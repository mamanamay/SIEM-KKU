# KKUSIEM (Demo) - AI Assistant Context

ไฟล์นี้ใช้เป็น Context อ้างอิงหลักสำหรับ AI Assistants (เช่น Claude, Gemini) เพื่อให้เข้าใจถึงสถาปัตยกรรม (Architecture) เทคโนโลยีที่ใช้ (Tech Stack) และ Workflow ภายในของโปรเจกต์นี้ทั้งหมดที่มีการอัปเกรดเป็น KKUSIEM (Demo)

## 🏗 สถาปัตยกรรม & เทคโนโลยีที่ใช้ (System Architecture & Tech Stack)

- **Frontend:** SvelteKit 2 + TypeScript + Vanilla CSS
  - **ที่อยู่ (Path):** `frontend/`
  - **การออกแบบ (Styling):** ใช้ Vanilla CSS แบบเพียวๆ โทนสีสว่าง (Light Theme) ได้แรงบันดาลใจจาก Dashboard ของ FortiGate เน้นความสะอาดตา ขาวขุ่น เป็นระเบียบ ไม่ใช้ Tailwind
  - **Routes & Pages (โครงสร้างเมนู 17 หน้า):**
    - `/`: หน้าล็อกอิน Authentication (รองรับสิทธิ์ `admin` และ `guest`)
    - `/dashboard`: มีโครงสร้าง Layout หลัก (`+layout.svelte`) พร้อมเมนูด้านข้าง (Sidebar) แบบเปิดค้าง
    - `/dashboard` (Overview): หน้า Dashboard แสดงกราฟและสถิติแบบ Real-time
    - `/dashboard/alert`, `/dashboard/logs`, `/dashboard/faculty`, `/dashboard/traffic`, `/dashboard/mitre` (Detection & Analysis)
    - `/dashboard/blocked_ip_audit`, `/dashboard/ioc`, `/dashboard/threat` (Response & Intel)
    - `/dashboard/wazuh`, `/dashboard/ai_monitor`, `/dashboard/malware`, `/dashboard/ddos`, `/dashboard/cis`, `/dashboard/pdpa`, `/dashboard/remoteaccess` (Integration & Compliance)
    - `/dashboard/analytics`, `/dashboard/settings` (System)
    - *หมายเหตุ:* หน้าส่วนใหญ่จะวาง Layout ตารางจำลอง (Mock UI) ตามโครงสร้าง HTML ต้นฉบับเอาไว้รอการเชื่อมต่อข้อมูลในระดับ Production
- **Backend:** NestJS 10 + TypeScript + TypeORM
  - **ที่อยู่ (Path):** `backend/`
  - **ตรรกะหลัก (Core Logic):** 
    - `log.service.ts`: อ่านไฟล์ Log จาก 3 แหล่ง (Access Layer, Server Honeypot, C&C Outbound) ทำการเชื่อมโยงข้อมูล (Time-Correlation) เพื่อหา IP ต้นทางที่แท้จริง แปลงข้อมูล (Enrichment) เช่น รหัส MITRE, Threat Score, สุ่มจำลอง IP ต้นทางเชื่อมโยงกับคณะต่างๆ (Faculty Mapping) ในมหาวิทยาลัย
    - `events.gateway.ts`: กระจายข้อมูลที่ประมวลผลแล้วไปยัง Frontend ผ่าน WebSockets (`socket.io`)
    - `attacks.controller.ts`: จัดการ API สำหรับการดูข้อมูล และสั่ง Block/Unblock IP โดยบันทึกลงในไฟล์ `blocked_ips.json`
- **Database & Cache:**
  - **PostgreSQL 16:** ฐานข้อมูลหลัก
  - **Redis 7:** Caching & WebSocket scaling
- **Honeypot & Sensors:**
  - **Cowrie**: SSH/Telnet honeypot บันทึกพฤติกรรมในรูปแบบ JSON (`cowrie.json`)
  - **WebTrap**: ระบบดักจับการโจมตีทางเว็บไซต์ (SQLi, Path Traversal) รองรับทั้ง **HTTP** และ **HTTPS** ทำงานในคอนเทนเนอร์แยกต่างหาก
- **โครงสร้างพื้นฐาน (Infrastructure):** Nginx 1.25
  - **ที่อยู่ (Path):** `nginx/`
  - Reverse Proxy แยก `/api`, `/socket.io` ไปที่ Backend และ `/` ไป Frontend พร้อมทำ HTTPS (Self-signed)

## 🔄 วงจรการทำงาน (Core Workflow - The Attack Lifecycle)

1. **การบุกรุก (Intrusion):** แฮกเกอร์เชื่อมต่อเข้ามาที่พอร์ต SSH/Telnet หรือยิง SQLi ใส่ WebTrap ผ่านพอร์ตที่เปิดไว้ (ตั้งค่าได้ใน `.env`)
2. **การบันทึก Log:** 
   - Cowrie หรือ WebTrap บันทึกพฤติกรรมการโจมตีที่ชั้น Application (`cowrie.json`, Log ภายใน WebTrap)
3. **การเชื่อมโยงและวิเคราะห์ (Correlation & Enrichment):** `log.service.ts` อ่าน Log นำมาเทียบเวลา (Time-Correlation) เพื่อสร้างสายการโจมตี (Attack Chain) ที่สมบูรณ์ เพิ่มข้อมูลรหัสคณะ (Faculty), รหัส MITRE ATT&CK, และคำนวณ Threat Score
4. **การกระจายข้อมูล (Broadcast):** NestJS ยิง Event ผ่าน WebSocket ทันที
5. **การแสดงผลและตอบสนอง (Visualization & Response):** SvelteKit นำข้อมูลมาประมวลผลบนหน้า `/dashboard/investigate` และหน้าอื่นๆ แบบ Real-time ผู้ใช้สามารถวิเคราะห์ผ่านกราฟ สถิติ และตารางข้อมูลได้

## 🛠 สิ่งที่พัฒนาต่อยอดได้ (Future Enhancements & Ideas)

- **การรับข้อมูลจากสภาพแวดล้อม Production:** 
  - นำข้อมูลจาก Wazuh Agent (FIM, SCA) มาใส่ในหน้า `/dashboard/wazuh`, `/dashboard/cis`, `/dashboard/pdpa`
  - นำ Syslog จาก FortiGate มาแสดงบน `/dashboard/traffic`, `/dashboard/blocked_ip_audit`
  - นำ AD/VPN Auth logs มาแสดงบน `/dashboard/remoteaccess`
- **ระบบอัตโนมัติ (SOAR):** พัฒนา Backend ให้สั่งบล็อก IP อัตโนมัติเมื่อ Threat Score สูงเกินกำหนดโดยส่งค่าผ่าน API ไปยัง Firewall (เช่น FortiGate)

## 📦 การนำขึ้นเซิร์ฟเวอร์ (Deployment)
ระบบถูกจัดระเบียบใหม่ให้รวมศูนย์การตั้งค่า Port ไว้ที่ไฟล์ `.env` ที่เดียว โดยใช้สคริปต์ `deploy.sh` (Linux) หรือ `deploy.ps1` (Windows) ในการรวบรวมไฟล์โปรเจกต์ ยกเว้นไฟล์ขยะหรือ Log เดิม และนำขึ้น Server อัตโนมัติ
