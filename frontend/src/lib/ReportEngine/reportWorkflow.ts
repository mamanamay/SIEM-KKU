import type { ExportSession } from './types';
export const REPORT_EDIT_FIELDS=[
  ['rootCause','สาเหตุ / ข้อประเมิน Analyst'],['impact','ผลกระทบที่ตรวจสอบ'],['actionsTaken','การแก้ไขที่ดำเนินการ (เวลา / หลักฐาน)'],
  ['resolution','ผลการแก้ไข / วิธีตรวจยืนยัน'],['remainingWork','งานค้าง / ผู้รับผิดชอบ / กำหนดเสร็จ']
] as const;

export function bangkokInput(value:string) {
  if(!value)return '';
  if(!/(Z|[+-]\d{2}:\d{2})$/.test(value))return value.slice(0,16);
  const ms=Date.parse(value);return Number.isFinite(ms)?new Date(ms+7*3600000).toISOString().slice(0,16):'';
}
export function bangkokDay(now=new Date()) {
  const day=new Date(now.getTime()+7*3600000).toISOString().slice(0,10);
  return {from:day+'T00:00',to:day+'T23:59:59.999'};
}
export function reportSelectionKey(s:ExportSession) {
  return JSON.stringify([s.dateRange,s.reportType,s.sourcePage,[...s.selectedIPs].sort(),s.reportType==='incident'?[]:[...(s.selectedTargetIPs||[])].sort(),s.selectedIncidentId]);
}
export function reportInputSignature(s:ExportSession) {
  return JSON.stringify([reportSelectionKey(s),s.reportTitle,s.reportId,s.language,s.selectedFields,s.selectedSections,
    s.manualEdits,s.analystAssessment,s.includeRawLogs,s.cveSimilarityResults]);
}
export async function reportApi(action:string,body:any) {
  const response=await fetch('/api/export/report/'+action,{method:'POST',headers:{'Content-Type':'application/json',
    Authorization:`Bearer ${localStorage.getItem('token')}`},body:JSON.stringify(body)});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(Array.isArray(error.message)?error.message.join(', '):error.message||`Report request failed (${response.status})`);}
  return action==='export'?response:response.json();
}
