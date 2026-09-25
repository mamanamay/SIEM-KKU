<div align="center">

# 🛡️ KKUSIEM Honeypot Command Center

**ระบบ Honeypot และ SIEM อัจฉริยะสำหรับดักจับ วิเคราะห์ และตอบสนองการโจมตีทางไซเบอร์แบบ Real-time**

[![SvelteKit](https://img.shields.io/badge/Frontend-SvelteKit-ff3e00?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![FastAPI](https://img.shields.io/badge/AI_Engine-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square&logo=sqlite)](https://sqlite.org)
[![Socket.io](https://img.shields.io/badge/Realtime-Socket.io-010101?style=flat-square&logo=socket.io)](https://socket.io)

</div>

---

## 📖 ภาพรวมของระบบ (System Overview)

KKUSIEM เป็นระบบศูนย์กลางที่รวบรวม Log จากอุปกรณ์ต่างๆ นำมาประมวลผลด้วย **AI Detection Engine** และ **Rule-based Engine** เพื่อวิเคราะห์ความรุนแรง แยกแยะประเภทการโจมตี และแสดงผลบน Dashboard แบบ Real-time

**กระบวนการทำงานหลัก (Data Flow):**
1. **Ingest:** รับ Log จาก Honeypot (Cowrie, WebTrap), IDS (Suricata, Wazuh), และ Syslog (Fortigate, Nginx)
2. **Detect & Correlate:** 
   - Syslog (Firewall/Nginx) จะถูกส่งเข้า **Detection Engine (AI/ML)** เพื่อคัดกรอง Anomaly ด้วย Isolation Forest และจำแนกประเภทด้วย XGBoost + LogLLM
   - Log จาก Honeypot/IDS จะถูกประมวลผลด้วย **Rule-based Engine** ใน Backend
3. **Store & Broadcast:** บันทึกข้อมูลลง Database และส่งให้หน้า Dashboard ผ่าน WebSocket ทันที
4. **AI Narrative:** ให้ Generative AI (Gemini) สรุปเหตุการณ์ที่รุนแรง (High/Critical) ออกมาเป็นคำอธิบายภาษาไทย
5. **Respond (SOAR):** SOC Team สามารถกดบล็อก IP ทั่วทั้งเครือข่าย หรือทำ Auto-triage ได้จาก Dashboard

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
Demo_Honeypot/
├── backend/            # NestJS API + WebSocket (Data ingestion & Rule-based correlation)
├── frontend/           # SvelteKit Dashboard (Real-time monitoring & SOAR)
├── detection-engine/   # 🧠 AI/ML Engine (FastAPI) ตรวจจับและวิเคราะห์ Syslog อัจฉริยะ
├── honeypots/          # Cowrie (SSH), WebTrap (HTTP)
├── nginx/              # Reverse Proxy + SSL config (Production)
├── tools/attacker/     # Attack Simulator (สำหรับทดสอบระบบ)
└── docker-compose.yml  # ไฟล์ Deploy ระบบแบบเต็มรูปแบบ
```

ดูรายละเอียดสถาปัตยกรรมแบบเจาะลึกได้ที่ [CLAUDE.md](CLAUDE.md)

## 🧠 การทำงานของ Detection Engine (AI/ML Pipeline)

หัวใจสำคัญของการตรวจจับ Syslog จาก Firewall และ Nginx จะอยู่ใน `detection-engine/` ซึ่งมี Pipeline การทำงาน 6 ขั้นตอน:
1. **Parse & Normalize:** แปลง Log ดิบจากหลายแหล่ง ให้อยู่ในฟอร์แมตมาตรฐานเดียวกัน
2. **External Attacker Filter:** กรองทิ้ง IP ภายใน (Private/Loopback) เพื่อโฟกัสเฉพาะภัยคุกคามจากภายนอก
3. **Feature Aggregation:** รวบรวมสถิติของแต่ละ IP ในช่วงเวลา 5 นาที (Time Window)
4. **AI Screening (Isolation Forest):** คัดแยกทราฟฟิกปกติออกไปเก็บ (Cold Storage) และส่งต่อเฉพาะทราฟฟิกที่ผิดปกติ (Anomaly)
5. **Threat Engine (XGBoost + LogLLM):** วิเคราะห์พฤติกรรมเชิงลึกเพื่อระบุชนิดการโจมตีและระดับความรุนแรง
6. **Correlation & AI Analyst:** รวบรวมเหตุการณ์ย่อยให้กลายเป็น "Attack Session" และสร้าง Incident ส่งกลับไปยัง Backend

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

ตอนเริ่มระบบครั้งแรก ฐานข้อมูลจะถูก Seed ด้วยผู้ใช้งาน 2 คน:

| Username | Password      | Role  | สิทธิ์ |
|----------|---------------|-------|--------|
| `admin`  | `Admin@1234!` | admin | จัดการระบบทั้งหมด, SOAR (บล็อก IP), ตั้งค่า AI |
| `guest`  | `guest123`    | guest | ดูข้อมูลบน Dashboard เท่านั้น (Read-only) |

⚠️ **ข้อควรระวัง:** เมื่อนำขึ้นเซิร์ฟเวอร์จริง ควรเปลี่ยนรหัสผ่านทันที หรือลบการ Seed ข้อมูลทิ้ง

## ⚙️ Environment Variables ที่สำคัญ (`.env`)

| ตัวแปร | หน้าที่ |
|---|---|
| `JWT_SECRET` | คีย์สำหรับเข้ารหัส Access Token (ควรตั้งให้ยาวและคาดเดายาก) |
| `GEMINI_API_KEY` | คีย์สำหรับใช้ AI สร้างคำอธิบายแจ้งเตือน (ถ้าไม่มี ระบบ Rule-based จะทำงานแทน) |
| `SSO_*` | การเชื่อมต่อระบบ Login ผ่าน KKU SSO |
| `INGEST_API_KEY` | รหัสผ่านสำหรับส่ง Log เข้ามาที่ `/api/ingest` |

## ⚠️ ปัญหาที่พบบ่อย (Troubleshooting)

- **หน้า Dashboard โล่ง ไม่แสดง Log ทันที:** ให้ลองรีเฟรชหน้าเว็บ หรือตรวจสอบว่า Container `nginx` รันอยู่ปกติและไม่มี error เรื่อง WebSocket proxying
- **การส่ง Log ไม่เข้าฐานข้อมูล:** ตรวจสอบ `INGEST_API_KEY` ระหว่างระบบต้นทาง (เช่น Wazuh) ว่าตรงกับ `.env` ของ Backend หรือไม่
- **AI ไม่วิเคราะห์เหตุการณ์เพิ่มเติม:** การเรียก Generative AI (Gemini) จะทำงานเฉพาะ Log ระดับ High/Critical เท่านั้น และมี Rate Limit 1 ครั้งต่อ 1 IP ต่อ 1 นาที เพื่อป้องกันโควต้าเต็ม
