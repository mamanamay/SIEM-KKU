const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8080;
const LOG_FILE = '/logs/webtrap.json';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure log directory exists
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

function analyzeRequest(req) {
    const url = req.url;
    const body = JSON.stringify(req.body);
    const userAgent = req.headers['user-agent'] || '';
    const fullPayload = url + ' ' + body;
    
    let type = 'Web Scan';
    let severity = 'medium';
    let detail = `Accessed ${url}`;

    if (fullPayload.match(/UNION|SELECT|INSERT|UPDATE|DELETE|DROP|--|' OR 1=1/i)) {
        type = 'SQL Inject';
        severity = 'critical';
        detail = `SQLi Pattern Detected in ${url}`;
    } else if (fullPayload.match(/\.\.\/|\.\.\\/i)) {
        type = 'Path Traversal';
        severity = 'high';
        detail = `Path Traversal attempt to ${url}`;
    } else if (fullPayload.match(/<script>|javascript:/i)) {
        type = 'XSS Attempt';
        severity = 'high';
        detail = `XSS payload found`;
    } else if (userAgent.match(/nmap|masscan|zgrab|nikto|dirb/i)) {
        type = 'Web Scan';
        severity = 'high';
        detail = `Scanner detected: ${userAgent}`;
    }

    // Determine Real IP if behind proxy
    let srcIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (srcIp.startsWith('::ffff:')) srcIp = srcIp.replace('::ffff:', '');

    return {
        timestamp: new Date().toISOString(),
        src_ip: srcIp,
        type: type,
        severity: severity,
        detail: detail,
        payload: fullPayload,
        user_agent: userAgent
    };
}

app.all('*', (req, res) => {
    const logEntry = analyzeRequest(req);
    
    // Write to log file
    fs.appendFile(LOG_FILE, JSON.stringify(logEntry) + '\n', (err) => {
        if (err) console.error('[!] Failed to write log:', err);
    });

    console.log(`[+] Captured: ${logEntry.type} from ${logEntry.src_ip}`);

    // Return fake vulnerable looking response
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

const https = require('https');

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WebTrap Honeypot listening on port ${PORT} (HTTP)`);
});

try {
    const options = {
        key: fs.readFileSync('/certs/key.pem'),
        cert: fs.readFileSync('/certs/cert.pem')
    };
    const HTTPS_PORT = 8443;
    https.createServer(options, app).listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log(`🚀 WebTrap Honeypot listening on port ${HTTPS_PORT} (HTTPS)`);
    });
} catch (err) {
    console.error('⚠️ Could not start HTTPS server, certs not found:', err.message);
}
