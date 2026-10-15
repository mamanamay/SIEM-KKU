> **บันทึกย้อนหลัง:** อาจอ้างไฟล์/คำสั่งที่นำออกแล้ว ขั้นตอนติดตั้งปัจจุบันอยู่ใน [DEPLOY](../../DEPLOY.md) และ [README](../../README.md)

# Unified SSE receiver and Detection Results

ตรวจพบโค้ดคนละรุ่นในโฟลเดอร์หลักกับแพ็กเกจ ecs-release:

- โฟลเดอร์หลักรับ feed แบบ buffered Axios และรอให้ HTTP response จบ ขณะที่ `/v1/stream` ส่ง `text/event-stream` ต่อเนื่อง จึงเกิด `ERR_BAD_RESPONSE` ได้เมื่อ stream ถูกตัดหรือเกินขนาด response
- แพ็กเกจ SSE เดิมยังไม่รวมหน้า `/dashboard/detections` และ worker แบบ streaming ของโฟลเดอร์หลัก
- parser หลักยังไม่มี ECS branches ที่แพ็กเกจ SSE ใช้ สัญญา ACK นับรายการใหม่และซ้ำก็แตกต่างกัน

รวมสองชุดเป็นรุ่น `single-sse-v4`: URL/key จุดเดียว, native streaming, backpressure, checkpoint หลัง durable ACK, reconnect, ECS/raw parsers และ worker/replay รุ่นปัจจุบัน ช่องเชื่อม SSO/integrations คงแยกจาก stream

Detection Results เป็นหน้าอ่านผล engine ที่เก็บในฐานข้อมูล ทั้ง eligible alerts และผลคะแนนมากกว่า 0 ที่ต้องตรวจต่อ มี source/severity/unknown target filters และ evidence เปิดดูได้ ชื่อหน้า title/sidebar เป็นภาษาอังกฤษ Path เดิม Log ปกติและเหตุการณ์ที่ยังไม่พบ rule ให้ดู Log Ingestion การไม่มี alert ไม่ได้ยืนยันว่าเหตุการณ์ปลอดภัย

แพ็กเกจใช้ checksum และ staged build, เก็บ .env/TLS/volumes เดิม และมี migration ของ worker ที่มาจากโค้ดหลัก ไม่มี rollback ฐานข้อมูลอัตโนมัติ

## Deploy

```powershell
cd C:\Users\InternCY\Documents\GitHub\Demo_Honeypot
.\deploy-single-api.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2'
.\ecs-release\check-log-api.ps1
```

Settings > Log API ต้องแสดง `Receiver: single-sse-v4` และ diagnostic ต้องมี `sseSupported:true` หาก false แปลว่า backend image ที่กำลังรันยังเป็นรุ่นเดิม ใช้ helper ตรวจได้ก่อน deploy โดยไม่บันทึก log หรือเปิดเผย key

## Validation

Build backend/frontend/detection engine สำเร็จ บริการ 6 ตัวผ่าน health checks ในระบบทดสอบแยก ทดสอบ SSE 36 กรณี, classification 36, HTML/response guards 30 และ PostgreSQL end-to-end: 6 รายการ → 3 benign, 2 detected, 1 quarantined; reconnect เพิ่ม 1 รายการใหม่โดยไม่ซ้ำ API Detection Results แสดงและกรองผลที่เก็บจริงได้ Chromium ตรวจ title/sidebar/tables/evidence/source filter และรายละเอียดต้นฉบับ WAF ผ่าน Diagnostic ทดสอบ 5 response รูปแบบและไม่พิมพ์ข้อมูลลับผ่าน ระบบทดสอบและ volume ถูกเก็บกวาดหลังเสร็จ การตรวจ source จริงบน server ยังต้องรัน deploy/diagnostic ใน terminal ของผู้ใช้
