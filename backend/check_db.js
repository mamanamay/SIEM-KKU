const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/honeypot' });
client.connect()
  .then(() => client.query('SELECT * FROM "user"'))
  .then(res => { console.log(res.rows); client.end(); })
  .catch(console.error);
