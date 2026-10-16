/** Deterministic analysis from persisted evidence; requires no AI key or network. */
export function localIncidentAnalysis(incident: any, evidence: any): string {
  const clean = (v: any) => String(v ?? 'ไม่ระบุ').replace(/[\r\n]+/g, ' ').slice(0, 350);
  const endpoint = (side: string) => {
    const context = incident.networkContext?.[side];
    return [side === 'source' ? incident.ip : incident.destIp, context?.organization, context?.cidr].filter(Boolean).map(clean).join(' · ') || 'ไม่ระบุ';
  };
  const stamp = Number(incident.timestampMs || incident.firstSeenMs);
  const time = Number.isFinite(stamp) && stamp > 0 ? new Date(stamp).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false }) + ' (UTC+7)' : 'ไม่ระบุ';
  const http = (evidence.items || []).filter((r: any) => r.http).slice(0, 5).map((r: any) =>
    `- Receipt ${clean(r.receiptId)}: ${clean(r.http.method)} ${clean(r.http.host)} ${clean(r.http.url || r.http.uri)} · HTTP ${clean(r.http.status)}`);
  const type = String(incident.type || '').toLowerCase();
  const recommendation = /traversal|lfi|rfi/.test(type) ? 'ตรวจ web access/error log และไฟล์ที่ถูกเรียก ทบทวนการตรวจ path และสิทธิ์อ่านไฟล์ของ web service' :
    /sql|injection/.test(type) ? 'ตรวจ query และ application log ที่สัมพันธ์กัน ทบทวน input validation และ parameterized queries' :
    /brute|ssh|login/.test(type) ? 'ตรวจ authentication log, บัญชีที่เกี่ยวข้อง และลำดับความพยายามเข้าสู่ระบบ พร้อมทบทวน rate limit/MFA' :
    'ตรวจหลักฐานต้นทางและปลายทางในช่วงเวลาเดียวกัน และเทียบกับนโยบายการใช้งานก่อนดำเนินการตอบสนอง';
  return [
    `## สรุปเหตุการณ์\nIncident ${clean(incident.id)}: ${clean(incident.type)} · ระดับ ${clean(incident.severity)}\nผลนี้ประมวลผลภายในระบบจากข้อมูลที่บันทึก ไม่ต้องเชื่อมต่อ AI ภายนอก`,
    `### 1. ต้นทางผู้เริ่มการเชื่อมต่อ\n${endpoint('source')}`,
    `### 2. ปลายทาง / ทรัพย์สินเป้าหมาย\n${endpoint('target')}\nพอร์ต ${clean(incident.destPort)} · โปรโตคอล ${clean(incident.protocol)}`,
    `### 3. พฤติกรรมและลำดับเวลา\nเวลา ${time}\nการตรวจจับ: ${clean(incident.type)}\nMITRE ATT&CK: ${clean(incident.mitreCode)}\nรายละเอียดจากระบบตรวจจับ: ${clean(incident.detail)}`,
    `### 4. หลักฐานและเส้นทางที่ยืนยันได้\n${endpoint('source')} → ${endpoint('target')}\nแหล่ง log: ${clean(incident.source)}\nมี receipt ${Number(evidence.total) || 0} รายการ แสดงตัวอย่าง ${Number(evidence.sampled) || 0} รายการ\n${http.length ? http.join('\n') : 'ไม่มี HTTP host/path ที่ยืนยันได้ใน receipt ตัวอย่าง'}\nไม่อนุมานอุปกรณ์หรือเส้นทางระหว่างกลางที่ไม่มีหลักฐาน`,
    `### 5. ผลลัพธ์และข้อจำกัด\nผลจาก sensor: ${clean(incident.outcome)} · สถานะ Incident: ${clean(incident.status)}\nALLOW, DENY, HTTP status หรือชื่อการตรวจจับเพียงอย่างเดียวไม่ยืนยันการเจาะสำเร็จ การบล็อกสำเร็จ หรือข้อมูลรั่วไหล\nการวิเคราะห์ภายในไม่ค้น CVE ภายนอก และไม่สร้างรหัส CVE จากการคาดเดา`,
    `### 6. ข้อเสนอแนะในการตรวจสอบ\n${recommendation}\nบันทึกผู้รับผิดชอบ เวลา และหลักฐานการแก้ไข ก่อนยืนยันผลหรือปิด Incident`
  ].join('\n\n');
}
