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
    cves:(snapshot.cveFindings||[]).slice(0,3).map((c:any)=>({id:c.cveId,incidentId:c.incidentId,receiptIds:c.receiptIds,
      reference:c.reference,verification:c.verification,reason:String(c.reason||'').slice(0,300)}))};
}

export function incidentReportHtml(s:any,d:any,revision:number) {
  const en=d.language==='en'; const t=(th:string,eng:string)=>en?eng:th;
  const unknown=t('ยังไม่มีหลักฐานยืนยัน — อยู่ระหว่างตรวจสอบ','Not established by available evidence — investigation pending');
  const time=(v:any)=>Number.isFinite(Number(v))&&Number(v)>0?new Date(Number(v)).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',hour12:false}):t('ไม่ระบุ','Unknown');
  const editable=(key:string,title:string,fallback:string)=>`<section class="narrative-section"><h2>${esc(title)}</h2><div data-edit-key="${key}" class="narrative">${esc(d.edits[key]||fallback)}</div></section>`;
  const table=(headers:string[],rows:any[][])=>`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const titles:Record<string,string>={executive:'Executive Summary',incident:'Incident Deep Dive',technical:'Technical Details'};
  const title=titles[s.reportType]||'Report';
  const header=`<header><div class="report-brand"><span class="brand-mark">K</span><div><b>KKU SIEM</b><small>SECURITY OPERATIONS · ${esc(title)}</small></div><span class="version">v1.${revision}</span></div><h1 data-edit-key="reportTitle">${esc(d.title)}</h1><div class="document-id">${esc(d.reportId)} · ${esc(t('ผู้จัดทำ / ผู้ตรวจทาน','Prepared / reviewed by'))}: ${esc(d.preparedBy)}</div></header>`;
  const targetFilter=s.selectedTargetIPs?.length?`<br>${esc(t('เครื่องเป้าหมายที่เลือก','Selected targets'))}: ${esc(s.selectedTargetIPs.join(', '))}`:'';
  const filterLabels:Record<string,string>={ip:'IP / CIDR',type:t('ประเภทเหตุการณ์','Event type'),country:t('ประเทศต้นทาง','Source country'),severity:t('ความรุนแรง','Severity')};
  const filterText=Object.entries(s.filters||{}).filter(([key,value])=>filterLabels[key]&&value&&value!=='all').map(([key,value])=>`${filterLabels[key]}: ${value}`).join(' · ')||t('ไม่มีตัวกรองเพิ่มเติม','No additional filters');
  const meta=`<div class="report-meta"><div><span>${esc(t('ช่วงเหตุการณ์ (UTC+7)','Event period (UTC+7)'))}</span><strong>${esc(time(s.range.start))} – ${esc(time(s.range.end))}</strong></div><div><span>${esc(t('ข้อมูล ณ (UTC+7)','Snapshot at (UTC+7)'))}</span><strong>${esc(time(Date.parse(s.issuedAt)))}</strong></div><div class="wide"><span>${esc(t('ขอบเขตที่เลือก','Selected scope'))}</span><strong>Source IP: ${esc(s.selectedIPs.join(', '))}${targetFilter}</strong></div><div class="wide"><span>${esc(t('ตัวกรอง','Filters'))}</span><strong>${esc(filterText)} · ${esc(s.policy)}</strong></div></div>`;
  const counts=`<div class="metrics"><div><span>${esc(t('Incident ในขอบเขต','Matching incidents'))}</span><strong>${s.incidentCount}</strong></div><div><span>${esc(t('Log ที่มี receipt ยืนยัน','Verified receipts'))}</span><strong>${s.receiptCount}</strong></div><div><span>${esc(t('Incident ที่ไม่มี receipt','Without countable receipts'))}</span><strong>${s.incidentsWithoutReceipts}</strong></div></div><p class="severity-summary">${esc(t('Log แยกตามระดับ','Receipts by severity'))}: ${s.counts.map((c:any)=>`${esc(c.severity)}: ${c.count}`).join(' · ')}</p>`;
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
  const endpoint=(e:any,side:string)=>{const n=e.networkContext?.[side];return [side==='source'?e.ip:e.destIp,n?.organization,n?.cidr].filter(Boolean).join(' · ');};
  const topology=d.fields.includes('networkContext')?table([t('ต้นทาง / หน่วยงาน / CIDR','Source / unit / CIDR'),t('เป้าหมาย / หน่วยงาน / CIDR','Target / unit / CIDR'),t('ทิศทาง','Direction')],events.map((e:any)=>[
    endpoint(e,'source'),endpoint(e,'target'),e.networkContext?.direction||'unknown'])):'';
  const httpRows=[...events.map((e:any)=>({incidentId:e.id,http:e.httpContext})),...s.evidence.map((e:any)=>({incidentId:e.attackId,http:e.httpContext}))].filter(e=>e.http);
  const seenHttp=new Set<string>();
  const uniqueHttp=httpRows.filter(e=>{const key=JSON.stringify([e.incidentId,e.http]);if(seenHttp.has(key))return false;seenHttp.add(key);return true;});
  const websites=uniqueHttp.length?`<section><h2>${esc(t('เว็บไซต์ / HTTP จากหลักฐานตัวอย่าง','Observed websites / HTTP samples'))}</h2>${table(['Incident','Host / URI','HTTP'],uniqueHttp.slice(0,3).map(e=>[e.incidentId,[e.http.host,e.http.url||e.http.uri].filter(Boolean).join(' ').slice(0,220),[e.http.method,e.http.status].filter(v=>v!=null).join(' ')]))}<p class="note">${uniqueHttp.length>3?t('แสดงบางรายการจากหลักฐานตัวอย่าง','Showing a subset of HTTP samples'):''} ${esc(t('HTTP response ไม่ยืนยันการเจาะสำเร็จ','An HTTP response does not establish exploitation'))}</p></section>`:'';
  const summaryDefault=t(`ตรวจพบ ${s.incidentCount} Incident ที่ผ่านนโยบายคัดกรองของ detection-engine ในขอบเขตที่เลือก มี receipt ยืนยัน ${s.receiptCount} log ต้องสืบสวนผลต่อระบบปลายทางเพิ่มเติม`,
    `${s.incidentCount} eligible detection-engine incidents and ${s.receiptCount} processed receipts match this selection. Target impact requires further investigation.`);
  const summary=editable('executiveSummary',t('ปัญหา / สรุปเหตุการณ์','Problem / incident summary'),summaryDefault);
  const root=editable('rootCause',t('สาเหตุ (ข้อประเมินของ Analyst)','Root cause (analyst assessment)'),unknown);
  const impact=editable('impact',t('ผลกระทบที่ตรวจสอบ','Impact assessment'),unknown);
  const assessmentGrid=`<div class="assessment-grid">${root}${impact}</div>`;
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
  const cves=d.cves.length?`<section><h2>CVE Similarity — ${esc(t('ตรวจสอบรหัสที่เผยแพร่แล้ว ไม่ใช่การยืนยันช่องโหว่','published CVE verified; vulnerability unconfirmed'))}</h2>${d.cves.map((c:any)=>`<p>${esc(c.id)} · Incident ${esc(c.incidentId)}: ${esc(c.reason)}<br>${esc(c.reference)}</p>`).join('')}</section>`:'';
  // Let the print engine paginate the document naturally instead of forcing
  // overflowing logical sections onto extra, nearly empty pages.
  const page=(body:string)=>`<div class="report-chapter">${body}</div>`;
  let pages:string[];
  if(s.sourcePage==='ai-briefing') {
    const chosen=(key:string,value:string)=>d.sections.includes(key)?value:'';
    pages=[page(meta+counts+chosen('AI Situation Summary',summary)+chosen('Threat Landscape',rows)+chosen('Targeted Organizations',topology)+
      chosen('Org Risk Assessment',assessmentGrid)+chosen('Attack Campaigns',timeline)+chosen('Recommended Actions',actions+resolution+remaining+recs)+
      chosen('Investigation Priorities',remaining)+limitation+review)];
  }
  else if(s.reportType==='executive') {
    const causeImpact=`<section><h2>${esc(t('สาเหตุ / ผลกระทบ (ข้อประเมิน Analyst)','Root cause / impact (analyst assessment)'))}</h2><div class="columns">`+
      `<div><b>${esc(t('สาเหตุ','Root cause'))}</b><div data-edit-key="rootCause" class="narrative">${esc(d.edits.rootCause||unknown)}</div></div>`+
      `<div><b>${esc(t('ผลกระทบ','Impact'))}</b><div data-edit-key="impact" class="narrative">${esc(d.edits.impact||unknown)}</div></div></div></section>`;
    const compactActions=actions.replace(esc(actionFacts),esc(compactActionFacts));
    pages=[page(meta+counts+summary+rows+topology+websites+causeImpact+compactActions+resolution+remaining+recs+cves+limitation+review)];
  }
  else if(s.reportType==='incident')pages=[page(meta+counts+summary+rows+topology+websites+assessmentGrid),page(timeline+actions+notes+resolution+remaining+recs+evidence+cves+limitation+review)];
  else pages=[page(meta+counts+summary+rows+topology+websites+assessmentGrid),page(timeline+evidence+notes+cves),page(actions+resolution+remaining+recs+limitation+review)];
  return `<!DOCTYPE html><html lang="${d.language}"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>
    @page{size:A4;margin:15mm 12mm}
    *{box-sizing:border-box}html{background:#edf2f6}body{margin:0;color:#243447;font:11.5px/1.55 'Noto Sans Thai','Tahoma',sans-serif;overflow-wrap:anywhere}
    article{background:#fff}.report-chapter+.report-chapter{margin-top:14px;padding-top:10px;border-top:1px solid #deeaec}
    header{border-bottom:2px solid #14796b;padding-bottom:12px;margin-bottom:14px}
    .report-brand{display:flex;align-items:center;gap:10px;color:#123c49}.brand-mark{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:#14796b;color:#fff;font:bold 25px/1 Georgia,serif}.report-brand b{font-size:14px;letter-spacing:1.4px}.report-brand small{display:block;font-size:8px;letter-spacing:1px;color:#667b87}.version{margin-left:auto;border:1px solid #d3e4e5;border-radius:5px;padding:3px 8px;color:#14796b;font-size:10px}
    h1{font-size:20px;line-height:1.45;margin:12px 0 5px;color:#102f3b;font-weight:700}.document-id{font-size:10px;color:#687c88}
    h2{font-size:12px;color:#155d57;line-height:1.5;margin:0 0 6px;font-weight:700}section{margin:13px 0;break-inside:auto}section>h2{border-bottom:1px solid #deeaec;padding-bottom:5px;break-after:avoid}
    p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.narrative{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;min-height:20px}
    .report-meta{display:grid;grid-template-columns:1.3fr 1fr;gap:9px 18px;padding:12px 14px;margin-bottom:12px;border:1px solid #dce6eb;border-radius:8px;background:#fafcfd}.report-meta .wide{grid-column:1/-1}.report-meta span{display:block;color:#71838f;font-size:9px}.report-meta strong{display:block;font-size:10px;font-weight:500;color:#243f50}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;break-inside:avoid}.metrics>div{border:1px solid #d8e9e5;background:#f4faf8;border-radius:7px;padding:9px 12px}.metrics span{display:block;font-size:9px;color:#526f76}.metrics strong{display:block;font-size:22px;line-height:1.3;color:#176c60}.severity-summary{font-size:9px;color:#6b7e89;margin:6px 0 12px}
    table{border-collapse:separate;border-spacing:0;width:100%;font-size:10px;table-layout:fixed;margin:10px 0;border:1px solid #dbe5eb;border-radius:6px;overflow:hidden}th,td{border-bottom:1px solid #e1e9ee;padding:6px 7px;overflow-wrap:anywhere;vertical-align:top;white-space:pre-line}th{background:#edf4f6;color:#315561;text-align:left;font-weight:700;font-size:9px}tbody tr:nth-child(even){background:#f8fafc}tbody tr:last-child td{border-bottom:0}thead{display:table-header-group}tr{break-inside:avoid}
    .note{font-size:9px;color:#6b7e89;border-top:1px solid #e2e8ee;padding-top:7px;margin-top:10px;line-height:1.6}.evidence{padding:9px 11px;margin:7px 0;font-size:9px;overflow-wrap:anywhere;background:#f7f9fc;border:1px solid #e1e8ef;border-radius:6px;break-inside:avoid}pre{font:9px/1.55 monospace;white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}
    .columns,.assessment-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.assessment-grid section{margin:8px 0}.narrative-section{padding:9px 12px;border-left:3px solid #c7e1dc;background:#fbfdfd;border-radius:0 6px 6px 0}
    [contenteditable="plaintext-only"]{outline:1px dashed #3b82f6;outline-offset:4px;background:#eff6ff;cursor:text;min-height:32px}[contenteditable="plaintext-only"]:focus{outline:2px solid #2563eb}
    body.executive section{margin:9px 0}body.executive .narrative-section{padding:7px 10px}body.executive h2{font-size:11px}body.executive .narrative{line-height:1.5}body.executive .note{font-size:8px}
    @media screen{body{padding:18px}article{width:100%;max-width:210mm;min-height:260mm;margin:0 auto 20px;padding:15mm 12mm;box-shadow:0 3px 20px #16344918;border-radius:4px}article:last-child{margin-bottom:0}}
    @media print{html,body{background:#fff}article{padding:0;margin:0;box-shadow:none;border-radius:0}header,.metrics,.report-meta,.narrative-section{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body class="${esc(s.reportType)}"><article>${header}${pages.join('')}</article></body></html>`;
}

export function incidentReportCsv(s:any,d:any) {
  const keys=['id','ip','sourceOrganization','sourceCidr','destIp','targetOrganization','targetCidr','httpHost','httpUri','httpStatus','windowFirstSeenMs','windowLastSeenMs','verifiedReceiptCount',...d.fields.filter((k:string)=>!['networkContext'].includes(k))];
  const cell=(v:any)=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
  // CSV is the same bounded incident-summary sample, explicitly labelled; never a claimed full raw-log dump.
  return '\uFEFF'+[
    ['Scope','organization',s.range.from,s.range.to],['Selected source IPs',s.selectedIPs.join(', ')],
    ['Selected target IPs',s.selectedTargetIPs?.length?s.selectedTargetIPs.join(', '):'All matching registered targets'],
    ['Matching incidents',s.incidentCount,'Matching receipts',s.receiptCount],
    ['Filters',JSON.stringify(s.filters||{})],['Verified CVE similarities',d.cves.map((c:any)=>`${c.id} (Incident ${c.incidentId})`).join('; ')],
    ['Sampled incident summaries',s.events.length,'Not all raw logs'],keys,...s.events.map((e:any)=>{const row={...e,sourceOrganization:e.networkContext?.source?.organization,sourceCidr:e.networkContext?.source?.cidr,
      targetOrganization:e.networkContext?.target?.organization,targetCidr:e.networkContext?.target?.cidr,httpHost:e.httpContext?.host,httpUri:e.httpContext?.url||e.httpContext?.uri,httpStatus:e.httpContext?.status};return keys.map(k=>row[k]);})
  ].map(row=>row.map(cell).join(',')).join('\r\n');
}
