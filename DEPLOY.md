# ติดตั้งและดูแล KKUSIEM

คู่มือนี้ใช้ `docker-compose.yml` ที่รากโครงการโดยตรง มี 6 services: nginx, frontend, backend, pdf-renderer, postgres และ detection-engine

## อัปเดต Incident / Report / CVE / Wallboard บน server เดิม

รันจาก Windows PowerShell ในโฟลเดอร์หลัก:

```powershell
cd 'C:\Users\InternCY\Documents\GitHub\Demo_Honeypot'
.\deploy.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2'
```

ตัวนี้ส่งไฟล์จริงผ่าน SCP จาก source ปัจจุบันในโฟลเดอร์หลัก ตามรายการ 50 ไฟล์ที่ระบุใน `deploy.ps1` แล้ว build/up เฉพาะ backend, frontend, detection-engine ไม่สร้าง archive ไม่ใช้ patch และไม่รัน pg_dump สำรองฐานข้อมูล ใช้ Compose project, Compose files และ env file ของ backend เดิม การเริ่ม backend ยังรัน migration ตาม Dockerfile เดิม และ helper จะหยุดหากมี migration อื่นค้างอยู่

ถ้าต้องการส่งไฟล์อย่างเดียวแล้วจัดการ Docker เอง ให้เพิ่ม `-UploadOnly`:

```powershell
.\deploy.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2' -UploadOnly
```

จะเห็น `UPDATED <path>` ทุกไฟล์ และ `UPLOAD_COMPLETE_50_FILES` เมื่อคัดลอกครบ หากเลือก deploy เต็มจะมีสถานะ build/start ต่อ และจบด้วย `DEPLOY_COMPLETE` ตัวเลือก `-CheckOnly` ตรวจไฟล์ที่ส่งกับ project เดิมโดยยังไม่คัดลอกเข้าแอปหรือ build/start ส่วน `-Port`, `-IdentityFile`, `-ComposeProjectName`, `-EnvFile` ยังใช้ได้

ใส่รหัสผ่าน SCP/SSH และ sudo เมื่อ terminal ขอ ตัวสคริปต์พักไฟล์ในโฟลเดอร์ชั่วคราวให้อัตโนมัติเพื่อใช้ SCP ครั้งเดียว และใช้ sudo วางไฟล์ที่เดิมเป็นของ root โดยรักษาสิทธิ์/เจ้าของของไฟล์เดิม ไม่เปลี่ยนสิทธิ์ทั้งโปรเจกต์ รายการที่ส่งไม่รวม `.env`, Compose, manifests/lockfiles หรือไฟล์อื่น และไม่สั่ง down หรือลบ volumes

ก่อนใช้ตัวนี้ ให้หยุด deploy รุ่นเก่าด้วย Ctrl+C หากยังมี pg_dump เก่าค้าง ตัว deploy เต็มจะหยุดก่อนคัดลอกไฟล์ เพื่อไม่ให้ backup เก่าขวาง migration; `-UploadOnly` ส่ง source ได้หลังตัว deploy เก่าหยุดแล้ว

อ่าน [ผลตรวจส่งต่อ](docs/HANDOFF_READINESS.md) ก่อนใช้ production รอบตรวจนี้ยังไม่ได้ทำ end-to-end deployment บนเครื่องใหม่

## เปลี่ยนโดเมนเป็น siem.kku.ac.th บน server เดิม

1. ตั้ง DNS ของ `siem.kku.ac.th` ให้ชี้ไปยัง server/reverse proxy ที่ใช้งานจริง และติดตั้งใบรับรองพร้อม chain ที่มี SAN ครอบคลุม `siem.kku.ac.th` ใน `nginx/certs/cert.pem` กับ private key ที่คู่กันใน `nginx/certs/key.pem` หาก TLS จบที่ proxy ภายนอก ต้องตั้งโดเมน/ใบรับรองที่ proxy นั้นด้วย
2. ให้ผู้ดูแล KKU SSO เปลี่ยน callback ของ client ที่ใช้งานเป็น `https://siem.kku.ac.th/callback` ส่วน `SSO_WEB_URL`, `SSO_API_URL`, client ID/secret และ outbound allowlist ใช้ค่าของผู้ให้บริการเดิม เว้นแต่ผู้ดูแล SSO แจ้งให้เปลี่ยน
3. แก้เฉพาะค่าต่อไปนี้ใน env file ที่ deployment เดิมใช้ โดยคง credentials และค่าอื่นไว้ ไม่คัดลอก `.env.example` ทับ `.env` เดิม:

```dotenv
PUBLIC_ORIGIN=https://siem.kku.ac.th
SSO_CALLBACK_URL=https://siem.kku.ac.th/callback
SIEM_PUBLIC_BASE_URL=https://siem.kku.ac.th
SIEM_MCP_ALLOWED_ORIGINS=https://siem.kku.ac.th
```

`SIEM_PUBLIC_BASE_URL` และ `SIEM_MCP_ALLOWED_ORIGINS` ปล่อยว่างได้เมื่อใช้ Compose นี้ เพราะรับค่าจาก `PUBLIC_ORIGIN` หาก MCP ต้องรับ browser client จาก origin อื่นที่อนุมัติไว้แล้ว ให้คง origin เหล่านั้นในรายการที่คั่นด้วย comma ด้วย

