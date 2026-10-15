import { BadRequestException } from '@nestjs/common';
import { escapeHtml as esc } from './report-safety';

export const EDIT_KEYS=['executiveSummary','rootCause','impact','actionsTaken','resolution','remainingWork','recommendations'];
export const REPORT_FIELDS=['type','severity','threatScore','source','destPort','protocol','status','ruleId','mitreCode','detail','notes','networkContext'];
export function reportDraftInput(body:any, snapshot:any, actor:string) {
  const text=(value:any,max:number)=>{
    if(value!==undefined&&typeof value!=='string')throw new BadRequestException('Invalid report text');
    const str=value||'';
    if(str.length>max)throw new BadRequestException('Report text is too long; shorten it in Preview');
    return str;
  };
  const edits:any={}; for(const key of EDIT_KEYS)edits[key]=text(body.manualEdits?.[key],6000);
  if(body.selectedFields!==undefined&&(!Array.isArray(body.selectedFields)||body.selectedFields.length>REPORT_FIELDS.length))throw new BadRequestException('Too many selected fields');
  if(body.selectedSections!==undefined&&(!Array.isArray(body.selectedSections)||body.selectedSections.length>8))throw new BadRequestException('Too many selected sections');
  const fields=Array.isArray(body.selectedFields)?[...new Set(body.selectedFields.filter((f:any)=>REPORT_FIELDS.includes(f)))]:REPORT_FIELDS;
  const sections=Array.isArray(body.selectedSections)?body.selectedSections.filter((s:any)=>typeof s==='string'&&s.length<64).slice(0,8):[];
  return {title:text(body.reportTitle,200)||'Incident Security Report',reportId:text(body.reportId,80),
    language:body.language==='en'?'en':'th',preparedBy:actor,reviewedBy:actor,
    assessment:text(body.analystAssessment,40)||'NeedsInvestigation',edits,fields,sections,
    includeRawLogs:snapshot.reportType==='technical'&&body.includeRawLogs===true,
    cves:Array.isArray(body.cveSimilarityResults)?body.cveSimilarityResults.slice(0,3).map((c:any)=>({id:text(c.cveId,32),reason:text(c.reason,300)})):[]};
}

