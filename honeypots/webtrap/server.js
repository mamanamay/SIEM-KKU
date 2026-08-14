const express = require('express');
const path    = require('path');

const app  = express();
const PORT = 8080;

// ─── Backend Ingest URL ──────────────────────────────────────────────────────
// เมื่ออยู่ใน Docker: backend = hostname ของ container ตาม docker-compose.yml
// เมื่อทดสอบ local: ใช้ localhost:5000
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:5000';
const INGEST_URL  = `${BACKEND_URL}/api/ingest/webtrap`;
const INGEST_KEY  = process.env.INGEST_API_KEY || ''; // Optional API Key

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── ฟังก์ชันวิเคราะห์ Request ───────────────────────────────────────────────
function analyzeRequest(req) {
    const url         = req.url;
    const body        = JSON.stringify(req.body);
    const userAgent   = req.headers['user-agent'] || '';
    const fullPayload = url + ' ' + body;

    let type     = 'Web Scan';
    let severity = 'medium';
    let detail   = `Accessed ${url}`;

    if (fullPayload.match(/UNION|SELECT|INSERT|UPDATE|DELETE|DROP|--|' OR 1=1/i)) {
        type     = 'SQL Inject';
        severity = 'critical';
        detail   = `SQLi Pattern Detected in ${url}`;
    } else if (fullPayload.match(/\.\.\//)) {
        type     = 'Path Traversal';
        severity = 'high';
        detail   = `Path Traversal attempt to ${url}`;
    } else if (fullPayload.match(/<script>|javascript:/i)) {
        type     = 'XSS Attempt';
        severity = 'high';
        detail   = `XSS payload found`;
    } else if (userAgent.match(/nmap|masscan|zgrab|nikto|dirb/i)) {
        type     = 'Web Scan';
        severity = 'high';
        detail   = `Scanner detected: ${userAgent}`;
    }

    // Resolve Real IP (ถ้าอยู่หลัง Proxy/Nginx)
    let srcIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '0.0.0.0';
    if (srcIp.startsWith('::ffff:')) srcIp = srcIp.replace('::ffff:', '');

    return {
        timestamp:  new Date().toISOString(),
        src_ip:     srcIp,
        type:       type,
        severity:   severity,
        detail:     detail,
        payload:    fullPayload.substring(0, 500), // จำกัดความยาว
        user_agent: userAgent,
    };
}

// ─── ฟังก์ชันยิง Log เข้า Backend (Fire-and-forget, ไม่บล็อก Response) ──────
async function sendToBackend(logEntry) {
    const headers = { 'Content-Type': 'application/json' };
    if (INGEST_KEY) headers['x-ingest-key'] = INGEST_KEY;

    try {
        const res = await fetch(INGEST_URL, {
            method:  'POST',
            headers: headers,
            body:    JSON.stringify(logEntry),
            signal:  AbortSignal.timeout(3000), // timeout 3 วินาที
        });
        if (!res.ok) {
            console.error(`[!] Backend rejected: ${res.status}`);
        }
    } catch (err) {
        // ถ้า Backend ไม่ตอบ (เช่นยังไม่ขึ้น) ให้ print warning และดำเนินต่อ
        console.warn(`[!] Could not reach backend (${err.message}) — event dropped.`);
    }
}

// ─── จับทุก Request ──────────────────────────────────────────────────────────
app.all('*', (req, res) => {
    const logEntry = analyzeRequest(req);

    // ยิง Log ไปที่ Backend แบบ Async (ไม่รอผล ไม่ block hacker)
    sendToBackend(logEntry);
    console.log(`[+] Captured: ${logEntry.type} from ${logEntry.src_ip} → sent to Backend`);

    // ส่ง Response หลอกๆ ให้ Attacker เห็น (เหมือนเว็บจริงที่มีช่องโหว่)
    res.status(200).send(`
        <html>
        <head><title>Admin Portal</title></head>
        <body>
            <h1>Internal Admin Portal</h1>
            <!-- TODO: Fix SQL Injection in ?id parameter -->
            <form method="POST" action="/login">
                Username: <input type="text" name="username"><br>
                Password: <input type="password" name="password"><br>
                <input type="submit" value="Login">
            </form>
        </body>
        </html>
    `);
});

// ─── HTTP Server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WebTrap Honeypot listening on port ${PORT} (HTTP)`);
    console.log(`📤 Sending logs to: ${INGEST_URL}`);
});

// ─── HTTPS Server (Optional, ต้องการ SSL cert) ───────────────────────────────
const https = require('https');
const fs    = require('fs');

try {
    const options = {
        key:  fs.readFileSync('/certs/key.pem'),
        cert: fs.readFileSync('/certs/cert.pem'),
    };
    https.createServer(options, app).listen(8443, '0.0.0.0', () => {
        console.log(`🚀 WebTrap Honeypot listening on port 8443 (HTTPS)`);
    });
} catch (err) {
    console.warn(`⚠️ HTTPS not started (certs not found): ${err.message}`);
}
