<div align="center">

# 🛡️ KKUSIEM Honeypot Dashboard

**Enterprise-grade Honeypot & SIEM Dashboard for Khon Kaen University**

[![SvelteKit](https://img.shields.io/badge/Frontend-SvelteKit-ff3e00?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL_16-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Deploy-Docker_Compose-2496ed?style=flat-square&logo=docker)](https://docs.docker.com/compose)

*Real-time threat detection · MITRE ATT&CK mapping · KKU SSO integration*

</div>

---

## 📖 ภาพรวมระบบ

KKUSIEM คือระบบ Honeypot & Security Dashboard สำหรับมหาวิทยาลัยขอนแก่น ออกแบบมาเพื่อ **ดักจับ ตรวจจับ และวิเคราะห์การโจมตีทางไซเบอร์** แบบ Real-time พร้อม Dashboard สำหรับทีม SOC (Security Operations Center)

```
Attacker ──► Honeypot (SSH/HTTP) ──► Log File ──► SIEM Engine ──► Dashboard
                                                        │
                                               PostgreSQL + WebSocket
```

---

## ✨ ฟีเจอร์หลัก

| หมวด | รายละเอียด |
|------|-----------|
| 🎯 **Real-time Dashboard** | แสดงการโจมตีแบบ Live ผ่าน WebSocket |
| 🗺️ **Threat Map** | แผนที่แสดงจุดกำเนิดการโจมตีบนเครือข่าย KKU |
| 🔬 **IP Investigation** | วิเคราะห์ IP เชิงลึก — reputation, location, history |
| 🛡️ **MITRE ATT&CK** | แมป Technique จากการโจมตีจริงสู่ Framework |
| 🚫 **Block & Isolate** | บล็อก IP และ Isolate Switch Port ผ่าน UI |
| 📊 **Analytics** | กราฟสถิติ ช่วงเวลา ประเภทการโจมตี |
| 🔑 **KKU SSO** | เข้าสู่ระบบผ่าน KKU Single Sign-On |
| 👥 **User Management** | จัดการบัญชีผู้ใช้ Admin / Guest พร้อม Whitelist |
| 📋 **Login Audit** | บันทึกประวัติการเข้าสู่ระบบทุกครั้ง |
| 🤖 **AI Analysis** | วิเคราะห์การโจมตีด้วย Google Gemini AI |

---

## 🏗️ Tech Stack

```
┌─────────────────────────────────────────────────┐
│                    Nginx (SSL)                   │
├──────────────────┬──────────────────────────────┤
│  SvelteKit (SPA) │     NestJS REST + WebSocket   │
│  TypeScript      │     TypeScript                │
├──────────────────┴──────────────────────────────┤
│         PostgreSQL 16  │  Redis 7                │
├─────────────────────────────────────────────────┤
│   Cowrie (SSH/Telnet)  │  WebTrap (HTTP)         │
└─────────────────────────────────────────────────┘
```

---

## 🚀 การติดตั้ง

### ข้อกำหนดเบื้องต้น
- Docker & Docker Compose
- SSL Certificate (สำหรับ HTTPS)
- KKU SSO Client ID & Secret (ถ้าใช้ SSO)

### 1. Clone & ตั้งค่า

```bash
git clone <repo-url>
cd honeypot-siem
cp .env.example .env
nano .env   # แก้ไขค่าให้ครบ
```

### 2. ตั้งค่า SSL

```bash
bash nginx/generate-ssl.sh
```

### 3. รันระบบ

```bash
docker compose up -d --build
```

### 4. เข้าใช้งาน

```
Dashboard  →  https://your-server
SSH Trap   →  :22222
Web Trap   →  :28081
```

---

## 🔐 บัญชีเริ่มต้น

| Username | Password | Role |
|---------|---------|------|
| `admin` | `Admin@1234!` | Admin — จัดการระบบได้ทั้งหมด |
| `guest` | `Guest@1234!` | Guest — ดูข้อมูลเท่านั้น |

> ⚠️ **เปลี่ยนรหัสผ่านทันทีหลังติดตั้ง** ผ่าน Settings → User Management

---

## ⚙️ Environment Variables

แก้ไขในไฟล์ `.env` ที่ root directory:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_strong_password
POSTGRES_DB=honeypot
JWT_SECRET=your_random_secret_key

# KKU SSO (ขอ Client ID จากผู้ดูแล KKU SSO)
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
SSO_CALLBACK_URL=https://your-domain/callback

# Ports
HTTP_PORT=80
HTTPS_PORT=443
COWRIE_SSH_PORT=22222
WEBTRAP_HTTP_PORT=28081

# AI (optional)
GEMINI_API_KEY=your-gemini-key
```

---

## 🐳 Docker Commands

```bash
# รันระบบ
sudo docker compose up -d --build

# ดู Logs
sudo docker logs honeypot_backend --tail=50

# Restart บริการเดียว
sudo docker compose restart backend

# หยุดและลบข้อมูลทั้งหมด
sudo docker compose down -v
```

---

## 📂 โครงสร้างโปรเจกต์

```
honeypot-siem/
├── frontend/          # SvelteKit Dashboard UI
│   └── src/routes/    # Pages: dashboard, logs, investigate, mitre, ...
├── backend/           # NestJS API + WebSocket + SIEM Engine
│   └── src/           # log.service.ts = SIEM core
├── honeypots/
│   ├── cowrie/        # SSH/Telnet honeypot config
│   └── webtrap/       # HTTP honeypot (Express.js)
├── nginx/             # Reverse proxy + SSL certs
├── logs/              # Runtime logs (cowrie, webtrap, siem)
├── .env               # Environment config (ไม่ commit)
└── docker-compose.yml
```

---

## 🔄 Data Flow

```
1. ผู้โจมตี เชื่อมต่อ Cowrie/WebTrap
2. Honeypot เขียน JSON log ลงไฟล์
3. SIEM Engine (log.service.ts) ตรวจจับและ parse
4. Backend correlate กับ NetFlow และ Firewall logs
5. บันทึกลง PostgreSQL + Broadcast WebSocket
6. Dashboard อัปเดตแบบ Real-time
```

---

## 📝 License

Copyright © 2025 Khon Kaen University — Security Operations Center

---

<div align="center">
<sub>Built with ❤️ for KKU SOC Team</sub>
</div>
