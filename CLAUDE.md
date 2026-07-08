# KKU-SIEM — AI Assistant Context (CLAUDE.md)

ไฟล์นี้คือ Context อ้างอิงหลักสำหรับ AI Assistants (Claude, Gemini ฯลฯ)
ให้ AI เข้าใจสถาปัตยกรรม เทคโนโลยี และโครงสร้างภายในของโปรเจกต์นี้อย่างถูกต้อง

---

## 🏗 Tech Stack & Architecture

### Frontend — SvelteKit 2 + TypeScript
- **Path:** `frontend/`
- **Port (dev):** `3000`
- **Styling:** Vanilla CSS ล้วน — ไม่ใช้ Tailwind
- **Theme:** Dark-mode Enterprise SIEM (คล้าย FortiGate / Splunk Dark)
- **Design System:** ใช้ CSS variables ผ่าน global classes `ds-*` ใน `app.css`
  - `ds-card`, `ds-card-head`, `ds-card-title`
  - `ds-table`, `ds-table-wrap`
  - `ds-btn`, `ds-badge`, `ds-search`, `ds-filters`
  - `ds-pagination`, `ds-page-btn`, `ds-page-info`
  - `ds-empty`, `ds-mono`, `ds-text-primary`
- **Icons:** Tabler Icons (CDN) — ใช้ class `ti ti-*`
- **Realtime:** ดึงข้อมูลผ่าน `eventsStore` (Svelte store) ที่รับจาก WebSocket

### Backend — NestJS 10 + TypeORM
- **Path:** `backend/`
- **Port:** `5001` (ตั้งค่าใน `main.ts` และ `vite.config.ts`)
- **Database:** SQLite (ผ่าน TypeORM) — ไม่ใช้ PostgreSQL / Redis ใน version นี้
- **Database file:** สร้างอัตโนมัติที่ `backend/honeypot.db`

### Core Services (backend/src/)

| ไฟล์ | หน้าที่ |
|------|--------|
| `main.ts` | Entry point — Listen port 5001 |
| `app.module.ts` | Root module — register entities, services |
| `log.service.ts` | อ่าน Log จาก 3 แหล่ง, Time-Correlation, Enrichment |
| `events.gateway.ts` | WebSocket Gateway (socket.io) — broadcast ข้อมูลให้ Frontend |
| `attacks.controller.ts` | REST API สำหรับดึงข้อมูลการโจมตี + Block/Unblock IP |
| `auth.controller.ts` | Login, Session audit, User CRUD API |
| `seed.service.ts` | **⚠️ CRITICAL** — สร้าง default admin/guest accounts ตอน startup |

### Entities (TypeORM)

| Entity | ตาราง | ข้อมูล |
|--------|-------|--------|
| `attack.entity.ts` | attacks | บันทึกการโจมตีแต่ละครั้ง |
| `user.entity.ts` | users | บัญชีผู้ใช้งาน (username, passwordHash, role) |
| `login-session.entity.ts` | login_sessions | ประวัติการ Login (audit log) |

---

## 🗂 Routes & Pages (Dashboard)

Layout หลักอยู่ที่ `frontend/src/routes/dashboard/+layout.svelte`
- มี **Auth Guard** — ตรวจ token ทุกครั้งที่เปลี่ยนหน้า
- มี **Idle Timer** — Auto logout หลังไม่มีการใช้งาน (ค่า default: 60 นาที)
- มี **Role Guard** — Admin เห็น Settings, User Management; Guest เห็นแค่ read-only

### หน้าที่มีอยู่จริง (ทุกหน้า)

**Detection & Analysis**
- `/dashboard` — SIEM Overview (KPI Cards, Live Threat Map, Timeline Chart, Attack Distribution)
- `/dashboard/alert` — Alerts & SOAR
- `/dashboard/logs` — Security Logs (multi-source)
- `/dashboard/analytics` — Analyst Center
- `/dashboard/investigate` — IP Deep-dive
- `/dashboard/mitre` — MITRE ATT&CK Matrix
- `/dashboard/faculty` — Faculty / Internal Threat Monitor
- `/dashboard/traffic` — Network Traffic

