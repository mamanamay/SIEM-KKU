# ติดตั้งและดูแล KKUSIEM

คู่มือนี้ใช้ `docker-compose.yml` ที่รากโครงการโดยตรง มี 6 services: nginx, frontend, backend, pdf-renderer, postgres และ detection-engine ไม่มี release archive หรือ deploy helper ที่ต้องเรียกเพิ่มเติม

อ่าน [ผลตรวจส่งต่อ](docs/HANDOFF_READINESS.md) ก่อนใช้ production รอบตรวจนี้ยังไม่ได้ทำ end-to-end deployment บนเครื่องใหม่

## เตรียม deployment ใหม่

1. เตรียม Docker Engine + Compose v2, DNS, TLS และพื้นที่สำหรับ PostgreSQL/reports
2. คัดลอก `.env.example` เป็น `.env` สำหรับ deployment ใหม่ อย่าทับ environment ของระบบเดิม
3. กรอกค่าตามตาราง ปรับโดเมนและ SSO UAT ตัวอย่างให้ตรงกับระบบปลายทาง
4. วาง `nginx/certs/cert.pem` และ `nginx/certs/key.pem` ที่ตรงกับโดเมนและ chain โดยเก็บไว้นอก Git
5. ตรวจ Compose แล้วเริ่มระบบด้วยคำสั่งด้านล่าง

| ค่า | ข้อกำหนด |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` | บัญชีแอปและฐานข้อมูล; ใช้ password ที่ใส่ใน URL ได้ เพราะ Compose ประกอบ DATABASE_URL |
| `JWT_SECRET` | สุ่มอย่างน้อย 32 ตัว; production ปฏิเสธค่าอ่อนแอ/placeholder |
| `INGEST_API_KEY`, `DETECTION_API_KEY` | สุ่มแยกกัน อย่างน้อย 32 ตัว ส่งให้เฉพาะ service ที่ต้องใช้ |
| `PDF_RENDER_KEY` | สุ่มอย่างน้อย 32 ตัว เป็นความลับร่วมระหว่าง Backend และ PDF worker |
| `TOTP_ENCRYPTION_KEY` | hex 64 ตัว; ระบบเดิมต้องใช้ค่าเดิมเพื่อถอดรหัสข้อมูลที่บันทึกแล้ว |
| `BOOTSTRAP_ADMIN_PASSWORD` | ฐานข้อมูลว่างเท่านั้น: อย่างน้อย 12 ตัวตาม SeedService; ล้างจาก environment หลังเปลี่ยนรหัสและ bootstrap สำเร็จ |
| `PUBLIC_ORIGIN`, `SSO_CALLBACK_URL` | origin แบบ HTTPS และ callback ที่ลงทะเบียนจริง |
| `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, SSO URLs | จากผู้ให้บริการ SSO; ถ้ายังไม่ใช้ให้เข้าสู่ระบบ local |
| `OUTBOUND_ALLOWED_HOSTS`, `OUTBOUND_PRIVATE_HOSTS` | อนุญาตเฉพาะต้นทาง/ปลายทางที่จำเป็นสำหรับ Log API, SSO, AI, webhook |
| `SIEM_TRUSTED_PROXY_CIDRS` | ระบุ reverse proxy ที่เชื่อถือจริงสำหรับการตัดสิน client IP |
| `SIEM_RESPONSE_MODE` | ค่าเริ่มต้น disabled; เปิดเมื่อ integration และนโยบายตอบสนองพร้อม |

สร้าง random hex 32 bytes ได้ด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` รันใหม่แยกแต่ละ key อย่านำค่าจากเอกสาร/ระบบอื่นมาใช้ซ้ำ

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend detection-engine pdf-renderer frontend nginx
```

อย่าส่งผล `docker compose config` แบบเต็มหรือ logs ที่มี credentials ให้บุคคลอื่น การใช้ `--quiet` ตรวจ configuration โดยไม่พิมพ์ environment ที่แทนค่าแล้ว

Nginx เปิดเฉพาะ HTTP/HTTPS (ค่าเริ่มต้น 80/443) Backend 5000, Frontend 3000, engine 8100, PostgreSQL 5432 และ PDF 8200 อยู่ภายใน container networks PDF worker ใช้ network ภายในแยกและได้ capability สำหรับ Chromium sandbox ตาม Compose

