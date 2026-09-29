const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://siem:secret_pass_123!@localhost:5432/siem_db' });
client.connect().then(() => {
  client.query('SELECT ip, "destIp", type, severity, detail FROM attacks ORDER BY id DESC LIMIT 5').then(res => {
    console.log(res.rows);
    client.end();
  });
});
