# พัฒนาต่อจากชุดซอร์ส

เริ่มจาก [README](README.md), [CLAUDE](CLAUDE.md) และ [ข้อจำกัดที่พบ](docs/HANDOFF_READINESS.md) ใช้ Node 24 (`.nvmrc`) และ Python 3.12 engine Dockerfile ใช้เวอร์ชันนี้ Frontend image ใช้ Node 22

## ติดตั้งและตรวจ build

```bash
npm --prefix backend ci --legacy-peer-deps
npm --prefix frontend ci --legacy-peer-deps
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix frontend run check
```

ใช้ `npm ci` เพื่อรักษา lockfiles การติดตั้ง Backend อาจต้องมีเครื่องมือ build native SQLite และ Chromium/Puppeteer จึงแนะนำ Docker ตาม [DEPLOY](DEPLOY.md) เมื่อเตรียมเครื่องใหม่ มี regression tests สำหรับ Incident/HTTP/CVE/Reports/Wallboard แล้ว ดู [วิธีทดสอบและขอบเขต](docs/incident-evidence-cve-report-validation.md) อย่าอ้างว่า tests ผ่านจากการ build อย่างเดียว และแยก unit cases ที่ผ่านออกจาก integration cases ที่ SKIP

Frontend `prepare` เรียก `svelte-kit sync` เพื่อสร้าง `.svelte-kit` ใน checkout ใหม่ ไม่ต้อง commit generated directory คำสั่ง `check` ยังมีข้อผิดพลาดที่บันทึกใน readiness ต้องรายงานผลจริงก่อนส่ง PR

## รัน local development

1. สำหรับเครื่องใหม่เท่านั้น คัดลอก `backend/.env.example` เป็น `backend/.env` และกำหนด JWT, TOTP, ingestion/detection keys ของเครื่องพัฒนา
2. เปิด terminal ใน `backend/` แล้วรัน `node --env-file=.env node_modules/@nestjs/cli/bin/nest.js start --watch` (`.env` ไม่โหลดเอง)
3. เมื่อไม่มี DATABASE_URL แอปใช้ `backend/database.sqlite` และ synchronize schema ใน development เท่านั้น ห้ามเชื่อม development mode เข้าฐานข้อมูล production
4. เปิดอีก terminal ใน `frontend/` รัน `npm run dev` Vite proxy `/api` และ `/socket.io` ไป `http://127.0.0.1:5000` หรือค่า `API_TARGET` ตรวจ URL/port จริงที่ Vite แสดง เพราะเปิด basic SSL และอาจเลือก port ถัดไป
5. Engine: สร้าง Python virtual environment เปิดใช้งาน แล้วติดตั้ง `pip install -r detection-engine/requirements.txt` จากนั้นเข้า `detection-engine/` ตั้ง `DETECTION_API_KEY` ให้ตรง Backend และรัน `python -m uvicorn main:app --host 127.0.0.1 --port 8100`
6. Backend ที่รันนอก Compose ต้องกำหนด `DETECTION_ENGINE_URL=http://127.0.0.1:8100/api/v1/ingest` ตามตัวแปรที่โค้ดใช้ และตั้ง PDF worker แยกเมื่อต้องทดสอบ PDF ดูรายละเอียด Compose/worker ใน DEPLOY

Engine ใช้ optional model dependencies เฉพาะเมื่อมี artifact และตั้งค่า shadow model; ไม่ต้องติดตั้งชุดโมเดลเพื่อรัน rules พื้นฐาน ดู `detection-engine/models/README.md`

Production-like local environment ให้ใช้ Compose เพื่อทดสอบ PostgreSQL migrations, TLS proxy และ PDF worker ครบเส้นทาง SQLite development ไม่ยืนยันพฤติกรรม PostgreSQL เช่น triggers, indexes และ SKIP LOCKED

## ส่งการเปลี่ยนแปลง

- สร้าง branch จาก revision ที่ตกลงกับทีม แยกงานให้ตรวจ diff ได้
- เปลี่ยน schema ผ่าน migration พร้อมตรวจผลต่อข้อมูลเดิม; เปลี่ยน API ให้ตรวจ authentication, roles, payload limits และ error handling
- ตรวจ build/type check และ smoke test ของ flow ที่เปลี่ยน เช่น receive → receipt → detection → incident → report
- อัปเดต GUIDELINE เมื่อพฤติกรรมหน้าจอเปลี่ยน และอัปเดต `.env.example`/DEPLOY เมื่อเพิ่ม configuration
- ตรวจ `git status --short`, `git diff` และ `git diff --cached` รวมไฟล์ runtime ใหม่ที่ยัง untracked; อย่าใช้ `git add -f` กับไฟล์ลับ/generated outputs
- เขียน PR ว่าเปลี่ยนพฤติกรรมอะไร ตรวจอะไรผ่าน/ไม่ผ่าน และข้อจำกัดที่เหลือ ห้ามซ่อนข้อผิดพลาดเดิมด้วยการลด type strictness

เก็บ lockfiles, source/assets, migrations และ runtime config ให้ครบ ห้ามแนบ `.env`, credentials, private certificates, DB, raw logs, reports จริง, node_modules, build/cache และแพ็กเกจ deploy ขนาดใหญ่
