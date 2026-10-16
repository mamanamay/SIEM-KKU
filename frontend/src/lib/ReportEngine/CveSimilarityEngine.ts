import type { CveSimilarityResult } from './types';

/** The backend reads the owned report snapshot and verifies candidates before saving findings. */
export async function analyzeCveSimilarity(_events: any[], _selectedIPs: string[], snapshotId?: string): Promise<CveSimilarityResult[]> {
  if (!snapshotId) throw new Error('เปิดรายงานจาก Incident หรือ Hunting เพื่อวิเคราะห์ CVE จากหลักฐานที่เลือก');
  const response = await fetch('/api/cve/similarity', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('token')},body:JSON.stringify({snapshotId})});
  const data=await response.json();
  if(!response.ok)throw new Error(data.message||'วิเคราะห์ CVE ไม่สำเร็จ');
  if(data.unverified?.length&&!data.results?.length)throw new Error('มีข้อเสนอ CVE ที่ตรวจสอบกับแหล่งอ้างอิงไม่ได้ กรุณาลองใหม่');
  return data.results || [];
}
export function getSimilarityColor(level:string) { return level==='high'?'#dc2626':level==='medium'?'#ca8a04':'#16a34a'; }
export function getSimilarityBg(level:string) { return level==='high'?'rgba(220,38,38,.1)':level==='medium'?'rgba(202,138,4,.1)':'rgba(22,163,74,.1)'; }
