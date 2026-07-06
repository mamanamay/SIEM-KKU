# 🛡️ KKUSIEM (Demo) - Honeypot & SIEM Dashboard

แดชบอร์ดแสดงผลแบบ Real-time ที่มีความทันสมัย สำหรับแสดงข้อมูลการโจมตีทางไซเบอร์ที่ดักจับได้จาก **Cowrie honeypot** ถูกสร้างขึ้นด้วยสถาปัตยกรรมแบบ Full-stack ที่ออกแบบมาเพื่อความรวดเร็ว ความเสถียร และความปลอดภัย ธีมและโครงสร้าง UI ได้รับแรงบันดาลใจจากระบบ Enterprise Firewall ชั้นนำ (FortiGate Light Theme)

![Honeypot Concept](https://img.shields.io/badge/Security-Honeypot-red.svg) ![SvelteKit](https://img.shields.io/badge/SvelteKit-2-ff3e00.svg) ![NestJS](https://img.shields.io/badge/NestJS-10-ea2845.svg) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)

## 📌 ภาพรวม (Overview)

โปรเจกต์นี้จัดทำขึ้นเพื่อเป็น Proof of Concept (PoC) สำหรับระบบตรวจสอบ Honeypot และ SIEM ระดับองค์กร (Enterprise) เมื่อแฮกเกอร์พยายามเจาะเข้ามาทางพอร์ต SSH/Telnet ตัว Cowrie honeypot จะดักจับและบันทึกพฤติกรรมที่เป็นอันตรายเหล่านั้นเอาไว้

แทนที่จะต้องพึ่งพาเครื่องมือจัดการ Log แบบเก่าที่หนักเครื่อง ระบบของเราใช้ Engine ขนาดเล็กที่ประมวลผล Log เหล่านี้ในทันที และแสดงผลบนแดชบอร์ดดีไซน์พรีเมียมแบบ **Real-time** พร้อมจำลองระบบตรวจสอบผู้โจมตีภายใน (Faculty Monitor)

**ฟีเจอร์เด่น (Key Features):**
- ⚡ **Real-time Monitoring:** ดูการโจมตีสดๆ ผ่าน WebSockets
- 🛡️ **Advanced SOC UI:** โครงสร้าง UI เต็มรูปแบบ 17 เมนูย่อย ครอบคลุมตั้งแต่งาน Detection & Analysis ไปจนถึง Compliance Audit
- 🔗 **3-Tier Log Correlation:** ระบบ SIEM เชื่อมโยง Log จาก 3 แหล่ง (Access Layer, Server Honeypot, C&C Outbound) เพื่อสร้างสายการโจมตีที่สมบูรณ์
- 🚫 **Interactive WAF / Firewall:** จำลองระบบ WAF ที่สามารถสั่ง Block IP แบบ Real-time ผ่าน UI และตัดการเชื่อมต่อผู้โจมตีทันที (TCP Drop)
- 🏢 **Faculty Monitor:** ระบบจำแนกการโจมตีจากภายในองค์กร โดยอิงตามวงแลน (Subnet) ของแต่ละคณะในมหาวิทยาลัย (Mockup)
- 🔍 **In-depth Analysis:** ตารางแสดงผลที่วิเคราะห์ระดับสูง เช่น รหัส MITRE ATT&CK Framework, ธงชาติ (GeoIP), คะแนนความเสี่ยง Threat Score (0-100), และแนะนำวิธีรับมือ (Mitigation steps) แบบอัตโนมัติ
- 🕒 **Interactive Time Range:** กรองและดูบันทึกตามช่วงเวลา (1h, 6h, 24h, 1m, 3m, 6m, 1y, All Time) แบบ Real-time พร้อมแสดง วันที่และเวลา (Date & Time) อย่างชัดเจน
- 🔒 **Role-based Authentication:** รักษาความปลอดภัยในการเข้าถึงแดชบอร์ด โดยแบ่งสิทธิ์การมองเห็นระหว่าง `admin` และ `guest` อย่างชัดเจน

---

## 🏗 โครงสร้างโปรเจกต์ (Project Structure)

- `frontend/` - **SvelteKit 2 (TypeScript)**: ส่วนติดต่อผู้ใช้งาน (UI) ธีม Light (ขาวขุ่น) หรูหราและใช้งานง่ายด้วย Vanilla CSS ครอบคลุม 17 หน้าเมนูย่อย
- `backend/` - **NestJS 10 (TypeScript)**: เป็น API server, WebSocket gateway, และตัวประมวลผล Log อัตโนมัติ ที่เชื่อมโยงข้อมูลจาก 3 แหล่ง (Correlation)
- `nginx/` - **Nginx 1.25**: Reverse proxy ทำหน้าที่จัดการ Routing และรองรับ SSL (HTTPS)
- `cowrie-config/` - **Cowrie**: การตั้งค่าและที่เก็บไฟล์ Log สำหรับ SSH/Telnet honeypot
- `webtrap/` - **WebTrap**: ระบบดักจับการโจมตีทางเว็บไซต์ (SQL Injection, Path Traversal)
- `siem-logs/` - ที่เก็บ Log ส่วนกลางรวมจากระบบดักจับต่างๆ (รวมทั้ง Access Layer ถ้ามีในอนาคต)

---

## 🚀 การเริ่มต้นใช้งาน (Getting Started)

### สิ่งที่ต้องมี (Prerequisites)
- [Docker](https://docs.docker.com/get-docker/) และ [Docker Compose](https://docs.docker.com/compose/install/)
- Git

### การติดตั้งและรันระบบ (Installation & Setup)

1. **Clone แหล่งเก็บข้อมูลนี้**
   ```bash
   git clone https://github.com/mamanamay/Demo_Honeypot.git
   cd Demo_Honeypot
   ```

2. **ตั้งค่า Environment Variables**
   ระบบใช้ไฟล์ `.env` สำหรับกำหนด Port และตั้งค่าอื่นๆ ทำการก๊อปปี้ไฟล์ต้นแบบ:
   ```bash
   cp .env.example .env
   ```
   *(เข้าไปแก้ไขไฟล์ `.env` ได้ตามต้องการ หากนำขึ้น Server จริงให้เปลี่ยน `JWT_SECRET`)*

3. **สร้าง SSL Certificates (จำเป็นสำหรับ HTTPS)**
   ใช้ Docker รันคำสั่งนี้เพื่อสร้าง self-signed certificate:
   ```bash
   docker run --rm -v "${PWD}/nginx/certs:/certs" nginx:1.25-alpine sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /certs/key.pem -out /certs/cert.pem -subj '/C=TH/ST=Bangkok/L=Bangkok/O=Honeypot/OU=IT/CN=localhost'"
   ```

4. **สตาร์ทระบบ**
   ใช้ Docker Compose เพื่อรันระบบทั้งหมด (Database, Backend, Frontend, Nginx, และ Honeypot):
   ```bash
   docker-compose up -d --build
   ```

4. **เข้าสู่แดชบอร์ด**
   เปิดเบราว์เซอร์แล้วไปที่:
   **`https://localhost`**
   
   *(หมายเหตุ: เนื่องจากเป็นการจำลองใบรับรอง SSL เบราว์เซอร์จะขึ้นเตือนความปลอดภัย ให้กด "Advanced" > "Proceed to localhost")*

---

### 🔑 บัญชีผู้ใช้เริ่มต้น (Default Credentials)
เมื่อเปิดระบบครั้งแรก ฐานข้อมูลจะสร้างบัญชีผู้ใช้เริ่มต้นให้โดยอัตโนมัติ:
- **Admin**: `admin` / `admin123` (ใช้งานได้เต็มรูปแบบ)
- **Guest**: `guest` / `guest123` (ดูได้อย่างเดียว)

*(หากต้องการแก้ไขรหัสผ่านเริ่มต้น ให้เข้าไปตั้งค่าใหม่ในไฟล์ `backend/src/seed.service.ts` จากนั้นทำการเคลียร์ฐานข้อมูลเพื่อให้ระบบสร้าง User ใหม่)*

---

## 🧪 วิธีทดสอบการโจมตี (How to Test the Honeypot)
1. ล็อกอินเข้าแดชบอร์ดผ่านเบราว์เซอร์
2. เปิด Terminal หรือ PowerShell 
3. ลองพยายามเชื่อมต่อเข้ากับ Honeypot เพื่อจำลองว่าคุณคือแฮกเกอร์:
   ```bash
   # โจมตี SSH Honeypot
   ssh root@localhost -p 2222
   
   # ลองยิงคำสั่ง SQL Injection ใส่ WebTrap (เปลี่ยน Port ตาม .env ของคุณ)
   curl "http://localhost:8081/login?user=admin' OR '1'='1"
   ```
4. ดูที่แดชบอร์ดของคุณ—การแจ้งเตือนการโจมตีและตารางวิเคราะห์จะเด้งขึ้นมาแบบ Real-time ทันที!

---

## 📦 การนำระบบขึ้นเซิร์ฟเวอร์จริง (Deployment)
หากต้องการนำระบบไปติดตั้งบน Server ของคุณ โปรเจกต์นี้มีสคริปต์อัตโนมัติมาให้:
- **สำหรับ Windows (PowerShell):** รัน `.\deploy.ps1`
- **สำหรับ Linux / Mac:** รัน `bash deploy.sh`

ระบบจะแพ็คไฟล์ที่จำเป็น (ตัดไฟล์ขยะและ Log ออก) โยนขึ้น Server ผ่าน SSH และสั่งรัน Docker ขึ้นมาให้โดยอัตโนมัติ

---

## 📄 License
โปรเจกต์นี้อยู่ภายใต้ MIT License - อ่านรายละเอียดเพิ่มเติมที่ไฟล์ [LICENSE](LICENSE)
