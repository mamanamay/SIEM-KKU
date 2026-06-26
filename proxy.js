const net = require('net');

const LOCAL_PORT = 2222;
const REMOTE_HOST = '127.0.0.1';
const REMOTE_PORT = 2223;

const server = net.createServer((clientSocket) => {
    const srcIp = clientSocket.remoteAddress.replace(/^.*:/, ''); // Handle IPv6 mapped IPv4
    const srcPort = clientSocket.remotePort;
    const dstIp = clientSocket.localAddress.replace(/^.*:/, '');
    const dstPort = clientSocket.localPort;

    console.log(`[+] Connection from ${srcIp}:${srcPort}`);

    const backendSocket = new net.Socket();
    backendSocket.connect(REMOTE_PORT, REMOTE_HOST, () => {
        // Send Out-of-band IP mapping to Backend API
        const http = require('http');
        const req = http.request({
            hostname: '127.0.0.1',
            port: 5000,
            path: '/api/attacks/ip-map',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        req.on('error', () => {}); // ignore mapping errors
        req.write(JSON.stringify({ realIp: srcIp }));
        req.end();

        // Bridge the streams directly
        clientSocket.pipe(backendSocket);
        backendSocket.pipe(clientSocket);
    });

    backendSocket.on('error', (err) => {
        console.error(`[-] Backend error: ${err.message}`);
        clientSocket.destroy();
    });

    clientSocket.on('error', (err) => {
        console.error(`[-] Client error: ${err.message}`);
        backendSocket.destroy();
    });
});

server.listen(LOCAL_PORT, () => {
    console.log(`🚀 Honeypot TCP Proxy Protocol Bridge started!`);
    console.log(`📡 Listening on 0.0.0.0:${LOCAL_PORT}`);
    console.log(`➡️  Forwarding to ${REMOTE_HOST}:${REMOTE_PORT} with PROXY header`);
});
