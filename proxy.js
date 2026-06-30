/**
 * SIEM Demo - Network Proxy (Access Layer Simulator)
 * =====================================================
 * จำลองบทบาทของ Core Switch + Firewall ในระบบเครือข่ายมหาวิทยาลัย
 * 
 * โครงสร้างที่จำลอง:
 *   [Attacker] → [proxy.js (Core Switch)] → [Docker: Cowrie/WebTrap (Server Zone)]
 *                        ↓
 *              เขียน access_layer.log  (บันทึกทราฟฟิกผ่าน Core)
 * 
 * นอกจากนี้ยังเฝ้าดู outbound connection จาก Docker network
 * และเขียน cnc_outbound.log หากพบการเชื่อมต่อต้องสงสัย
 */

const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ─── Log File Paths ───────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, 'siem-logs');
const ACCESS_LOG = path.join(LOG_DIR, 'access_layer.log');
const CNC_LOG    = path.join(LOG_DIR, 'cnc_outbound.log');

// สร้างโฟลเดอร์เก็บ Log ถ้ายังไม่มี
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ─── Faculty IP Ranges (จำลอง Access Switch ของแต่ละคณะ) ─────────────────────
// ในระบบจริง Core Switch จะรู้ว่า IP range ไหนมาจาก Access Switch คณะไหน
const FACULTY_RANGES = [
  { prefix: '10.10.', name: 'Faculty of Engineering',   code: 'ENG',    port: 'Gi1/0/1' },
  { prefix: '10.20.', name: 'Faculty of Medicine',       code: 'MED',    port: 'Gi1/0/2' },
  { prefix: '10.30.', name: 'Faculty of Science',        code: 'SCI',    port: 'Gi1/0/3' },
  { prefix: '10.40.', name: 'Faculty of Humanities',     code: 'HUM',    port: 'Gi1/0/4' },
  { prefix: '10.50.', name: 'Faculty of Business',       code: 'BUS',    port: 'Gi1/0/5' },
  { prefix: '10.60.', name: 'Faculty of Agriculture',    code: 'AGR',    port: 'Gi1/0/6' },
  { prefix: '10.70.', name: 'Faculty of Architecture',   code: 'ARC',    port: 'Gi1/0/7' },
  { prefix: '10.80.', name: 'Faculty of Law',            code: 'LAW',    port: 'Gi1/0/8' },
  { prefix: '172.',   name: 'Internal Network',          code: 'INT',    port: 'Gi1/0/9' },
  { prefix: '192.168.',name:'Admin Network',              code: 'ADM',    port: 'Gi1/0/10'},
  { prefix: '127.',   name: 'Loopback (localhost)',       code: 'LO',     port: 'Lo0'    },
];

function getFacultyInfo(ip) {
  const match = FACULTY_RANGES.find(f => ip.startsWith(f.prefix));
  if (match) return match;
  // External IP
  return { name: 'External / Internet', code: 'EXT', port: 'Gi0/0 (WAN)' };
}

// ─── Known C&C / Malicious IP Prefixes (Blacklist) ───────────────────────────
// ในระบบจริงดึงจาก Threat Intelligence Feed
const CNC_BLACKLIST_PREFIXES = [
  '185.', '91.', '194.', '45.148.', '45.95.', '193.', '89.', '179.', '5.188.',
];

function isBlacklisted(ip) {
  return CNC_BLACKLIST_PREFIXES.some(prefix => ip.startsWith(prefix));
}

// ─── Utility: Write log entry ─────────────────────────────────────────────────
function writeLog(filePath, entry) {
  fs.appendFile(filePath, JSON.stringify(entry) + '\n', err => {
    if (err) console.error(`[!] Failed to write log: ${err.message}`);
  });
}

// ─── Blocked IPs Enforcement ──────────────────────────────────────────────────
const BLOCKED_IPS_FILE = path.join(LOG_DIR, 'blocked_ips.json');
let blockedIpsCache = new Set();

