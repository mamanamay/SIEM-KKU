# 🏗️ KKUSIEM Architecture & Project Structure

ไฟล์เอกสารนี้แสดงภาพรวมโครงสร้างของโปรเจกต์ (Folder Structure) และสถาปัตยกรรมระบบ (System Architecture) ของ KKUSIEM เพื่อให้นักพัฒนาเข้าใจการเชื่อมต่อระหว่างส่วนประกอบต่างๆ ได้ง่ายขึ้นครับ

---

## 📂 โครงสร้างโฟลเดอร์หลัก (Project Structure)

โครงสร้างแบบต้นไม้แสดงไฟล์และโฟลเดอร์ที่สำคัญที่สุดในระบบ:

```text
Demo_Honeypot/
│
├── backend/                   # 🔴 NestJS Backend API & WebSocket
│   ├── src/
│   │   ├── entities/          # โครงสร้างฐานข้อมูล (TypeORM)
│   │   ├── app.module.ts      # โมดูลหลักรวบรวม Controller/Service
│   │   ├── attacks.controller.ts # รับ Log โจมตีและเรียก AI (Gemini)
│   │   ├── auth.controller.ts # จัดการการล็อกอิน, SSO, และ 2FA
│   │   ├── events.gateway.ts  # จัดการ Real-time WebSocket
│   │   └── seed.service.ts    # สร้างฐานข้อมูลจำลองตอนเริ่มต้น
│   ├── .env                   # ตั้งค่าตัวแปร (DB, SSO, Keys)
│   └── database.sqlite        # ฐานข้อมูล (ถูก Ignore จาก Git)
│
├── frontend/                  # 🟢 SvelteKit Frontend Dashboard
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/    # คอมโพเนนต์ UI (กราฟ, ตาราง, โมดอล AI)
│   │   │   └── utils/         # ฟังก์ชันช่วยเหลือ (แปลงเวลา, Export PDF)
│   │   ├── routes/            # หน้าเว็บทั้งหมด (File-based Routing)
│   │   │   ├── callback/      # รับการเชื่อมต่อกลับจาก KKU SSO
│   │   │   ├── dashboard/     # หน้าแผงควบคุมหลัก
│   │   │   └── +page.svelte   # หน้าล็อกอินหลัก (รองรับ SSO และ 2FA)
│   │   └── stores/
│   │       └── events.ts      # เก็บ State และเชื่อม WebSocket กับ Backend
│   └── .env                   # ตั้งค่า URL ชี้ไปยัง Backend
│
├── honeypots/                 # 🪤 ระบบล่อลวง (Decoys)
│   ├── cowrie/                # โฟลเดอร์จำลอง (SSH/Telnet Honeypot)
│   └── webtrap/               # สคริปต์ดักจับ Web-based Attacks
│
├── nginx/                     # 🛡️ การตั้งค่า Reverse Proxy (Production)
├── docs/                      # 📝 เอกสารโปรเจกต์เพิ่มเติม
└── README.md                  # 📖 คู่มือการติดตั้งและใช้งานระบบ
```

---

## 📐 สถาปัตยกรรมระบบ (System Architecture)

ระบบถูกออกแบบมาเป็น Event-Driven Architecture ควบคู่ไปกับ Client-Server Model เพื่อรองรับการแสดงผลแบบ Real-time:

```mermaid
graph TD
    %% Define styles
    classDef attacker fill:#ffcccc,stroke:#ff0000,stroke-width:2px;
    classDef honeypot fill:#ffe6cc,stroke:#ff9900,stroke-width:2px;
    classDef backend fill:#cce5ff,stroke:#0066cc,stroke-width:2px;
    classDef db fill:#e6ccff,stroke:#9900cc,stroke-width:2px;
    classDef ai fill:#ccffcc,stroke:#00cc00,stroke-width:2px;
    classDef frontend fill:#ffffcc,stroke:#cccc00,stroke-width:2px;
    classDef external fill:#e6e6e6,stroke:#666666,stroke-width:2px;

    %% Nodes
    A[Hacker / Attacker]:::attacker
    B1[WebTrap Honeypot]:::honeypot
    B2[Cowrie Honeypot]:::honeypot
    B3[Suricata / Wazuh]:::honeypot
    
    C((NestJS Backend API)):::backend
    D[(SQLite Database)]:::db
    E[Google Gemini AI]:::ai
    F[SvelteKit Dashboard]:::frontend
    
    G[KKU SSO Service]:::external
    H[Admin / SOC Team]:::frontend

    %% Data flow for Ingestion
    A -->|Attacks (HTTP/SSH)| B1
    A -->|Attacks (HTTP/SSH)| B2
    A -->|Malicious Traffic| B3
    
    B1 -.->|POST JSON| C
    B2 -.->|POST JSON| C
    B3 -.->|POST JSON| C

    %% Internal Backend Flow
    C -->|Save Logs & Audits| D
    C -->|Trigger Triage Request| E
    E -->|Return AI Insights| C

    %% Real-time Flow
    C == WebSocket (Socket.io) ==> F
    
    %% Authentication Flow
    H -->|Login via SSO| G
    G -->|Callback with Auth Code| C
    C -->|Verify 2FA (Local)| D
    C -->|Issue JWT Token| F

    %% User Interaction
    H -->|View & Analyze| F
    F -->|Request Blocking| C
```

### คำอธิบาย Data Flow
1. **Attack Ingestion**: ผู้โจมตี (Attacker) เจาะเข้ามาที่ Honeypot หรือถูกตรวจจับโดย IDS ระบบล่อลวงจะสร้าง Log JSON และ POST ส่งมายัง Backend (NestJS)
2. **Processing & Storage**: Backend บันทึกข้อมูลลงฐานข้อมูล (SQLite) และส่งต่อไปให้ AI (Gemini) ทำการวิเคราะห์ระดับความรุนแรงหากเปิดโหมด SOAR เอาไว้
3. **Real-time Broadcast**: Backend ส่งข้อมูลการโจมตีผ่าน Socket.io ทะลุมายัง Frontend (SvelteKit) แบบเสี้ยววินาที กราฟและตารางหน้าจอผู้ใช้จะอัปเดตเอง
4. **Authentication (Hybrid)**: SOC Team ทำการล็อกอินผ่าน KKU SSO หากแอดมินในระบบตั้งค่า 2FA เอาไว้ Backend จะเด้งกลับมาหน้าเว็บให้กรอกรหัสยืนยัน 6 หลักก่อนอนุญาตให้เข้าใช้งาน
5. **Mitigation**: SOC Team สามารถสั่งการแบน IP จากหน้าเว็บ Frontend ผ่าน Backend ได้ทันที
