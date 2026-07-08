const fs = require('fs');
const readline = require('readline');

// 1. รับชื่อไฟล์ CSV จาก Command Line
const inputFile = process.argv[2];
const outputFile = './webtrap-logs/webtrap.json';

if (!inputFile) {
  console.log("❌ กรุณาระบุไฟล์ CSV เช่น: node import_csv.js access.csv");
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.log(`❌ ไม่พบไฟล์ ${inputFile}`);
  process.exit(1);
}

// 2. ฟังก์ชันวิเคราะห์ช่องโหว่จาก URL และ User-Agent
function detectAttack(url, userAgent) {
  const decodedUrl = decodeURIComponent(url).toLowerCase();
  const ua = (userAgent || '').toLowerCase();
  
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
  
  // ตรวจจับจาก User Agent (เช่น บอทแฮกเกอร์ Dorkbot)
  if (ua.includes('dorkbot') || ua.includes('zmap') || ua.includes('masscan')) {
    return { type: 'Malicious Bot (Scan)', severity: 'medium' };
  }
  
  return null;
}

// ฟังก์ชันสำหรับอ่าน CSV แบบง่าย (รองรับกรณีมีลูกน้ำในเครื่องหมายคำพูด)
function parseCSV(text) {
  let p = '', row = [''], i = 0, r = 0, s = !0, l;
  for (l of text) {
      if ('"' === l) {
          if (s && l === p) row[i] += l;
          s = !s;
      } else if (',' === l && s) l = row[++i] = '';
      else row[i] += l;
      p = l;
  }
  return row;
}

console.log(`🔍 กำลังอ่านไฟล์ CSV: ${inputFile}...`);
const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

let isFirstLine = true;
let attackCount = 0;

rl.on('line', (line) => {
  // ข้ามบรรทัดหัวตาราง (Header)
  if (isFirstLine) {
    isFirstLine = false;
    return;
  }

  if (!line.trim()) return;

  const cols = parseCSV(line);
  
  // โครงสร้างจากตัวอย่างของคุณ:
  // 0: timestamp
  // 1: remote_addr (IP)
  // 2: request_method
  // 3: request (URL)
  // ...
  // 13: http_user_agent
  
  const originalTime = cols[0];
  const src_ip = cols[1];
  const method = cols[2];
  const requestUrl = cols[3];
  const userAgent = cols[13] || 'Unknown';

  const attack = detectAttack(requestUrl, userAgent);
  
  if (attack) {
    const timestamp = new Date().toISOString(); 
    
    const payload = {
      src_ip: src_ip,
      timestamp: timestamp, // ปรับเป็นเวลาปัจจุบันเพื่อให้กราฟเด้ง
      type: attack.type,
      severity: attack.severity,
      detail: requestUrl,
      user_agent: userAgent
    };

    fs.appendFileSync(outputFile, JSON.stringify(payload) + '\n');
    console.log(`🚨 ตรวจพบการโจมตี: [${src_ip}] ${attack.type} (Bot: ${userAgent})`);
    attackCount++;
  }
});

rl.on('close', () => {
  console.log(`\n✅ ตรวจสอบเสร็จสิ้น! พบการโจมตีทั้งหมด ${attackCount} รายการ`);
  console.log(`👉 กลับไปดูที่หน้าแดชบอร์ดได้เลยครับ กราฟน่าจะเด้งขึ้นมาแล้ว!`);
});
