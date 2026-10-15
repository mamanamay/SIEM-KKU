> **บันทึกย้อนหลัง:** อาจอ้างไฟล์/คำสั่งที่นำออกแล้ว ขั้นตอนติดตั้งปัจจุบันอยู่ใน [DEPLOY](../../DEPLOY.md) และ [README](../../README.md)

# เพิ่ม CA สำหรับ HTTPS API บน server

ชุด deploy นี้รองรับ CA เพิ่มเติมใน backend โดยยังตรวจใบรับรอง HTTPS และชื่อโดเมนตามเดิม ใช้กับการเรียก Log API, SSO, AI และ webhook ของ backend ทั้งหมด ไม่เปลี่ยนใบรับรองหน้าเว็บ SIEM และไม่ต้องกรอก certificate ในหน้า Log API

## ขอและวางไฟล์

ขอ Root CA และ Intermediate CA ที่ใช้จริงจากผู้ดูแล API/เครือข่าย ในรูปแบบ PEM ขอเฉพาะ public certificate ไม่ขอ private key หากมี HTTPS inspection ให้ผู้ดูแลยืนยัน CA ของระบบ inspection ด้วย ตรวจ fingerprint กับผู้ดูแลผ่านช่องทางที่เชื่อถือได้ก่อนติดตั้ง ไม่ดึงใบรับรองจากปลายทางแล้วเชื่อถือทันที

รวม CA ที่ได้รับเป็น `log-api-ca.pem` (แต่ละใบมี BEGIN CERTIFICATE / END CERTIFICATE) ไม่ใช้ certificate ของเว็บ SIEM หรือ server certificate ของ API แทน CA

บน server ใน SSH terminal ของ napat:

```bash
mkdir -p /home/napat/siem-ca
chmod 755 /home/napat/siem-ca
```

บน Windows PowerShell เปลี่ยน path ต้นทางให้ตรงกับไฟล์ที่ได้รับ:

```powershell
scp "C:\path\to\log-api-ca.pem" napat@10.101.104.234:/home/napat/siem-ca/log-api-ca.pem
```

กลับ terminal บน server:

```bash
chmod 644 /home/napat/siem-ca/log-api-ca.pem
```

โฟลเดอร์นี้เก็บเฉพาะ public CA certificate จึงอ่านได้โดย backend ที่รันเป็น user node และอยู่นอก source project ที่ installer อัปเดต

## Deploy และตั้งค่า

ต้อง deploy ชุดใหม่ก่อนเพื่อให้ Compose รองรับ volume และ environment เพิ่มเติม (ค่าเริ่มต้นยังไม่เปิด CA เพิ่มเติม):

```powershell
cd C:\Users\InternCY\Documents\GitHub\Demo_Honeypot
.\deploy-single-api.ps1 -ServerIP 10.101.104.234 -Username napat -RemoteDir '~/siem_v2'
```

บน server เปิด `~/siem_v2/.env` แล้วเพิ่มหรือแก้ค่าเดิมเพียงหนึ่งรายการต่อชื่อ ห้ามทับทั้งไฟล์:

```dotenv
SIEM_CA_DIR=/home/napat/siem-ca
NODE_EXTRA_CA_CERTS=/app/certs/log-api-ca.pem
```

`SIEM_CA_DIR` คือโฟลเดอร์จริงบน host; `NODE_EXTRA_CA_CERTS` คือ path ของไฟล์ภายใน container backend ซึ่ง mount แบบ read-only ที่ `/app/certs` ค่าเริ่มต้น mount `/etc/ssl/certs` ของ host โดย NODE_EXTRA_CA_CERTS ว่าง จึงยังใช้ trust store เดิมของ Node.js เท่านั้น Compose จะไม่สร้างโฟลเดอร์ CA ที่พิมพ์ผิดให้อัตโนมัติ

ตรวจไฟล์ด้วย image backend ก่อนเปลี่ยน container ที่รันอยู่:

```bash
cd ~/siem_v2
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml run --rm --no-deps backend node config/check-extra-ca.cjs
```

ต้องแสดง `Additional outbound CA bundle validated` หากไฟล์ไม่มี/อ่านไม่ได้/ไม่ใช่ PEM CA/หมดอายุ/มี private key จะไม่ผ่าน ตรวจนี้ยืนยันไฟล์และสิทธิ์อ่าน ยังไม่ยืนยันว่าตรงกับ issuer ของ API

เมื่อผ่านแล้ว:

```bash
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml up -d --no-deps --no-build --force-recreate --wait --wait-timeout 120 backend
sudo docker compose --env-file .env -p siem_v2 -f docker-compose.yml logs --tail=50 backend
```

ในหน้า Settings > Log API ใช้ URL `https://...` ที่ชื่อโดเมนตรงกับ certificate แล้ว Test GET จากนั้นบันทึก/เปิดดึงอัตโนมัติ การเพิ่ม CA ไม่แก้ certificate หมดอายุ ชื่อโดเมนผิด หรือ chain ที่ต้นทางส่งมาไม่ครบ หากยังผิดพลาดให้ส่งเฉพาะ error code ไม่ส่ง API key

ไม่ต้อง rebuild image เพื่อเปลี่ยนเนื้อหา CA ในครั้งต่อไป แต่ต้องสร้าง backend container ใหม่ เพราะ Node.js โหลด CA เมื่อเริ่ม process ใบรับรองจริงไม่ได้รวมใน release archive และ installer ไม่เขียนทับ `.env` หรือ `/home/napat/siem-ca` จึงคงการตั้งค่าครั้งต่อไป

หาก server มี `docker-compose.override.yml` ให้เติม `-f docker-compose.override.yml` ต่อท้าย `-f docker-compose.yml` ในทุกคำสั่ง Compose ด้านบน เพื่อคง override ที่ใช้จริง

อ้างอิง: https://nodejs.org/learn/http/enterprise-network-configuration
