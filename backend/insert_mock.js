const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(() => {
  const query = `
    INSERT INTO attack (ip, "destIp", type, severity, detail, country, "aiAnalysis", "timeStr", "timestampMs")
    VALUES ('185.220.101.55', '10.52.1.235', 'SSH Brute Force', 'critical', 'Failed password for root from 185.220.101.55 port 22 ssh2', 'Russia', null, NOW()::text, EXTRACT(EPOCH FROM NOW()) * 1000)
  `;
  client.query(query).then(() => {
    console.log('Inserted example log into attack table');
    client.end();
  }).catch(err => {
    console.error(err);
    client.end();
  });
});
