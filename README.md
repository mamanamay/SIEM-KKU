<div align="center">

# 🛡️ KKUSIEM Honeypot Command Center

**Enterprise-Grade Honeypot & SIEM Dashboard for Khon Kaen University**

[![SvelteKit](https://img.shields.io/badge/Frontend-SvelteKit-ff3e00?style=flat-square&logo=svelte)](https://kit.svelte.dev)
[![NestJS](https://img.shields.io/badge/Backend-NestJS-e0234e?style=flat-square&logo=nestjs)](https://nestjs.com)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=flat-square&logo=sqlite)](https://sqlite.org)
[![WebSocket](https://img.shields.io/badge/Realtime-Socket.io-010101?style=flat-square&logo=socket.io)](https://socket.io)

</div>

---

## 📖 1. รายละเอียดโปรเจกต์ (Project Details)
**KKUSIEM** คือระบบวิเคราะห์การคุกคามและแผงควบคุมความปลอดภัยทางไซเบอร์ (SIEM Dashboard) ที่ถูกออกแบบมาเพื่อรับข้อมูลจากระบบ Honeypot, IDS (Suricata) และ Endpoint (Wazuh) ระบบนี้จะทำการรวบรวมข้อมูลการโจมตีมาแสดงผลในรูปแบบ Real-time พร้อมทั้งมีระบบ AI (Google Gemini) ช่วยวิเคราะห์พฤติกรรมการโจมตี และระบบ 2FA (Time-based OTP) รวมถึงการเชื่อมต่อกับระบบ SSO ของมหาวิทยาลัยขอนแก่น (KKU SSO)

## 💻 2. ความต้องการของระบบ (System Requirements)
- **OS**: Windows, macOS, หรือ Linux (Ubuntu/Debian แนะนำสำหรับ Production)
- **Node.js**: เวอร์ชัน 18.x หรือสูงกว่า
- **Package Manager**: `npm` หรือ `yarn`
- **Network**: จำเป็นต้องเชื่อมต่ออินเทอร์เน็ตสำหรับการใช้งาน AI Analysis และระบบล็อกอิน KKU SSO

## 🚀 3. การติดตั้งและเริ่มใช้งาน (Installation and Quick Start)

### 3.1 การตั้งค่า Backend (NestJS)
1. เข้าไปที่โฟลเดอร์ Backend: `cd backend`
2. ติดตั้งแพ็กเกจ: `npm install`
3. คัดลอกไฟล์ `.env.example` ไปเป็น `.env` และตั้งค่า (ดูหัวข้อการตั้งค่าขั้นสูง)
4. รันระบบสำหรับการพัฒนา: `npm run start:dev`

### 3.2 การตั้งค่า Frontend (SvelteKit)
1. เข้าไปที่โฟลเดอร์ Frontend: `cd frontend`
2. ติดตั้งแพ็กเกจ: `npm install`
3. รันระบบสำหรับการพัฒนา: `npm run dev` (เว็บจะเปิดที่ `http://localhost:5173`)

## 🎯 4. การใช้งาน (Usage)
1. เข้าสู่ระบบผ่านหน้าเว็บด้วย **KKU SSO** หรือรหัสผ่าน Admin เริ่มต้น
2. (หากตั้งค่าไว้) ยืนยันตัวตนด้วยรหัส 2FA 6 หลักจากแอปพลิเคชัน (เช่น Google Authenticator)
3. ภายใน Dashboard จะแสดงกราฟและตารางข้อมูลแบบ Real-time ทันทีที่มีการโจมตีเข้ามายัง Honeypot
4. คุณสามารถกด **"วิเคราะห์ด้วย AI"** ที่แถวของการโจมตีแต่ละรายการเพื่อให้ AI ช่วยวิเคราะห์ หรือกด **"แบน IP"** เพื่อส่งคำสั่งบล็อก

## ⚙️ 5. การทำงานของระบบ (How it Works)
- **การรับข้อมูล (Ingestion)**: อุปกรณ์ภายนอก (Honeypot, Wazuh) ส่งข้อมูล JSON ผ่าน HTTP POST มายัง Backend API
- **การจัดเก็บและกระจายข้อมูล (Processing & Real-time)**: Backend ทำการจัดเก็บลงฐานข้อมูล SQLite และส่งข้อมูล Broadcast ผ่าน WebSocket ทันที
- **การแสดงผล (Presentation)**: Frontend SvelteKit รับข้อมูลผ่าน Store (`events.ts`) และรีเฟรชกราฟบนหน้าจอผู้ใช้โดยไม่ต้องโหลดหน้าเว็บใหม่
- **ระบบยืนยันตัวตน (Authentication)**: 
  - หากใช้ SSO เมื่อกลับมาที่ระบบ หากบัญชีถูกผูกกับ 2FA ไว้ ระบบจะบังคับให้ยืนยันตัวตนแบบ Local ก่อนการออก Access Token (Bypass Prevention)

## 🔐 6. การกำหนดสิทธิ์ในระบบหลังบ้าน (ACL - Access Control List)
ระบบมีการแบ่งสิทธิ์การใช้งานออกเป็น 2 ระดับ:
- **`admin` (ผู้ดูแลระบบ)**:
  - สามารถดูข้อมูล Dashboard ทั้งหมด
  - สามารถกดสั่งบล็อก IP และจัดการตั้งค่า 2FA ได้
  - สามารถจัดการเปิด/ปิด โหมด SOAR (Auto-Blocking)
- **`guest` (ผู้เยี่ยมชม / Read-only)**:
  - สามารถดูข้อมูล Dashboard และเรียกดู AI Analysis ได้
  - **ไม่สามารถ** ทำการกดบล็อก IP หรือเปลี่ยนแปลงการตั้งค่าความปลอดภัยใดๆ ของระบบได้ 

## 🌐 7. API Endpoints
ระบบ Backend นำเสนอ REST API หลักๆ ดังนี้:
- `POST /api/attacks`: ส่งข้อมูล Log การโจมตี (ต้องการ API Key ระดับเครื่องมือ)
- `GET /api/attacks/logs`: ดึงประวัติการโจมตีย้อนหลัง
- `GET /api/auth/sso/login`: Redirect ไปหน้าจอ KKU SSO
- `POST /api/auth/sso/callback`: รับรหัส (Code) จาก SSO มาแลกเป็น Profile และตรวจสอบ 2FA
- `POST /api/auth/2fa/verify`: ยืนยันรหัส TOTP เพื่อรับ JWT Access Token
- `POST /api/attacks/soar/toggle`: เปิด/ปิดระบบ Auto-Triage สำหรับ SOAR

## 🛠️ 8. การตั้งค่าขั้นสูง (Advanced Configurations)
ไฟล์ `.env` ในฝั่ง Backend มีตัวแปรสำคัญที่ต้องตั้งค่าเมื่อนำขึ้น Production:
- `SSO_CLIENT_ID` และ `SSO_CLIENT_SECRET`: ได้รับจากการลงทะเบียนกับ KKU SSO
- `SSO_CALLBACK_URL`: ต้องตรงกับ URL ของเซิร์ฟเวอร์จริง (เช่น `https://<domain>/callback`)
- `JWT_SECRET`: คีย์เข้ารหัสสำหรับ Token ควรตั้งค่าเป็นสตริงยาวๆ แบบสุ่ม
- `GEMINI_API_KEY`: สำคัญมากสำหรับการใช้งานฟีเจอร์ AI Analysis

## ⚠️ 9. การแก้ไขปัญหา (Troubleshooting)
- **ล็อกอินผ่าน SSO ไม่ได้ (Token Error)**:
  - สาเหตุ: Redirect URL ในไฟล์ `.env` ไม่ตรงกับที่ลงทะเบียนไว้กับทาง KKU SSO 
  - การแก้ไข: แก้ไข `SSO_CALLBACK_URL` ให้ตรงกันทุกตัวอักษร
- **เข้าหน้าเว็บไม่ได้หลังจากรีสตาร์ทเครื่อง**:
  - สาเหตุ: Backend อาจจะยังไม่ทำงาน
  - การแก้ไข: ตรวจสอบกระบวนการ PM2 หรือ Docker ว่า Backend กำลังรันอยู่บนพอร์ตที่กำหนดหรือไม่ (ค่าเริ่มต้นคือพอร์ต `5000`)
- **ผู้ใช้ลืมรหัส 2FA และเข้าสู่ระบบไม่ได้**:
  - การแก้ไข: Admin สามารถเข้าถึงฐานข้อมูล SQLite หรือ API เพื่อเคลียร์ค่า `totpEnabled` ให้ผู้ใช้คนนั้นได้

## 🧠 10. ข้อมูลเทคนิค (Technical Details)
- **State Management**: Frontend ใช้ Svelte Stores (`writable`) ร่วมกับ `sessionStorage` เพื่อป้องกันข้อมูลการโจมตีหายเวลาผู้ใช้รีเฟรชหน้าต่าง
- **Database Architecture**: ใช้ TypeORM กับ SQLite (สำหรับเวอร์ชัน PoC นี้) เพื่อความคล่องตัวในการตั้งค่า 
- **Security Check**: โค้ดทุก API ที่มีการเปลี่ยนแปลงข้อมูล (Mutation) ใน Backend จะใช้ `@Roles('admin')` Guard ของ NestJS ป้องกัน

## 🏗️ 11. การพัฒนาและปรับแต่ง (Development and Customization)
- **การเพิ่ม Dashboard ใหม่**: สร้างไฟล์ `+page.svelte` ใหม่ใน `frontend/src/routes/dashboard/` และดึงข้อมูลจาก `eventsStore` ในไฟล์ `src/stores/events.ts` มาใช้งานได้ทันที
- **การเพิ่ม Endpoint หลังบ้าน**: เพิ่มฟังก์ชันใน Controller (เช่น `attacks.controller.ts`) และเรียกใช้งานผ่าน Fetch API จากหน้าบ้าน โดยใส่ `credentials: 'include'` เพื่อแนบคุกกี้หรือ Token 

## 📊 12. รูปแบบข้อมูล (Data Formats)
ข้อมูลการโจมตีหลักที่ระบบใช้สื่อสารระหว่าง Honeypot และ Backend มีรูปแบบ JSON ดังนี้:
```json
{
  "src_ip": "192.168.1.100",
  "dest_port": 22,
  "timestamp": "2023-10-27T10:00:00Z",
  "protocol": "TCP",
  "log_type": "honeypot",
  "severity": "high",
  "payload": "user=root&pass=12345"
}
```