export function incidentReportHtml(s:any,d:any,revision:number) {
  const en=d.language==='en'; const t=(th:string,eng:string)=>en?eng:th;
  const unknown=t('ยังไม่มีหลักฐานยืนยัน — อยู่ระหว่างตรวจสอบ','Not established by available evidence — investigation pending');
  const time=(v:any)=>Number.isFinite(Number(v))&&Number(v)>0?new Date(Number(v)).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false}):t('ไม่ระบุ','Unknown');
  const editable=(key:string,title:string,fallback:string)=>`<section><h2>${esc(title)}</h2><div data-edit-key="${key}" class="narrative">${esc(d.edits[key]||fallback)}</div></section>`;
  const table=(headers:string[],rows:any[][])=>`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const titles:Record<string,string>={executive:'Executive Summary',incident:'Incident Deep Dive',technical:'Technical Details'};
  const title=titles[s.reportType]||'Report';
  const header=`<header><b>KKU SIEM · ${title}</b><h1>${esc(d.title)}</h1><div>${esc(d.reportId)} · v1.${revision} · ${esc(t('ผู้จัดทำ / ผู้ตรวจทาน','Prepared / reviewed by'))}: ${esc(d.preparedBy)}</div></header>`;
  const targetFilter=s.selectedTargetIPs?.length?`<br>${esc(t('เครื่องเป้าหมายที่เลือก','Selected targets'))}: ${esc(s.selectedTargetIPs.join(', '))}`:'';
  const meta=`<p>${esc(t('ช่วงเหตุการณ์','Event period'))}: ${esc(time(s.range.start))} – ${esc(time(s.range.end))} (UTC+7 / Asia/Bangkok)<br>${esc(t('ข้อมูล ณ','Snapshot at'))}: ${esc(time(Date.parse(s.issuedAt)))} · ${esc(t('ขอบเขต: เป้าหมายในเครือข่าย มข.','Scope: registered KKU targets'))} · ${esc(s.policy)}${targetFilter}</p>`;
  const counts=`<p class="facts">${esc(t('Incident','Incidents'))}: <strong>${s.incidentCount}</strong> · ${esc(t('log ที่มี receipt ตรงช่วงเวลา','Matching processed receipts'))}: <strong>${s.receiptCount}</strong> · ${esc(t('Incident ที่ไม่มี receipt ยืนยันจำนวน log','Incidents without countable receipts'))}: ${s.incidentsWithoutReceipts}<br>${esc(t('log แยกตามระดับ','Receipt counts by severity'))}: ${s.counts.map((c:any)=>`${esc(c.severity)}: ${c.count}`).join(' · ')}</p>`;
  const limitation=`<p class="note">${esc(t('จำนวน log นับจาก receipt ในช่วงวันที่ที่เลือก ไม่ใช้ยอด hitCount สะสม หลักฐานด้านล่างเป็นตัวอย่าง ไม่ใช่ log ทั้งหมด การตรวจพบ/deny ไม่ยืนยันว่าเครื่องถูกเจาะหรือปลอดภัย สถานะ Incident ไม่เปลี่ยนจากการส่งออกรายงาน','Log counts use event-time receipts, not lifetime hitCount. Evidence below is a sample. Detection/deny does not establish compromise or safety. Export does not change incident status.'))}</p>`;
  const events=s.events.slice(0,s.reportType==='executive'?3:5);
  const mandatory=['id','ip','destIp'];
  const labels:Record<string,string>={id:'Incident ID',ip:'Source IP',destIp:'Target IP',type:'Attack type',severity:'Severity',
    threatScore:'Detection score',source:'Log source',destPort:'Target port',protocol:'Protocol',status:'Case status',ruleId:'Detection rule',mitreCode:'MITRE ATT&CK'};
  const extra=d.fields.filter((k:string)=>!['detail','notes','networkContext'].includes(k));
  const keys=[...mandatory,...extra.slice(0,2)];
  const rows=table(keys.map(k=>labels[k]||k),events.map((e:any)=>keys.map(k=>e[k]??t('ไม่ระบุ','Unknown'))))+
    `<p class="note">${events.length} / ${s.incidentCount} ${esc(t('Incident ตัวอย่าง','sampled incidents'))}</p>`+
    (extra.length>2?events.map((e:any)=>`<p>Incident ${e.id}: ${extra.slice(2).map((k:string)=>esc(labels[k]||k)+'='+esc(e[k]??'unknown')).join(' · ')}</p>`).join(''):'');
  const org=(e:any)=>e.networkContext?.target?.organization||t('อยู่ในเครือข่าย มข. — ไม่ระบุหน่วยงาน','In KKU network — unit unspecified');
  const topology=d.fields.includes('networkContext')?table([t('ต้นทาง','Source'),t('เครื่องเป้าหมาย','Target'),t('หน่วยงานเป้าหมาย','Target unit'),t('ทิศทาง','Direction')],events.map((e:any)=>[
    `${e.ip} (${e.networkContext?.source?.scope||'unknown'})`,e.destIp,org(e),e.networkContext?.direction||'unknown'])):'';
  const summaryDefault=t(`ตรวจพบ ${s.incidentCount} Incident ที่ผ่านนโยบายคัดกรองของ detection-engine ในขอบเขตที่เลือก มี receipt ยืนยัน ${s.receiptCount} log ต้องสืบสวนผลต่อระบบปลายทางเพิ่มเติม`,
    `${s.incidentCount} eligible detection-engine incidents and ${s.receiptCount} processed receipts match this selection. Target impact requires further investigation.`);
  const summary=editable('executiveSummary',t('ปัญหา / สรุปเหตุการณ์','Problem / incident summary'),summaryDefault);
  const root=editable('rootCause',t('สาเหตุ (ข้อประเมินของ Analyst)','Root cause (analyst assessment)'),unknown);
  const impact=editable('impact',t('ผลกระทบที่ตรวจสอบ','Impact assessment'),unknown);
  const actionFacts=events.map((e:any)=>`Incident ${e.id}: ${t('สถานะที่บันทึก','Recorded status')}=${e.status||'unknown'}, ${t('ผลจาก sensor','Sensor outcome')}=${e.outcome||'unknown'}`).join('\n');
  const outcomeCounts:Record<string,number>={};for(const e of events)outcomeCounts[e.outcome||'unknown']=(outcomeCounts[e.outcome||'unknown']||0)+1;
  const compactActionFacts=t('ผล sensor ของ Incident ตัวอย่าง','Sensor outcomes of sampled incidents')+': '+Object.entries(outcomeCounts).map(([outcome,count])=>`${outcome} (${count} Incident)`).join(', ');
  const actions=`<section><h2>${esc(t('การดำเนินการที่บันทึกในระบบ','Recorded system actions'))}</h2><p>${esc(actionFacts)}</p></section>`+
    editable('actionsTaken',t('บันทึกการแก้ไขของผู้จัดทำ (ระบุเวลา/หลักฐาน)','Analyst action record (include time/evidence)'),t('ยังไม่มีบันทึกการดำเนินการเพิ่มเติม','No additional action record supplied'));
  const resolution=editable('resolution',t('ผลการแก้ไข / วิธีตรวจยืนยัน','Resolution / verification'),unknown);
  const remaining=editable('remainingWork',t('งานที่ยังค้าง / ผู้รับผิดชอบ / กำหนดเสร็จ','Remaining work / owner / due date'),t('ระบุผู้รับผิดชอบ ตรวจ log ปลายทาง และยืนยันผลก่อนปิด Incident','Assign an owner, inspect target logs and verify results before closing the incident'));
  const recs=editable('recommendations',t('มาตรการที่เสนอ (ยังไม่ใช่การดำเนินการแล้ว)','Recommendations (not completed actions)'),t('ตรวจหลักฐานปลายทางและทบทวน policy ตามเหตุการณ์ที่เลือก','Review target evidence and applicable controls for the selected incidents'));
  const timeline=`<section><h2>${esc(t('Timeline จาก receipt','Receipt timeline'))}</h2>${table([t('เวลา UTC+7','Time UTC+7'),'Incident',t('ต้นทาง → เป้าหมาย','Source → target')],s.evidence.map((e:any)=>[time(e.timestampMs),e.attackId,`${e.sourceIp||'unknown'} → ${e.targetIp||'unknown'}`]))}<p>${s.evidence.length} / ${s.receiptCount} ${esc(t('receipt ตัวอย่างช่วงเริ่ม/ท้ายตามเวลา','start/end receipt samples'))}</p></section>`;
  const evidence=`<section><h2>${esc(t('หลักฐาน / การตรวจจับ','Evidence / detection'))}</h2>${s.evidence.slice(0,3).map((e:any)=>`<div class="evidence"><b>Receipt ${esc(e.id)}</b> · Incident ${esc(e.attackId)}<br>SHA-256: ${esc(e.rawDigest||t('ไม่มี hash บันทึก','No recorded hash'))}${d.includeRawLogs?`<pre>${esc(e.excerpt?.slice(0,400)||t('เนื้อหาไม่พร้อมใช้งาน','Content unavailable'))}</pre>`:''}</div>`).join('')}${d.fields.includes('detail')?events.slice(0,3).map((e:any)=>`<p>Incident ${e.id}: ${esc(e.detail?.slice(0,400)||'')+(e.detectionEvidenceExcerpt?' · '+esc(e.detectionEvidenceExcerpt.slice(0,200)):'')}</p>`).join(''):''}<p>${esc(t('ข้อความหลักฐานตัดเป็น snippet; hash อ้างถึง raw ต้นฉบับเมื่อมีบันทึก','Evidence excerpts are bounded snippets; recorded hashes refer to original raw content'))}</p></section>`;
  const notes=d.fields.includes('notes')?events.filter((e:any)=>e.notes).slice(0,3).map((e:any)=>`<p>Incident ${e.id} · ${esc(t('บันทึก Analyst','Analyst notes'))}: ${esc(e.notes)}</p>`).join(''):'';
  const review=`<p class="note">${esc(t('ข้อประเมิน Analyst','Analyst assessment'))}: ${esc(d.assessment)} · ${esc(t('ผู้กด Confirm & Export ต้องตรวจทานฉบับและข้อมูลนี้ การยืนยันถูกบันทึกพร้อมบัญชีผู้ใช้ เวลา และ hash ของเนื้อหา','Confirm & Export acknowledges this exact revision and snapshot; the server records the actor, time and content hash.'))}</p>`;
  const cves=d.cves.length?`<section><h2>CVE Similarity — ${esc(t('ไม่ใช่การยืนยันช่องโหว่','not a confirmed vulnerability'))}</h2>${d.cves.map((c:any)=>`<p>${esc(c.id)}: ${esc(c.reason)}</p>`).join('')}</section>`:'';
  const page=(body:string)=>`<article>${header}${body}</article>`;
  let pages:string[];
  if(s.sourcePage==='ai-briefing') {
    const chosen=(key:string,value:string)=>d.sections.includes(key)?value:'';
    pages=[page(meta+counts+chosen('AI Situation Summary',summary)+chosen('Threat Landscape',rows)+chosen('Targeted Organizations',topology)+
      chosen('Org Risk Assessment',root+impact)+chosen('Attack Campaigns',timeline)+chosen('Recommended Actions',actions+resolution+remaining+recs)+
      chosen('Investigation Priorities',remaining)+limitation+review)];
  }
  else if(s.reportType==='executive') {
    const causeImpact=`<section><h2>${esc(t('สาเหตุ / ผลกระทบ (ข้อประเมิน Analyst)','Root cause / impact (analyst assessment)'))}</h2><div class="columns">`+
      `<div><b>${esc(t('สาเหตุ','Root cause'))}</b><div data-edit-key="rootCause" class="narrative">${esc(d.edits.rootCause||unknown)}</div></div>`+
      `<div><b>${esc(t('ผลกระทบ','Impact'))}</b><div data-edit-key="impact" class="narrative">${esc(d.edits.impact||unknown)}</div></div></div></section>`;
    const compactActions=actions.replace(esc(actionFacts),esc(compactActionFacts));
    pages=[page(meta+counts+summary+rows+topology+causeImpact+compactActions+resolution+remaining+recs+limitation+review)];
  }
  else if(s.reportType==='incident')pages=[page(meta+counts+summary+rows+topology+timeline+root+impact),page(actions+notes+resolution+remaining+recs+evidence+cves+limitation+review)];
  else pages=[page(meta+counts+summary+rows+topology+root+impact),page(timeline+evidence+notes+cves),page(actions+resolution+remaining+recs+limitation+review)];
  return `<!DOCTYPE html><html lang="${d.language}"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>
    @page{size:A4;margin:15mm 12mm}*{box-sizing:border-box}body{margin:0;color:#172554;font:12px/1.5 'Noto Sans Thai','Tahoma',sans-serif;background:white}article{break-before:page}article:first-child{break-before:auto}header{border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:10px}h1{font-size:19px;margin:4px 0}h2{font-size:13px;margin:10px 0 4px}p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}.narrative{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:10px;table-layout:fixed;margin:8px 0}th,td{border:1px solid #cbd5e1;padding:4px;overflow-wrap:anywhere}th{background:#eff6ff;text-align:left}tr{break-inside:avoid}.facts{background:#ecfdf5;padding:8px}.note{font-size:10px;color:#475569;border-top:1px solid #e2e8f0;padding-top:6px}.evidence{margin:6px 0;font-size:9px;overflow-wrap:anywhere}pre{font:9px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}
    .columns{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    body.executive p{margin:3px 0}body.executive h2{margin:6px 0 2px}
  </style></head><body class="${esc(s.reportType)}">${pages.join('')}</body></html>`;
}

export function incidentReportCsv(s:any,d:any) {
  const keys=['id','ip','destIp','windowFirstSeenMs','windowLastSeenMs','verifiedReceiptCount',...d.fields.filter((k:string)=>!['networkContext'].includes(k))];
  const cell=(v:any)=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
  // CSV is the same bounded incident-summary sample, explicitly labelled; never a claimed full raw-log dump.
  return '\uFEFF'+[
    ['Scope','organization',s.range.from,s.range.to],['Selected source IPs',s.selectedIPs.join(', ')],
    ['Selected target IPs',s.selectedTargetIPs?.length?s.selectedTargetIPs.join(', '):'All matching registered targets'],
    ['Matching incidents',s.incidentCount,'Matching receipts',s.receiptCount],
    ['Sampled incident summaries',s.events.length,'Not all raw logs'],keys,...s.events.map((e:any)=>keys.map(k=>e[k]))
  ].map(row=>row.map(cell).join(',')).join('\r\n');
}
