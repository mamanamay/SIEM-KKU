<div align="center">

# 🛡️ KKUSIEM Honeypot Command Center

**Honeypot & SIEM Dashboard สำหรับดักจับและวิเคราะห์การโจมตีแบบ Real-time**

[![SvelteKit](https://img.shields.io/badge/Frontend-SvelteKit-ff3e00?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square&logo=sqlite)](https://sqlite.org)
[![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-010101?style=flat-square&logo=socket.io)](https://socket.io)

</div>

---

## 📖 ภาพรวม

รับ Log การโจมตีจาก Honeypot (Cowrie, WebTrap) และ IDS/EDR (Suricata, Wazuh) → ตรวจจับ/ให้คะแนนความรุนแรงด้วย **rule-based engine** (ไม่ใช่ AI) → บันทึกลง DB และ broadcast ผ่าน WebSocket ทันที → AI (Gemini) วิเคราะห์สรุปเพิ่มเติมเฉพาะ event ที่ severity สูง → แสดงผลบน Dashboard (SvelteKit) พร้อมระบบล็อกอิน KKU SSO + 2FA

## 📂 โครงสร้างโปรเจกต์

```text
Demo_Honeypot/
├── backend/            # NestJS API + WebSocket + Detection Engine (log.service.ts)
├── frontend/           # SvelteKit Dashboard
├── honeypots/
│   ├── cowrie/         # SSH/Telnet Honeypot
│   └── webtrap/        # Web-based Attack Trap
├── nginx/              # Reverse Proxy + SSL (production)
├── detection-engine/   # ส่วนประมวลผล/จำแนก log เพิ่มเติม
├── tools/attacker/     # Attack Simulator (สำหรับ Demo/Testing)
├── docker-compose.yml  # Deploy แบบเต็มระบบ (nginx, backend, frontend, postgres, redis, honeypots)
└── docs/               # เอกสารเพิ่มเติม
```

ดูรายละเอียดสถาปัตยกรรม/data flow แบบลึกได้ที่ [CLAUDE.md](CLAUDE.md)

## 🚀 เริ่มใช้งาน (Local Dev)

**Backend**
```bash
cd backend
npm install
cp .env.example .env   # ตั้งค่าตัวแปร (ดูหัวข้อ Environment Variables)
npm run start:dev      # http://localhost:5000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

**หรือรันทั้งระบบด้วย Docker**
```bash
cp .env.example .env    # ตั้งค่าตัวแปรที่ root ก่อน
docker compose up -d --build
```

## 🔑 Credential เริ่มต้น (Demo/Dev เท่านั้น)

ระบบ seed ผู้ใช้ 2 คนไว้ให้อัตโนมัติตอน backend เริ่มรันครั้งแรก (`backend/src/seed.service.ts`):

| Username | Password      | Role  | สิทธิ์ |
|----------|---------------|-------|--------|
| `admin`  | `Admin@1234!` | admin | ดู Dashboard, บล็อก IP, ตั้งค่า 2FA/SOAR |
| `guest`  | `guest123`    | guest | ดู Dashboard และ AI Analysis เท่านั้น (read-only) |

⚠️ **ก่อนขึ้น Production ต้องเปลี่ยนรหัสผ่านทั้งสองบัญชีทันที** หรือลบ/ปิดการ seed ออกไป

## ⚙️ Environment Variables หลัก (`.env`)

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `JWT_SECRET` | เข้ารหัส Access Token — ต้องตั้งเป็นสตริงสุ่มยาว |
| `GEMINI_API_KEY` | เปิดใช้ AI narrative (ไม่ตั้งไว้ระบบยัง fallback เป็น rule-based ได้ปกติ) |
| `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` / `SSO_CALLBACK_URL` | เชื่อมต่อ KKU SSO |
| `INGEST_API_KEY` | ป้องกันคนภายนอกยิง Log ปลอมเข้า `/api/attacks` |
| `POSTGRES_*`, `HTTP_PORT`, `HTTPS_PORT`, `COWRIE_SSH_PORT`, `WEBTRAP_HTTP_PORT` | ใช้เฉพาะตอน deploy ด้วย Docker Compose |

ค่าตัวอย่างทั้งหมดอยู่ใน [.env.example](.env.example) และ [backend/.env.example](backend/.env.example) — **ห้าม commit ไฟล์ `.env` จริงขึ้น git**

## 🌐 API หลัก

- `POST /api/attacks` — รับ Log การโจมตี (ต้องมี `INGEST_API_KEY`)
- `GET /api/attacks/logs` — ดึงประวัติการโจมตี
- `GET /api/auth/sso/login` / `POST /api/auth/sso/callback` — เข้าสู่ระบบผ่าน KKU SSO
- `POST /api/auth/2fa/verify` — ยืนยัน TOTP เพื่อรับ JWT
- `POST /api/attacks/auto-triage` — ให้ AI แนะนำ IP ที่ควร auto-block (SOAR)

## ⚠️ Troubleshooting

- **เข้าเว็บไม่ได้ / API ไม่ตอบ**: เช็คว่า backend รันอยู่ที่พอร์ต `5000` (`process.env.PORT ?? 5000`)
- **SSO login พลาด**: `SSO_CALLBACK_URL` ใน `.env` ต้องตรงกับที่ลงทะเบียนไว้กับ KKU SSO ทุกตัวอักษร
- **AI ไม่วิเคราะห์ event ใหม่**: มี rate limit 1 ครั้ง/IP/60 วินาที ต่อการเรียก Gemini
