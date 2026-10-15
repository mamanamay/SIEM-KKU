import { Controller, Post, Body, Request, Res, ConflictException, BadRequestException, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { ReportQueryService } from './report-query.service';
import { ExportService } from './export.service';
import { AiService } from './ai.service';
import { ReportDraft } from './entities/report-draft.entity';
import { Report } from './entities/report.entity';
import { ExportAudit } from './entities/export-audit.entity';
import { incidentReportHtml, incidentReportCsv, reportDraftInput } from './incident-report-template';
import { reportFileName } from './report-safety';

export async function reportPageCount(bytes:Uint8Array) {
  const count=(await PDFDocument.load(bytes,{updateMetadata:false})).getPageCount();
  if(count<1||count>3)throw new HttpException({message:`รายงานมี ${count} หน้า (กำหนด 1–3 หน้า) กรุณากลับ Preview เพื่อลดเนื้อหาหรือขอบเขต`,pageCount:count},422);
  return count;
}

@Controller('api/export/report')
export class IncidentReportController {
  constructor(private readonly query:ReportQueryService,private readonly db:DataSource,
    private readonly exporter:ExportService,private readonly ai:AiService) {}

  @Post('options') options(@Body() body:any) {return this.query.options(body);}
  @Post('snapshot') snapshot(@Body() body:any,@Request() req:any) {return this.query.snapshot(body,req.user);}

  @Post('preview')
  async preview(@Body() body:any,@Request() req:any) {
    const row=await this.query.owned(body.snapshotId,req.user);
    if(body.revision!==row.revision)throw new ConflictException('Report revision changed; reload the preview');
    const snapshot=JSON.parse(row.snapshotJson),draft=reportDraftInput(body,snapshot,row.actor),revision=row.revision+1;
    const html=incidentReportHtml(snapshot,draft,revision);
    if(Buffer.byteLength(html)>512*1024)throw new BadRequestException('Report exceeds HTML budget');
    const contentDigest=createHash('sha256').update(row.snapshotJson).update(JSON.stringify(draft)).update(html).digest('hex');
    const previous=row.draftJson?JSON.parse(row.draftJson):{};
    const history=[...(row.revisionHistoryJson?JSON.parse(row.revisionHistoryJson):[]).slice(-9),
      {revision,actor:row.actor,timestamp:new Date().toISOString(),contentDigest,
        changedFields:Object.keys(draft).filter(key=>JSON.stringify(previous[key])!==JSON.stringify((draft as any)[key]))}];
    const result=await this.db.getRepository(ReportDraft).update({id:row.id,revision:row.revision},
      {draftJson:JSON.stringify(draft),revisionHistoryJson:JSON.stringify(history),html,revision,contentDigest,validatedDigest:null,pageCount:null});
    if(result.affected!==1)throw new ConflictException('Report revision changed; reload the preview');
    return {html,revision,contentDigest,reportVersion:`v1.${revision}`,preparedBy:row.actor,reviewedBy:row.actor};
  }

  @Post('validate')
  async validate(@Body() body:any,@Request() req:any) {
    const row=await this.query.owned(body.snapshotId,req.user);
    this.matches(row,body);
    await this.db.getRepository(ReportDraft).update({id:row.id,contentDigest:row.contentDigest},{validatedDigest:null,pageCount:null});
    const snapshot=JSON.parse(row.snapshotJson),draft=JSON.parse(row.draftJson);
    const bytes=await this.exporter.generatePdfFromHtml(row.html,draft.title);
    const pageCount=await reportPageCount(bytes);
    const issues:any[]=[];
    if(snapshot.incidentsWithoutReceipts)issues.push({level:'warning',category:'evidence',message:'Some incidents have no retained receipts: log counts are incomplete and explicitly labelled.'});
    if(!draft.edits.rootCause||!draft.edits.impact||!draft.edits.resolution)issues.push({level:'warning',category:'evidence',message:'Root cause, impact or resolution remains unverified. This is a preliminary report.'});
    try {
      const aiResult=await this.ai.validateReportContent(req.user.sub,row.html,{actualEventCount:snapshot.receiptCount,
        statedEventCount:snapshot.receiptCount,events:snapshot.events});
      if(aiResult?.valid===false)issues.push({level:'error',category:'language',message:String(aiResult.feedback||'AI requested a revision').slice(0,1000)});
      else if(String(aiResult?.feedback||'').startsWith('AI Validation unavailable')||String(aiResult?.feedback||'').startsWith('Parsed response'))
        issues.push({level:'info',category:'language',message:'AI language check unavailable; manual review remains required.'});
      else for(const suggestion of (aiResult?.improvements||[]).slice(0,10))issues.push({level:'warning',category:'language',message:String(suggestion).slice(0,500)});
    }catch {issues.push({level:'info',category:'language',message:'AI language check unavailable; manual review remains required.'});}
    const hasCritical=issues.some(i=>i.level==='error');
    const updated=await this.db.getRepository(ReportDraft).update({id:row.id,contentDigest:row.contentDigest},
      {validatedDigest:hasCritical?null:row.contentDigest,pageCount});
    if(updated.affected!==1)throw new ConflictException('Preview changed during validation');
    return {passed:!hasCritical,hasCritical,issues,checkedAt:new Date().toISOString(),pageCount,contentDigest:row.contentDigest};
  }

  private matches(row:ReportDraft,body:any) {
    if(!row.html||!row.contentDigest||body.contentDigest!==row.contentDigest||body.revision!==row.revision)
      throw new ConflictException('Preview changed; regenerate and validate this revision');
  }

  @Post('export')
  async publish(@Body() body:any,@Request() req:any,@Res() res:Response) {
    const row=await this.query.owned(body.snapshotId,req.user);
    this.matches(row,body);
    if(row.validatedDigest!==row.contentDigest||!row.pageCount)throw new ConflictException('Validate the current report before export');
    if(!['dataVerified','aiVerified','cveDisclaimer'].every(key=>body.checklist?.[key]===true))throw new BadRequestException('Complete all review acknowledgements');
    const format=body.format,snapshot=JSON.parse(row.snapshotJson),draft=JSON.parse(row.draftJson);
    if(!['pdf','html','csv'].includes(format)||format==='csv'&&snapshot.reportType!=='technical')throw new BadRequestException('Invalid format for this report type');
    const bytes=format==='pdf'?await this.exporter.generatePdfFromHtml(row.html,draft.title):Buffer.from(format==='html'?row.html:incidentReportCsv(snapshot,draft),'utf8');
    const pageCount=format==='pdf'?await reportPageCount(bytes):row.pageCount;
    const sha256Hash=createHash('sha256').update(bytes).digest('hex');
    const name=reportFileName(format),filePath=path.join(__dirname,'..','uploads','reports',name);
    const review={actor:req.user.username,actorId:String(req.user.sub),role:req.user.role,reviewedAt:new Date().toISOString(),
      revision:row.revision,contentDigest:row.contentDigest,snapshotId:row.id,checklist:body.checklist,pageCount,
      csvIsSample:format==='csv'};
    await fs.mkdir(path.dirname(filePath),{recursive:true});
    await fs.writeFile(filePath,bytes,{flag:'wx'});
    try {
      await this.db.transaction(async m=>{
        // Recheck after rendering; a simultaneous edit must never export an older review as current.
        const current=await m.getRepository(ReportDraft).findOne({where:{id:row.id}});
        if(!current||current.contentDigest!==row.contentDigest||current.validatedDigest!==row.contentDigest)throw new ConflictException('Report changed during export');
        await m.getRepository(Report).save({reportId:draft.reportId,reportVersion:`v1.${row.revision}`,title:draft.title,type:snapshot.reportType,
          format,language:draft.language,sourcePage:snapshot.sourcePage,filePath,author:row.actor,preparedBy:row.actor,
          reviewedBy:req.user.username,exportedBy:req.user.username,summary:format==='csv'?bytes.toString('utf8'):row.html,
          sha256Hash,selectedIpCount:snapshot.selectedIPs.length,selectedFieldCount:draft.fields.length,
          filtersJson:JSON.stringify({range:snapshot.range,selectedIPs:snapshot.selectedIPs,incidentId:snapshot.incidentId,
            selectedTargetIPs:snapshot.selectedTargetIPs,
            selectedFields:draft.fields,selectedSections:draft.sections,includeRawLogs:draft.includeRawLogs,manualEdits:draft.edits,assessment:draft.assessment}),
          revisionHistoryJson:row.revisionHistoryJson,
          snapshotJson:row.snapshotJson,reviewJson:JSON.stringify(review),contentDigest:row.contentDigest,pageCount});
        await m.getRepository(ExportAudit).save({action:'EXPORT_REPORT',reportId:draft.reportId,reportTitle:draft.title,reportType:snapshot.reportType,
          language:draft.language,fileFormat:format,sourcePage:snapshot.sourcePage,exportedBy:req.user.username,exportedByRole:req.user.role,
          selectedIpCount:snapshot.selectedIPs.length,selectedFieldCount:draft.fields.length,status:'SUCCESS',sha256Hash});
      });
    } catch(error){await fs.unlink(filePath).catch(()=>{});throw error;}
    res.set({'Content-Type':format==='pdf'?'application/pdf':format==='html'?'text/html; charset=utf-8':'text/csv; charset=utf-8',
      'Content-Disposition':`attachment; filename="${name}"`,'Content-Length':String(bytes.length),'X-Report-Hash':sha256Hash,
      'X-Report-Pages':String(pageCount),'Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'",'X-Content-Type-Options':'nosniff'});
    res.end(bytes);
  }
}