function refreshBlockedIps() {
  try {
    if (fs.existsSync(BLOCKED_IPS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BLOCKED_IPS_FILE, 'utf-8'));
      blockedIpsCache = new Set(data.map(entry => entry.ip));
    }
  } catch (e) { /* ignore parse errors during write */ }
}

// Refresh blocked IPs list every 2 seconds
setInterval(refreshBlockedIps, 2000);
refreshBlockedIps();

// ─── Port Scan Tracker ────────────────────────────────────────────────────────
const connectionCounts = {};
const SCAN_THRESHOLD  = 5;
const SCAN_WINDOW_MS  = 5000;

function trackAndDetectScan(ip, port) {
  if (!connectionCounts[ip]) {
    connectionCounts[ip] = { count: 0, ports: new Set(), firstSeen: Date.now() };
  }
  const now  = Date.now();
  const stat = connectionCounts[ip];

  if (now - stat.firstSeen > SCAN_WINDOW_MS) {
    stat.count = 1;
    stat.ports = new Set([port]);
    stat.firstSeen = now;
  } else {
    stat.count++;
    stat.ports.add(port);
  }

  if (stat.count === SCAN_THRESHOLD) {
    const scanEntry = {
      timestamp:  new Date().toISOString(),
      log_source: 'ACCESS_LAYER',
      layer:      'Core Switch (Gi0/0)',
      event:      'PORT_SCAN_DETECTED',
      src_ip:     ip,
      faculty:    getFacultyInfo(ip),
      dst_ports:  [...stat.ports],
      detail:     `Port scan detected — ${stat.count} connections in ${SCAN_WINDOW_MS}ms`,
      mitre:      'T1595',
      severity:   'medium',
    };
    writeLog(ACCESS_LOG, scanEntry);
    console.log(`[!] 🔍 Port Scan from ${ip} → logged to access_layer.log`);
  }
}

// ─── Core Proxy Servers ───────────────────────────────────────────────────────
const PROXIES = [
  { name: 'SSH Honeypot (Cowrie)',   localPort: 2222, remotePort: 2223, remoteHost: '127.0.0.1', service: 'SSH',  mitre: 'T1110' },
  { name: 'Web Honeypot (HTTP)',     localPort: 8080, remotePort: 8081, remoteHost: '127.0.0.1', service: 'HTTP', mitre: 'T1190' },
  { name: 'Web Honeypot (HTTPS)',    localPort: 8443, remotePort: 8444, remoteHost: '127.0.0.1', service: 'HTTPS',mitre: 'T1190' },
];

