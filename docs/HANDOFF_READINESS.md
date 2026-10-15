# ผลตรวจความพร้อมส่งต่อ KKUSIEM

ตรวจวันที่ 15 ตุลาคม 2026 จากโฟลเดอร์หลัก `Documents/GitHub/Demo_Honeypot` เอกสารนี้เป็นผลตรวจซอร์สปัจจุบัน ไม่ใช่การรับรอง production หรือการตรวจความปลอดภัยครบทุกกรณี

**สถานะ: เตรียมชุดซอร์สส่งต่อได้ แต่ยังไม่ควร push ประวัติ Git เดิม และ Frontend type check ยังไม่ผ่าน**

## ผลตรวจจริง

| รายการ | ผล |
| --- | --- |
| Backend `npm run build` | ผ่าน หลังติดตั้ง pdf-lib ที่ประกาศอยู่ใน lockfile ให้ครบ |
| Frontend `npm run build` | ผ่าน มี CSS/a11y และ Svelte compatibility warnings |
| ติดตั้งและ build จากสำเนาซอร์สสะอาด | ผ่านทั้งสองส่วน ด้วย `npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund`; ไม่คัดลอก node_modules/build/env/history จากเครื่องหลัก |
| Frontend `npm run check` | ไม่ผ่าน: 113 errors, 135 warnings ใน 31 ไฟล์ |
| Python syntax | ผ่าน 30 ไฟล์ ตรวจ AST โดยไม่สร้าง pycache |
| package.json เทียบ package-lock.json | dependencies/devDependencies/engines ตรงกันทั้ง Backend และ Frontend |
| `docker compose config --quiet` | ผ่านกับ environment ของเครื่องนี้ โดยไม่พิมพ์ค่าลับ |
| `git diff --check` | ผ่านหลังแก้ trailing whitespace ใน xgboost_classifier.py |
| ชุดไฟล์ที่จะเข้า Git | ไม่พบค่าตรงกับ live secret ที่นำมาตรวจ, private-key blocks หรือ token patterns ที่สแกน |
| ประวัติ Git reachable จากทุก refs | พบ credentials และ private keys รวม TLS key ที่ตรงกับไฟล์ของเครื่องนี้ |
| คู่มือปัจจุบัน | README, CLAUDE, DEPLOY, CONTRIBUTING, GUIDELINE และ Backend README ปรับตามซอร์ส; GUIDELINE ครบ 28 เส้นทางหน้าเว็บ |

ตรวจ Node/npm บนเครื่องนี้ด้วย Node 26.3.1 และ npm 11.16.0 ส่วน Dockerfiles ใช้ Node 24/22 และ Python 3.12 จึงยังต้องทดสอบ images ตามเวอร์ชันเหล่านั้นใน deployment ใหม่

การติดตั้งสำเนาทดสอบปิด install scripts เพื่อไม่ดาวน์โหลด Chromium/รัน native build hooks การ build ผ่านยังไม่ยืนยัน SQLite native binary, Chromium sandbox หรือการรันแอปจริง คำสั่งติดตั้งปกติในคู่มือยังเปิด lifecycle scripts ตามที่ Dockerfiles ต้องใช้

## จุดที่ต้องจัดการก่อนเผยแพร่หรือใช้ production

### 1. Credentials ในประวัติ Git — ต้องจัดการก่อนส่ง history เดิม

สแกน exact matches จากค่า environment ที่ใช้อยู่ (ค่าลับยาวอย่างน้อย 12 ตัว) กับ Git blobs ที่ reachable พบชื่อคีย์ต่อไปนี้ โดยไม่พิมพ์ค่าจริง:

| ชื่อค่า | ตัวอย่าง path ที่ยังพบใน history |
| --- | --- |
| `POSTGRES_PASSWORD` | `.env.example`, `clean_db.js`, `query.js` และสำเนาใน audit/.release |
| `INGEST_API_KEY` | `.env.example` หลาย revision |
| `JWT_SECRET` | `backend/.env.example` |
| `SSO_CLIENT_SECRET` | `frontend/user_inputs.txt` |
| TLS private key | `nginx/certs/key.pem` และสำเนา package/test; ค่า key ตรงกับไฟล์ปัจจุบัน |

มี private keys ของ Cowrie และสำเนา key ใน release/test/cache เก่าเพิ่มเติม และยังมีรายงานจริงในประวัติ การ ignore หรือลบใน commit ใหม่ไม่เอาข้อมูลเหล่านี้ออกจาก commits เก่า

ผู้ดูแลต้องวางแผนเปลี่ยน credentials ที่พบและออก TLS key/certificate ใหม่อย่างประสานกับผู้ใช้บริการ คง TOTP encryption key เดิมไว้เว้นแต่มีแผนย้ายข้อมูลเข้ารหัสที่ตรวจสอบแล้ว การตรวจนี้ไม่ได้เปลี่ยน environment, credentials, certificate หรือบริการที่กำลังใช้งาน

