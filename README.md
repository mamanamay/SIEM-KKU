# KKUSIEM — Demo_Honeypot

ระบบ SIEM สำหรับรับ log จาก API ต้นทางหรือ POST, เก็บหลักฐานการรับเข้า, ตรวจจับด้วย rules/heuristics และแสดงผลเพื่อสืบสวนบนเว็บ มี NestJS API, SvelteKit dashboard และ FastAPI detection engine

> สถานะส่งต่อ 15 ตุลาคม 2026: Backend และ Frontend build ผ่าน แต่ Frontend type check ยังไม่ผ่าน และประวัติ Git เดิมมี credentials/private keys ดูข้อจำกัดและผลตรวจใน [HANDOFF_READINESS](docs/HANDOFF_READINESS.md) ก่อนนำขึ้น repository ขององค์กร

## เริ่มอ่าน

| เอกสาร | สำหรับ |
| --- | --- |
| [GUIDELINE.md](GUIDELINE.md) | ผู้ใช้งาน: หน้าที่ของทุกหน้าและลำดับการตรวจเหตุการณ์ |
| [DEPLOY.md](DEPLOY.md) | ผู้ดูแล: environment, TLS, Compose, migrations, backup |
| [CONTRIBUTING.md](CONTRIBUTING.md) | นักพัฒนา: ติดตั้ง ตรวจงาน และส่งการเปลี่ยนแปลง |
| [CLAUDE.md](CLAUDE.md) | นักพัฒนา/AI agent: จุดแก้โค้ดและข้อกำหนดระบบ |
| [Streaming log processing](docs/streaming-log-processing.md) | receipts, queue, detection, cursor และ backpressure |
| [HANDOFF_READINESS](docs/HANDOFF_READINESS.md) | ผลตรวจจริงและงานคงค้างก่อนส่งต่อ |

## ระบบทำงานอย่างไร

1. Backend ดึง API ที่บันทึกใน Settings > Log API หรือรับ `POST /api/ingest` ด้วย ingestion key
2. เก็บ raw event/receipt ลงฐานข้อมูลก่อนตอบรับ การรับสำเร็จยังไม่ใช่การตรวจจับเสร็จ
3. Worker claim งานด้วย lease; ส่ง batch ที่จำกัดจำนวน/ขนาดไป detection engine
4. Engine แปลง log และตรวจ rules/heuristics; ผลทุกระดับตรวจได้ที่ Detection Results ข้อมูลไม่ครบหรือไม่เป็น alert ไม่ได้หมายความว่าต้นฉบับหาย
5. Backend ประเมินหลักฐานและความเกี่ยวข้องกับเครือข่ายที่ลงทะเบียน เก็บ incident แล้วกระจายผ่าน Socket.IO
6. ผู้ใช้สืบสวน สร้างรายงาน และใช้ integrations ตามสิทธิ์และการตั้งค่า AI, Slack, SSO และการตอบสนองต้องมีการตั้งค่าของแต่ละ deployment

Shadow model เป็นตัวเลือก ไม่ได้หมายความว่ามี trained production model แนบมาครบ คะแนนหลักอ้างอิง rules/heuristics และหลักฐานจริง การบล็อกใน SIEM ต้องตรวจ response mode/integration ก่อนถือว่าบล็อกที่อุปกรณ์จริงแล้ว

## โครงสร้าง

```text
backend/
  src/                 API, auth, ingestion, receipts, reports, developer API
    entities/          TypeORM entities
    migrations/        PostgreSQL migrations (7 ไฟล์ ณ วันที่ตรวจ)
  config/              PDF worker, CA validation, network map
frontend/
  src/routes/          28 เส้นทางหน้าเว็บ และ server route
  src/lib/             components, reports, utilities, data
  src/stores/          สถานะที่ใช้ร่วมในเว็บ
  static/              รูปภาพและ assets
detection-engine/     FastAPI, parsers, rules, features, fusion, optional models
nginx/                 reverse proxy, TLS configuration และ helper
docker-compose.yml    nginx, frontend, backend, pdf-renderer, postgres, detection-engine
docs/                 คู่มือเพิ่มเติมและบันทึกย้อนหลัง
```

`backend/config/`, migrations, frontend data/assets และ `detection-engine/models/README.md` เป็นส่วนของชุดซอร์สที่ต้องส่งต่อ `node_modules`, `dist`, `build`, `.svelte-kit`, `.env`, certificates/private keys, SQLite และรายงาน runtime ถูกยกเว้นจาก Git

## รันด้วย Docker Compose

ต้องมี Docker Engine และ Compose v2 พร้อม TLS certificate ที่ตรงกับโดเมน

```bash
# deployment ใหม่เท่านั้น; อย่าทับ environment ของระบบเดิม
cp .env.example .env
# แก้ค่าที่เว้นว่างและ origin/SSO/allowlist ให้ตรงกับสภาพแวดล้อม
# วาง cert.pem และ key.pem ใน nginx/certs/ โดยไม่ commit
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

อ่าน [DEPLOY.md](DEPLOY.md) ก่อนเริ่มจริง Compose ใช้ PostgreSQL 16; Backend Dockerfile ใช้ Node 24, Frontend ใช้ Node 22, engine ใช้ Python 3.12 Backend รัน migrations ก่อน start และ PDF มี worker แยกที่ไม่เปิด host port

## พัฒนาจากซอร์ส

ใช้ Node 24 ตาม `.nvmrc` และ Python 3.12 แยก environment สำหรับ engine

```bash
npm --prefix backend ci --legacy-peer-deps
npm --prefix frontend ci --legacy-peer-deps
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix frontend run check
```

`--legacy-peer-deps` ตรงกับ Dockerfiles ปัจจุบัน มี peer-version debt ที่ระบุในรายงาน readiness อย่าถือว่า build ผ่านเท่ากับ type check หรือ end-to-end ผ่าน การรัน local API/environment อยู่ใน [CONTRIBUTING.md](CONTRIBUTING.md)

## บัญชีและข้อมูล

ฐานข้อมูล production ใหม่ต้องกำหนด `BOOTSTRAP_ADMIN_PASSWORD` อย่างน้อย 12 ตัวตาม SeedService ระบบสร้าง `admin` และบังคับเปลี่ยนรหัสผ่าน ไม่มีบัญชี default password สำหรับใช้งานทั่วไป ระบบเดิมต้องเก็บ `TOTP_ENCRYPTION_KEY` เดิมไว้เพื่ออ่าน MFA และ source credentials ที่เข้ารหัส

ข้อมูลเครือข่ายและตราสัญลักษณ์ในซอร์สเป็นของ deployment นี้ ผู้รับช่วงต้องปรับ Network Map, origin, SSO และ integrations ให้ตรงกับหน่วยงานก่อนใช้งานจริง ไม่แนบฐานข้อมูลหรือข้อมูลเหตุการณ์จริงเข้า Git

ใบอนุญาตที่รากโครงการ: [LICENSE](LICENSE) เอกสารใน `docs/deployment-history/` เป็นบันทึกย้อนหลัง คำสั่งเก่าที่อ้าง helper/package ซึ่งถูกนำออกแล้วไม่ใช่ขั้นตอนติดตั้งปัจจุบัน
