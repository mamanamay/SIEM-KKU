<div align="center">

# 🛡️ KKUSIEM Honeypot Command Center

**ระบบ Honeypot และ SIEM อัจฉริยะสำหรับดักจับ วิเคราะห์ และตอบสนองการโจมตีทางไซเบอร์แบบ Real-time**

[![SvelteKit](https://img.shields.io/badge/Frontend-SvelteKit-ff3e00?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![FastAPI](https://img.shields.io/badge/AI_Engine-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791?style=flat-square&logo=postgresql)](https://postgresql.org)
[![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-010101?style=flat-square&logo=socket.io)](https://socket.io)

</div>

---

## 📖 ภาพรวมของระบบ (System Overview)

KKUSIEM เป็นระบบศูนย์กลางที่รวบรวม Log จากอุปกรณ์ต่างๆ นำมาประมวลผลด้วย **AI Detection Engine** และ **Rule-based Engine** เพื่อวิเคราะห์ความรุนแรง แยกแยะประเภทการโจมตี และแสดงผลบน Dashboard แบบ Real-time

**หลักการสำคัญ — LAN-Scope Filtering:**
> Dashboard จะแสดงเฉพาะ Log การโจมตีที่ **เป้าหมาย (เหยื่อ) อยู่ในวงแลนขององค์กร** ตามที่กำหนดไว้ใน Network Map (`ip_records.json`) เท่านั้น Log ที่ไม่มี Destination IP ในวงแลนจะถูก Drop อัตโนมัติ

**กระบวนการทำงานหลัก (Data Flow):**
1. **Ingest:** รับ Log จาก Honeypot (Cowrie, WebTrap), IDS (Suricata, Wazuh), และ Syslog (Fortigate, Nginx)
2. **LAN Filter:** กรองให้เหลือเฉพาะ Event ที่ Destination IP อยู่ใน subnet ที่บันทึกใน Network Map
3. **Detect & Correlate:**
   - Syslog (Firewall/Nginx) ส่งเข้า **Detection Engine (AI/ML)** เป็น batch ทุก 2 วินาที (สูงสุด 50 lines/batch)
   - Log จาก Honeypot/IDS ประมวลผลด้วย **Rule-based Engine** ใน Backend ทันที
   - หาก Detection Engine ไม่ตอบสนอง ระบบจะ **Fallback** ส่ง Log ด้วย Basic Parser อัตโนมัติ
4. **Store & Broadcast:** บันทึกลง PostgreSQL และส่งหน้า Dashboard ผ่าน WebSocket ทันที
5. **AI Narrative:** Gemini สรุปเหตุการณ์ระดับ High/Critical เป็นภาษาไทย
6. **Respond (SOAR):** SOC Team กดบล็อก IP หรือทำ Auto-triage จาก Dashboard

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
Demo_Honeypot/
├── backend/            # NestJS API + WebSocket (Data ingestion & Rule-based correlation)
│   └── src/
│       ├── log.service.ts        # ⚙️ Core: Ingest → LAN Filter → DB → WebSocket
│       ├── network-map.service.ts # 🗺️ LAN subnet matching (ip_records.json)
│       ├── ingest.controller.ts  # POST /api/ingest — รับ log จากทุกต้นทาง
│       └── ip_records.json       # รายชื่อ subnet วงแลนองค์กร (644 records)
├── frontend/           # SvelteKit Dashboard (Real-time monitoring & SOAR)
├── detection-engine/   # 🧠 AI/ML Engine (FastAPI) — Isolation Forest + XGBoost
├── honeypots/          # Cowrie (SSH), WebTrap (HTTP)
├── nginx/              # Reverse Proxy + SSL config (Production)
├── logrotate.conf      # Log rotation config (hourly, no copytruncate)
└── docker-compose.yml  # ไฟล์ Deploy ระบบแบบเต็มรูปแบบ
```

ดูรายละเอียดสถาปัตยกรรมแบบเจาะลึกได้ที่ [CLAUDE.md](CLAUDE.md)

## 🗺️ การทำงานของ LAN Filter (Network Map)

ทุก Log ที่เข้ามาจะถูกตรวจสอบว่า **เครื่องเป้าหมาย (destIp) อยู่ในวงแลนองค์กรหรือไม่** ก่อนบันทึกลงฐานข้อมูล:

```
isRelevant = isLanDest(destIp)          ← destIp อยู่ใน ip_records.json?
           || (!destIp && isLanSensor)  ← ไม่รู้ destIp แต่ sensor ของเราอยู่ใน LAN

ถ้า false → Drop เงียบ (ไม่บันทึก ไม่แสดงบน Dashboard)
```

- **`ip` field** บน Dashboard = **IP ผู้โจมตี** (อาจเป็น IP ต่างประเทศ)
- **`destIp` field** = **IP เครื่องเหยื่อในวงแลน** (ต้องอยู่ใน ip_records.json)
- Subnet ทั้งหมด (644 records) จัดการผ่านหน้า **Network Map** บน Dashboard

## 🧠 การทำงานของ Detection Engine (AI/ML Pipeline)

หัวใจสำคัญของการตรวจจับ Syslog จาก Firewall และ Nginx มี Pipeline 6 ขั้นตอน:
1. **Parse & Normalize:** แปลง Log ดิบจากหลายแหล่งให้อยู่ในฟอร์แมตมาตรฐาน
2. **External Attacker Filter:** กรองทิ้ง IP ภายใน (Private/Loopback)
3. **Feature Aggregation:** รวบรวมสถิติของแต่ละ IP ในช่วง 5 นาที
4. **AI Screening (Isolation Forest):** คัดแยก Anomaly ออกจาก Normal traffic
5. **Threat Engine (XGBoost + LogLLM):** จำแนกชนิดการโจมตีและระดับความรุนแรง
6. **Correlation & AI Analyst:** รวมเหตุการณ์เป็น Attack Session ส่งกลับ Backend

> **Fallback Mode:** ถ้า Detection Engine ไม่ตอบสนอง (down/timeout) Backend จะ parse Log ด้วย Basic Parser และ ingest เข้า DB อัตโนมัติ เพื่อให้ Log ไม่หายไปจาก Dashboard

## 🚀 การติดตั้งและเริ่มใช้งาน

**รันทั้งระบบด้วย Docker (แนะนำสำหรับ Production / Testing)**
```bash
# 1. ตั้งค่า Environment Variables
cp .env.example .env
cp backend/.env.example backend/.env

# 2. เริ่มการทำงานของทุก Service
docker compose up -d --build
```

**รันแยกส่วน (Local Development)**
- **Backend:** `cd backend && npm install && npm run start:dev` (http://localhost:5000)
- **Frontend:** `cd frontend && npm install && npm run dev` (http://localhost:5173)
- **Detection Engine:** `cd detection-engine && pip install -r requirements.txt && uvicorn main:app --port 8100`

## 🔑 บัญชีเข้าใช้งานเริ่มต้น (Default Credentials)

| Username | Password      | Role  | สิทธิ์ |
|----------|---------------|-------|--------|
| `admin`  | `Admin@1234!` | admin | จัดการระบบทั้งหมด, SOAR (บล็อก IP), ตั้งค่า AI |
| `guest`  | `guest123`    | guest | ดูข้อมูลบน Dashboard เท่านั้น (Read-only) |

⚠️ **ข้อควรระวัง:** เมื่อนำขึ้นเซิร์ฟเวอร์จริง ควรเปลี่ยนรหัสผ่านทันที

## ⚙️ Environment Variables ที่สำคัญ (`.env`)

| ตัวแปร | หน้าที่ |
|---|---|
| `JWT_SECRET` | คีย์สำหรับเข้ารหัส Access Token |
| `GEMINI_API_KEY` | คีย์ AI สำหรับสร้างคำอธิบายแจ้งเตือน (ถ้าไม่มี ระบบ Rule-based ทำงานแทน) |
| `SSO_*` | การเชื่อมต่อระบบ Login ผ่าน KKU SSO |
| `INGEST_API_KEY` | รหัสผ่านสำหรับส่ง Log เข้ามาที่ `/api/ingest` |
| `POSTGRES_USER/PASSWORD/DB` | ข้อมูล PostgreSQL สำหรับ Production |

## ⚠️ ปัญหาที่พบบ่อย (Troubleshooting)

- **หน้า Dashboard โล่ง ไม่แสดง Log:**
  1. ตรวจสอบว่า Container ทุกตัวรันอยู่: `docker compose ps`
  2. ดู log Backend: `docker compose logs backend --tail=50`
  3. ถ้าเห็น `[Cache GC]` ทุก 5 นาที = Backend ทำงานปกติ
  4. ถ้าเห็น `[DetectionEngine] Unreachable ... falling back` = อยู่ใน Fallback Mode (Log ยังเข้าได้)
  5. ตรวจสอบว่า `destIp` ของ Log อยู่ใน Network Map หรือไม่

- **Log เข้าระบบแต่ไม่โชว์บน Dashboard:**
  - Log อาจถูก Drop เพราะ `destIp` ไม่อยู่ใน subnet ที่กำหนดใน Network Map (`ip_records.json`)
  - ตรวจสอบ subnet ที่หน้า Network Map และเพิ่ม subnet ที่ขาดหาย

- **การส่ง Log ไม่เข้าฐานข้อมูล:**
  - ตรวจสอบ `INGEST_API_KEY` ว่าตรงกับ `.env` ของ Backend
  - ทดสอบ: `GET /api/ingest/test` (ไม่ต้องใช้ Key) และ `GET /api/ingest/status` (ดู health แต่ละ source)

- **RAM เต็มบน Server:**
  - ระบบมี Cache GC ทุก 5 นาที และ Auto-Prune Log อายุเกิน 30 วันทุกเที่ยงคืน
  - ตรวจสอบ: `docker stats` เพื่อดูการใช้ RAM แต่ละ Container
  - Backend ถูกจำกัด heap ที่ 512MB (`NODE_OPTIONS=--max-old-space-size=512`)

- **AI ไม่วิเคราะห์เหตุการณ์:**
  - Gemini ทำงานเฉพาะ Log ระดับ High/Critical และมี Rate Limit 1 ครั้ง/IP/นาที
