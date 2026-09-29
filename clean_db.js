const fs = require('fs');
const { Client } = require('pg');

const rawData = fs.readFileSync('backend/src/ip_records.json', 'utf-8');
const subnets = JSON.parse(rawData);

function ipToLong(ip) {
  try {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  } catch (e) {
    return 0;
  }
}

function isInLan(ip) {
  if (!ip) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const ipLong = ipToLong(ip);
  for (const subnet of subnets) {
    const subnetLong = ipToLong(subnet['Net-Address']);
    const mask = subnet.Mask;
    const maskLong = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
    if ((ipLong & maskLong) === (subnetLong & maskLong)) return true;
  }
  return false;
}

async function run() {
  const client = new Client({ connectionString: 'postgres://postgres:ChangeMe_StrongPassword_Here@localhost:5432/honeypot' });
  await client.connect();
  
  const res = await client.query('SELECT id, ip, "destIp" FROM attack');
  let deleteCount = 0;
  
  for (const row of res.rows) {
    const isTargetLan = isInLan(row.destIp);
    const isSourceLan = isInLan(row.ip);
    
    // If BOTH are not in LAN, it's external-to-external noise
    if (!isTargetLan && !isSourceLan) {
      await client.query('DELETE FROM attack WHERE id = ', [row.id]);
      deleteCount++;
    }
  }
  
  console.log('Deleted', deleteCount, 'rows that were entirely external.');
  process.exit(0);
}

run();
