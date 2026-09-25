const https = require('https');
https.get({ host: '127.0.0.1', port: 18443, path: '/api/system/health', rejectUnauthorized: false }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
}).on('error', err => console.log('Error:', err.message));
