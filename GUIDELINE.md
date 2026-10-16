# GUIDELINE — ชุดซอร์ส KKUSIEM หลังทำความสะอาด

เอกสารนี้อ้างอิงโฟลเดอร์ต้นฉบับ `Demo_Honeypot` ณ 15 ตุลาคม 2026 ซึ่งมีหน้าเว็บ 28 เส้นทาง เก็บซอร์สที่ใช้งาน การตั้งค่า ข้อมูลที่จำเป็น และคู่มือ ส่วน patch, archives, checksum, manifest, สคริปต์ซ่อม/ตรวจชั่วคราว และ release bundle เดิมถูกย้ายไป Windows Recycle Bin แล้ว

## โครงสร้างที่ใช้จริง

| โฟลเดอร์/ไฟล์ | หน้าที่ |
| --- | --- |
| `backend/src/` | NestJS API, ingestion/receipts, policies, auth, reports, entities และ migrations |
| `backend/config/` | PDF worker, ตรวจ CA และ Network Map เริ่มต้น; Dockerfile ใช้งานจริง |
| `backend/package.json`, `package-lock.json`, `tsconfig*.json`, `nest-cli.json`, `Dockerfile` | dependency/build/runtime configuration |
| `frontend/src/`, `frontend/static/` | หน้า SvelteKit, components, stores, client libraries และ assets |
| `frontend/package*.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `Dockerfile` | การติดตั้งและ build เว็บ |
| `detection-engine/` | FastAPI, parsers, runtime rules/features/session/fusion และ optional shadow model |
| `detection-engine/models/`, `requirements-models.txt` | จุดวางโมเดลและ dependencies แบบ optional ที่ Dockerfile รองรับ |
| `nginx/` | reverse proxy, TLS และสคริปต์สร้าง certificate |
| `docker-compose.yml` | topology หลักและ health checks |
| `.env`, `backend/.env`, certificates, database, uploads | environment และข้อมูลของเครื่องนี้ เก็บไว้เพื่อไม่ให้ข้อมูลระบบหาย ห้าม commit secrets/live data |
| `docs/` | แนวทาง streaming และเอกสาร deployment รุ่นก่อน |
| `.git`, `.gitignore`, `.gitattributes`, `LICENSE` | ประวัติ repository, กฎควบคุมไฟล์ และใบอนุญาต |

`node_modules`, `backend/dist` และ `frontend/build` ที่มีอยู่เป็น dependencies/ผล build สำหรับการรันในเครื่อง เก็บไว้เพื่อไม่ตัดไฟล์ของระบบที่ติดตั้งอยู่ และถูกยกเว้นจาก Git แล้ว ไม่จำเป็นต้องแนบเมื่อส่งซอร์สต่อ

## ติดตั้งและรันจากซอร์ส

1. สร้าง `.env` จาก `.env.example` สำหรับ deployment ใหม่; อย่าทับ `.env` ของระบบที่ใช้งานแล้ว
2. ตั้ง `PUBLIC_ORIGIN`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`, `INGEST_API_KEY`, `DETECTION_API_KEY`, `TOTP_ENCRYPTION_KEY`, `PDF_RENDER_KEY` ให้ถูกต้อง
3. ingestion/detection keys ต้องผ่านเกณฑ์ production; TOTP key ต้องเป็น hex 64 ตัวและเก็บคงที่ ตรวจข้อกำหนดเพิ่มเติมในตัวตรวจค่า environment ของ Backend
4. ฐานข้อมูล production ใหม่ต้องกำหนด `BOOTSTRAP_ADMIN_PASSWORD` อย่างน้อย 12 ตัวตามเกณฑ์ของ SeedService; บัญชี admin ถูกบังคับเปลี่ยนรหัสเมื่อเข้าใช้ ไม่ใช้รหัส bootstrap รุ่นเก่า
5. เตรียม `nginx/certs/cert.pem` และ `key.pem` ที่ตรงกับโดเมน หรือใช้ `bash nginx/generate-ssl.sh` สำหรับสภาพแวดล้อมที่เหมาะกับ self-signed certificate
6. เริ่ม Compose โดยตรงจากรากโปรเจกต์:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 backend detection-engine pdf-renderer frontend nginx
```

Dockerfile ของ Backend ติดตั้ง dependencies, build และเรียก migrations ก่อนเริ่มแอป PDF ใช้ service `pdf-renderer` แยกจาก Backend; รายงานและข้อมูล PostgreSQL/receipts มี volumes ตาม Compose ปัจจุบัน ไม่ต้องใช้ archive หรือสคริปต์ deploy รุ่นก่อนที่นำออกแล้ว

การติดตั้ง dependencies เพื่อพัฒนา (ใช้ Node 24 ตาม `.nvmrc`; ขั้นตอน local ดู CONTRIBUTING):

```bash
npm --prefix backend ci --legacy-peer-deps
npm --prefix backend run build
npm --prefix frontend ci --legacy-peer-deps
npm --prefix frontend run build
npm --prefix frontend run check
```

ณ วันที่ตรวจ Frontend check ยังไม่ผ่าน ดูรายละเอียดใน HANDOFF_READINESS ก่อนส่งงาน

ไฟล์ environment ไม่ได้ถูกอ่านเข้า Node process โดยอัตโนมัติจากการวางไฟล์ ต้องใช้ environment ของ process/Compose หรือ `node --env-file` ให้เหมาะกับคำสั่งที่รัน อย่าเปิด production ด้วยค่าเริ่มต้นที่ไม่ผ่าน validation

## บัญชีและรหัสผ่านสำหรับเข้าใช้งานครั้งแรก

| รายการ | ค่าที่ใช้ |
| --- | --- |
| ชื่อผู้ใช้เริ่มต้น | `admin` |
| รหัสผ่านแรกเริ่ม | ค่าที่ผู้ติดตั้งกำหนดใน `BOOTSTRAP_ADMIN_PASSWORD` ของ `.env` ก่อนเริ่มระบบกับฐานข้อมูลว่าง |
| หน้าเข้าสู่ระบบ | เปิด `PUBLIC_ORIGIN` ที่กำหนดไว้ แล้วเลือกเข้าสู่ระบบแบบ local ที่ `/` |
| หลังเข้าสู่ระบบ | เปลี่ยนรหัสผ่านตามที่ระบบบังคับ และทำขั้นตอน MFA หากระบบกำหนด |

**ระบบไม่มีรหัสผ่านเริ่มต้นตายตัวที่แจกใช้ร่วมกัน** ผู้ติดตั้งต้องกำหนดรหัสเฉพาะ deployment เอง สำหรับ production ต้องยาวอย่างน้อย 12 ตัว และไม่ใช้ค่า placeholder/รหัสรุ่นเก่าที่ SeedService ปฏิเสธ ไม่ใส่รหัสจริงลงคู่มือหรือ Git

ขั้นตอนสำหรับติดตั้งใหม่:

1. สร้างรหัสสุ่ม เช่น รัน `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` ในเครื่องผู้ติดตั้ง แล้วเก็บผ่านช่องทางที่ควบคุมสิทธิ์
2. ใส่ค่าที่สร้างใน `BOOTSTRAP_ADMIN_PASSWORD=` ของ `.env` (ถ้ารัน Backend จากซอร์สให้ใช้ `backend/.env` และโหลด environment ตาม CONTRIBUTING)
3. เริ่มระบบด้วยขั้นตอนติดตั้งด้านบน แล้ว login ด้วยชื่อ `admin` และรหัสที่กำหนด ระบบจะบังคับเปลี่ยนรหัสผ่านครั้งแรก
4. หลังเปลี่ยนรหัสสำเร็จ ให้ล้างค่า bootstrap จาก `.env` และนำ environment ใหม่ไปใช้กับ Backend ตามขั้นตอน deployment; จัดเก็บรหัสใหม่อย่างปลอดภัย

ตัวแปร bootstrap ใช้สร้างบัญชีเฉพาะเมื่อฐานข้อมูลผู้ใช้ว่าง หากมีบัญชีอยู่แล้ว การแก้ตัวแปรนี้ **ไม่รีเซ็ตรหัสผ่านเดิม** ให้ผู้ดูแลใช้ขั้นตอน reset password ใน Users สำหรับ development ที่ไม่ได้กำหนด bootstrap ระบบสุ่มรหัสและแสดงครั้งเดียวใน log ตอนสร้าง admin ต้องเก็บ log นั้นเป็นข้อมูลลับ

## หน้าเว็บและการใช้งาน

| URL | ใช้ทำอะไร |
| --- | --- |
| `/` | เข้าระบบ local, ยืนยัน MFA และเปลี่ยนรหัสเมื่อถูกบังคับ |
| `/callback` | รับผล KKU SSO แล้วส่งต่อ flow ที่ Backend อนุญาต |
| `/login` | callback/login compatibility flow รุ่นเดิม |
| `/dashboard` | ภาพรวมเหตุการณ์/การแจ้งเตือนที่หน้าโหลดอยู่ |
| `/dashboard/log-ingestion` | ดู log ที่รับจริง สถานะ pipeline รายการรับเข้า และตัวอย่างส่ง POST |
| `/dashboard/detections` | ดู Detection Results; กรอง source/severity/target scope และเปลี่ยนหน้า |
| `/dashboard/hunting` | ค้นและกรองเหตุการณ์เพื่อสืบสวน |
| `/dashboard/explorer` | ค้น log และอ่านรายละเอียด/raw evidence |
| `/dashboard/soar` | Deep Incident สำหรับตรวจกลุ่มเหตุการณ์ หลักฐาน timeline และ AI |
| `/dashboard/analytics` | วิเคราะห์ต้นทาง ประเทศ และ attack vectors |
| `/dashboard/ai-briefing` | สรุปสถานการณ์และจัดลำดับการตรวจเพิ่มเติม |
| `/dashboard/mitre` | ดูการจัดประเภทตาม tactic/technique ที่ระบบรองรับ |
| `/dashboard/cve` | ค้นรหัส CVE และอ่านข้อมูลช่องโหว่/บทวิเคราะห์ |
| `/dashboard/network-map` | จัดการเครือข่าย/หน่วยงานที่ระบบใช้พิจารณาเป้าหมาย |
| `/dashboard/blocked_ip_audit` | ดูรายการตอบสนองที่บันทึกใน SIEM; การบังคับใช้จริงขึ้นกับ response mode/integration |
| `/dashboard/health` | ดูทรัพยากรและสถานะระบบ |
| `/wallboard` | หน้าจอ SOC/แผนที่สำหรับแสดงภาพรวม |
| `/dashboard/settings` | ทางเข้าการตั้งค่า |
| `/dashboard/settings/profile` | ข้อมูลส่วนตัว |
| `/dashboard/settings/users` | ผู้ดูแลจัดการบัญชี บทบาทและรหัสผ่าน |
| `/dashboard/settings/config` | การตั้งค่าระดับระบบ |
| `/dashboard/settings/log-api` | ตั้ง API ต้นทางรวม, key/auth, format/JSON mapping/SSE, ทดสอบและดึงข้อมูล |
| `/dashboard/settings/integrations` | ตั้ง AI และช่องทางแจ้งเตือน รวม Slack policy ตามสิทธิ์ |
| `/dashboard/settings/developer-api` | PAT, REST/MCP catalog, ตัวอย่างเรียกใช้ และ activity |
| `/dashboard/settings/api-history` | ประวัติคำขอ API ตามสิทธิ์ผู้ดูแล |
| `/dashboard/settings/report-history` | ประวัติรายงาน ดาวน์โหลดและจัดการตามสิทธิ์ |
| `/dashboard/settings/audit-trail` | ประวัติกิจกรรมที่ระบบบันทึก |
| `/dashboard/settings/security` | รหัสผ่านและการตั้งค่าความปลอดภัยของบัญชี |

ตรวจสิทธิ์และผลตอบกลับจาก server ทุกครั้ง การมีปุ่มใน UI ไม่ได้ยืนยันว่าได้สิทธิ์หรือทำงานกับอุปกรณ์ภายนอกสำเร็จ

## ขั้นตอนนำข้อมูลเข้า

1. Admin ตรวจ Network Map และ asset/target configuration ให้ตรงกับระบบจริง
2. เปิด Settings > Log API ตั้ง URL รวมและเลือกการส่ง key ตามต้นทาง
3. เลือก response format: auto, SSE หรือรูปแบบที่ต้นทางรองรับ; กำหนด JSON paths เมื่อจำเป็น
4. บันทึกก่อน pull และตรวจสถานะ/ข้อผิดพลาดบนหน้า การ Test GET หรือ Pull เรียกต้นทางจริง จึงต้องใช้ปลายทางที่ได้รับอนุญาต
5. เปิด Log Ingestion เพื่อตรวจ receipt/processing status แล้วเปิด Detection Results เพื่อดูผลกฎ รวมรายการที่ยังไม่เป็น alert
6. สืบสวน actionable events ใน Deep Incident/Hunting โดยเทียบ source, target, timestamp และ raw evidence

POST ภายนอกใช้ `/api/ingest` และ ingestion credential ตาม deployment ส่วน developer PAT เป็นอีกชนิดหนึ่ง ไม่ใช้แทน ingestion key หรือ browser session

คะแนนตรวจจับปัจจุบันมาจาก rules/heuristics; shadow model เป็นการเปรียบเทียบตามการตั้งค่า ไม่ใช่การยืนยันว่าใช้งาน trained production model ครบแล้ว การหาเป้าหมายไม่ได้หรือไม่มีข้อมูลเพียงพอต้องรายงานตามหลักฐาน

## รายงานและข้อมูลถาวร

อัปเดต 16 ตุลาคม 2026: Hunting/Deep Incident แสดงหน่วยงานและ CIDR แยกต้นทาง/เป้าหมาย เว็บไซต์อ่านจาก HTTP evidence และเปิด receipt ต้นฉบับได้ Log Explorer ค้น receipt จริงรวมการเข้าเว็บปกติ ส่วน Wallboard ใช้ scope การแจ้งเตือนเดียวกับ Dashboard และแสดงสถานะการโหลดข้อมูล

Export รักษาตัวกรอง IP/ประเภท/ประเทศ/severity และช่วงเวลาจากหน้าต้นทาง ผล CVE จาก AI ต้องมีหลักฐานและตรวจรหัสที่เผยแพร่แล้วก่อนบันทึก เชื่อมประวัติกลับ Incident ได้ การมี CVE similarity ยังไม่ยืนยันช่องโหว่หรือการเจาะสำเร็จ รายละเอียดไฟล์ migration การตั้งค่า และผลทดสอบอยู่ใน [บันทึกการเชื่อมข้อมูล](docs/incident-evidence-cve-report-validation.md)

ใช้ report flow ที่เปิดให้ในหน้าต้นทาง ตรวจข้อมูลที่เลือก preview และชนิดไฟล์ที่ได้จริง ตรวจประวัติรายงานที่ Backend เพิ่มอีกครั้งหากต้องใช้อ้างอิง การล้างไฟล์พัฒนารอบนี้ไม่ได้ลบฐานข้อมูล รายงานของผู้ใช้ `.env` หรือ private certificate ที่ระบบเครื่องนี้ใช้อยู่

## เอกสารเพิ่มเติม

[README](README.md), [CLAUDE](CLAUDE.md), [DEPLOY](DEPLOY.md) และ [CONTRIBUTING](CONTRIBUTING.md) ปรับตามซอร์สปัจจุบันแล้ว ผลตรวจส่งต่ออยู่ใน [HANDOFF_READINESS](docs/HANDOFF_READINESS.md) เอกสารใน `docs/deployment-history/` เป็นบันทึกย้อนหลัง คำสั่งที่อ้าง `ecs-release`, `.patch` หรือ helper รุ่นเก่าไม่ใช่ขั้นตอนปัจจุบัน ส่วน `deploy.ps1` ที่รากโครงการส่ง source ของ Incident / Report / CVE / Wallboard จำนวน 42 ไฟล์จากโฟลเดอร์หลักผ่าน SCP โดยตรง แล้ว build/up เฉพาะสามบริการ ตาม [DEPLOY](DEPLOY.md)

## ก่อนส่งซอร์สขึ้น Git ขององค์กร

- ตรวจ `git status` และ diff เพื่อเก็บงานใหม่ที่ยังไม่ commit ให้ครบ
- แนบ source, configs, dependency manifests/lockfiles, migrations, assets, LICENSE และ `.md` ที่ต้องใช้
- ไม่นำ `.env`, private keys, database, reports, node_modules, build/cache หรือ archives เข้าประวัติ Git
- ไฟล์ที่เคย tracked ยังต้อง commit การลบ/ปรับตามสถานะจริง กฎ ignore ไม่ลบไฟล์ออกจากประวัติเดิม
- เมื่อพฤติกรรมเปลี่ยน ให้แก้คู่มือจากโค้ดรุ่นนี้ ไม่คัดลอกคู่มือของ worktree รุ่นเก่ามาทับทั้งชุด

## สิทธิ์และการใช้ฟังก์ชันร่วม

ผู้ใช้ต้องเข้าสู่ระบบก่อนดูข้อมูลที่ป้องกันไว้ สิทธิ์จริงตรวจโดย Backend ทั้ง role, สถานะบัญชี และ version ของ token ผู้ใช้แบบอ่านอย่างเดียวอาจเปิดหน้าได้แต่แก้ไขไม่ได้ งานจัดการบัญชี/queue และ configuration บางส่วนจำกัดผู้ดูแล ส่วนข้อมูลดิบจำกัด role ที่ API อนุญาต เมื่อพบ 401 ให้ตรวจ session; 403 ให้ตรวจสิทธิ์กับผู้ดูแล

### เข้าระบบและบัญชี

- `/` เป็นทางเข้าหลัก: เลือก local หรือ SSO ตาม deployment ทำ MFA และเปลี่ยนรหัสเมื่อระบบกำหนด `/callback` และ `/login` เป็นส่วนของ callback/compatibility flow ไม่ใช่หน้าตั้ง SSO
- Profile แก้ข้อมูลแสดงผลของตน Security จัดการรหัสผ่านและ MFA Users ใช้เพิ่ม/แก้ไข/ลบบัญชี บทบาท และ reset password ตามสิทธิ์ ตรวจชื่อบัญชีก่อนบันทึก
- Developer API สร้าง/เพิกถอน PAT เลือก scope และวันหมดอายุ เก็บ token ที่แสดงครั้งเดียวผ่านช่องทางปลอดภัย ใช้ catalog/OpenAPI และทดสอบ REST/MCP แบบอ่านข้อมูล ดู activity เพื่อยืนยันว่ามีการเรียกใช้จริง

### ตรวจเหตุการณ์และสืบสวน

- เริ่ม Log Ingestion เพื่อดูรับเข้าจริง คิว สถานะประมวลผล และสาเหตุ fail/quarantine จากนั้นดู Detection Results ซึ่งรวมผลที่ยังไม่เป็น incident
- Dashboard แสดงเหตุการณ์ที่เข้าเกณฑ์ alert และขอบเขตเครือข่าย เลือกช่วงเวลาให้ตรง timestamp ใน log หากต้นทางมีข้อมูลเก่า ข้อมูลอาจไม่อยู่ในช่วงค่าเริ่มต้น
- Hunting ใช้กรอง/ค้นการโจมตี Explorer ใช้ตรวจ log และ evidence เปิดรายละเอียดก่อนสรุปผล เทียบ IP ต้นทาง/เป้าหมาย หน่วยงาน เวลา กฎและ raw content
- Deep Incident/SOAR ใช้ดูความสัมพันธ์ timeline และหลักฐาน เปิด AI ช่วยวิเคราะห์เมื่อ integration พร้อม ตรวจข้อเสนอเทียบหลักฐานก่อนใช้ตอบสนอง
- Analytics, MITRE และ AI Briefing ช่วยดูแนวโน้ม/จัดลำดับ แต่จำนวนหรือคะแนนไม่ใช่การยืนยันความสำเร็จของการโจมตี CVE แสดงข้อมูลช่องโหว่/บทวิเคราะห์ ไม่ใช่หลักฐานว่าทรัพย์สินติดช่องโหว่นั้นแล้ว
- Blocked IP Audit ใช้ติดตามรายการตอบสนองใน SIEM ตรวจ response mode และผล integration เพิ่มเพื่อยืนยันอุปกรณ์ปลายทาง Wallboard ใช้แสดงภาพรวม Health ใช้ติดตามทรัพยากร/สถานะระบบ

### ตั้งค่าต้นทางและระบบ

- Network Map ต้องตรงกับเครือข่าย/หน่วยงานจริงและ asset ของต้นทาง ไม่ใส่ IP ของ SIEM แทนเป้าหมายเพื่อให้ผ่าน LAN filter
- Log API กำหนด combined endpoint, วิธีส่ง credential, JSON mapping หรือ SSE, polling/cursor และ asset ตามรูปแบบต้นทาง บันทึกก่อน pull; Test GET อ่านตัวอย่างโดยไม่บันทึก receipt หรือเลื่อน cursor
- Integrations กำหนด AI/การแจ้งเตือน และ Slack Alert Policy ตรวจ cooldown, เพดานส่ง และ preview เหตุผลก่อนเปิดใช้งาน การทดสอบที่ส่งจริงอาจแจ้งเตือนระบบภายนอก
- System Config ใช้ปรับการตั้งค่าที่หน้าอนุญาต environment และ service topology ยังจัดการโดยผู้ดูแล deployment
- API History ตรวจคำขอ/สถานะตามสิทธิ์ Audit Trail ใช้ตรวจการกระทำที่ระบบบันทึก ไม่ใช้แทนการสำรองฐานข้อมูล

### รายงานและการตรวจผล

เลือกเหตุการณ์และช่วงเวลาจากหน้าที่มีปุ่ม export/report เปิด preview ตรวจความครบของ evidence และข้อมูลอ่อนไหวก่อนสร้าง/ดาวน์โหลด ชนิดไฟล์ขึ้นกับ flow ของหน้านั้น Report History ใช้ค้นย้อนหลัง ดาวน์โหลด หรือจัดการรายการตามสิทธิ์ ถ้า PDF ล้มเหลวให้ตรวจ PDF worker และ log ของ Backend

เมื่อข้อมูลไม่ปรากฏ ให้ไล่ตรวจ source → receipt → processing/detection → alert eligibility/network scope → time filter ตามลำดับ ดู [รายละเอียด pipeline](docs/streaming-log-processing.md) ก่อนส่งข้อมูลซ้ำ ไม่แปลง log ที่ไม่พอเป็น alert เพียงเพื่อให้ Dashboard มีข้อมูล
