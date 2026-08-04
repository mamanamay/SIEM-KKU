<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { eventsStore, connectionState, initSocket, disconnectSocket } from '../../stores/events';

  // ── State ─────────────────────────────────────────────────────────────────
  let currentTime = '';
  let currentDate = '';
  let timeInterval: any;
  let carouselIdx = 0;
  let carouselInterval: any;

  // ── Data ──────────────────────────────────────────────────────────────────
  $: events = $eventsStore;
  $: connected = $connectionState === 'connected';

  $: total = events.length;
  $: critical = events.filter(e => e.severity === 'critical').length;
  $: high = events.filter(e => e.severity === 'high').length;
  $: medium = events.filter(e => e.severity === 'medium').length;
  $: uniqueIPs = [...new Set(events.map(e => e.ip))].length;
  $: uniqueCountries = [...new Set(events.map(e => e.country).filter(Boolean))].length;

  $: recentAlerts = events.filter(e => e.severity === 'critical' || e.severity === 'high').slice(-15).reverse();
  $: recentAll = events.slice(-8).reverse();

  $: topIPs = (() => {
    const c: Record<string, number> = {};
    events.forEach(e => c[e.ip] = (c[e.ip] || 0) + 1);
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10);
  })();

  $: topCountries = (() => {
    const c: Record<string, number> = {};
    events.forEach(e => { if (e.country) c[e.country] = (c[e.country] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6);
  })();

  $: epsRate = Math.floor(events.length / Math.max(1, Math.ceil((Date.now() - (events[0]?.timestampMs || Date.now())) / 3600000))) || 0;

  // Severity color
  function sevColor(sev: string) {
    if (sev === 'critical') return '#ef4444';
    if (sev === 'high') return '#f97316';
    if (sev === 'medium') return '#f59e0b';
    return '#6b7280';
  }

  function countryFlag(country: string) {
    const f: Record<string, string> = {
      'Russia':'🇷🇺','China':'🇨🇳','United States':'🇺🇸','USA':'🇺🇸','Germany':'🇩🇪',
      'Brazil':'🇧🇷','Japan':'🇯🇵','Korea':'🇰🇷','India':'🇮🇳','Singapore':'🇸🇬',
      'Netherlands':'🇳🇱','France':'🇫🇷','United Kingdom':'🇬🇧','UK':'🇬🇧',
      'Australia':'🇦🇺','Canada':'🇨🇦','Finland':'🇫🇮','Bulgaria':'🇧🇬',
      'Indonesia':'🇮🇩','Vietnam':'🇻🇳','Local Network':'🏠',
    };
    return f[country] || '🌍';
  }

  onMount(() => {
    // Check token for socket
    const token = localStorage.getItem('token');
    if (!token) {
      // Still show monitor in read-only if no token
    }
    initSocket();

    const update = () => {
      const now = new Date();
      currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
      currentDate = now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
    };
    update();
    timeInterval = setInterval(update, 1000);

    // Carousel auto-rotate
    carouselInterval = setInterval(() => {
      carouselIdx = (carouselIdx + 1) % 3;
    }, 8000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(carouselInterval);
    };
  });

  onDestroy(() => {
    disconnectSocket();
    clearInterval(timeInterval);
    clearInterval(carouselInterval);
  });

  // Sparkline — last 12 values by minute buckets
  $: sparkData = (() => {
    const buckets = new Array(12).fill(0);
    const now = Date.now();
    events.forEach(e => {
      const ms = e.timestampMs || 0;
      const minutesAgo = Math.floor((now - ms) / 60000);
      if (minutesAgo >= 0 && minutesAgo < 12) {
        buckets[11 - minutesAgo]++;
      }
    });
    return buckets;
  })();

  $: maxSpark = Math.max(...sparkData, 1);
</script>

<svelte:head>
  <title>SOC Monitor Wall | KKUSIEM</title>
  <style>
    body { margin: 0; overflow: hidden; background: #030711; }
  </style>
</svelte:head>

<!-- Scanline overlay -->
<div class="scanlines"></div>

<div class="monitor-wrap">

  <!-- ═══ TOP BAR ═══════════════════════════════════════════════════════════ -->
  <div class="top-bar">
    <div class="top-brand">
      <div class="brand-icon"><i class="ti ti-radar"></i></div>
      <div>
        <div class="brand-name">KKUSIEM</div>
        <div class="brand-sub">Security Operations Center</div>
      </div>
    </div>

    <div class="top-kpis">
      <div class="top-kpi red"><span class="tkpi-num">{critical}</span><span class="tkpi-lbl">CRITICAL</span></div>
      <div class="top-kpi orange"><span class="tkpi-num">{high}</span><span class="tkpi-lbl">HIGH</span></div>
      <div class="top-kpi yellow"><span class="tkpi-num">{medium}</span><span class="tkpi-lbl">MEDIUM</span></div>
      <div class="top-kpi blue"><span class="tkpi-num">{uniqueIPs}</span><span class="tkpi-lbl">UNIQUE IPs</span></div>
      <div class="top-kpi green"><span class="tkpi-num">{uniqueCountries}</span><span class="tkpi-lbl">COUNTRIES</span></div>
    </div>

    <div class="top-right">
      <div class="conn-dot {connected ? 'on' : 'off'}"></div>
      <div class="clock-wrap">
        <div class="clock-time">{currentTime}</div>
        <div class="clock-date">{currentDate}</div>
      </div>
    </div>
  </div>

  <!-- ═══ MAIN GRID ══════════════════════════════════════════════════════════ -->
  <div class="main-grid">

    <!-- ── Q1: Live Attack Feed ── -->
    <div class="panel panel-q1">
      <div class="panel-head">
        <span><i class="ti ti-activity"></i> Live Attack Feed</span>
        <span class="live-badge"><span class="ldot"></span> LIVE</span>
      </div>
      <div class="feed-list">
        {#each recentAlerts as e}
        <div class="feed-item" style="border-left: 2px solid {sevColor(e.severity)};">
          <div class="feed-time">{e.timeStr || '--:--'}</div>
          <div class="feed-body">
            <div class="feed-ip">{e.ip} <span class="feed-flag">{countryFlag(e.country || 'Local Network')}</span></div>
            <div class="feed-type">{e.type}</div>
          </div>
          <div class="feed-sev" style="color:{sevColor(e.severity)}">{e.severity?.toUpperCase()}</div>
        </div>
        {/each}
        {#if !recentAlerts.length}
          <div class="no-feed"><i class="ti ti-shield-check"></i> ไม่มี Critical/High alerts</div>
        {/if}
      </div>
    </div>

    <!-- ── Q2: Big Stats + Sparkline ── -->
    <div class="panel panel-q2">
      <div class="panel-head">
        <span><i class="ti ti-chart-bar"></i> Event Statistics</span>
        <span class="eps-chip">{total} Events</span>
      </div>

      <div class="big-stats">
        <div class="big-stat">
          <div class="big-num" style="color:#ef4444">{total.toLocaleString()}</div>
          <div class="big-lbl">TOTAL EVENTS</div>
        </div>
        <div class="stat-divider"></div>
        <div class="big-stat">
          <div class="big-num" style="color:#f97316">{critical.toLocaleString()}</div>
          <div class="big-lbl">CRITICAL</div>
        </div>
        <div class="stat-divider"></div>
        <div class="big-stat">
          <div class="big-num" style="color:#3b82f6">{uniqueIPs.toLocaleString()}</div>
          <div class="big-lbl">UNIQUE IPs</div>
        </div>
      </div>

      <!-- Sparkline -->
      <div class="spark-wrap">
        <div class="spark-title">Events / Minute (last 12 min)</div>
        <div class="sparkline">
          {#each sparkData as val, i}
          <div class="spark-bar"
            style="height:{Math.round((val/maxSpark)*100)}%;
                   background:{val===0?'rgba(255,255,255,0.05)':val>5?'#ef4444':val>2?'#f97316':'#1d9e75'};"
            title="{val} events">
          </div>
          {/each}
        </div>
        <div class="spark-labels">
          {#each ['-12m','-10m','-8m','-6m','-4m','-2m','now'] as l}
          <span>{l}</span>{/each}
        </div>
      </div>

      <!-- Severity bar -->
      <div class="sev-bar-wrap">
        {#if total > 0}
          <div class="sev-bar">
            <div class="sev-seg" style="width:{(critical/total*100).toFixed(1)}%;background:#ef4444" title="Critical"></div>
            <div class="sev-seg" style="width:{(high/total*100).toFixed(1)}%;background:#f97316" title="High"></div>
            <div class="sev-seg" style="width:{(medium/total*100).toFixed(1)}%;background:#f59e0b" title="Medium"></div>
            <div class="sev-seg" style="flex:1;background:#1d9e75" title="Low"></div>
          </div>
          <div class="sev-legend">
            <span style="color:#ef4444">■ Critical {critical}</span>
            <span style="color:#f97316">■ High {high}</span>
            <span style="color:#f59e0b">■ Medium {medium}</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- ── Q3: Top Attackers ── -->
    <div class="panel panel-q3">
      <div class="panel-head">
        <span><i class="ti ti-skull"></i> Top Attacker IPs</span>
        <span class="panel-badge">{topIPs.length} unique</span>
      </div>
      <div class="leaderboard">
        {#each topIPs as [ip, count], i}
        <div class="leader-row">
          <div class="leader-rank" style="color:{i===0?'#ef4444':i<3?'#f97316':'var(--text-muted)'}">
            {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
          </div>
          <div class="leader-info">
            <div class="leader-ip">{ip}</div>
            <div class="leader-bar-wrap">
              <div class="leader-bar"
                style="width:{Math.round(count/topIPs[0][1]*100)}%;
                       background:{i===0?'#ef4444':i<3?'#f97316':'#3b82f6'};">
              </div>
            </div>
          </div>
          <div class="leader-count">{count}</div>
        </div>
        {/each}
        {#if !topIPs.length}
          <div class="no-feed"><i class="ti ti-database-off"></i> ยังไม่มีข้อมูล</div>
        {/if}
      </div>
    </div>

    <!-- ── Q4: Country Map + Recent ── -->
    <div class="panel panel-q4">
      <div class="panel-head">
        <span><i class="ti ti-world"></i> Source Countries</span>
        <a href="/dashboard/outbound-monitor" target="_blank" class="link-btn">
          <i class="ti ti-external-link"></i> Full Monitor
        </a>
      </div>
      <div class="country-grid">
        {#each topCountries as [country, count]}
        <div class="country-chip">
          <div class="cc-flag">{countryFlag(country)}</div>
          <div class="cc-info">
            <div class="cc-name">{country}</div>
            <div class="cc-bar-w"><div class="cc-bar" style="width:{Math.round(count/total*100)}%;"></div></div>
          </div>
          <div class="cc-num">{count}</div>
        </div>
        {/each}
      </div>

      <div class="panel-head" style="margin-top:12px;">
        <span><i class="ti ti-list"></i> Recent Events</span>
      </div>
      <div class="recent-list">
        {#each recentAll as e}
        <div class="recent-row" style="border-left:2px solid {sevColor(e.severity)}">
          <span class="recent-time">{e.timeStr}</span>
          <span class="recent-ip">{e.ip}</span>
          <span class="recent-type">{e.type}</span>
        </div>
        {/each}
      </div>
    </div>

  </div>

  <!-- ═══ BOTTOM BAR ═══════════════════════════════════════════════════════ -->
  <div class="bottom-bar">
    <div class="bb-left">
      <span class="bb-item"><i class="ti ti-radar"></i> KKUSIEM SOC Monitor</span>
      <span class="bb-sep">|</span>
      <span class="bb-item" style="color:{connected?'#10b981':'#ef4444'}">
        <i class="ti ti-{connected?'wifi':'wifi-off'}"></i>
        {connected ? 'CONNECTED — Real-time' : 'DISCONNECTED'}
      </span>
    </div>
    <div class="bb-right">
      <a href="/dashboard" class="exit-btn"><i class="ti ti-layout-dashboard"></i> Back to Dashboard</a>
    </div>
  </div>
</div>

<style>
  /* ── Base ── */
  .monitor-wrap {
    width: 100vw; height: 100vh;
    background: #030711;
    display: flex; flex-direction: column;
    font-family: 'Inter', 'Noto Sans Thai', sans-serif;
    color: #e8eaf0;
    overflow: hidden;
    position: relative;
  }
  .scanlines {
    position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    background: repeating-linear-gradient(
      0deg,
      rgba(0,0,0,0) 0px, rgba(0,0,0,0) 1px,
      rgba(0,0,0,0.03) 1px, rgba(0,0,0,0.03) 2px
    );
  }

  /* ── Top Bar ── */
  .top-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 20px;
    background: rgba(0,0,0,0.4);
    border-bottom: 1px solid rgba(29,158,117,0.3);
    flex-shrink: 0;
  }
  .top-brand { display: flex; align-items: center; gap: 12px; }
  .brand-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(29,158,117,0.15);
    border: 1px solid rgba(29,158,117,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; color: #1d9e75;
    box-shadow: 0 0 16px rgba(29,158,117,0.3);
  }
  .brand-name { font-size: 16px; font-weight: 900; letter-spacing: 0.15em; color: #1d9e75; }
  .brand-sub { font-size: 10px; color: #5a6478; letter-spacing: 0.1em; text-transform: uppercase; }

  .top-kpis { display: flex; gap: 8px; }
  .top-kpi {
    display: flex; flex-direction: column; align-items: center;
    padding: 6px 14px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    min-width: 64px;
  }
  .top-kpi.red    { border-color: rgba(239,68,68,0.3);  background: rgba(239,68,68,0.06);  }
  .top-kpi.orange { border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.06); }
  .top-kpi.yellow { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.06); }
  .top-kpi.blue   { border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.06); }
  .top-kpi.green  { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.06); }
  .tkpi-num { font-size: 20px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
  .top-kpi.red    .tkpi-num { color: #ef4444; }
  .top-kpi.orange .tkpi-num { color: #f97316; }
  .top-kpi.yellow .tkpi-num { color: #f59e0b; }
  .top-kpi.blue   .tkpi-num { color: #3b82f6; }
  .top-kpi.green  .tkpi-num { color: #10b981; }
  .tkpi-lbl { font-size: 9px; color: #5a6478; letter-spacing: 0.1em; margin-top: 2px; }

  .top-right { display: flex; align-items: center; gap: 12px; }
  .conn-dot {
    width: 10px; height: 10px; border-radius: 50%;
    animation: blink 1.5s ease-in-out infinite;
  }
  .conn-dot.on  { background: #10b981; box-shadow: 0 0 8px #10b981; }
  .conn-dot.off { background: #ef4444; box-shadow: 0 0 8px #ef4444; animation: none; }
  @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
  .clock-time { font-size: 22px; font-weight: 900; font-family: 'JetBrains Mono', monospace; color: #00ff88; letter-spacing: 0.05em; line-height: 1; }
  .clock-date { font-size: 10px; color: #5a6478; margin-top: 2px; }

  /* ── Main Grid ── */
  .main-grid {
    flex: 1; min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 8px;
    padding: 8px;
  }
  .panel {
    background: rgba(10,15,28,0.8);
    border: 1px solid rgba(29,158,117,0.15);
    border-radius: 12px;
    display: flex; flex-direction: column;
    overflow: hidden;
    position: relative;
  }
  .panel::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
    background: linear-gradient(90deg, transparent, rgba(29,158,117,0.5), transparent);
  }
  .panel-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #5a6478;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }
  .panel-head i { margin-right: 6px; color: #1d9e75; }
  .panel-badge { font-size: 10px; color: #1d9e75; background: rgba(29,158,117,0.1); border: 1px solid rgba(29,158,117,0.3); border-radius: 10px; padding: 2px 8px; }
  .live-badge { display: flex; align-items: center; gap: 5px; color: #ef4444; font-size: 10px; font-weight: 700; }
  .ldot { width: 6px; height: 6px; border-radius: 50%; background: #ef4444; animation: blink 0.8s ease-in-out infinite; }
  .eps-chip { font-size: 10px; color: #1d9e75; }
  .link-btn { font-size: 10px; color: #3b82f6; display: flex; align-items: center; gap: 4px; text-decoration: none; }
  .link-btn:hover { color: #60a5fa; }

  /* ── Q1 Feed ── */
  .feed-list { flex: 1; overflow-y: auto; scrollbar-width: thin; padding: 6px 0; }
  .feed-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    animation: slideInLeft 0.3s ease;
  }
  @keyframes slideInLeft { from{transform:translateX(-10px);opacity:0}to{transform:translateX(0);opacity:1} }
  .feed-time { font-size: 10px; color: #5a6478; font-family: monospace; min-width: 60px; }
  .feed-body { flex: 1; min-width: 0; }
  .feed-ip { font-size: 12px; font-weight: 700; color: #e8eaf0; font-family: monospace; }
  .feed-flag { font-size: 12px; }
  .feed-type { font-size: 10px; color: #5a6478; margin-top: 1px; }
  .feed-sev { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; }
  .no-feed { text-align: center; color: #3d4558; padding: 30px; font-size: 12px; }

  /* ── Q2 Stats ── */
  .big-stats {
    display: flex; align-items: center; justify-content: space-around;
    padding: 16px 14px;
    flex-shrink: 0;
  }
  .big-stat { text-align: center; }
  .big-num { font-size: 48px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
  .big-lbl { font-size: 10px; color: #5a6478; letter-spacing: 0.12em; margin-top: 4px; }
  .stat-divider { width: 1px; height: 60px; background: rgba(255,255,255,0.08); }

  .spark-wrap { padding: 0 14px 10px; flex-shrink: 0; }
  .spark-title { font-size: 10px; color: #5a6478; margin-bottom: 6px; }
  .sparkline { display: flex; align-items: flex-end; gap: 3px; height: 50px; }
  .spark-bar { flex: 1; border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.5s; }
  .spark-labels { display: flex; justify-content: space-between; font-size: 9px; color: #3d4558; margin-top: 4px; }

  .sev-bar-wrap { padding: 0 14px 12px; flex-shrink: 0; }
  .sev-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 1px; }
  .sev-seg { transition: width 0.5s; }
  .sev-legend { display: flex; gap: 12px; margin-top: 6px; font-size: 10px; color: #5a6478; }

  /* ── Q3 Leaderboard ── */
  .leaderboard { flex: 1; overflow-y: auto; scrollbar-width: thin; padding: 8px 0; }
  .leader-row { display: flex; align-items: center; gap: 8px; padding: 7px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .leader-rank { font-size: 14px; width: 28px; text-align: center; flex-shrink: 0; }
  .leader-info { flex: 1; min-width: 0; }
  .leader-ip { font-family: monospace; font-size: 12px; font-weight: 600; color: #e8eaf0; margin-bottom: 4px; }
  .leader-bar-wrap { height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
  .leader-bar { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .leader-count { font-size: 14px; font-weight: 800; color: #e8eaf0; font-variant-numeric: tabular-nums; flex-shrink: 0; }

  /* ── Q4 ── */
  .country-grid { display: flex; flex-direction: column; gap: 6px; padding: 8px 14px; flex-shrink: 0; }
  .country-chip { display: flex; align-items: center; gap: 8px; }
  .cc-flag { font-size: 14px; width: 20px; }
  .cc-info { flex: 1; min-width: 0; }
  .cc-name { font-size: 11px; color: #a0a8b8; margin-bottom: 3px; }
  .cc-bar-w { height: 3px; background: rgba(255,255,255,0.05); border-radius: 2px; }
  .cc-bar { height: 100%; background: #1d9e75; border-radius: 2px; transition: width 0.5s; }
  .cc-num { font-size: 12px; font-weight: 700; color: #e8eaf0; min-width: 28px; text-align: right; }

  .recent-list { flex: 1; overflow-y: auto; scrollbar-width: thin; padding: 4px 0; }
  .recent-row { display: flex; gap: 10px; align-items: center; padding: 5px 14px; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 10px; }
  .recent-time { color: #5a6478; font-family: monospace; min-width: 55px; }
  .recent-ip { font-family: monospace; color: #e8eaf0; min-width: 100px; }
  .recent-type { color: #5a6478; }

  /* ── Bottom Bar ── */
  .bottom-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 20px;
    background: rgba(0,0,0,0.4);
    border-top: 1px solid rgba(29,158,117,0.2);
    flex-shrink: 0;
  }
  .bb-left { display: flex; align-items: center; gap: 10px; font-size: 11px; color: #3d4558; }
  .bb-sep { color: #1d1d1d; }
  .bb-item { display: flex; align-items: center; gap: 5px; }
  .exit-btn {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: #5a6478;
    padding: 5px 12px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    text-decoration: none; transition: all 0.2s;
  }
  .exit-btn:hover { color: #e8eaf0; background: rgba(255,255,255,0.07); }
</style>