function createProxy(config) {
  const server = net.createServer(clientSocket => {
    const rawAddr = clientSocket.remoteAddress || '0.0.0.0';
    const srcIp   = rawAddr.replace(/^.*:/, '');          // strip ::ffff:
    const srcPort = clientSocket.remotePort;

    // ── Check Blocked IPs ─────────────────────────────────────────────────────
    if (blockedIpsCache.has(srcIp)) {
      console.log(`[!] 🚫 Connection from BLOCKED IP dropped: ${srcIp} → ${config.service}`);
      
      // บันทึก log ว่าการเชื่อมต่อถูกบล็อกจริง
      const blockEntry = {
        timestamp:    new Date().toISOString(),
        log_source:   'ACCESS_LAYER',
        layer:        'Core Switch (WAF/ACL)',
        event:        'BLOCKED_CONNECTION',
        src_ip:       srcIp,
        src_port:     srcPort,
        dst_service:  config.service,
        dst_port:     config.localPort,
        faculty:      getFacultyInfo(srcIp),
        mitre:        'Defense',
        severity:     'high',
        detail:       `Connection instantly dropped by proxy (IP is in blocked list)`,
      };
      writeLog(ACCESS_LOG, blockEntry);
      
      clientSocket.destroy();
      return;
    }

    const faculty  = getFacultyInfo(srcIp);
    const ts       = new Date().toISOString();

    // ── Write Access Layer Log (จำลอง NetFlow จาก Core Switch) ──────────────
    const accessEntry = {
      timestamp:    ts,
      log_source:   'ACCESS_LAYER',
      layer:        'Core Switch → Server Zone',
      event:        'INBOUND_CONNECTION',
      src_ip:       srcIp,
      src_port:     srcPort,
      dst_service:  config.service,
      dst_port:     config.localPort,
      faculty:      faculty,
      mitre:        config.mitre,
      severity:     'low',
      detail:       `${config.service} connection accepted through Core Switch`,
    };
    writeLog(ACCESS_LOG, accessEntry);
    console.log(`[+] [${config.name}] ${srcIp}:${srcPort} → ACCESS LOG written`);

    // ── Port Scan Detection ───────────────────────────────────────────────────
    trackAndDetectScan(srcIp, config.localPort);

    // ── Notify SIEM Backend (Time-based IP mapping) ───────────────────────────
    const req = http.request({
      hostname: '127.0.0.1', port: 5000,
      path: '/api/attacks/ip-map', method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {}); // Suppress if backend not up
    req.write(JSON.stringify({
      realIp:    srcIp,
      faculty:   faculty,
      service:   config.service,
      timestamp: ts,
    }));
    req.end();

    // ── Forward traffic to Honeypot ───────────────────────────────────────────
    const backendSocket = new net.Socket();
    backendSocket.connect(config.remotePort, config.remoteHost, () => {
      clientSocket.pipe(backendSocket);
      backendSocket.pipe(clientSocket);
    });

    backendSocket.on('error', err => {
      console.error(`[-] [${config.name}] Backend error: ${err.message}`);
      clientSocket.destroy();
    });
    clientSocket.on('error', err => {
      console.error(`[-] [${config.name}] Client error: ${err.message}`);
      backendSocket.destroy();
    });
    clientSocket.on('close', () => backendSocket.destroy());
    backendSocket.on('close', () => clientSocket.destroy());
  });

  server.listen(config.localPort, '0.0.0.0', () => {
    console.log(`🚀 [${config.name}] Listening :${config.localPort} → 127.0.0.1:${config.remotePort}`);
  });

  server.on('error', err => console.error(`[!] Server error on port ${config.localPort}: ${err.message}`));
}

PROXIES.forEach(createProxy);

// ─── C&C Outbound Listener ────────────────────────────────────────────────────
// จำลอง Firewall ตรวจจับการเชื่อมต่อออกจาก Server Zone ไปยัง C&C
// เราเปิด HTTP Server รับ Report จาก Cowrie/WebTrap เมื่อมีคำสั่ง wget/curl เกิดขึ้น
const CNC_REPORT_PORT = 5001;
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/report-outbound') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const dstIp = data.dst_ip || 'unknown';
        const severity = isBlacklisted(dstIp) ? 'critical' : 'medium';

        const cncEntry = {
          timestamp:    new Date().toISOString(),
          log_source:   'CNC_FIREWALL',
          layer:        'Firewall (Outbound)',
          event:        isBlacklisted(dstIp) ? 'CNC_COMMUNICATION' : 'SUSPICIOUS_OUTBOUND',
          src_ip:       data.src_ip || 'unknown',
          dst_ip:       dstIp,
          dst_port:     data.dst_port || 443,
          dst_country:  data.dst_country || 'Unknown',
          command:      data.command || '',
          mitre:        'T1071',
          severity:     severity,
          detail:       `Outbound from Server Zone to ${dstIp} — ${severity === 'critical' ? 'BLACKLISTED C&C IP' : 'Suspicious destination'}`,
        };
        writeLog(CNC_LOG, cncEntry);
        console.log(`[!] 🚨 C&C Outbound: ${data.src_ip} → ${dstIp} (${severity}) — logged to cnc_outbound.log`);
        res.writeHead(200);
        res.end('OK');
      } catch (e) {
        res.writeHead(400);
        res.end('Bad JSON');
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(CNC_REPORT_PORT, () => {
  console.log(`🔒 C&C Outbound Listener on :${CNC_REPORT_PORT}/report-outbound`);
});

console.log(`\n📁 SIEM Logs directory: ${LOG_DIR}`);
console.log(`   ├── access_layer.log  (Core Switch NetFlow)`);
console.log(`   └── cnc_outbound.log  (Firewall Outbound)\n`);
