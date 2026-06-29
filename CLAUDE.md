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
    - `log.service.ts`: อ่านไฟล์ `cowrie.json` (Tail) อย่างต่อเนื่องและจำลองข้อมูล WebTrap เมื่อมีการโจมตีจะแปลงข้อมูล (Enrichment) เช่น รหัส MITRE, Threat Score, สุ่มจำลอง IP ต้นทางเชื่อมโยงกับคณะต่างๆ (Faculty Mapping) ในมหาวิทยาลัย (เช่น คณะแพทยศาสตร์, วิศวกรรมศาสตร์)
    - `events.gateway.ts`: กระจายข้อมูลที่ประมวลผลแล้วไปยัง Frontend ผ่าน WebSockets (`socket.io`)
- **Database & Cache:**
  - **PostgreSQL 16:** ฐานข้อมูลหลัก
  - **Redis 7:** Caching & WebSocket scaling
- **Honeypot & Sensors:**
  - **Cowrie**: SSH/Telnet honeypot บันทึกพฤติกรรมในรูปแบบ JSON (`cowrie.json`)
  - **WebTrap**: (จำลองเพิ่มเติม) สคริปต์ Node.js สำหรับดักจับ Web Attacks (SQLi, Path Traversal) รองรับทั้ง **HTTP (8080)** และ **HTTPS (8443)** ทำงานคู่กับ `proxy.js` เพื่อดักจับ Port Scan
- **โครงสร้างพื้นฐาน (Infrastructure):** Nginx 1.25
  - **ที่อยู่ (Path):** `nginx/`
  - Reverse Proxy แยก `/api`, `/socket.io` ไปที่ Backend และ `/` ไป Frontend พร้อมทำ HTTPS (Self-signed)

## 🔄 วงจรการทำงาน (Core Workflow - The Attack Lifecycle)

1. **การบุกรุก (Intrusion):** แฮกเกอร์เชื่อมต่อเข้ามาที่พอร์ต SSH (2222) หรือยิง SQLi ใส่ WebTrap (8080)
2. **การบันทึก Log:** Cowrie หรือ WebTrap บันทึกพฤติกรรมลงในไฟล์ Log ท้องถิ่น
3. **การตรวจจับและวิเคราะห์ (Detection & Enrichment):** `log.service.ts` อ่านบรรทัดใหม่ แปลง JSON เพิ่มข้อมูลจำลองรหัสคณะ (Faculty), รหัส MITRE ATT&CK, และคำนวณ Threat Score
4. **การกระจายข้อมูล (Broadcast):** NestJS ยิง Event ผ่าน WebSocket ทันที พร้อมประทับ วันที่และเวลา (Date & Time) อย่างครบถ้วน
5. **การแสดงผล (Visualization):** SvelteKit นำข้อมูลมาประมวลผลและกระจายไปยังตารางของแต่ละหน้า พร้อมรองรับการกรองเวลาแบบละเอียด (1h, 6h, 24h, 1m, 3m, 6m, 1y) และอัปเดต UI ทันทีโดยไม่ต้อง Refresh (รวมถึงระบบ Deep Linking จากแจ้งเตือน)

## 🛠 สิ่งที่พัฒนาต่อยอดได้ (Future Enhancements & Ideas)

- **การรับข้อมูลจากสภาพแวดล้อม Production:** 
  - นำข้อมูลจาก Wazuh Agent (FIM, SCA) มาใส่ในหน้า `/dashboard/wazuh`, `/dashboard/cis`, `/dashboard/pdpa`
  - นำ Syslog จาก FortiGate มาแสดงบน `/dashboard/traffic`, `/dashboard/blocked_ip_audit`
  - นำ AD/VPN Auth logs มาแสดงบน `/dashboard/remoteaccess`
- **บล็อก IP อัตโนมัติ (Active Response):** พัฒนา Backend ให้สั่งบล็อก IP ที่ Firewall อัตโนมัติเมื่อ Threat Score สูงเกินกำหนด