4. ส่ง source รุ่นนี้ด้วย `deploy.ps1` จาก checkout ที่แก้แล้ว รายการส่งรวม SSO controller, API catalog และหน้า Developer API แล้ว แต่ไม่ส่ง env file หรือใบรับรอง จัดการสองส่วนนี้บน server ตามข้อข้างต้น
5. บน server เข้าโฟลเดอร์ deployment เดิม ใช้ Compose project, env file และ override ชุดเดิมทุกคำสั่ง ตัวอย่างด้านล่างใช้ project `siem_v2` กับ `.env` และไม่มี override; เปลี่ยน arguments ให้ตรงกับระบบจริง:

```bash
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml config --quiet
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml build backend frontend
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml run --rm --no-deps nginx nginx -t
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml up -d --no-deps --force-recreate --wait --wait-timeout 120 backend frontend nginx
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml ps
```

หาก `deploy.ps1` build backend/frontend สำเร็จแล้ว ไม่ต้องรัน build ซ้ำ ต้อง recreate ทั้งสาม services เพื่อให้ backend รับ public URL ใหม่, frontend รับ `ORIGIN` ใหม่ และ Nginx รับ HTTP redirect/ใบรับรองใหม่ การเปลี่ยนโดเมนไม่ต้องแก้ schema หรือย้ายฐานข้อมูล แต่ backend startup ยังตรวจและรัน migrations ที่ค้างตามปกติ

6. ตรวจ HTTPS โดยไม่ข้ามการตรวจ certificate, HTTP redirect ไปโดเมนใหม่, `/api/ingest/ready`, local login/MFA, KKU SSO, WebSocket และ URL ที่แสดงในหน้า Developer API ผู้ใช้ต้องเข้าสู่ระบบใหม่บนโดเมนใหม่ และต้องเปลี่ยน URL ใน producer, API/MCP client และลิงก์ภายนอกที่ยังใช้โดเมนเก่า

Frontend ใช้ `/api` และ `/socket.io/` ตาม origin ที่เปิดอยู่ Nginx ใช้ `server_name _;` และ redirect จาก `PUBLIC_ORIGIN` จึงไม่ต้องแก้ชื่อ host ใน `nginx.conf` สำหรับรูปแบบ deployment นี้

## Deploy หยุดด้วย ECONNREFUSED ที่ PostgreSQL

หาก `migration:show` แสดง `ECONNREFUSED ...:5432` แปลว่าเชื่อมต่อ PostgreSQL ไม่ได้ในขณะนั้น ยังไม่ได้พิสูจน์ว่าเป็นปัญหา SSO หรือรหัสผ่านฐานข้อมูล สคริปต์ deploy จะเริ่ม container PostgreSQL เดิมหากหยุดอยู่ แล้วรอ healthcheck สูงสุด 120 วินาทีก่อนตรวจ migrations โดยใช้ `--no-recreate` และไม่ลบ volume หากฐานข้อมูลยังไม่พร้อม จะหยุดและแสดงสถานะกับ PostgreSQL logs เพื่อหาสาเหตุ เช่น crash, recovery หรือพื้นที่เต็ม

ตรวจจาก SSH ในโฟลเดอร์ deployment เดิม โดยใช้ project/env/override ชุดเดิม ตัวอย่าง:

```bash
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml ps -a postgres backend
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml logs --tail=60 postgres
```

แก้สาเหตุของฐานข้อมูลก่อนรัน `deploy.ps1` ซ้ำ ห้ามใช้ `down -v` หรือสร้างฐานใหม่เพื่อแก้ connection refused คำเตือน orphan `siem_redis` และ npm update ไม่ใช่สาเหตุของ error นี้

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

`nginx/generate-ssl.sh` เป็น helper self-signed สำหรับทดสอบ โดยอ่าน CN/SAN ของ `siem.kku.ac.th` จาก `nginx/certs/openssl.cnf` และไม่เขียนทับ `cert.pem` ที่มีอยู่ production ควรใช้ certificate พร้อม chain ที่เชื่อถือได้และ SAN ตรงกับ hostname จริง

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

รอบ Report/Thai CVE เพิ่ม migration `CveThaiTranslation1792137600000` เพื่อสร้างตาราง cache คำแปลใหม่เท่านั้น Backend startup รัน migration ตามเดิม helper ยอมรับ migration ที่ค้างเฉพาะสองรายการของงานนี้ (`IncidentEvidence1792100000000` และ `CveThaiTranslation1792137600000`) ก่อน deploy ให้ตรวจ PostgreSQL ของระบบเดิมว่าพร้อมใช้งาน คำแปลใหม่ต้องใช้ AI integration ของบัญชีผู้ใช้; หากไม่มี key จะอ่านได้เฉพาะภาษาไทยจากต้นฉบับหรือคำแปลที่บันทึกไว้ และแสดงสาเหตุตามจริง
