process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
const urls = [
  '/',
  '/dashboard',
  '/dashboard/soar',
  '/dashboard/network-map',
  '/dashboard/mitre',
  '/dashboard/blocked_ip_audit',
  '/dashboard/settings',
];

async function check() {
  for (const url of urls) {
    try {
      const r = await fetch('https://127.0.0.1:3000' + url);
      console.log(url, r.status);
    } catch (e) {
      console.log(url, 'Error:', e.message);
    }
  }
}
check();