ทางส่งต่อมีสองแบบ: ใช้ source-only export ไปยัง repository ใหม่ที่ไม่มี `.git` เดิม หรือทำแผน sanitize history และตรวจซ้ำก่อนส่งออก ห้าม push/แนบ `.git` เดิมโดยถือว่าการทำความสะอาดไฟล์ปัจจุบันเพียงพอ ทั้งสองแบบยังต้องจัดการค่าที่เคยเปิดเผยแล้วตามขอบเขตระบบจริง

### 2. Frontend type check — ต้องแก้ก่อนตั้งเกณฑ์ CI ว่าผ่าน

จุดที่มี errors มาก ได้แก่ Users 22, Report History 13, Integrations 10, AI Briefing 9, Profile 8 และ Security 8 ตัวอย่างปัญหาคือชนิดข้อมูล unknown/null/implicit any และ prop `hideText` ที่ OrgBadge ไม่ได้ประกาศ

ยังคงเปิด strict checking ไม่ได้ลดเกณฑ์หรือซ่อน errors ควรแก้เป็นงานแยกพร้อมตรวจหน้าที่ได้รับผลกระทบ ปัจจุบันไม่มี automated test suite ในชุดที่ทำความสะอาดแล้ว จึงต้องบันทึก manual checks ตาม flow ที่เปลี่ยน

### 3. งานตรวจบน deployment ใหม่

- ทดสอบ PostgreSQL migrations ทั้งฐานข้อมูลว่างและสำเนาฐานข้อมูลเดิม รวม backup/restore
- ทดสอบ login, password change, MFA, SSO และสิทธิ์ทุกกลุ่มที่ใช้งานจริง
- ทดสอบ POST/GET/SSE → receipt → detection → incident → WebSocket → report/PDF
- ทดสอบ network/CA/outbound policy, source cursor, retry/duplicate/backpressure และ integrations ที่เปิดใช้
- ตรวจ dependency peer debt: basic-ssl 2.3.0 ต้องการ Vite 6/7/8 แต่ lockfile ใช้ Vite 5.4.21; build มี warnings เรื่อง exports ของ Svelte โดยใช้ Kit 2.68.0 กับ Svelte 4.2.20
- ตรวจ version/upgrade และ dependency vulnerability policy ขององค์กร รอบนี้ไม่ได้รัน dependency vulnerability audit หรือ penetration test
- metadata Backend ยังเป็น `private: true`, `license: UNLICENSED` แต่ LICENSE ที่รากเป็น MIT ให้เจ้าของ repository ตกลง metadata ก่อนเผยแพร่ ไม่มีการเปลี่ยนใบอนุญาตในรอบนี้

## สิ่งที่เตรียมให้แล้ว

- `.env.example` ทั้งสองจุดใช้ช่องว่างสำหรับ secrets; แก้คำสั่ง bootstrap ที่อ้าง helper ซึ่งถูกนำออก
- เพิ่ม `.nvmrc` (24), Node engines, Frontend prepare/sync และขั้นตอนติดตั้งจาก lockfile
- นำ test scripts/dependencies ที่อ้างชุดทดสอบซึ่งถูกลบแล้วออกจาก manifests/lockfiles และเอา Jest globals/config ที่เหลือออก
- Git ignore ครอบคลุม environment variants, keys, databases/WAL/SHM, reports, Python cache, build และ tsbuildinfo โดยอนุญาต runtime source/data/config และ Backend README
- สร้าง `backend/uploads/reports/.gitkeep` ให้ปลายทางรายงานอยู่ในชุดซอร์ส
- แก้คู่มือและ Compose comment ให้ใช้ Compose หลักซึ่งยังมีอยู่จริง พร้อมติดป้ายเอกสาร deployment เก่าว่าเป็นบันทึกย้อนหลัง
- นำรายงาน HTML 6 ไฟล์และ Python bytecode 36 ไฟล์ออกจาก Git index ด้วย `git rm --cached`; รายงานบนดิสก์ยังอยู่ เป็น staged deletions ที่รอ commit
- ไม่ได้ commit, push, เปลี่ยน remote หรือแก้ประวัติ Git งานแก้โค้ดเดิมและไฟล์ runtime ใหม่ที่ยัง untracked ยังคงอยู่ ต้องรวมให้ครบเมื่อจัด commit

รายละเอียดรายการ 42 ไฟล์อยู่ใน [HANDOFF_REMOVED_FROM_GIT.md](HANDOFF_REMOVED_FROM_GIT.md) การนำออกจาก index รอบนี้เป็นการเตรียม snapshot ปัจจุบัน ไม่ได้ล้าง history

## ชุดซอร์สสำหรับส่งต่อ

Source-only ZIP ที่จัดทำแยกจาก repository รวม source/config/lockfiles/assets/migrations/LICENSE และคู่มือ Markdown โดยไม่รวม `.git`, `.env`, private keys, live DB/logs/reports, node_modules หรือ build outputs แนบ SHA-256 และรายการ path/hash แยกไว้กับ ZIP

แตก ZIP ลงโฟลเดอร์ใหม่และตรวจว่าไม่มี `.git` เก่าก่อนสร้าง repository ขององค์กร ชุดนี้ยังมีข้อจำกัด type check และการทดสอบ production ตามรายงานข้างต้น อย่าใช้การ build ผ่านแทนการทดสอบระบบครบเส้นทาง
