/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           KKUSIEM — Attack Simulator                        ║
 * ║   จำลองการโจมตีหลายรูปแบบ → POST /api/ingest (realtime)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Mode:
 *   AUTO     — วนซ้ำตลอด (ใช้ demo ที่จอ)
 *   BURST    — ยิง N events แล้วหยุด (BURST_COUNT)
 *   SCENARIO — จำลอง Kill Chain sequence แบบมีขั้นตอน
 *
 * ตั้งค่าผ่าน ENV:
 *   BACKEND_URL   = http://backend:5000   (default)
 *   INGEST_API_KEY = ...
 *   ATTACKER_MODE  = AUTO | BURST | SCENARIO
 *   BURST_COUNT    = 50  (ใช้กับ mode BURST)
 *   MIN_DELAY_MS   = 2000  (delay ต่ำสุดระหว่าง event)
 *   MAX_DELAY_MS   = 8000  (delay สูงสุดระหว่าง event)
 */

const fs      = require('fs');
const path    = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const BACKEND_URL    = process.env.BACKEND_URL    || 'http://backend:5000';
const INGEST_URL     = `${BACKEND_URL}/api/ingest`;
const INGEST_KEY     = process.env.INGEST_API_KEY || '';
const MODE           = (process.env.ATTACKER_MODE  || 'AUTO').toUpperCase();
const BURST_COUNT    = parseInt(process.env.BURST_COUNT   || '30');
const MIN_DELAY      = parseInt(process.env.MIN_DELAY_MS  || '2000');
const MAX_DELAY      = parseInt(process.env.MAX_DELAY_MS  || '8000');

// ─── Load Scenarios ───────────────────────────────────────────────────────────
const S = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8'));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const rand    = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const sleep   = (ms) => new Promise(r => setTimeout(r, ms));
const now     = () => new Date().toISOString();

let sentCount = 0;
// Track per-IP attempt count for realistic brute force escalation
const ipAttempts = {};

// ─── POST to /api/ingest ──────────────────────────────────────────────────────
async function send(payload) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (INGEST_KEY) headers['X-Ingest-Key'] = INGEST_KEY;

    const res = await fetch(INGEST_URL, {
      method:  'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    sentCount++;
    const src = payload.source || payload.eventid?.split('.')[0] || 'generic';
    console.log(`[${sentCount}] ✅ ${src.padEnd(10)} | ${payload.src_ip || payload.agent?.ip || '?'} | status=${res.status}`);
    return data;
  } catch (err) {
    console.error(`[!] Ingest failed: ${err.message} — Retrying in 5s...`);
    await sleep(5000);
  }
}

// ─── EVENT GENERATORS ────────────────────────────────────────────────────────

function genCowrieLogin(ip, success = false) {
  const cred = rand(S.userPassPool);
  ipAttempts[ip] = (ipAttempts[ip] || 0) + 1;
  return {
    eventid:   success ? 'cowrie.login.success' : 'cowrie.login.failed',
    src_ip:    ip,
    username:  cred.u,
    password:  cred.p,
    session:   `sim-${Date.now()}`,
    timestamp: now(),
    version:   rand(['SSH-2.0-libssh-0.9.3','SSH-2.0-OpenSSH_8.4','SSH-2.0-PuTTY']),
  };
}

function genCowrieCommand(ip) {
  return {
    eventid:   'cowrie.command.input',
    src_ip:    ip,
    input:     rand(S.commands),
    session:   `sim-${Date.now()}`,
    timestamp: now(),
  };
}

function genWebTrapSql(ip) {
  const urlPath = rand(S.webPaths);
  return {
    src_ip:     ip,
    type:       'SQL Inject',
    severity:   'critical',
    detail:     `POST ${urlPath} payload=${rand(S.sqlPayloads)}`,
    user_agent: rand(['sqlmap/1.7.8','curl/7.81.0','python-requests/2.28']),
    timestamp:  now(),
  };
}

function genWebTrapXss(ip) {
  return {
    src_ip:     ip,
    type:       'XSS Attempt',
    severity:   'high',
    detail:     `GET /search?q=${encodeURIComponent(rand(S.xssPayloads))}`,
    user_agent: rand(['Mozilla/5.0','nikto/2.1.6','WFuzz/3.1.0']),
    timestamp:  now(),
  };
}

function genWebTrapScan(ip) {
  const urlPath = rand(S.webPaths);
  return {
    src_ip:     ip,
    type:       'Web Scan',
    severity:   'medium',
    detail:     `GET ${urlPath} — directory traversal / recon scan`,
    user_agent: rand(['nikto/2.1.6','gobuster/3.6','dirbuster/1.0']),
    timestamp:  now(),
  };
}

function genWebTrapPath(ip) {
  return {
    src_ip:     ip,
    type:       'Path Traversal',
    severity:   'high',
    detail:     `GET /../../../etc/passwd (traversal attempt)`,
    user_agent: rand(['curl/7.81.0','python-requests/2.28']),
    timestamp:  now(),
  };
}

