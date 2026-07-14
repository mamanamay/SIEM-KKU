# 🛡️ KKU-SIEM — Honeypot & Security Dashboard

[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-ff3e00?logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/NestJS-10.x-ea2845?logo=nestjs)](https://nestjs.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?logo=docker)](https://docs.docker.com/compose)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

ระบบ SIEM Dashboard แบบ Real-time สำหรับมหาวิทยาลัยขอนแก่น (KKU) ดักจับและวิเคราะห์การโจมตีทางไซเบอร์จาก Cowrie SSH/Telnet Honeypot และ Web Trap แสดงผลแบบ Full-stack พร้อม WebSocket Live Update

---

## 📐 สถาปัตยกรรมระบบ (Architecture)

```
Internet / Attackers
        │
        ▼
┌───────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)               │
│   :80/:443 → Frontend   │   /api, /socket.io → Backend │
└───────────────────────────────────────────────────────┘
        │                           │
        ▼                           ▼
┌─────────────────┐      ┌──────────────────────────────┐
│  SvelteKit 2    │      │        NestJS 10              │
│  Frontend UI    │◄─────│  REST API + WebSocket Gateway │
│  (Port 3000)    │      │  (Port 5001)                  │
└─────────────────┘      └──────────────┬───────────────┘
                                        │ reads logs
                          ┌─────────────┼──────────────┐
                          ▼             ▼              ▼
                   access_layer.log  cowrie.json  cnc_outbound.log
                   (Nginx Access)  (SSH Honeypot)  (C&C Detect)

Honeypot Sensors:
  • Cowrie  — SSH/Telnet Honeypot (Port 2222/2223)
  • WebTrap — Web Attack Trap: SQLi, Path Traversal (Port 8081)
```

---

## 🗂️ โครงสร้างไฟล์ (Project Structure)

```
Demo_Honeypot/
├── frontend/                    # SvelteKit 2 + TypeScript UI
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte         # หน้า Login
│   │   │   └── dashboard/
│   │   │       ├── +layout.svelte   # Layout หลัก + Sidebar + Auth Guard
│   │   │       ├── +page.svelte     # SIEM Dashboard Overview
│   │   │       ├── alert/           # Alerts & SOAR Rules
│   │   │       ├── logs/            # Security Logs (Multi-source)
│   │   │       ├── analytics/       # Analyst Center / Statistics
│   │   │       ├── investigate/     # IP Deep-dive Investigation
│   │   │       ├── mitre/           # MITRE ATT&CK Matrix
│   │   │       ├── cve/             # CVE Database Lookup
│   │   │       ├── blocked_ip_audit/ # Firewall Block Audit
│   │   │       ├── ioc/             # Indicators of Compromise
│   │   │       ├── network-map/     # Network Map
│   │   │       └── settings/        # System Settings + User Management
│   │   └── stores/
│   │       ├── events.ts            # WebSocket store (realtime data)
│   │       └── faculties.ts         # KKU Faculty IP mapping
│   ├── Dockerfile
│   └── vite.config.ts              # Proxy /api → backend:5001
│
├── backend/                     # NestJS 10 + TypeORM
│   ├── src/
│   │   ├── main.ts                  # Entry point (Port 5001)
│   │   ├── app.module.ts            # Root module
│   │   ├── log.service.ts           # Log reader + Correlation engine
│   │   ├── events.gateway.ts        # WebSocket Gateway (socket.io)
│   │   ├── attacks.controller.ts    # Attack API + Block/Unblock IP
│   │   ├── auth.controller.ts       # Login + Session + User Management API
│   │   ├── seed.service.ts          # Database seed (default users) ⚠️
│   │   └── entities/
│   │       ├── attack.entity.ts     # Attack record schema
│   │       ├── user.entity.ts       # User account schema
│   │       └── login-session.entity.ts # Login audit schema
│   └── Dockerfile
│
├── nginx/
│   ├── nginx.conf                   # Reverse proxy config
│   └── generate-ssl.sh              # Self-signed SSL certificate script
│
│   └── blocked_ips.json             # Blocked IP list (persisted)
│
├── docker-compose.yml               # Production deployment
├── docker-compose.dev.yml           # Local development
├── .env.example                     # Environment variable template
├── deploy.sh                        # Linux/Mac deploy script
├── deploy.ps1                       # Windows deploy script
└── README.md
```

---

## 🖥️ หน้า Dashboard ทั้งหมด (11 Routes)

### Detection & Analysis
| Route | หน้า |
|-------|------|
| `/dashboard` | SIEM Overview — KPI Cards, Live Threat Map, Charts |
| `/dashboard/alert` | Alerts & SOAR — กฎแจ้งเตือนและ Response อัตโนมัติ |
| `/dashboard/logs` | Security Logs — Multi-source log viewer พร้อม filter |
| `/dashboard/analytics` | Analyst Center — สถิติเชิงลึก, Top Attackers |
| `/dashboard/investigate` | IP Investigation — วิเคราะห์ IP แบบ Deep-dive |
| `/dashboard/mitre` | MITRE ATT&CK Matrix — จำแนก Tactic & Technique |
| `/dashboard/network-map` | Network Map — แผนผังเครือข่าย |

### Response & Intelligence
| Route | หน้า |
|-------|------|
| `/dashboard/blocked_ip_audit` | IP Block Audit — จัดการ Firewall Block List |
| `/dashboard/cve` | CVE Lookup — ค้นหาช่องโหว่ |
| `/dashboard/api-history` | API History — ประวัติการใช้งาน API |

### System
| Route | หน้า |
|-------|------|
| `/dashboard/settings` | System Settings — User Management, Login Audit, Config |

---

## ⚙️ การรันบน Localhost (Local Development)

### สิ่งที่ต้องมี
- Node.js 20+
- npm

### ขั้นตอน

```bash
# 1. Clone
git clone https://github.com/mamanamay/Demo_Honeypot.git
cd Demo_Honeypot

# 2. รัน Backend (Terminal 1)
cd backend
npm install
npm run start:dev
# Backend จะ Listen ที่ Port 5001

# 3. รัน Frontend (Terminal 2)
cd frontend
npm install
npm run dev
# Frontend จะ Listen ที่ Port 3000

# 4. เปิดเบราว์เซอร์
open http://localhost:3000
```

---

## 🐳 การ Deploy ขึ้น Server ด้วย Docker

### สิ่งที่ต้องมี
- Docker 24+
- Docker Compose v2+

### ขั้นตอน

```bash
# 1. Clone บน Server
git clone https://github.com/mamanamay/Demo_Honeypot.git
cd Demo_Honeypot

# 2. ตั้งค่า Environment
cp .env.example .env
# แก้ไข .env ตามต้องการ (PORT, Hostname ฯลฯ)

# 3. สร้าง SSL Certificate (Self-signed)
bash nginx/generate-ssl.sh

# 4. Build และ Start ทุก Service
docker-compose up -d --build

# 5. ตรวจสอบ
docker-compose ps
docker-compose logs -f backend
```

เปิดเบราว์เซอร์: `https://your-server-ip`

> **หมายเหตุ:** เบราว์เซอร์อาจแจ้งเตือน SSL (self-signed) — กด Advanced > Proceed

### Port ที่ใช้งาน

| Service | Port | หมายเหตุ |
|---------|------|----------|
| Nginx (HTTP) | 80 | Redirect → HTTPS |
| Nginx (HTTPS) | 443 | Main entry point |
| Frontend (internal) | 3000 | ผ่าน Nginx proxy |
| Backend API (internal) | 5001 | ผ่าน Nginx proxy |
| Cowrie SSH Honeypot | 2222 | สำหรับดักจับ SSH |
| Cowrie Telnet | 2223 | สำหรับดักจับ Telnet |
| WebTrap | 8081 | สำหรับดักจับ Web Attack |

---

## 🔑 บัญชีผู้ใช้เริ่มต้น (Default Credentials)

> [!CAUTION]
> **⚠️ CRITICAL — ต้องเปลี่ยนรหัสผ่านก่อน Deploy ขึ้น Server จริงทุกครั้ง**

รหัสผ่านเริ่มต้นถูกกำหนดไว้ที่ไฟล์:
**`backend/src/seed.service.ts`**

ระบบมี 2 บทบาท:
- **`admin`** — เข้าถึงได้ทุกเมนู รวมถึง Settings และ User Management
- **`guest`** — ดูข้อมูลได้เท่านั้น ไม่สามารถแก้ไขหรือเข้า Settings ได้

การเพิ่ม/ลบบัญชีหลัง Deploy สามารถทำได้ผ่าน **System Settings → User Management** ใน Dashboard

---

## 📁 Log Files ที่ระบบอ่าน (Runtime)

ไฟล์ Log เหล่านี้ถูกสร้างขึ้น runtime และไม่ได้อยู่ใน Git:

| ไฟล์ | แหล่ง | เนื้อหา |
|------|-------|---------|
| `siem-logs/access_layer.log` | Nginx | HTTP Access Log ของเว็บ Production |
| `cowrie-config/var/log/cowrie/cowrie.json` | Cowrie | SSH/Telnet Attack Events |
| `siem-logs/cnc_outbound.log` | Custom Sensor | C&C Outbound Detection |
| `siem-logs/blocked_ips.json` | Dashboard UI | รายการ IP ที่ถูก Block (persisted) |

---

## 🔄 วงจรการทำงาน (Core Workflow)

```
1. Attacker → SSH Port 2222 หรือ Web Port 8081
        │
        ▼
2. Cowrie / WebTrap บันทึก Event → cowrie.json / webtrap.json
        │
        ▼
3. log.service.ts (NestJS) อ่าน Log ทุก 5 วินาที
   → Time-Correlation (เชื่อมโยง 3 log sources)
   → Enrichment (MITRE Code, Threat Score, Faculty Mapping, GeoIP)
        │
        ▼
4. events.gateway.ts → Broadcast ผ่าน WebSocket (socket.io)
        │
        ▼
5. SvelteKit Frontend รับ Event → Update UI แบบ Real-time
   → Dashboard, Alerts, Maps, Charts อัปเดตทันที
        │
        ▼
6. Admin สามารถ Block IP ผ่าน UI → บันทึกลง blocked_ips.json
```

---

## 📦 License

โปรเจกต์นี้อยู่ภายใต้ [MIT License](LICENSE)
