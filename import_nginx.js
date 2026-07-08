const fs = require('fs');
const readline = require('readline');

// 1. รับชื่อไฟล์ Nginx Log จาก Command Line
const inputFile = process.argv[2];
const outputFile = './webtrap-logs/webtrap.json';

if (!inputFile) {
  console.log("❌ กรุณาระบุไฟล์ Nginx Log เช่น: node import_nginx.js access.log");
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.log(`❌ ไม่พบไฟล์ ${inputFile}`);
  process.exit(1);
}

// 2. ฟังก์ชันวิเคราะห์ช่องโหว่จาก URL (เหมือนที่ WebTrap ทำ)
function detectAttack(url) {
  const decodedUrl = decodeURIComponent(url).toLowerCase();
  
  if (decodedUrl.includes('union select') || decodedUrl.includes('or 1=1') || decodedUrl.includes("' or '1'='1")) {
    return { type: 'SQL Inject', severity: 'high' };
  }
  if (decodedUrl.includes('../') || decodedUrl.includes('..\\') || decodedUrl.includes('/etc/passwd')) {
    return { type: 'Path Traversal', severity: 'critical' };
  }
  if (decodedUrl.includes('<script>') || decodedUrl.includes('javascript:')) {
    return { type: 'XSS Attempt', severity: 'medium' };
  }
  if (decodedUrl.includes('nmap') || decodedUrl.includes('nikto') || decodedUrl.includes('dirb') || decodedUrl.includes('sqlmap')) {
    return { type: 'Web Scan', severity: 'low' };
  }
  
  // ถ้าไม่มีคำสั่งแปลกๆ ถือว่าเป็นการเข้าเว็บปกติ (ไม่เป็น Attack)
  return null;
}

// 3. เริ่มอ่านไฟล์ Nginx
console.log(`🔍 กำลังอ่านไฟล์: ${inputFile}...`);
const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

// Regex สำหรับจับ Nginx Combined Log Format
// เช่น: 192.168.1.100 - - [08/Jul/2026:10:00:00 +0700] "GET /login?user=admin' OR 1=1 HTTP/1.1" 404 123 "-" "Mozilla/5.0"
const logRegex = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+) \S+" \d+ \d+ "[^"]*" "([^"]*)"/;

let attackCount = 0;

rl.on('line', (line) => {
  const match = line.match(logRegex);
  if (match) {
    const src_ip = match[1];
    const timeStr = match[2]; 
    const method = match[3];
    const url = match[4];
    const userAgent = match[5];

    // เช็คว่า URL มีช่องโหว่ซ่อนมาไหม
    const attack = detectAttack(url);
    
    if (attack) {
      // แปลงเวลาให้เป็นมาตรฐาน ISO (ใช้วันที่ปัจจุบันเพื่อให้กราฟเด้งแบบ Real-time)
      const timestamp = new Date().toISOString(); 
      
      const payload = {
        src_ip: src_ip,
        timestamp: timestamp, 
        type: attack.type,
        severity: attack.severity,
        detail: `[${method}] ${url}`,
        user_agent: userAgent
      };

      // 4. เขียนลงไฟล์ webtrap.json เพื่อให้ Backend (SIEM) ดูดไปโชว์ใน Dashboard
      fs.appendFileSync(outputFile, JSON.stringify(payload) + '\n');
      console.log(`🚨 ตรวจพบการโจมตี: [${src_ip}] ${attack.type}`);
      attackCount++;
    }
  }
});

rl.on('close', () => {
  console.log(`\n✅ ตรวจสอบเสร็จสิ้น! พบการโจมตีทั้งหมด ${attackCount} รายการ`);
  console.log(`👉 ตอนนี้คุณสามารถไปดูผลลัพธ์กราฟเด้งในหน้า Dashboard ได้เลยครับ!`);
});
