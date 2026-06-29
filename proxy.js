const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

const connectionCounts = {};
const SCAN_THRESHOLD = 5;
const SCAN_WINDOW_MS = 5000;

function trackConnection(ip, port) {
    if (!connectionCounts[ip]) {
        connectionCounts[ip] = { count: 0, firstSeen: Date.now() };
    }
    const now = Date.now();
    if (now - connectionCounts[ip].firstSeen > SCAN_WINDOW_MS) {
        connectionCounts[ip].count = 1;
        connectionCounts[ip].firstSeen = now;
    } else {
        connectionCounts[ip].count++;
        if (connectionCounts[ip].count === SCAN_THRESHOLD) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                src_ip: ip,
                type: 'Reconnaissance',
                severity: 'medium',
                detail: `Port Scanning Detected (TCP Connect to port ${port})`,
                payload: 'N/A',
                user_agent: 'Nmap / Port Scanner'
            };
            const logPath = path.join(__dirname, 'webtrap-logs', 'webtrap.json');
            fs.appendFile(logPath, JSON.stringify(logEntry) + '\n', (err) => {
                if (err) console.error('[!] Failed to write scan log:', err);
            });
            console.log(`[!] 🚨 Port Scan detected from ${ip}`);
        }
    }
}

const PROXIES = [
    { name: 'Cowrie SSH', localPort: 2222, remotePort: 2223, remoteHost: '127.0.0.1' },
    { name: 'WebTrap HTTP', localPort: 8080, remotePort: 8081, remoteHost: '127.0.0.1' },
    { name: 'WebTrap HTTPS', localPort: 8443, remotePort: 8444, remoteHost: '127.0.0.1' }
];

function createProxy(config) {
    const server = net.createServer((clientSocket) => {
        const srcIp = clientSocket.remoteAddress.replace(/^.*:/, ''); 
        const srcPort = clientSocket.remotePort;

        console.log(`[+] [${config.name}] Connection from ${srcIp}:${srcPort}`);
        trackConnection(srcIp, config.localPort);

        const backendSocket = new net.Socket();
        backendSocket.connect(config.remotePort, config.remoteHost, () => {
            // Send Out-of-band IP mapping to Backend API
            const req = http.request({
                hostname: '127.0.0.1',
                port: 5000,
                path: '/api/attacks/ip-map',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            req.on('error', () => {}); 
            req.write(JSON.stringify({ realIp: srcIp }));
            req.end();

            // Bridge the streams directly
            clientSocket.pipe(backendSocket);
            backendSocket.pipe(clientSocket);
        });

        backendSocket.on('error', (err) => {
            console.error(`[-] [${config.name}] Backend error: ${err.message}`);
            clientSocket.destroy();
        });

        clientSocket.on('error', (err) => {
            console.error(`[-] [${config.name}] Client error: ${err.message}`);
            backendSocket.destroy();
        });
    });

    server.listen(config.localPort, () => {
        console.log(`🚀 [${config.name}] Proxy listening on 0.0.0.0:${config.localPort} -> ${config.remoteHost}:${config.remotePort}`);
    });
}

PROXIES.forEach(createProxy);
