const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://siem:secret_pass_123!@localhost:5432/siem_db' });
client.connect().then(() => {
  client.query("SELECT * FROM attacks WHERE ip='10.52.1.235' ORDER BY id DESC LIMIT 1").then(res => {
    console.log(res.rows[0].rawLog);
    client.end();
  });
});
