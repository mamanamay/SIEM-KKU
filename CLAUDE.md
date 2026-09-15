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

---

## 🧪 คำแนะนำการทำงาน (Dev Conventions, Commands & Testing)

### ▶️ คำสั่งที่ใช้บ่อย (Dev Commands)

**Backend** (`cd backend`, NestJS + TypeORM):
```bash
npm run start:dev     # รันแบบ watch mode (ใช้ตอนพัฒนา)
npm run build         # build เป็น dist/
npm run lint          # eslint --fix ทั้ง src/
npm run format        # prettier --write ทั้ง src/ และ test/
npm run test          # unit test ด้วย jest
npm run test:cov      # unit test พร้อม coverage
npm run test:e2e      # e2e test (config: test/jest-e2e.json)
```

**Frontend** (`cd frontend`, SvelteKit + Vite):
```bash
npm run dev      # vite dev --host (dev server)
npm run build    # vite build
npm run check    # svelte-check --tsconfig ./tsconfig.json (type-check ทั้ง .ts/.svelte)
```

> ไม่มีคำสั่ง `npm run test` ในฝั่ง frontend — ยังไม่ได้ตั้ง test runner ไว้

### 📏 Coding Conventions

- **Backend**: บังคับด้วย ESLint (`eslint.config.mjs`) + Prettier (`.prettierrc`: `singleQuote: true`, `trailingComma: "all"`). กฎที่เปิดเป็น `warn` เท่านั้น (ไม่ fail build): `no-floating-promises`, `no-unsafe-argument`. `no-explicit-any` ปิดไว้ — โค้ด backend ใช้ `any` กับ payload ที่มาจากหลายแหล่ง (Cowrie/Wazuh/WebTrap) ได้ตามปกติ
- **Frontend**: TypeScript `strict: true` (ดู `frontend/tsconfig.json`) — ต้อง `npm run check` ผ่านก่อน commit งานที่แก้ `.ts`/`.svelte`
- โครงสร้าง backend เป็น **module-per-feature แบบเบา**: ไม่มีโฟลเดอร์ `*.module` แยกทุกฟีเจอร์ ส่วนใหญ่คือคู่ `xxx.controller.ts` + `xxx.service.ts` วางแบนอยู่ใน `src/` ตรงๆ (ยกเว้น `api-log/` ที่แยกเป็นโมดูลของตัวเอง) — ให้ทำตาม pattern เดิมเวลาเพิ่มฟีเจอร์ใหม่ อย่าสร้างโฟลเดอร์โมดูลใหม่โดยไม่จำเป็น
- Entity ทั้งหมด (TypeORM) อยู่รวมกันใน `backend/src/entities/`

### ✅ Testing — สถานะปัจจุบัน

- Backend ตั้งค่า Jest ไว้พร้อมใช้ (`package.json` → `jest` block, `rootDir: src`, matcher `*.spec.ts`) **แต่ยังไม่มีไฟล์ `.spec.ts` อยู่ในโค้ดจริงเลยสักไฟล์** — ถ้าเพิ่ม logic สำคัญ (เช่น scoring/classification ใน `log.service.ts`) ควรเขียนเทสต์คู่กันไปด้วย เพราะ CI/reviewer จะไม่มีเทสต์เดิมให้ diff เทียบ
- Frontend ไม่มี test runner ตั้งไว้เลย — การ "ทดสอบ" ตอนนี้คือ `npm run check` (type-check) + ทดลองรันจริงผ่าน `npm run dev`
- เวลาแก้ไฟล์ backend ที่มี business logic ซับซ้อน (AI/log processing, auth, webhook) ให้รัน `npm run test` เพื่อเช็คว่าไม่พังของเดิม แม้ตอนนี้จะยังไม่มีเทสต์ก็ตาม — เผื่อมีการเพิ่มเทสต์เข้ามาทีหลัง

---

## 🤖 ระบบ AI ตรวจจับและวิเคราะห์ Log (Deep Dive)