function genWazuh(ip) {
  const rule = rand(S.wazuhRules);
  return {
    rule: {
      id:          String(rule.id),
      level:       rule.level,
      description: rule.desc,
      mitre:       { id: ['T1110', 'T1059', 'T1190', 'T1078'] },
    },
    agent: { ip, name: `agent-${ip.split('.')[3]}` },
    data:  { srcip: ip },
    timestamp: now(),
  };
}

function genGeneric(ip) {
  const types = ['Port Scan','ICMP Flood','DNS Amplification','UDP Flood'];
  return {
    source:    'suricata',
    src_ip:    ip,
    type:      rand(types),
    severity:  rand(['medium','high']),
    detail:    `Network anomaly detected from ${ip}`,
    timestamp: now(),
  };
}

// ─── RANDOM EVENT — สุ่มเลือก generator ──────────────────────────────────────
async function sendRandomEvent() {
  const ip = rand(S.ipPool);

  // Weight: SSH brute force เกิดบ่อยที่สุด
  const roll = Math.random();

  if (roll < 0.35) {
    await send(genCowrieLogin(ip, false));
  } else if (roll < 0.40) {
    // Login success (หายาก) → ตามด้วย command
    await send(genCowrieLogin(ip, true));
    await sleep(1500);
    await send(genCowrieCommand(ip));
  } else if (roll < 0.55) {
    await send(genWebTrapSql(ip));
  } else if (roll < 0.63) {
    await send(genWebTrapXss(ip));
  } else if (roll < 0.72) {
    await send(genWebTrapScan(ip));
  } else if (roll < 0.78) {
    await send(genWebTrapPath(ip));
  } else if (roll < 0.90) {
    await send(genWazuh(ip));
  } else {
    await send(genGeneric(ip));
  }
}

// ─── KILL CHAIN SCENARIO ──────────────────────────────────────────────────────
// จำลองการโจมตีแบบมีขั้นตอน: Recon → BruteForce → Login → Execute → C&C
async function runKillChain() {
  const ip = rand(S.ipPool);
  console.log(`\n🎯 [KILL CHAIN] Starting attack from ${ip}\n`);

  const steps = [
    { label: 'Step 1: Recon (Web Scan)',       fn: () => send(genWebTrapScan(ip)),     delay: 3000 },
    { label: 'Step 2: BruteForce SSH #1',      fn: () => send(genCowrieLogin(ip)),     delay: 2000 },
    { label: 'Step 3: BruteForce SSH #2',      fn: () => send(genCowrieLogin(ip)),     delay: 2000 },
    { label: 'Step 4: BruteForce SSH #3',      fn: () => send(genCowrieLogin(ip)),     delay: 2000 },
    { label: 'Step 5: SQL Injection attempt',  fn: () => send(genWebTrapSql(ip)),      delay: 3000 },
    { label: 'Step 6: SSH Login SUCCESS 🚨',   fn: () => send(genCowrieLogin(ip, true)), delay: 2000 },
    { label: 'Step 7: Command Execution 🚨',   fn: () => send(genCowrieCommand(ip)),   delay: 2000 },
    { label: 'Step 8: Wazuh Critical Alert',   fn: () => send(genWazuh(ip)),           delay: 3000 },
  ];

  for (const step of steps) {
    console.log(`  ⟶ ${step.label}`);
    await step.fn();
    await sleep(step.delay);
  }
  console.log(`\n✅ [KILL CHAIN] Complete — ${steps.length} events sent from ${ip}\n`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║      KKUSIEM — Attack Simulator          ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Mode        : ${MODE}`);
  console.log(`Target      : ${INGEST_URL}`);
  console.log(`Auth Key    : ${INGEST_KEY ? '✅ Set' : '⚠️  Not set (no auth)'}`);
  console.log(`Delay range : ${MIN_DELAY}–${MAX_DELAY} ms`);
  if (MODE === 'BURST') console.log(`Burst count : ${BURST_COUNT}`);
  console.log('─'.repeat(44));

  // Wait for backend to be ready
  console.log('Waiting 10s for backend to start...');
  await sleep(10000);

  if (MODE === 'SCENARIO') {
    // Run one kill chain, then switch to AUTO
    await runKillChain();
    console.log('Kill Chain done. Switching to AUTO mode...\n');
    await loopAuto();

  } else if (MODE === 'BURST') {
    for (let i = 0; i < BURST_COUNT; i++) {
      await sendRandomEvent();
      await sleep(randInt(MIN_DELAY, MAX_DELAY));
    }
    console.log(`\n✅ BURST complete — ${BURST_COUNT} events sent.`);

  } else {
    // AUTO — infinite loop
    await loopAuto();
  }
}

async function loopAuto() {
  console.log('🔄 AUTO mode — Press Ctrl+C to stop\n');
  while (true) {
    // Every 10 events, do a kill chain for realism
    if (sentCount > 0 && sentCount % 20 === 0) {
      await runKillChain();
    } else {
      await sendRandomEvent();
    }
    await sleep(randInt(MIN_DELAY, MAX_DELAY));
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
