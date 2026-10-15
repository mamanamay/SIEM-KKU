# แนวทางทำงานกับซอร์ส KKUSIEM

ใช้เอกสารนี้ร่วมกับ [README](README.md), [CONTRIBUTING](CONTRIBUTING.md), [GUIDELINE](GUIDELINE.md) และ [สถานะส่งต่อ](docs/HANDOFF_READINESS.md) อ้างอิงซอร์สปัจจุบัน ณ 15 ตุลาคม 2026

## จุดเริ่มต้นของแต่ละส่วน

| งาน | ไฟล์/โฟลเดอร์หลัก |
| --- | --- |
| Bootstrap, services, database | `backend/src/main.ts`, `app.module.ts`, `data-source.ts` |
| Session, MFA, SSO, roles | `auth.controller.ts`, `auth.guard.ts`, `auth-policy.ts`, `auth-tokens.ts`, `jwt.config.ts`, `totp.service.ts`, `crypto.service.ts`, `roles.guard.ts` |
| รับ log และ durable queue | `ingest.controller.ts`, `receipt.service.ts`, `log.service.ts`, `request-admission.ts`, `runtime-limits.ts` |
| ดึง API/JSON/SSE | `log-api.controller.ts`, `log-api.service.ts`, `log-api-config.ts`, `log-api-format.ts`, `log-api-sse.ts` |
| LAN, target และ alert eligibility | `network-map.service.ts`, `target-ip.ts`, `event-context.ts`, `alert-policy.ts`, `alert-query.service.ts` |
| Entities และ schema upgrade | `backend/src/entities/`, `backend/src/migrations/`, `data-source.ts` |
| Reports | `incident-report.controller.ts`, `report-query.service.ts`, `report-safety.ts`, `export.service.ts`, `backend/config/pdf-worker.cjs`, `frontend/src/lib/ReportEngine/` |
| PAT, REST/MCP, outbound policy | `backend/src/developer-api/`, `outbound-http.ts`, `integration-url.ts` |
| WebSocket และ audit | `events.gateway.ts`, `audit.service.ts`, `backend/src/api-log/` |
| Detection runtime | `detection-engine/main.py`, `parsers/`, `engine/rules/`, `engine/correlation/`, `features/`, `fusion/`, `alert_policy.py` |
| Optional shadow model | `detection-engine/engine/ml/shadow_model.py`, `models/README.md`, `requirements-models.txt` |
| UI/route/shared state | `frontend/src/routes/`, `frontend/src/lib/`, `frontend/src/stores/` |
| Deployment | `docker-compose.yml`, service Dockerfiles, `nginx/nginx.conf`, `.env.example` |

Backend paths ในตารางที่ไม่ได้ขึ้นต้นด้วยโฟลเดอร์อยู่ใต้ `backend/src/` ตรวจการเรียกใช้จริงก่อนลบไฟล์ โดยเฉพาะ dynamic imports, Docker COPY/bind mounts, assets และ migrations

## ข้อกำหนดที่ต้องคงไว้

- AuthGuard เป็น global guard ผ่าน `APP_GUARD` endpoint ใหม่ต้องกำหนด public/ingest/self-service/role อย่างตั้งใจ ตรวจสิทธิ์ที่ server เสมอ
- Access token และ pre-auth ใช้ signed HS256 JWT แยก purpose/stage; tokenVersion และสถานะบัญชีมีผลต่อการเพิกถอน session ห้ามย้อนกลับไปเชื่อ pre-auth payload ที่ไม่ได้ verify
- Production ต้องมี PostgreSQL, keys ผ่าน validation และ schema migrations; ไม่เปิด `synchronize` ใน production
- Migration แรกสร้าง baseline เฉพาะฐานข้อมูลแอปที่ว่าง ตรวจฐานข้อมูลที่มี schema บางส่วนก่อนอัปเกรด migrations หลายตัวปฏิเสธ automatic down เพื่อรักษาหลักฐาน
- ACK หลัง receipt ลงฐานข้อมูล; คิวต้องมีขอบเขต, lease, retry และ idempotency ไม่โหลด log ทั้งหมดเข้า RAM และไม่ broadcast ก่อน transaction สำเร็จ
- เก็บ raw evidence และผลตรวจที่ไม่เข้าเกณฑ์ alert แยกจาก incident; อย่าแต่ง target IP เพื่อผ่าน LAN policy
- JSON/SSE polling ต้องเลื่อน cursor หลัง durable ACK และแยกจำนวนอ่านใหม่/ซ้ำให้ชัด
- Source keys และ MFA ใช้การเข้ารหัสที่พึ่ง `TOTP_ENCRYPTION_KEY` ห้ามเปลี่ยนค่าของระบบที่มีข้อมูลเดิมโดยไม่มีแผนย้ายข้อมูล
- Outbound URL ต้องผ่าน network/host policy; ไม่ปิด TLS verification เพื่อแก้ปัญหา CA
- PDF worker แยก service/network และใช้ sandbox ของ Chromium ไม่เพิ่ม `--no-sandbox` เพื่อกลบปัญหา deployment
- Developer PAT ใช้ scope และสิทธิ์บัญชีปัจจุบัน ไม่ใช้ PAT แทน ingestion key หรือ browser session; token เต็มแสดงครั้งเดียว
- การแจ้งเตือน/การตอบสนองต้องบอกผลจริงจาก integration ไม่ถือว่าบันทึกนโยบายหรือรายการบล็อกแล้วเท่ากับอุปกรณ์ภายนอกทำสำเร็จ

## ตรวจงานก่อนส่ง

ใช้ lockfiles และ `npm ci --legacy-peer-deps` อย่าอัปเกรด dependency หลายส่วนพร้อมกันโดยไม่มีเหตุผล ทำ build ทั้ง Backend/Frontend และ `npm --prefix frontend run check` เมื่อแตะ UI/TypeScript พร้อมตรวจผลกระทบของ migration/API ที่เปลี่ยน

ณ วันที่ตรวจ build ผ่านแต่ Frontend check มี 113 errors / 135 warnings ใน 31 ไฟล์ และ build มี warnings เรื่อง Svelte exports/compatibility อย่าปิด strict checking หรืออ้างว่าระบบผ่านทุก check เพียงเพราะ build สำเร็จ ยังไม่มี automated test suite ในชุดที่ทำความสะอาดนี้

อัปเดตคู่มือและ `.env.example` เมื่อเปลี่ยน behavior/config ไม่ใส่ secrets, real reports, private keys, DB dumps, caches หรือ dependency folders ใน commit ตรวจ `git diff --cached` และ new/untracked runtime files ให้ครบก่อน commit

## การส่ง repository

ประวัติเดิมมี credentials และ private keys ที่ยังตรงกับระบบนี้ ห้ามถือว่า `.gitignore` หรือ commit ลบไฟล์ล้างประวัติแล้ว ให้เจ้าของระบบจัดการ credential rotation และเลือก source-only repository ใหม่หรือแผน sanitize history ที่ตรวจสอบได้ก่อนเผยแพร่ ห้าม force-push, ล้างประวัติ หรือเปลี่ยน credentials ของระบบที่ใช้อยู่โดยอัตโนมัติ