ระบบนี้ **ไม่ได้ใช้ AI ในการ "ตรวจจับ" ว่าเป็นการโจมตีหรือไม่** — การตรวจจับ/ให้คะแนน (Detection & Scoring) เป็น **rule-based ล้วนๆ แบบ deterministic**. AI (Generative) ถูกใช้เฉพาะ "ชั้นบนสุด" เพื่อ **สรุป/อธิบาย** เหตุการณ์ที่ตรวจจับได้แล้วเป็นภาษาธรรมชาติ (ภาษาไทย) ให้ SOC Team อ่านง่ายขึ้น แบ่งเป็น 3 ชั้น:

### ชั้นที่ 1 — Detection & Scoring Engine (ไม่ใช่ AI, เป็น Rule-based)
📍 `backend/src/log.service.ts`

นี่คือ "สมอง" ตัวจริงของระบบ SIEM — รับ log ดิบจากทุกแหล่ง แปลงเป็น `Attack` record พร้อม `type`, `severity`, `mitreCode`, `threatScore`:

- **Auto-detect source** (`autoDetectSource`): เดาว่า payload มาจากไหนจาก shape ของ field (`eventid` → Cowrie, `rule.id` → Wazuh/Suricata, `src_ip`+`type` → WebTrap, ที่เหลือ → generic) แล้วส่งเข้า processor เฉพาะของแต่ละแหล่ง (`processCowrieLine`, `processWazuhAlert`, `processWebTrapLine`, `processGenericLog`)
- **Escalation ตามความถี่**: SSH login failed จาก IP เดิมในหน้าต่าง 60 วินาที (`ipStats` map) จะไล่ระดับ `SSH Login Attempt` (≤2 ครั้ง) → `SSH Brute Force` (≤10 ครั้ง) → `Aggressive Brute Force` (>10 ครั้ง) พร้อม `threatScore` 40/70/90 ตามลำดับ
- **IP correlation**: `resolveRealIp()` จับคู่ Cowrie session กับ IP จริงที่มาจาก reverse proxy โดยเทียบเวลาภายในหน้าต่าง `CORRELATION_WINDOW_MS = 5000` ms (แก้ปัญหา Cowrie เห็นแต่ IP ของ proxy)
- **Syslog classifier** (`processSyslogMessage`, ใช้กับ Fortigate/Nginx log ที่ tail แบบ polling ผ่าน `fs.watchFile`): ใช้ keyword/regex matching (เช่น `sql`, `union`, `<script>`, `nmap`, `../`, `wget`) เพื่อ map เข้า MITRE ATT&CK code (T1190, T1189, T1595, T1110, T1059, T1498) และคำนวณ `threatScore` แบบ `Math.max(current, newScore)`
- ผลลัพธ์ทั้งหมดถูกบันทึกผ่าน `saveAndBroadcast()` → เขียนลง SQLite (`Attack` entity) + broadcast ผ่าน Socket.io ทันที **ก่อน** ที่ AI (ชั้น 2) จะวิเคราะห์เสร็จด้วยซ้ำ — ดังนั้น dashboard เห็น event ทันทีเสมอ ไม่ต้องรอ AI

### ชั้นที่ 2 — Generative AI Narrative (Backend, Gemini)
📍 `backend/src/ai.service.ts`, `backend/src/attacks.controller.ts`

Dual-mode เสมอ: **ลอง Gemini ก่อน (ถ้ามี `GEMINI_API_KEY` ใน `.env`) → ถ้า fail/timeout/ไม่มี key → fallback เป็น rule-based Thai template ทันที** ระบบจึงทำงานได้ 100% แม้ไม่มี API key เลย:

- `AiService.analyzeAlert()` — ถูกเรียก **อัตโนมัติ** จาก `log.service.ts` เฉพาะ event ที่ `severity` เป็น `high`/`critical` เท่านั้น (ประหยัด quota) แบบ async ไม่บล็อก response หลัก, มี **rate limit 1 ครั้ง/IP/60 วินาที** (in-memory `Map`, auto-cleanup entry ที่ไม่ได้ใช้เกิน 5 นาที) ผลลัพธ์ (`aiAnalysis`) จะ update กลับเข้า DB แล้ว broadcast ซ้ำอีกครั้งเมื่อ AI ตอบเสร็จ
- Endpoint แบบ on-demand จากหน้า dashboard (เรียกตอนผู้ใช้กดปุ่ม ไม่ใช่อัตโนมัติ): `POST /api/attacks/ai-briefing` (สรุปภัยคุกคามรายวัน), `ai-full-report` (สร้างรายงานฉบับเต็มเป็น HTML), `auto-triage` (แนะนำว่าควร auto-block IP ไหนจาก pattern ของ events ล่าสุด), `nl-search` (แปลงคำค้นภาษาธรรมชาติ → filter object), `analyze-event` (วิเคราะห์ payload เดี่ยวๆ ตามคำขอ)
- ทุก endpoint รับ header `x-gemini-key` เพื่อให้ frontend ส่ง API key ของผู้ใช้เองมา override `.env` ได้ (กรณีไม่ได้ตั้ง key ฝั่ง server)
- โมเดลที่ใช้คงที่: `gemini-2.0-flash` เท่านั้น (hardcoded URL ในทั้งสองไฟล์) — timeout ต่างกันตาม endpoint (8–20s) แล้ว fallback ทันทีถ้า error/timeout

### ชั้นที่ 3 — Generative AI ฝั่ง Frontend (KKU IntelSphere AI)
📍 `frontend/src/lib/utils/kkuai.ts`, ใช้งานใน `frontend/src/lib/ReportEngine/` (เช่น `CveSimilarityEngine.ts`, `AiReportModal.svelte`)

เป็น AI คนละตัวจากชั้น 2 โดยสิ้นเชิง — เรียกตรงจาก **browser** ไปยัง KKU IntelSphere AI Gateway (`https://gen.ai.kku.ac.th/api/v1`, OpenAI-compatible `/chat/completions`) ไม่ผ่าน backend เลย:

- ผู้ใช้ต้องตั้งค่า API key ของตัวเองใน Settings → เก็บใน `localStorage` (`kkuai_api_key`) **ไม่ใช่ `.env` ของ backend** — คนละ scope กับ Gemini key ของชั้น 2 โดยสิ้นเชิง
- เลือกโมเดลได้หลายตัว (`KKU_AI_MODELS`): Typhoon v2 70B/8B (SCB Tech), Llama 3.3 70B / 3.1 8B (Meta), WangchanLM 7.5B (VISTEC, เน้นภาษาไทย)
- ใช้ใน 2 งานหลัก: (1) เขียนรายงาน narrative ใน Report Wizard, (2) `CveSimilarityEngine.ts` — วิเคราะห์ว่ารูปแบบการโจมตีที่ตรวจจับได้ **คล้าย** กับ CVE ไหนบ้าง (มี system prompt บังคับว่าต้องใช้คำว่า "Similar/Potentially Related" ห้ามฟันธงว่าเป็นการ exploit สำเร็จจริง เพราะเป็นการวิเคราะห์ความคล้าย ไม่ใช่การยืนยัน)

### 🧩 สิ่งที่ต้องรู้เมื่อแก้โค้ดชั้น AI
1. **อย่าย้าย logic การให้คะแนน/จำแนกประเภทไปไว้ที่ AI** — ตั้งใจออกแบบให้ deterministic (ชั้น 1) แยกจาก narrative (ชั้น 2/3) เพื่อให้ dashboard เชื่อถือได้แม้ AI ล่ม/ไม่มี key
2. ทุก call ไปยัง Gemini/KKU AI ต้องมี **timeout + fallback เสมอ** (`AbortSignal.timeout(...)` แล้ว catch ไป rule-based) — ห้ามเพิ่ม AI call ที่ block flow หลักโดยไม่มี fallback
3. Rate limit ของ `analyzeAlert()` คิดต่อ IP ไม่ใช่ต่อ request — ถ้าจะ debug ว่าทำไม AI ไม่วิเคราะห์ event ใหม่ ให้เช็คว่า IP เดิมถูกวิเคราะห์ไปเมื่อไม่ถึง 60 วินาทีที่แล้วหรือไม่ก่อน
