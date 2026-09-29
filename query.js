const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:ChangeMe_StrongPassword_Here@localhost:5432/honeypot' });
client.connect().then(() => client.query('SELECT id, ip, \"destIp\", type FROM attack ORDER BY id DESC LIMIT 5')).then(res => { console.log(res.rows); process.exit(0); });
