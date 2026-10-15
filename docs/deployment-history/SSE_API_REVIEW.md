> **บันทึกย้อนหลัง:** อาจอ้างไฟล์/คำสั่งที่นำออกแล้ว ขั้นตอนติดตั้งปัจจุบันอยู่ใน [DEPLOY](../../DEPLOY.md) และ [README](../../README.md)

# รับ log API แบบ SSE — 14 ตุลาคม 2026

## สาเหตุที่ยืนยันแล้ว

`https://cybertools-demo.kku.ac.th/v1/stream` ยืนยันตัวตนด้วย Bearer แล้วตอบ HTTP 200, `Content-Type: text/event-stream`, `Transfer-Encoding: chunked` ข้อมูล 72,912 bytes มาใน 332 ms และ response ยังไม่จบ นี่เป็น stream ต่อเนื่อง ไม่ใช่ JSON response ที่จบต่อรอบ โค้ดเดิมรอทั้ง response ก่อน parse และมีขีดจำกัดรวม 2 MB/15 วินาที จึงใช้กับ stream นี้ไม่ได้

118 generic ก่อนหน้านั้นมาจากการใช้ URL หน้าเว็บที่ไม่มี path ซึ่งคืน HTML ไม่ใช่ log ใหม่ โค้ดปฏิเสธ HTML แล้ว และไม่ลบหลักฐานเก่าหรือสร้าง alert เทียม

## สิ่งที่เปลี่ยน

- URL/key connection เดียวเหมือนเดิม ตรวจ SSE จาก Content-Type อัตโนมัติ หรือเลือก SSE ใน advanced settings
- Backend เปิด stream ต่อเนื่องแม้ปิดหน้าเว็บ แยก `data:` ทีละ frame เป็น ECS JSON เดี่ยว/array หรือ raw log แล้วใช้ classifier NGINX/Firewall เดิม เก็บ JSON ทั้งรายการ
- รองรับ UTF-8/BOM, LF/CRLF/CR, multiline data, comments/heartbeat, event ID และ retry ไม่ dispatch event ที่ส่งไม่ครบก่อน EOF
- หนึ่ง stream ต่อ backend มี backpressure: รอ durable receipt commit ก่อนอ่าน event ถัดไป จำกัดแต่ละ frame ด้วย LOG_API_MAX_RESPONSE_BYTES และแต่ละ log ด้วย MAX_LOG_BYTES ไม่ใช้ limit 2 MB กับข้อมูลรวมทั้งอายุ connection
- Cursor ถูกเก็บใน SystemConfig หลัง durable ACK เท่านั้น ไม่ต้อง migration ตารางใหม่ เมื่อ reconnect/restart ส่ง Last-Event-ID และ deduplicate ตามเนื้อหา/ID ของแต่ละ log
- เปลี่ยน URL/key/mapping แล้วหยุด connection เดิมก่อนเปิดใหม่ ไม่ใช้ cursor เก่าข้าม connection ที่เปลี่ยน fingerprint
- Save เมื่อเปิดดึงอัตโนมัติจะเริ่มรับทันที ปุ่มดึงตอนนี้ใช้ stream เดิมถ้ากำลังทำงาน ถ้าปิดอัตโนมัติจะรับหนึ่ง event หรือรอสูงสุด 5 วินาทีแล้วปิด
- Test GET ไม่เขียน receipts/cursor อ่านไม่เกิน 5 SSE records/5 วินาที หากมี stream เดิมจะอ่านตัวอย่างจาก cache ของ stream โดยไม่เปิดอีก connection
- Snapshot JSON/NDJSON/raw text ยังคงดึงตามรอบเดิม การตรวจ TLS/CA, DNS pinning, private destination policy และการไม่ตาม redirect ยังคงใช้
- หน้า Log API แสดงสถานะ SSE, จำนวนสะสมตั้งแต่ backend เริ่มรับ, เวลา event ล่าสุด, และข้อจำกัดเมื่อไม่มี SSE ID

## ใช้งานบน server

ยังไม่ได้ deploy server จริง ผู้ใช้กรอกรหัส SSH/sudo ใน terminal ตาม workflow เดิม:

