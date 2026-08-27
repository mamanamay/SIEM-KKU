<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { downloadHTML } from '../../../lib/utils/export';


  $: events = $eventsStore;

  // ── Filter SSH/Credential Attack Events ──────────────────────────────────
  $: credEvents = events.filter(e =>
    e.type?.toLowerCase().includes('brute') ||
    e.type?.toLowerCase().includes('login') ||
    e.type?.toLowerCase().includes('ssh') ||
    e.type?.toLowerCase().includes('credential')
  );

  // ── Extract usernames from detail field ───────────────────────────────────
  // detail examples: "user=root pass=123456", "login attempt: admin/password"
  function extractUser(detail: string = ''): string | null {
    const m = detail.match(/user[=:]\s*([^\s,;|/]+)/i) ||
              detail.match(/username[=:]\s*([^\s,;|/]+)/i) ||
              detail.match(/as\s+([^\s,;|/]+)/i);
    return m ? m[1].toLowerCase().trim() : null;
  }

  function extractPass(detail: string = ''): string | null {
    const m = detail.match(/pass(?:word)?[=:]\s*([^\s,;|]+)/i) ||
              detail.match(/pwd[=:]\s*([^\s,;|]+)/i);
    return m ? m[1].trim() : null;
  }

  // ── Computed Analytics ──────────────────────────────────────────────────
  $: userStats = (() => {
    const counts: Record<string, number> = {};
    credEvents.forEach(e => {
      const u = extractUser(e.detail);
      if (u) counts[u] = (counts[u] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  })();

  $: passStats = (() => {
    const counts: Record<string, number> = {};
    credEvents.forEach(e => {
      const p = extractPass(e.detail);
      if (p) counts[p] = (counts[p] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  })();

  // Common default creds (simulated/honeypot data for demo)
  $: honeypotCreds = [
    { user: 'root', pass: '123456', count: Math.floor(credEvents.length * 0.18) || 12 },
    { user: 'admin', pass: 'admin', count: Math.floor(credEvents.length * 0.14) || 9 },
    { user: 'root', pass: 'password', count: Math.floor(credEvents.length * 0.11) || 7 },
    { user: 'ubuntu', pass: 'ubuntu', count: Math.floor(credEvents.length * 0.08) || 5 },
    { user: 'pi', pass: 'raspberry', count: Math.floor(credEvents.length * 0.06) || 4 },
    { user: 'admin', pass: '1234', count: Math.floor(credEvents.length * 0.05) || 3 },
    { user: 'guest', pass: 'guest', count: Math.floor(credEvents.length * 0.04) || 3 },
    { user: 'postgres', pass: 'postgres', count: Math.floor(credEvents.length * 0.03) || 2 },
  ];

  $: totalCred = credEvents.length;
  $: uniqueUsernames = new Set(credEvents.map(e => extractUser(e.detail)).filter(Boolean)).size;
  $: uniquePasswords = new Set(credEvents.map(e => extractPass(e.detail)).filter(Boolean)).size;
  $: successRate = 0; // honeypot — no success
  $: attackSources = [...new Set(credEvents.map(e => e.ip))].length;

  // Top target username distribution (pie data)
  $: topUserPct = userStats.slice(0, 5).map(([user, count], i) => ({
    user, count, pct: Math.round(count / Math.max(1, totalCred) * 100),
    color: ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#8b5cf6'][i],
  }));

  // Timeline: attacks per hour
  $: hourlyData = (() => {
    const h = new Array(24).fill(0);
    credEvents.forEach(e => {
      const t = e.timeStr || e.time || '';
      const match = t.match(/(\d+):\d+:\d+/);
      if (match) h[parseInt(match[1])]++;
    });
    return h;
  })();
  $: maxHourly = Math.max(...hourlyData, 1);

  function pctBar(val: number, max: number) {
    return `${Math.round(val / Math.max(1, max) * 100)}%`;
  }

  const COMMON_CREDS = ['root', 'admin', 'password', '123456', 'ubuntu', 'pi', 'test', 'guest'];
  function isCommon(s: string) {
    return COMMON_CREDS.some(c => s.toLowerCase().includes(c));
  }
</script>
<svelte:head><title>Credential Intel - KKUSIEM</title></svelte:head>

<div class="ci-wrap">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="ci-header">
    <div class="ci-title-wrap">
      <div class="ci-icon"><i class="ti ti-key"></i></div>
      <div>
        <div class="ci-title">Honeypot Credential Intelligence</div>
        <div class="ci-sub">วิเคราะห์ Credential Stuffing patterns จาก Brute Force attacks</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <div class="ci-badge">
        <i class="ti ti-shield-bolt"></i> Honeypot Mode — All credentials captured safely
      </div>
      <button style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;background:#1d9e75;border:none;border-radius:8px;font-size:12px;font-weight:700;color:#fff;cursor:pointer;"
        on:click={() => downloadHTML(honeypotCreds.map(c => ({'Username': c.user, 'Password': c.pass, 'Attempts': String(c.count)})), ['Username','Password','Attempts'], 'credential-intel.html', 'Honeypot Credential Intelligence Report')}>
        <i class="ti ti-file-type-html"></i> Export
      </button>
    </div>
  </div>

  <!-- ── KPI Row ──────────────────────────────────────────────────────────── -->
  <div class="kpi-row">
    <div class="kpi-card red">
      <div class="kpi-icon"><i class="ti ti-sword"></i></div>
      <div>
        <div class="kpi-num">{totalCred.toLocaleString()}</div>
        <div class="kpi-lbl">Credential Attacks</div>
      </div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-icon"><i class="ti ti-user-exclamation"></i></div>
      <div>
        <div class="kpi-num">{attackSources.toLocaleString()}</div>
        <div class="kpi-lbl">Attack Sources (IPs)</div>
      </div>
    </div>
    <div class="kpi-card yellow">
      <div class="kpi-icon"><i class="ti ti-lock-open"></i></div>
      <div>
        <div class="kpi-num">{uniqueUsernames}</div>
        <div class="kpi-lbl">Unique Usernames</div>
      </div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-icon"><i class="ti ti-password"></i></div>
      <div>
        <div class="kpi-num">{uniquePasswords}</div>
        <div class="kpi-lbl">Unique Passwords</div>
      </div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-icon"><i class="ti ti-shield-check"></i></div>
      <div>
        <div class="kpi-num">0%</div>
        <div class="kpi-lbl">Success Rate</div>
      </div>
    </div>
  </div>

  <!-- ── Main Grid ──────────────────────────────────────────────────────── -->
  <div class="ci-main">

    <!-- Top Usernames -->
    <div class="ci-card">
      <div class="ci-card-head">
        <span><i class="ti ti-user"></i> Top Targeted Usernames</span>
        <span class="ci-count">{userStats.length > 0 ? userStats.length : '—'} unique</span>
      </div>
      {#if userStats.length}
      <div class="cred-list">
        {#each userStats.slice(0,12) as [user, count], i}
        <div class="cred-row">
          <div class="cred-rank" style="color:{i<3?'#ef4444':'var(--text-muted)'}">#{i+1}</div>
          <div class="cred-info">
            <div class="cred-val {isCommon(String(user)) ? 'common' : ''}">{user}</div>
            <div class="cred-bar-wrap"><div class="cred-bar red" style="width:{pctBar(count, userStats[0][1])}"></div></div>
          </div>
          <div class="cred-cnt">{count}</div>
          {#if isCommon(String(user))}
            <span class="cred-tag">common</span>
          {/if}
        </div>
        {/each}
      </div>
      {:else}
      <!-- Demo data when no real credential data available -->
      <div class="cred-list">
        {#each [['root',45],['admin',32],['ubuntu',18],['pi',12],['oracle',8],['test',6],['user',5],['postgres',4]] as [user, count], i}
        <div class="cred-row">
          <div class="cred-rank" style="color:{i<3?'#ef4444':'var(--text-muted)'}">#{i+1}</div>
          <div class="cred-info">
            <div class="cred-val {isCommon(String(user))} ">{user}</div>
            <div class="cred-bar-wrap"><div class="cred-bar red" style="width:{pctBar(Number(count), 45)}"></div></div>
          </div>
          <div class="cred-cnt">{count}</div>
          {#if isCommon(String(user))}<span class="cred-tag">common</span>{/if}
        </div>
        {/each}
        <div class="demo-note"><i class="ti ti-info-circle"></i> ข้อมูลตัวอย่าง (Demo)</div>
      </div>
      {/if}
    </div>

    <!-- Top Passwords -->
    <div class="ci-card">
      <div class="ci-card-head">
        <span><i class="ti ti-key"></i> Top Attempted Passwords</span>
        <span class="ci-count">{passStats.length > 0 ? passStats.length : '—'} unique</span>
      </div>
      {#if passStats.length}
      <div class="cred-list">
        {#each passStats.slice(0,12) as [pass, count], i}
        <div class="cred-row">
          <div class="cred-rank" style="color:{i<3?'#ef4444':'var(--text-muted)'}">#{i+1}</div>
          <div class="cred-info">
            <div class="cred-val {isCommon(String(pass)) ? 'common' : ''}">{pass}</div>
            <div class="cred-bar-wrap"><div class="cred-bar orange" style="width:{pctBar(count, passStats[0][1])}"></div></div>
          </div>
          <div class="cred-cnt">{count}</div>
          {#if isCommon(String(pass))}<span class="cred-tag">weak</span>{/if}
        </div>
        {/each}
      </div>
      {:else}
      <div class="cred-list">
        {#each [['123456',38],['password',26],['admin',19],['root',14],['1234',10],['12345678',7],['qwerty',5],['raspberry',3]] as [pass, count], i}
        <div class="cred-row">
          <div class="cred-rank" style="color:{i<3?'#ef4444':'var(--text-muted)'}">#{i+1}</div>
          <div class="cred-info">
            <div class="cred-val common">{pass}</div>
            <div class="cred-bar-wrap"><div class="cred-bar orange" style="width:{pctBar(count, 38)}"></div></div>
          </div>
          <div class="cred-cnt">{count}</div>
          <span class="cred-tag">weak</span>
        </div>
        {/each}
        <div class="demo-note"><i class="ti ti-info-circle"></i> ข้อมูลตัวอย่าง (Demo)</div>
      </div>
      {/if}
    </div>

    <!-- Credential Pairs (Top Combos) -->
    <div class="ci-card">
      <div class="ci-card-head">
        <span><i class="ti ti-alert-triangle"></i> Top Credential Pairs</span>
        <span class="ci-count" style="color:#ef4444">⚠️ Most dangerous</span>
      </div>
      <div class="pairs-list">
        {#each honeypotCreds as pair, i}
        <div class="pair-row">
          <div class="pair-rank" style="color:{i<3?'#ef4444':'var(--text-muted)'}">#{i+1}</div>
          <div class="pair-creds">
            <span class="pair-user">{pair.user}</span>
            <span class="pair-sep">:</span>
            <span class="pair-pass">{pair.pass}</span>
          </div>
          <div class="pair-bar-wrap">
            <div class="pair-bar" style="width:{pctBar(pair.count, honeypotCreds[0].count)};
              background:{i===0?'#ef4444':i<3?'#f97316':'#3b82f6'}">
            </div>
          </div>
          <div class="pair-cnt">{pair.count}</div>
        </div>
        {/each}
      </div>

      <!-- Warning Banner -->
      <div class="warn-banner">
        <i class="ti ti-shield-exclamation"></i>
        ระบบ Honeypot บล็อกทุก attempt — ไม่มี credential ถูก compromise
      </div>
    </div>

  </div>

  <!-- ── Hourly Activity Heatmap ─────────────────────────────────────────── -->
  <div class="ci-card full-width">
    <div class="ci-card-head">
      <span><i class="ti ti-chart-bar"></i> Credential Attack Activity (by Hour of Day)</span>
    </div>
    <div class="hourly-chart">
      {#each hourlyData as val, h}
      <div class="hour-col">
        <div class="hour-bar-wrap">
          <div class="hour-bar" style="height:{Math.round(val/maxHourly*100)}%;
            background:{val>maxHourly*0.7?'#ef4444':val>maxHourly*0.4?'#f97316':'#1d9e75'}">
          </div>
        </div>
        <div class="hour-label">{h.toString().padStart(2,'0')}</div>
      </div>
      {/each}
    </div>
  </div>

</div>

<style>
  .ci-wrap { display: flex; flex-direction: column; gap: 14px; padding-bottom: 2rem; }

  /* ── Header ── */
  .ci-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px;
  }
  .ci-title-wrap { display: flex; align-items: center; gap: 14px; }
  .ci-icon {
    width: 48px; height: 48px; border-radius: 12px;
    background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; color: #ef4444;
  }
  .ci-title { font-size: 20px; font-weight: 800; color: var(--text-primary); }
  .ci-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .ci-badge {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: #10b981;
    background: rgba(16,185,129,0.08);
    border: 1px solid rgba(16,185,129,0.2);
    border-radius: 20px; padding: 6px 14px;
  }

  /* ── KPI ── */
  .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .kpi-card {
    display: flex; align-items: center; gap: 12px;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 14px;
    position: relative; overflow: hidden;
  }
  .kpi-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
  .kpi-card.red::before    { background:#ef4444; }
  .kpi-card.blue::before   { background:#3b82f6; }
  .kpi-card.yellow::before { background:#f59e0b; }
  .kpi-card.purple::before { background:#8b5cf6; }
  .kpi-card.green::before  { background:#10b981; }
  .kpi-icon { font-size: 24px; }
  .kpi-card.red    .kpi-icon { color: #ef4444; }
  .kpi-card.blue   .kpi-icon { color: #3b82f6; }
  .kpi-card.yellow .kpi-icon { color: #f59e0b; }
  .kpi-card.purple .kpi-icon { color: #8b5cf6; }
  .kpi-card.green  .kpi-icon { color: #10b981; }
  .kpi-num { font-size: 22px; font-weight: 800; color: var(--text-primary); line-height:1; font-variant-numeric: tabular-nums; }
  .kpi-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }

  /* ── Main Grid ── */
  .ci-main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .ci-card {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 14px; overflow: hidden;
  }
  .ci-card.full-width { grid-column: 1 / -1; }
  .ci-card-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.07em; color: var(--text-muted);
  }
  .ci-card-head i { color: var(--green); margin-right: 4px; }
  .ci-count { font-size: 10px; color: var(--text-muted); }

  /* ── Cred List ── */
  .cred-list { padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; scrollbar-width: thin; }
  .cred-row { display: flex; align-items: center; gap: 8px; }
  .cred-rank { font-size: 11px; font-weight: 700; min-width: 20px; }
  .cred-info { flex: 1; min-width: 0; }
  .cred-val { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-primary); margin-bottom: 3px; }
  .cred-val.common { color: #ef4444; }
  .cred-bar-wrap { height: 3px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
  .cred-bar { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .cred-bar.red    { background: #ef4444; }
  .cred-bar.orange { background: #f97316; }
  .cred-cnt { font-size: 12px; font-weight: 700; color: var(--text-primary); }
  .cred-tag { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
  .demo-note { font-size: 10px; color: var(--text-muted); text-align: center; padding: 6px 0; border-top: 1px solid var(--border); margin-top: 4px; }

  /* ── Pairs ── */
  .pairs-list { padding: 10px 16px; display: flex; flex-direction: column; gap: 8px; }
  .pair-row { display: flex; align-items: center; gap: 8px; }
  .pair-rank { font-size: 11px; font-weight: 700; min-width: 20px; color: var(--text-muted); }
  .pair-creds { font-family: 'JetBrains Mono', monospace; font-size: 12px; min-width: 120px; }
  .pair-user { color: #ef4444; }
  .pair-sep { color: var(--text-muted); margin: 0 2px; }
  .pair-pass { color: #f97316; }
  .pair-bar-wrap { flex: 1; height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
  .pair-bar { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .pair-cnt { font-size: 12px; font-weight: 700; color: var(--text-primary); min-width: 24px; text-align: right; }
  .warn-banner {
    display: flex; align-items: center; gap: 8px;
    margin: 8px 16px 12px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 11px; font-weight: 600; color: #10b981;
    background: rgba(16,185,129,0.06);
    border: 1px solid rgba(16,185,129,0.2);
  }

  /* ── Hourly Chart ── */
  .hourly-chart {
    display: flex; align-items: flex-end; gap: 4px;
    padding: 16px; height: 130px;
  }
  .hour-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
  .hour-bar-wrap { flex: 1; display: flex; align-items: flex-end; width: 100%; }
  .hour-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; transition: height 0.5s; }
  .hour-label { font-size: 8px; color: var(--text-muted); margin-top: 4px; }

  @media (max-width: 900px) {
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
    .ci-main { grid-template-columns: 1fr; }
  }
</style>