**Response & Intelligence**
- `/dashboard/blocked_ip_audit` — IP Block Audit
- `/dashboard/ioc` — Indicators of Compromise
- `/dashboard/threat` — Threat Intelligence
- `/dashboard/cve` — CVE Database

**Integration & Compliance**
- `/dashboard/wazuh` — Wazuh SIEM Integration
- `/dashboard/ai_monitor` — AI Monitor
- `/dashboard/malware` — Malware Analysis
- `/dashboard/ddos` — DDoS Detection
- `/dashboard/cis` — CIS Benchmark
- `/dashboard/pdpa` — PDPA Compliance
- `/dashboard/remoteaccess` — Remote Access Log

**System**
- `/dashboard/settings` — Settings (4 tabs: User Management, Login Audit, System Config, About)

---

## 🔑 Authentication System

**Login flow:**
1. ผู้ใช้ POST `/api/auth/login` → รับ `access_token` + `role`
2. Token เก็บใน `localStorage`
3. `eventsStore` จัดการ state (role, token)
4. WebSocket connect ใช้ token ใน handshake

**User roles:**
- `admin` — เข้าถึงได้ทุกอย่าง รวม Settings และ User Management
- `guest` — Read-only, ไม่เห็นหน้า Settings

**Default credentials:** ดูและแก้ไขได้ที่ `backend/src/seed.service.ts`
> ⚠️ ต้องเปลี่ยนก่อน Deploy ขึ้น Server จริงทุกครั้ง

**User Management API:**
- `GET /api/auth/users` — รายชื่อผู้ใช้ทั้งหมด
- `POST /api/auth/register` — สร้างบัญชีใหม่
- `DELETE /api/auth/users/:username` — ลบบัญชี
- `GET /api/auth/sessions` — Login audit log

---

## 📁 Log Files ที่ระบบอ่าน (Runtime)

`log.service.ts` อ่านไฟล์เหล่านี้ทุก 5 วินาที:

| Path | แหล่ง | รูปแบบ |
|------|-------|--------|
| `siem-logs/access_layer.log` | Nginx access log | CSV หรือ Combined Log Format |
| `cowrie-config/var/log/cowrie/cowrie.json` | Cowrie | JSON Lines |
| `siem-logs/cnc_outbound.log` | Custom | JSON Lines |

ไฟล์ที่ระบบเขียนเอง:
- `siem-logs/blocked_ips.json` — รายการ IP ที่ Block แล้ว

---

## 🔄 Realtime Data Flow

```
log.service.ts (ทุก 5 วินาที)
    → อ่าน 3 log sources
    → Time-Correlation
    → Enrichment (MITRE, ThreatScore, Faculty, GeoIP)
    → events.gateway.ts
        → socket.io broadcast → "new_attack"
            → Frontend eventsStore.update()
                → ทุก component ที่ bind กับ $eventsStore อัปเดตอัตโนมัติ
```

---

## 🛠 Coding Conventions

1. **CSS:** ใช้ global `ds-*` classes ก่อนเสมอ — อย่าเขียน local style ซ้ำ
2. **HTML:** ตรวจ `<div>` ปิดครบทุกครั้ง (Svelte จะ error 500 ถ้า tag ไม่ครบ)
3. **TypeScript:** ไม่บังคับ strict — ใช้ `any` ได้ถ้าจำเป็น
4. **Ports:** Backend = 5001, Frontend = 3000 (เปลี่ยนแล้วจาก 5000)
5. **ห้ามแตะ logic** ใน `eventsStore`, `log.service.ts`, `events.gateway.ts` โดยไม่จำเป็น

---

## 📦 Deployment

**Production:** `docker-compose.yml` — รัน Nginx, Frontend, Backend, Cowrie, WebTrap  
**Development:** `docker-compose.dev.yml` หรือรัน `npm run dev` แยก  
**Scripts:** `deploy.sh` (Linux) / `deploy.ps1` (Windows)
