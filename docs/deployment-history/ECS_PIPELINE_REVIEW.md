> **บันทึกย้อนหลัง:** อาจอ้างไฟล์/คำสั่งที่นำออกแล้ว ขั้นตอนติดตั้งปัจจุบันอยู่ใน [DEPLOY](../../DEPLOY.md) และ [README](../../README.md)

# ตรวจ API รวม NGINX + Firewall และเหตุผลที่ไม่เห็น alert

> รุ่นล่าสุด 14 ตุลาคม 2026 รวมการตั้งค่าให้เหลือหนึ่งฟอร์มและหนึ่ง connection แล้ว อ่าน SINGLE_API_REVIEW.md และใช้ deploy-single-api.ps1 จากโฟลเดอร์หลัก

## สาเหตุที่ยืนยันจากตัวอย่าง

ข้อมูลใหม่เป็น ECS JSON ไม่ใช่บรรทัด combined access/syslog แบบเดิม NGINX ใช้ `source.ip`, `http.request.method`, `url.original`, `@timestamp`; Firewall ใช้ `event.module=fortinet`, `destination.ip`, `event.action`, `fortinet.firewall` parser เดิมไม่รองรับ และการเลือก raw field เป็น `message` จะตัด IP/เวลา/HTTP/signature ออก [ECS field reference](https://www.elastic.co/guide/en/ecs/current/ecs-field-reference.html) และ [event fields](https://github.com/elastic/ecs/blob/main/docs/reference/ecs-event.md) อธิบายโครงสร้างเหล่านี้

โค้ดดึง GET เดิมกำหนด source ตามช่อง NGINX หรือ Firewall ทั้งชุด จึงไม่สามารถแยกทั้งสองชนิดจาก response เดียวอย่างถูกต้องได้

ตัวอย่างที่ส่งทั้งสองรายการไม่มีหลักฐานการโจมตี: NGINX GET สำเร็จ 200 และ Firewall เป็น session `close/success` นับเป็น log ปกติ ไม่แปลง policy ID 337 หรือ syslog severity 5 ให้เป็น IPS signature/threat score

## สิ่งที่แก้แล้ว

- Settings → Log API เพิ่ม **API เดียว · Firewall + NGINX** ดึงหนึ่งครั้งต่อรอบ แยก `nginx`/`fortinet` ตาม `event.module` คง URL/key เดิมของโหมดแยกไว้และหยุดการดึงอัตโนมัติของโหมดแยกเมื่อเปิด combined
- รองรับ JSON เดี่ยว, array, NDJSON, array ใต้ field, Elasticsearch `hits.hits._source` และ grouped `nginx`/`firewall` พร้อม raw text เดิม
- ECS เก็บทั้ง JSON แม้ raw field ตั้ง `message` จึงไม่ทิ้ง IP/เวลา/HTTP/ข้อมูล vendor
- NGINX อ่าน IP เป้าหมายจาก `destination.ip` หรือ upstream IP จริงใน `nginx.access.upstream_addr` บันทึก basis และไม่เดา IP จาก domain/multiple upstreams
- Firewall อ่าน source/destination/ports/bytes/observer IP และรักษา DNAT/observed destination; signature ใช้ vendor attack fields ไม่ใช่ policy ID
- POST รองรับ batch ECS โดยตรงและใช้ `event.id` กันการส่งซ้ำ
- หน้าเว็บแสดงจำนวนอ่าน/ใหม่/ซ้ำ/แยกชนิดไม่ได้ และเวลาเหตุการณ์ล่าสุดที่ API คืน
- Log Ingestion แสดงทุก disposition, เหตุผล/คะแนนการตัดสิน และปุ่มดูต้นฉบับ/หลักฐาน ผู้ดูแลส่งรายการ failed/quarantined กลับคิวหลังแก้ parser ได้
- รายการจาก API รวมที่แยกชนิดไม่ได้จะถูกเก็บแล้วกักพร้อมเหตุผล ไม่ทำให้เป็น benign เงียบ ๆ

## การคัดกรองเข้มแค่ไหน

ยังเป็น rules/heuristics และยังไม่มีค่า precision/recall จาก log จริงที่มี label ชุดทดสอบจำลองผ่าน **32/32 กรณี**: 13 กรณีเข้า alert policy, 17 กรณีไม่เข้า alert policy, 2 กรณีข้อมูลผิดถูกปฏิเสธ ผลนี้เป็น coverage ของกรณีทดสอบ ไม่ใช่ความแม่นยำ 100% ของ production

| เหตุการณ์ | ผลทดสอบ/เงื่อนไขปัจจุบัน |
|---|---|
| ตัวอย่าง NGINX และ Firewall ของผู้ใช้ | อ่าน IP/เวลาได้, benign, score 0 |
| SQL injection, XSS, traversal, command injection ใน URI | high, score 85, เข้า alert policy |
| Login ผิด 9 ครั้ง / 10 ครั้ง | 9 ยังไม่เข้า; 10 เข้า high score 80 |
| Port scan ที่ถูก deny 19 / 20 พอร์ต | 19 ยังไม่เข้า; 20 เข้า high score 80, หน้าต่าง 60 วินาที |
| เชื่อมต่อ allowed 20 พอร์ต | ไม่แปลงเป็น deny scan |
| IPS signature high / medium / low | high 85 และ medium 60 เข้า; low 30 เก็บเป็น filtered_detection |
| HTTP 404 50 รายการ | medium 65 เป็น filtered_detection ให้ analyst ตรวจ ไม่ขึ้น high alert |
| HTTP 404/500 เดี่ยว หรือ deny เดี่ยว | ไม่มีหลักฐานพอให้เป็น alert |

นอกจากคะแนน/หลักฐาน ยังต้องเกี่ยวข้องกับ Network Map ผ่าน source, destination หรือ sensor IP ตาม `LOG_SCOPE=related` ผลนอก scope จะเห็น `out_of_scope` ใน Log Ingestion ไม่จำเป็นต้องเปลี่ยนเป็น `LOG_SCOPE=all` เพื่อทำให้ตัวเลขขึ้น

หากยิง HTTP attack แต่ Firewall ส่งเพียง traffic session ปกติ จะไม่มี request URI/signature ให้ยืนยัน attack ต้องดู NGINX หรือ UTM/IPS event ที่มีหลักฐานนั้น และเป้าหมายที่ยิงต้องถูก monitor โดย API ต้นทางจริง ตัวอย่าง NGINX นี้กล่าวถึง vallaris/upstream 10.101.119.212; ต้องเทียบกับ URL/IP ที่ใช้ทดสอบจริง

## ผลทดสอบโค้ด

- Build backend/frontend/detection images ผ่าน และเปิดครบ 6 services healthy ใน stack แยก
- Parser unit tests 7 กรณีผ่าน รวม ECS ตัวอย่างจริง, IPv6, NAT, legacy และข้อมูลผิด
- 32 synthetic detection cases ผ่าน โดยไม่มีการยิงโจมตีจริง
- GET API รวม → durable DB → detection: 2 benign, 2 detected alerts, 1 unknown quarantined; retry เป็น duplicate ไม่สร้างใหม่
- POST ECS โดยตรงผ่าน, `event.id` retry dedupe ผ่าน
- GET แบบแยก URL เดิม รวม scheduled polling/header/query key ผ่าน
- Server diagnostic helper ผ่านใน stack จำลองโดยใช้ engine ชั่วคราวและไม่เขียนข้อมูล/alert ทดสอบลงฐานจริง
- Chromium ผ่านการเปิด API รวม/Test GET และ Log Ingestion/ปุ่มดูหลักฐานจริง; admin replay กู้ ECS receipt ที่เคย quarantined ผ่านแล้ว

## ใช้งานบน server

agent เข้า SSH แบบไม่กรอกรหัสผ่านไม่ได้ จึงยังไม่ได้ deploy/รันทดสอบบน 10.101.104.234 จริง ให้รันจาก terminal ที่คุณกรอกรหัสผ่านได้:

```powershell
cd C:\Users\InternCY\Documents\GitHub\Demo_Honeypot\ecs-release
.\deploy.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2'
.\sync-config.ps1 -AfterDeploy
```

จากนั้น Settings → Log API ช่อง **API เดียว**: กรอก URL/key เดิม, response `JSON` หรือ `auto`, source field `event.module`; ถ้า API คืน JSON เดี่ยวหรือ array ตรง ๆ ให้เว้นตำแหน่ง array ว่าง ถ้าเป็น `data.logs` ให้ใส่ให้ตรง actual response แล้ว Test GET → บันทึก/เปิดดึงอัตโนมัติ → ดึง log ตอนนี้ → Log Ingestion

หลังตั้งค่าให้รัน:

```powershell
.\test-log-pipeline.ps1
```

สคริปต์อ่าน settings/receipts จริงใน transaction READ ONLY, เรียก GET ด้วย key ที่เก็บไว้โดยไม่แสดง key และ replay ตัวอย่างล่าสุดสูงสุด 25 รายการต่อชนิดใน detection container ชั่วคราว (512 MB, 1 CPU) ที่ใช้ image ปัจจุบัน ไม่สร้าง user/เปลี่ยน policy/เพิ่ม test alerts/เรียก Slack/สั่ง block แล้วลบ container และไฟล์ helper ใน backend หลังจบ สำเนารายงานบน server เป็น private และดาวน์โหลดมา `log-pipeline-report.jsonl`

อ่าน `live_receipts_24h`, `recent_receipt_decisions`, `live_api.decisions` เป็นผลของระบบจริง แยกจาก `self_test` ที่เป็นข้อมูลจำลอง:

| decision | สิ่งที่ตรวจต่อ |
|---|---|
| PARSER_ERROR | schema/field ที่ API ส่ง กับ parser |
| NO_RULE_MATCH | รายการนี้ไม่ตรงกฎ; เทียบ URI/signature ของการยิงจริง |
| BELOW_ALERT_POLICY | ตรวจ score/evidence, ไม่ใช่ปัญหาการรับ log |
| OUTSIDE_CONFIGURED_NETWORK | เทียบ target/sensor กับ Network Map |
| WOULD_CREATE_ALERT | หลักฐานและ scope ผ่าน; เทียบ receipt ที่ระบบจริงประมวลผล |

รายงานไม่พิมพ์ raw/API keys หรือ URL query ต้นทาง ส่วนหลักฐานต้นฉบับอ่านได้ผ่านหน้าเว็บที่ตรวจสิทธิ์

## ข้อจำกัดที่ยังต้องยืนยันจริง

- URL/key/response wrapper/pagination/cursor/ช่วงเวลา API จริงยังไม่อยู่ในข้อมูลที่ให้มา ต้องดูผล `live_api` และเทียบเวลาเหตุการณ์ การได้ HTTP 200 แต่เป็น snapshot เดิมไม่ยืนยันว่า log ของการยิงใหม่มาถึง
- กฎ burst/scan ใช้ processing-time windows ในรุ่นปัจจุบัน การ replay log เก่าเป็นก้อนอาจสะสมเป็น burst ได้ จึงต้องจัด replay/ช่วงเวลาให้เหมาะก่อนสรุปเหตุการณ์จริง
- กฎ URI เป็น heuristic ไม่ครอบคลุม payload ใน POST body ถ้าต้นทางไม่ได้ส่ง body มา, TLS payload ที่ไม่มี access/IPS log, หรือรูปแบบ evasion ทั้งหมด
- การประมวลผลใหม่ช่วยรายการที่ยังมีต้นฉบับเก็บอยู่ หากโค้ดเดิมเลือกเฉพาะ `message` และไม่ได้เก็บ IP/HTTP ไว้ ต้องดึง ECS ต้นฉบับใหม่จาก API
- Synthetic thresholds ใน helper อิง defaults (20 denied ports, 10 auth failures); หากตั้ง custom thresholds ให้เทียบรายงานกับค่าที่ใช้จริง
- ชุดที่ตรวจแล้วอยู่ใน `ecs-release` เพราะแพ็กเกจ/สคริปต์ที่โฟลเดอร์หลักเปลี่ยนระหว่างตรวจ เก็บไฟล์ปัจจุบันไว้ทั้งหมดและรักษาการแก้ NGINX DNS resolver ไว้ในชุดใหม่ สคริปต์ใน `ecs-release` ใช้ checksum/staged build และรักษา `.env`/TLS/volumes บน server ส่วน source ที่โฟลเดอร์หลักยังต่างรุ่นตามรายงาน CONFIG_REVIEW.md
