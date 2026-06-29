const net = require('net');
const http = require('http');

const PROXIES = [
    { name: 'Cowrie SSH', localPort: 2222, remotePort: 2223, remoteHost: '127.0.0.1' },
    { name: 'WebTrap HTTP', localPort: 8080, remotePort: 8081, remoteHost: '127.0.0.1' }
];

function createProxy(config) {
    const server = net.createServer((clientSocket) => {
        const srcIp = clientSocket.remoteAddress.replace(/^.*:/, ''); 
        const srcPort = clientSocket.remotePort;

        console.log(`[+] [${config.name}] Connection from ${srcIp}:${srcPort}`);

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