`backend` bind public CA directory แบบ read-only ค่าเริ่มต้น `/etc/ssl/certs` เหมาะกับ Linux หากใช้ Docker Desktop/Windows ต้องกำหนด `SIEM_CA_DIR` เป็นโฟลเดอร์ host ที่มีอยู่จริงและ mount ได้ ตั้ง `NODE_EXTRA_CA_CERTS` เป็น path ของ public CA bundle ภายใน `/app/certs/` เมื่อจำเป็น

`nginx/generate-ssl.sh` เป็น helper self-signed ที่มี CN ของ UAT เดิม เหมาะกับการตรวจในสภาพแวดล้อมที่ควบคุมไว้เท่านั้น deployment ใหม่ควรใช้ certificate/SAN ที่ตรงกับ hostname จริง

## ฐานข้อมูลและการอัปเกรด

Backend image รัน `migration:run` ก่อน `start:prod` มี migration CLI ที่ `dist/data-source.js` และ production ใช้ `synchronize: false` migration แรกสร้าง baseline เฉพาะฐานข้อมูลแอปว่าง หากพบ schema บางส่วนจะหยุดให้ตรวจสอบก่อน

1. สำรอง PostgreSQL, volume รายงาน และ environment/keys ผ่านช่องทางที่ควบคุมสิทธิ์
2. ตรวจ migrations และทดลองกับฐานข้อมูลสำเนา อย่าใช้ข้อมูลจริงใน Git
3. อัปเกรด image แล้วตรวจ startup/migration logs และ health checks
4. เปิดเว็บ ตรวจบัญชี/สิทธิ์, ingestion receipt, detection, report PDF และ integrations ที่ใช้จริง

migrations หลายตัวไม่รองรับ automatic down อย่าใช้การลบ volume เป็น rollback ใช้ backup/restore ที่ทดสอบแล้ว `docker compose down` หยุดระบบแต่ **อย่าเพิ่ม `-v`** หากต้องรักษาข้อมูล

Volumes ถาวรคือ `pgdata`, `siem_logs`, `siem_reports` โดยรายงาน mount ที่ `/app/uploads` ต้องสำรองควบคู่กับฐานข้อมูล และเก็บ keys เดิมอย่างปลอดภัย การเปลี่ยน TOTP key โดยไม่ย้ายข้อมูลทำให้ข้อมูลเข้ารหัสเดิมอ่านไม่ได้

## ตรวจหลังเริ่มระบบ

- `GET /api/ingest/test` ใช้ทดสอบการเข้าถึง; `GET /api/ingest/ready` ตรวจความพร้อม DB ใช้ endpoint ภายในหาก proxy ต้องยืนยันตัวตน
- Login local ครั้งแรกด้วย bootstrap admin และเปลี่ยนรหัสตาม flow; ตั้ง MFA/SSO ตามนโยบาย
- ตั้ง Network Map และ Settings > Log API; ทดสอบตัวอย่างก่อน pull และตรวจ Log Ingestion/Detection Results
- แยก receipt accepted ออกจาก processed/incident แล้วดู retry/failed/quarantined เมื่อข้อมูลไม่ขึ้น Dashboard
- ทดสอบ WebSocket, รายงาน/PDF และสิทธิ์ของบัญชีอ่านอย่างเดียว/นักวิเคราะห์/ผู้ดูแล
- ทดสอบ outbound/Slack/SSO เฉพาะปลายทางที่พร้อมใช้งานจริง การดึง log และ test integration อาจเรียก service ภายนอก

## ก่อนนำ Git history เดิมไปใช้

พบค่า credentials ที่ยังตรงกับเครื่องนี้และ TLS private key ใน history ดู [HANDOFF_READINESS](docs/HANDOFF_READINESS.md) ต้องวางแผนเปลี่ยนค่าที่รั่วและจัดการ history ก่อนเผยแพร่ การสร้าง repository ใหม่จาก source-only export ช่วยไม่พาประวัติเก่าไปด้วย แต่ไม่ทดแทนการเปลี่ยนค่าที่เคยเปิดเผยแล้ว
