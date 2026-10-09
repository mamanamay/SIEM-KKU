import type { Message, SecurityContext, InvestigationReportScope } from './types';
import { globalReportStore, openReportWizard } from '../../stores/globalReportStore';

const MAX_EVENTS = 20;
const MAX_BYTES = 24576;
const fields = ['id','type','severity','source','status','country','destPort','protocol','ruleId','mitreCode','detail','action','faculty','department'];
const text = (value: unknown, limit=256) => typeof value === 'string' ? value.slice(0,limit) : '';
const validIp = (value: unknown): value is string => typeof value === 'string' && value.split('.').length===4 && value.split('.').every(p=>/^\d{1,3}$/.test(p)&&Number(p)<=255);
export const eventSourceIp = (e:any) => e.ip || e.srcIp || e.src_ip || e.srcip;
export const eventTargetIp = (e:any) => e.destIp || e.targetIp || e.dstIp || e.dst_ip || e.dstip;
function eventTime(e:any) {
  const value=e.timestampMs ?? e.createdAt ?? e.timestamp;
  const ms=typeof value==='number' ? value : Date.parse(value);
  return Number.isFinite(ms)&&ms>0 ? ms : NaN;
}
function bangkokMinute(ms:number) { return new Date(ms+7*3600000).toISOString().slice(0,16)+'+07:00'; }

/** Store only a bounded, independent copy of evidence available to this answer. Never parse AI prose as evidence. */
export function captureInvestigationReport(context: SecurityContext, restored=false): InvestigationReportScope {
  const selectedIP=validIp(context.selectedIP)?context.selectedIP:undefined;
  const related=(context.events||[]).filter(e=>validIp(eventSourceIp(e))&&Number.isFinite(eventTime(e))&&
    (!selectedIP||eventSourceIp(e)===selectedIP||eventTargetIp(e)===selectedIP));
  const events:any[]=[];
  for(const e of related) {
    const row:any={ip:eventSourceIp(e),createdAt:new Date(eventTime(e)).toISOString(),timestampMs:eventTime(e),count:1};
    const target=eventTargetIp(e);if(validIp(target)){row.destIp=target;row.targetIp=target;}
    for(const key of fields) {
      const value=e[key];if(typeof value==='string')row[key]=text(value,key==='detail'?768:256);
      else if(typeof value==='number'&&Number.isFinite(value))row[key]=value;
    }
    if(new TextEncoder().encode(JSON.stringify([...events,row])).length>MAX_BYTES)break;
    events.push(row);if(events.length>=MAX_EVENTS)break;
  }
  const times=events.map(eventTime);
  return {version:1,selectedIP,events,totalAvailable:related.length,restored,
    dateRange:events.length?{from:bangkokMinute(Math.floor(Math.min(...times)/60000)*60000),
      to:bangkokMinute(Math.floor(Math.max(...times)/60000)*60000+60000)}:undefined};
}

/** Old messages have no frozen scope. Restore only an explicit IP from their preceding user question. */
export function restoreInvestigationReport(message:Message, messages:Message[], available:any[], role:string): InvestigationReportScope {
  const index=messages.findIndex(m=>m.id===message.id);
  const query=messages.slice(0,index).reverse().find(m=>m.role==='user')?.content||'';
  const selectedIP=query.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)?.[0];
  const events=role==='guest'||!validIp(selectedIP)?[]:(role==='analyst'?available.slice(0,50):available);
  return captureInvestigationReport({currentPage:'ai-copilot',selectedIP,events},true);
}

export function openInvestigationReport(message:Message, fallback?:InvestigationReportScope) {
  const scope=message.reportScope||fallback;
  if(!scope?.events.length||!scope.dateRange)throw new Error('ยังไม่มีหลักฐานเหตุการณ์สำหรับคำตอบนี้ กรุณาวิเคราะห์ IP อีกครั้งจากหน้าที่มีข้อมูล log แล้วกดออกรายงาน');
  const sources=[...new Set(scope.events.map(eventSourceIp))];
  const targets=[...new Set(scope.events.map(eventTargetIp).filter(validIp))];
  const assessment=text(message.structuredData?.securityAssessment||message.content,4000);
  const coverage=`ขอบเขต: หลักฐานที่แชทโหลดไว้ ${scope.events.length} จาก ${scope.totalAvailable} รายการ ไม่ใช่ raw log ทั้งหมด${scope.restored?' (กู้ขอบเขตจาก IP ในคำถามเก่าและข้อมูลที่หน้าเว็บมีอยู่ขณะนี้)':''}`;
  openReportWizard({pageType:'ai-copilot',reportTitle:`Investigation Report${scope.selectedIP?' — '+scope.selectedIP:''}`,
    supportedFormats:['pdf','html'],aiEnabled:true,csvEnabled:false,allowExecOnly:true,sections:[]},
    {investigationMessageId:message.id,investigationIP:scope.selectedIP,evidenceIds:scope.events.map(e=>e.id),coverage},scope.events);
  globalReportStore.update(s=>({...s,dateRange:{...scope.dateRange!},selectedIPs:sources,selectedTargetIPs:targets,
    includeRawLogs:false,manualEdits:{...s.manualEdits,executiveSummary:`${coverage}\n\nข้อประเมินจาก ${message.source} — รอผู้วิเคราะห์ตรวจทาน\n${assessment}`,
      recommendations:(message.structuredData?.recommendedActions||[]).slice(0,10).map(r=>text(r,500)).join('\n')},
    analystAssessment:'NeedsInvestigation'}));
}
