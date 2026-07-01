const { io } = require("socket.io-client");
// Read token from localstorage? No, we don't have token in node.
// We can just query PostgreSQL directly!
const { Client } = require('pg');

async function test() {
  const client = new Client({
    connectionString: "postgresql://honeypot_user:admin123@localhost:5432/honeypot"
  });
  await client.connect();
  const res = await client.query('SELECT * FROM attack LIMIT 1');
  console.log(res.rows[0]);
  await client.end();
}
test();
