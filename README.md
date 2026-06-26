# 🍯 Honeypot Dashboard

แดชบอร์ดแสดงผลแบบ Real-time ที่มีความทันสมัย สำหรับแสดงข้อมูลการโจมตีทางไซเบอร์ที่ดักจับได้จาก **Cowrie honeypot** ถูกสร้างขึ้นด้วยสถาปัตยกรรมแบบ Full-stack ที่ออกแบบมาเพื่อความรวดเร็ว ความเสถียร และความปลอดภัย

![Honeypot Concept](https://img.shields.io/badge/Security-Honeypot-red.svg) ![SvelteKit](https://img.shields.io/badge/SvelteKit-2-ff3e00.svg) ![NestJS](https://img.shields.io/badge/NestJS-10-ea2845.svg) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)

## 📌 ภาพรวม (Overview)

โปรเจกต์นี้จัดทำขึ้นเพื่อเป็น Proof of Concept (PoC) สำหรับระบบตรวจสอบ Honeypot ระดับองค์กร (Enterprise) เมื่อแฮกเกอร์พยายามเจาะเข้ามาทางพอร์ต SSH/Telnet ตัว Cowrie honeypot จะดักจับและบันทึกพฤติกรรมที่เป็นอันตรายเหล่านั้นเอาไว้

แทนที่จะต้องพึ่งพาเครื่องมือจัดการ Log แบบเก่าที่หนักเครื่อง ระบบของเราใช้ Engine ขนาดเล็กที่ประมวลผล Log เหล่านี้ในทันที และแสดงผลบนแดชบอร์ดดีไซน์พรีเมียมแบบ **Real-time**

**ฟีเจอร์เด่น (Key Features):**
- ⚡ **Real-time Monitoring:** ดูการโจมตีสดๆ ผ่าน WebSockets
- 🛡️ **Advanced SOC UI:** ตารางแสดงผลแบบกดขยายได้ (Expandable Rows) พร้อมการวิเคราะห์ระดับสูง เช่น รหัส MITRE ATT&CK, ธงชาติ (GeoIP), คะแนนความเสี่ยง Threat Score (0-100), และแนะนำวิธีรับมือ (Mitigation steps) แบบอัตโนมัติ
- 🔒 **Role-based Authentication:** รักษาความปลอดภัยในการเข้าถึงแดชบอร์ด โดยแบ่งสิทธิ์การมองเห็นระหว่าง `admin` และ `guest` อย่างชัดเจน
- 📊 **Persistent Storage:** ข้อมูลการโจมตีทั้งหมดจะถูกเก็บไว้อย่างปลอดภัยในฐานข้อมูล PostgreSQL เพื่อการตรวจสอบย้อนหลัง
- 🌐 **Secure by Default:** ระบบทำงานอยู่หลัง Nginx reverse proxy ซึ่งเปิดใช้งาน HTTPS ไว้เป็นค่าเริ่มต้น

---

## 🏗 โครงสร้างโปรเจกต์ (Project Structure)

- `frontend/` - **SvelteKit 2 (TypeScript)**: ส่วนติดต่อผู้ใช้งาน (UI) มีเลย์เอาต์เมนูด้านข้าง (Sidebar) แบ่งเป็น 4 หน้าหลัก (Overview, Threat Logs, Analytics, Settings) ตกแต่งดีไซน์ด้วย Vanilla CSS พรีเมียมล้วนๆ ไม่พึ่งพาไลบรารีอื่น
- `backend/` - **NestJS 10 (TypeScript)**: เป็น API server, WebSocket gateway, และตัวประมวลผล Log อัตโนมัติ ที่เสริมความฉลาดด้วยตรรกะแบบ Security Operations Center (SOC)
- `nginx/` - **Nginx 1.25**: Reverse proxy ทำหน้าที่จัดการ Routing และรองรับ SSL (HTTPS)
- `cowrie-config/` - **Cowrie**: การตั้งค่าและที่เก็บไฟล์ Log สำหรับ SSH/Telnet honeypot

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

2. **สร้าง SSL Certificates (จำเป็นสำหรับ HTTPS)**
   ใช้ Docker รันคำสั่งนี้เพื่อสร้าง self-signed certificate:
   ```bash
   docker run --rm -v "${PWD}/nginx/certs:/certs" nginx:1.25-alpine sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /certs/key.pem -out /certs/cert.pem -subj '/C=TH/ST=Bangkok/L=Bangkok/O=Honeypot/OU=IT/CN=localhost'"
   ```

3. **สตาร์ทระบบ**
   ใช้ Docker Compose เพื่อรันระบบทั้งหมด (Database, Backend, Frontend, Nginx, และ Honeypot):
   ```bash
   docker-compose -f docker-compose.dev.yml up -d --build
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
2. เปิด Terminal (หรือใช้มือถือผ่านวงแลน) แล้วจำลองการโจมตีด้วยคำสั่ง SSH เข้าไปที่ Honeypot (เปลี่ยน IP ให้ตรงกับเครื่องรัน):
   ```bash
   ssh root@localhost -p 2222
   ```
3. พิมพ์รหัสผ่านอะไรลงไปก็ได้มั่วๆ
4. ดูที่แดชบอร์ดของคุณ—การแจ้งเตือนการโจมตีและตารางวิเคราะห์จะเด้งขึ้นมาแบบ Real-time ทันที!

---

## 📄 License
โปรเจกต์นี้อยู่ภายใต้ MIT License - อ่านรายละเอียดเพิ่มเติมที่ไฟล์ [LICENSE](LICENSE)