```powershell
cd C:\Users\InternCY\Documents\GitHub\Demo_Honeypot
.\deploy-single-api.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2'
.\ecs-release\sync-config.ps1 -AfterDeploy
```

จากหน้า Settings > Log API:

1. ใช้ URL `https://cybertools-demo.kku.ac.th/v1/stream`
2. Authentication: Authorization Bearer ใช้ key ที่บันทึกแล้วได้ ไม่ต้องเปลี่ยน key
3. Format: Auto หรือ SSE ไม่ต้องกำหนดชนิด NGINX/Firewall แยก
4. เปิดดึงอัตโนมัติแล้วบันทึก จากนั้นตรวจสถานะ SSE และหน้า Log Ingestion (รวมรายการปกติ/กักไว้)

Config เพิ่ม `LOG_API_SSE_IDLE_TIMEOUT_MS=120000` เป็นเวลา socket ไม่มีข้อมูลก่อน reconnect ไม่ใช่เวลาสูงสุดของ connection Heartbeat ทำให้ connection คงอยู่ รอบดึงเดิมใช้เป็นเวลารอ reconnect (รวม jitter ของ scheduler 10 วินาที) หรือ snapshot polling; retry ของ SSE ใช้เมื่อมากกว่าค่าที่กำหนด ไม่มีการเพิ่ม budget ไม่จำกัดหรือปิด TLS

## ผลทดสอบ

- Build backend/frontend และ six-service health ผ่าน
- SSE parser/lifecycle 36 checks: UTF-8, bounds, commit/cursor, reconnect, failure ไม่เลื่อน cursor, partial EOF, stream lifetime มากกว่า 2 MB, preview/one-shot, Save/poll race และไม่ข้าม log จริงที่มี event name เป็น ping
- Snapshot connection/migration/dedupe/scheduled polling regression ผ่าน
- Postgres + detection + API: 6 SSE ตัวอย่าง -> 3 normal records, 2 alerts ที่มีหลักฐาน, 1 unknown ที่ quarantined; reconnect เพิ่มหนึ่งรายการโดยไม่มี duplicate
- Restart backend จริงใน stack จำลองแล้วรับจาก cursor ใน Postgres ต่อได้ ไม่ replay ซ้ำ
- Chromium: SSE status/cached preview แสดงจริง และ Log Ingestion เปิด raw/normalized WAF ที่ผู้ใช้ส่งให้ได้
- HTML/error regression 30 checks, classifier/migration 36 checks, diagnostic HTTP 5 scenarios และ Compose encoding/environment ผ่าน
- CLI pipeline diagnostics อ่าน SSE แบบ bounded ได้จริง พร้อม synthetic detector cases 32/32 ผ่าน (ไม่ใช่การวัด production precision/recall)

## ข้อจำกัดที่ต้องรู้

การส่งย้อนหลังหลังหลุดต้องให้ต้นทางส่ง SSE `id:` ที่คงที่และรองรับ Last-Event-ID หากไม่มี ID หรือไม่ replay ระบบรับใหม่และกันรายการซ้ำได้ตามเนื้อหา แต่รับรองไม่ได้ว่าข้อมูลระหว่างหลุดจะย้อนกลับมาครบ ขณะนี้ยังไม่ทราบสัญญา replay ของ provider จริง มีคำสั่ง `.\ecs-release\check-log-api.ps1` ดูจำนวน data/id fields แบบ sample โดยไม่แสดงข้อมูลหรือ key

ตัวอย่าง WAF ใหม่แยกเป็น Firewall ได้และเก็บ source 58.10.232.81, destination 202.28.118.200, observer KKU_FG3K4E/10.101.141.202, timestamp และ ECS ต้นฉบับครบ ผลในชุดทดสอบไม่สร้าง alert จาก warning/medium/passthrough เพียงอย่างเดียว เพราะยังไม่มี signature/หลักฐานที่เข้า alert policy นี่ไม่ใช่การยืนยันว่าเหตุการณ์ปลอดภัย รายละเอียดเปิดดูใน Log Ingestion ได้ ไม่ควรใช้จำนวน alert เป็นจำนวน log ทั้งหมด หรือใช้ผล synthetic เป็น production precision/recall

อ้างอิงรูปแบบ SSE: https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
