# Honeypot Dashboard - AI Assistant Context

ไฟล์นี้ใช้เป็น Context อ้างอิงหลักสำหรับ AI Assistants (เช่น Claude, Gemini) เพื่อให้เข้าใจถึงสถาปัตยกรรม (Architecture) เทคโนโลยีที่ใช้ (Tech Stack) และ Workflow ภายในของโปรเจกต์นี้ทั้งหมด

## 🏗 สถาปัตยกรรม & เทคโนโลยีที่ใช้ (System Architecture & Tech Stack)

- **Frontend:** SvelteKit 2 + TypeScript + Vanilla CSS
  - **ที่อยู่ (Path):** `frontend/`
  - **การออกแบบ (Styling):** ใช้ Vanilla CSS แบบเพียวๆ แต่ปรับแต่งให้มีความพรีเมียม (ดีไซน์ Glassmorphism และ Dark Mode) โดยไม่ใช้ Tailwind เพื่อควบคุม UI ได้อย่างเบ็ดเสร็จ
  - **Routes & Pages:**
    - `/`: หน้าล็อกอิน Authentication (รองรับสิทธิ์ `admin` และ `guest`)
    - `/dashboard`: มีโครงสร้าง Layout หลัก (`+layout.svelte`) พร้อมเมนูด้านข้าง (Sidebar) แบบเปิดค้าง
    - `/dashboard`: หน้า Overview แสดงกราฟและสถิติแบบ Real-time
    - `/dashboard/logs`: หน้า SOC Analyst view สำหรับวิเคราะห์ Threat Logs (ตารางสามารถกดขยายแถวได้ แสดงแผนผัง MITRE, ธงชาติ GeoIP และวิธีรับมือ)
- **Backend:** NestJS 10 + TypeScript + TypeORM
  - **ที่อยู่ (Path):** `backend/`
  - **ตรรกะหลัก (Core Logic):** 
    - `log.service.ts`: ทำการอ่านไฟล์ `cowrie.json` (Tail) อย่างต่อเนื่อง เมื่อมีการโจมตีจะถูกประมวลผลทันที และแปลงข้อมูลให้เข้ากับหลักการวิเคราะห์ของ SOC (เช่น ใส่ GeoIP, รหัส MITRE ATT&CK, และคำนวณ Threat Score)
    - `events.gateway.ts`: กระจายข้อมูล Payload ที่ประมวลผลแล้วไปยัง Frontend ผ่าน WebSockets (`socket.io`)
  - **ชั้นจัดการข้อมูล (Data Layer):** ใช้ TypeORM บันทึกข้อมูลลง PostgreSQL มี Entity ชื่อ `User` และ `Attack` (โดย `Attack` จะเก็บฟิลด์ระดับลึกเช่น `country`, `clientVersion`, `mitreCode`, `threatScore`)
  - **การจำลองข้อมูล (Seeding):** `seed.service.ts` จะแทรกข้อมูลผู้ใช้งานและข้อมูลตัวอย่างการโจมตี (Mock attacks) ลงฐานข้อมูลโดยอัตโนมัติเมื่อระบบเริ่มทำงาน
- **Database & Cache:**
  - **PostgreSQL 16:** ฐานข้อมูลหลักสำหรับเก็บรหัสผ่านผู้ใช้และประวัติการโจมตี
  - **Redis 7:** ติดตั้งมาพร้อม Docker เตรียมพร้อมสำหรับการขยายระบบ WebSocket (Adapter scaling) หรือทำ Caching
- **Honeypot:** Cowrie
  - เป็น SSH/Telnet honeypot ที่หลอกให้แฮกเกอร์เข้ามาโจมตีที่พอร์ต 2222/2223 (แมปปิ้งกับ 22/23 ของโฮสต์)
  - บันทึกพฤติกรรมในรูปแบบโครงสร้าง JSON อัตโนมัติ ไว้ที่ไฟล์ `cowrie-config/var/log/cowrie/cowrie.json`
- **โครงสร้างพื้นฐาน (Infrastructure):** Nginx 1.25
  - **ที่อยู่ (Path):** `nginx/`
  - ทำหน้าที่เป็นช่องทางเข้าหลักของระบบ (Reverse Proxy)
  - จัดการเรื่องการถอดรหัส TLS/HTTPS โดยใช้ใบรับรองจาก `nginx/certs/`
  - ควบคุมเส้นทางจราจรของเน็ตเวิร์ก: `/api` และ `/socket.io` ส่งไป Backend, ส่วนอื่นๆ (`/`) ส่งไป Frontend

## 🔄 วงจรการทำงาน (Core Workflow - The Attack Lifecycle)

1. **การบุกรุก (Intrusion):** แฮกเกอร์เชื่อมต่อเข้ามาที่พอร์ต SSH (เช่น `ssh root@<IP> -p 2222`)
2. **การบันทึก Log:** Cowrie ยอมรับการเชื่อมต่อ จำลองสภาพแวดล้อม Shell ปลอม และบันทึกพฤติกรรม (การล็อกอินพลาด/สำเร็จ, คำสั่งที่รัน) ลงใน `cowrie.json`
3. **การตรวจจับและวิเคราะห์ (Detection & Enrichment - Real-time):** NestJS ตรวจจับได้ว่าขนาดไฟล์เปลี่ยนไป `log.service.ts` จะอ่านบรรทัดใหม่ แปลง JSON และจับคู่ `eventid` กับรูปแบบการโจมตี จากนั้นประมวลผลเพิ่ม (Enrichment) ด้วยรหัส MITRE ATT&CK และวิเคราะห์วิธีรับมือ
4. **การจัดเก็บ (Persistence):** NestJS บันทึกข้อมูลการโจมตีระดับสูงนี้ลง PostgreSQL ผ่าน TypeORM
5. **การกระจายข้อมูล (Broadcast):** NestJS ยิง Event `new_attack` ผ่าน WebSocket
6. **การแสดงผล (Visualization):** SvelteKit ได้รับ WebSocket Event และทำการอัปเดตกราฟ รวมถึงตาราง Threat Logs ใน UI ทันที โดยที่ผู้ใช้ไม่ต้องกด Refresh หน้าเว็บ

## 🛠 สิ่งที่พัฒนาต่อยอดได้ (Future Enhancements & Ideas)

- **การทำงานร่วมกับ VirusTotal:** Cowrie ดักจับมัลแวร์ที่ถูกดาวน์โหลดและบันทึกไว้ในโฟลเดอร์ `downloads` Backend (NestJS) สามารถนำไฟล์ไปแฮช (SHA256) และเช็คกับ API ของ VirusTotal เพื่อแสดงระดับความอันตรายของมัลแวร์ได้
- **บล็อก IP อัตโนมัติ (Fail2Ban):** พัฒนา Backend ให้เชื่อมต่อกับ Firewall ของโฮสต์ เพื่อสั่งแบน IP ที่มี Threat Score สูงเกินกำหนดโดยอัตโนมัติ
- **เป็นทางเลือกแทน ELK:** สถาปัตยกรรมนี้ทำหน้าที่เป็นตัวแทนที่เบากว่า นำไปปรับแต่งง่ายกว่า ระบบ ELK stack (Elasticsearch, Logstash, Kibana)
