<script lang="ts">
  import PageHeader from '../../lib/components/PageHeader.svelte';
  import { onDestroy } from 'svelte';
  import { eventsStore, connectionState } from '../../stores/events';
  import { formatEventTime } from '../../lib/formatTime';
  import { getFacultyForIP } from '../../stores/faculties';
  import { themeStore } from '../../stores/theme';

  // ─── Attack entity field reference (from backend/src/entities/attack.entity.ts)
  // e.id, e.ip, e.type, e.severity, e.detail, e.country, e.threatScore,
  // e.mitreCode, e.status, e.sessionId, e.timestampMs, e.timeStr, e.createdAt
  // NOTE: e.timeStr = "DD/MM/YYYY HH:MM:SS" (Bangkok), e.timestampMs = unix ms

  function getEventTs(e: any): number {
    if (e.timestampMs) return Number(e.timestampMs);
    if (e.createdAt)   return new Date(e.createdAt).getTime();
    return 0;
  }

  // ─── Raw Events ──────────────────────────────────────────────────────────────
  let events: any[] = [];
  const unsub = eventsStore.subscribe(v => { events = v; });

  // ─── Chart Instances ─────────────────────────────────────────────────────────
  let timelineChart: any;
  let typeChart: any;
  let radarChart: any;
  let polarChart: any;

  let timelineCanvas: HTMLCanvasElement;
  let typeCanvas: HTMLCanvasElement;
  let radarCanvas: HTMLCanvasElement;
  let polarCanvas: HTMLCanvasElement;

  // ─── Derived Stats (using real backend fields) ────────────────────────────────
  $: totalEvents    = events.length;
  $: criticalEvents = events.filter((e: any) => e.severity === 'critical');
  // "blocked" = mitigation contains 'ban' or 'block', or type includes 'Block'
  $: blockedEvents  = events.filter((e: any) =>
    (e.mitigation && /ban|block/i.test(e.mitigation)) ||
    (e.type && /block/i.test(e.type))
  );
  $: sshEvents = events.filter((e: any) =>
    e.type && /ssh/i.test(e.type)
  );

  // ─── Counter Animation (browser-only — requestAnimationFrame not in Node) ────
  let dTotal = 0, dCrit = 0, dBlocked = 0, dSsh = 0;

  function animCount(start: number, target: number, set: (v: number) => void, ms = 700) {
    if (typeof requestAnimationFrame === 'undefined') { set(target); return; }
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - t0) / ms, 1);
      set(Math.round(start + (1 - Math.pow(1 - p, 3)) * (target - start)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  let pTotal = -1, pCrit = -1, pBlk = -1, pSsh = -1;

  $: { 
    if (totalEvents !== pTotal) { 
      if (pTotal === -1) { dTotal = totalEvents; } else { animCount(dTotal, totalEvents, v => dTotal = v); }
      pTotal = totalEvents; 
    } 
  }
  $: { 
    if (criticalEvents.length !== pCrit) { 
      if (pCrit === -1) { dCrit = criticalEvents.length; } else { animCount(dCrit, criticalEvents.length, v => dCrit = v); }
      pCrit = criticalEvents.length; 
    } 
  }
  $: { 
    if (blockedEvents.length !== pBlk) { 
      if (pBlk === -1) { dBlocked = blockedEvents.length; } else { animCount(dBlocked, blockedEvents.length, v => dBlocked = v); }
      pBlk = blockedEvents.length; 
    } 
  }
  $: { 
    if (sshEvents.length !== pSsh) { 
      if (pSsh === -1) { dSsh = sshEvents.length; } else { animCount(dSsh, sshEvents.length, v => dSsh = v); }
      pSsh = sshEvents.length; 
    } 
  }

  // ─── Faculty Ranking (internal IPs via CIDR lookup) ──────────────────────────
  $: facultyRanking = (() => {
    const m: Record<string, { name: string; count: number }> = {};
    events.forEach(e => {
      const fac = getFacultyForIP(e.ip);
      if (fac) {
        if (!m[fac.code]) m[fac.code] = { name: fac.name, count: 0 };
        m[fac.code].count++;
      }
    });
    return Object.entries(m).map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.count - a.count).slice(0, 7);
  })();
  $: facMax = facultyRanking[0]?.count || 1;

  // ─── Country Ranking (real e.country field from backend) ─────────────────────
  $: countryRanking = (() => {
    const m: Record<string, number> = {};
    events.forEach(e => {
      const c = e.country;
      if (c && c !== 'Local Network') m[c] = (m[c] || 0) + 1;
    });
    return Object.entries(m).map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count).slice(0, 7);
  })();
  $: cntMax = countryRanking[0]?.count || 1;

  // ─── Last event timestamp ─────────────────────────────────────────────────────
  $: lastEventLabel = events.length > 0
    ? formatEventTime(events[0].timeStr || events[0].createdAt)
    : 'No events';

  // ─── Ticker feed ─────────────────────────────────────────────────────────────
  $: tickerItems = events.slice(0, 25);

  function sevColor(sev: string) {
    switch ((sev || '').toLowerCase()) {
      case 'critical': return '#ef4444';
      case 'high':     return '#f97316';
      case 'medium':   return '#f59e0b';
      case 'low':      return '#3b82f6';
      default:         return '#6b7280';
    }
  }

  // ─── Charts ──────────────────────────────────────────────────────────────────
  let prevTheme = '';
  $: if (timelineCanvas && typeCanvas && radarCanvas && polarCanvas && events && $themeStore) {
    if ($themeStore !== prevTheme) {
      prevTheme = $themeStore;
      if (timelineChart) timelineChart.destroy(); timelineChart = null;
      if (typeChart) typeChart.destroy(); typeChart = null;
      if (radarChart) radarChart.destroy(); radarChart = null;
      if (polarChart) polarChart.destroy(); polarChart = null;
    }
    buildCharts();
  }

  function isDark() {
    return $themeStore === 'dark';
  }

  function buildCharts() {
    if (!timelineCanvas) return;
    const dark      = isDark();
    const grid      = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    const label     = dark ? '#d1d5db' : '#6b7280';
    const tipBg     = dark ? '#111827' : '#ffffff';
    const tipColor  = dark ? '#f3f4f6' : '#111827';
    const panelBg   = dark ? '#1f2937' : '#ffffff';

    // ── Timeline: 24-hour area, using e.timestampMs or e.createdAt ──────────
    const now = Date.now();
    const buckets = Array(24).fill(0);
    const bucketLabels = Array.from({ length: 24 }, (_, i) => {
      const h = new Date(now - (23 - i) * 3_600_000).getHours();
      return `${String(h).padStart(2, '0')}:00`;
    });
    events.forEach(e => {
      const ts = getEventTs(e);
      const diffH = (now - ts) / 3_600_000;
      if (diffH >= 0 && diffH < 24) buckets[23 - Math.floor(diffH)]++;
    });

    if (!timelineChart) {
      import('chart.js/auto').then(({ default: Chart }) => {
        const ctx = timelineCanvas.getContext('2d')!;
        const grad = ctx.createLinearGradient(0, 0, 0, 200);
        grad.addColorStop(0, 'rgba(59,130,246,0.40)');
        grad.addColorStop(1, 'rgba(59,130,246,0.02)');

        timelineChart = new Chart(timelineCanvas, {
          type: 'line',
          data: {
            labels: bucketLabels,
            datasets: [{
              data: buckets, fill: true,
              backgroundColor: grad,
              borderColor: '#3b82f6', borderWidth: 2,
              pointRadius: 0, pointHoverRadius: 4, tension: 0.4,
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { backgroundColor: tipBg, titleColor: label, bodyColor: tipColor, borderColor: grid, borderWidth: 1, padding: 8 }
            },
            scales: {
              y: { beginAtZero: true, grid: { color: grid }, ticks: { color: label, stepSize: 1 } },
              x: { grid: { display: false }, ticks: { color: label, maxTicksLimit: 12, maxRotation: 0 } }
            }
          }
        });

        buildSmallCharts(Chart, dark, grid, label, tipBg, tipColor, panelBg);
      });
    } else {
      timelineChart.data.labels = bucketLabels;
      timelineChart.data.datasets[0].data = buckets;
      timelineChart.update('none');
      patchSmallCharts();
    }
  }

  function buildSmallCharts(Chart: any, dark: boolean, grid: string, label: string, tipBg: string, tipColor: string, panelBg: string) {
    // ── Doughnut: Attack Types ────────────────────────────────────────────────
    const tm: Record<string, number> = {};
    events.forEach(e => { const t = e.type || 'Unknown'; tm[t] = (tm[t] || 0) + 1; });
    const sorted = Object.entries(tm).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const typeTotal = sorted.reduce((s, x) => s + x[1], 0);

    typeChart = new Chart(typeCanvas, {
      type: 'doughnut',
      data: {
        labels: sorted.map(x => x[0]),
        datasets: [{ data: sorted.map(x => x[1]),
          backgroundColor: ['#ef4444','#f97316','#3b82f6','#8b5cf6','#10b981','#f59e0b'],
          borderWidth: 2, borderColor: panelBg, hoverOffset: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '66%',
        plugins: {
          legend: { position: 'bottom', labels: { color: label, boxWidth: 10, padding: 10, font: { size: 10 } } },
          tooltip: { backgroundColor: tipBg, titleColor: label, bodyColor: tipColor, borderColor: grid, borderWidth: 1 }
        }
      },
      plugins: [{
        id: 'centerLabel',
        afterDraw(chart: any) {
          const { ctx, chartArea: { width, height, left, top } } = chart;
          ctx.save();
          const cx = left + width / 2, cy = top + height / 2;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = dark ? '#e8eaf0' : '#111827';
          ctx.font = 'bold 22px Inter,sans-serif';
          ctx.fillText(String(typeTotal), cx, cy - 7);
          ctx.fillStyle = label;
          ctx.font = '10px Inter,sans-serif';
          ctx.fillText('events', cx, cy + 10);
          ctx.restore();
        }
      }]
    });

    // ── Radar: Attack Vectors ─────────────────────────────────────────────────
    const vec: Record<string, number> = { Network: 0, Application: 0, Endpoint: 0, Identity: 0, Cloud: 0 };
    events.forEach(e => {
      const t = (e.type || '').toLowerCase();
      if (/sql|web|xss|http/.test(t))          vec.Application++;
      else if (/ssh|login|auth|brute/.test(t)) vec.Identity++;
      else if (/malware|virus|process/.test(t)) vec.Endpoint++;
      else if (/cloud|aws|s3/.test(t))          vec.Cloud++;
      else                                       vec.Network++;
    });
    radarChart = new Chart(radarCanvas, {
      type: 'radar',
      data: {
        labels: Object.keys(vec),
        datasets: [{
          label: 'Threat Surface',
          data: Object.values(vec),
          backgroundColor: 'rgba(168,85,247,0.2)',
          borderColor: '#a855f7', pointBackgroundColor: '#a855f7',
          pointBorderColor: panelBg, pointRadius: 3, borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { beginAtZero: true, angleLines: { color: grid }, grid: { color: grid }, pointLabels: { color: label, font: { size: 10 } }, ticks: { display: false } } },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: tipBg, titleColor: label, bodyColor: tipColor, borderColor: grid, borderWidth: 1 } }
      }
    });

    // ── Polar: Severity ────────────────────────────────────────────────────────
    const sv: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    events.forEach(e => { const s = (e.severity || 'info').toLowerCase(); if (sv[s] !== undefined) sv[s]++; });
    polarChart = new Chart(polarCanvas, {
      type: 'polarArea',
      data: {
        labels: ['Critical','High','Medium','Low','Info'],
        datasets: [{ data: [sv.critical, sv.high, sv.medium, sv.low, sv.info],
          backgroundColor: ['rgba(239,68,68,.75)','rgba(249,115,22,.75)','rgba(245,158,11,.75)','rgba(59,130,246,.75)','rgba(16,185,129,.75)'],
          borderWidth: 1, borderColor: panelBg }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { display: false } },
        plugins: {
          legend: { position: 'bottom', labels: { color: label, boxWidth: 10, padding: 10, font: { size: 10 } } },
          tooltip: { backgroundColor: tipBg, titleColor: label, bodyColor: tipColor, borderColor: grid, borderWidth: 1 }
        }
      }
    });
  }

  function patchSmallCharts() {
    if (!typeChart || !radarChart || !polarChart) return;

    const tm: Record<string, number> = {};
    events.forEach(e => { const t = e.type || 'Unknown'; tm[t] = (tm[t] || 0) + 1; });
    const sorted = Object.entries(tm).sort((a, b) => b[1] - a[1]).slice(0, 6);
    typeChart.data.labels = sorted.map(x => x[0]);
    typeChart.data.datasets[0].data = sorted.map(x => x[1]);
    typeChart.update('none');

    const vec: Record<string, number> = { Network: 0, Application: 0, Endpoint: 0, Identity: 0, Cloud: 0 };
    events.forEach(e => {
      const t = (e.type || '').toLowerCase();
      if (/sql|web|xss|http/.test(t))          vec.Application++;
      else if (/ssh|login|auth|brute/.test(t)) vec.Identity++;
      else if (/malware|virus|process/.test(t)) vec.Endpoint++;
      else if (/cloud|aws|s3/.test(t))          vec.Cloud++;
      else                                       vec.Network++;
    });
    radarChart.data.datasets[0].data = Object.values(vec);
    radarChart.update('none');

    const sv: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    events.forEach(e => { const s = (e.severity || 'info').toLowerCase(); if (sv[s] !== undefined) sv[s]++; });
    polarChart.data.datasets[0].data = [sv.critical, sv.high, sv.medium, sv.low, sv.info];
    polarChart.update('none');
  }

  onDestroy(() => {
    unsub();
    timelineChart?.destroy();
    typeChart?.destroy();
    radarChart?.destroy();
    polarChart?.destroy();
  });
</script>

<svelte:head><title>Dashboard – KKUSIEM</title></svelte:head>

<div class="dash">

  <!-- ── Header ──────────────────────────────────────────────────────────────── -->
  <PageHeader title="Overview Dashboard" description="High-level summary of system status and security metrics." icon="ti-layout-dashboard" />

  <!-- ── Health Bar ─────────────────────────────────────────────────────────── -->
  <div class="health-bar">
    <span class="dot dot-green"></span><span class="hl">SIEM Online</span>
    <span class="sep">|</span>
    <span class="dot {$connectionState ? 'dot-green' : 'dot-red'}"></span>
    <span class="hl">Live Feed: <b>{$connectionState ? 'Connected' : 'Disconnected'}</b></span>
    <span class="sep">|</span>
    <i class="ti ti-clock hl-icon"></i>
    <span class="hl">Last: <b>{lastEventLabel}</b></span>
    <span class="ml-auto hl"><i class="ti ti-database hl-icon"></i> <b>{totalEvents}</b> events</span>
  </div>

  <!-- ── KPI Cards ──────────────────────────────────────────────────────────── -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-top blue"></div>
      <div class="kpi-icon blue"><i class="ti ti-shield-lock"></i></div>
      <div class="kpi-body">
        <span class="kpi-label">Total Events (24h)</span>
        <span class="kpi-value">{dTotal.toLocaleString()}</span>
        <span class="kpi-sub">All honeypot sensors</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top red"></div>
      <div class="kpi-icon red pulsering"><i class="ti ti-alert-triangle"></i></div>
      <div class="kpi-body">
        <span class="kpi-label">Critical Incidents</span>
        <span class="kpi-value">{dCrit.toLocaleString()}</span>
        <span class="kpi-sub">Requires immediate action</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top orange"></div>
      <div class="kpi-icon orange"><i class="ti ti-terminal"></i></div>
      <div class="kpi-body">
        <span class="kpi-label">SSH Brute-Force</span>
        <span class="kpi-value">{dSsh.toLocaleString()}</span>
        <span class="kpi-sub">Port 22 attacks</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-top green"></div>
      <div class="kpi-icon green"><i class="ti ti-ban"></i></div>
      <div class="kpi-body">
        <span class="kpi-label">Auto-Blocked</span>
        <span class="kpi-value">{dBlocked.toLocaleString()}</span>
        <span class="kpi-sub">IP ban triggered</span>
      </div>
    </div>
  </div>

  <!-- ── Live Ticker ────────────────────────────────────────────────────────── -->
  {#if tickerItems.length > 0}
  <div class="ticker-wrap">
    <div class="ticker-badge"><i class="ti ti-antenna"></i> LIVE</div>
    <div class="ticker-track">
      <div class="ticker-inner">
        {#each [...tickerItems, ...tickerItems] as e}
          <span class="t-item">
            <span class="t-sev" style="color:{sevColor(e.severity)};border-color:{sevColor(e.severity)}44;background:{sevColor(e.severity)}18;">
              {(e.severity||'info').toUpperCase()}
            </span>
            <span class="t-ip">{e.ip}</span>
            <span class="t-type">{e.type||'Unknown'}</span>
            {#if e.country && e.country !== 'Local Network'}
              <span class="t-country">{e.country}</span>
            {/if}
            <span class="t-dot">·</span>
          </span>
        {/each}
      </div>
    </div>
  </div>
  {/if}

  <!-- ── Row: Timeline (half) + Attack Types (half) ───────────────────────── -->
  <div class="row2">
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-radar ci violet-c"></i> Attack Vectors</span>
      </div>
      <div class="chart-box" style="height:200px;">
        <canvas bind:this={typeCanvas}></canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-chart-polar ci orange-c"></i> Severity Split</span>
      </div>
      <div class="chart-box" style="height:200px;">
        <canvas bind:this={polarCanvas}></canvas>
      </div>
    </div>
  </div>

  <!-- ── Row: Attack Vectors + Severity Split ───────────────────────────────── -->
    <div class="row2">
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-chart-area-line ci blue-c"></i> Incident Activity — Last 24 Hours</span>
        <span class="hdr-badge">{totalEvents} events</span>
      </div>
      <div class="chart-box" style="height:200px;">
        <canvas bind:this={radarCanvas}></canvas>
      </div>
    </div>
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-chart-donut ci purple-c"></i> Attack Types</span>
      </div>
      <div class="chart-box" style="height:200px;">
        <canvas bind:this={timelineCanvas}></canvas>
      </div>
    </div>
  </div>
  

  <!-- ── Bottom Row (3 columns) ─────────────────────────────────────────────── -->
  <div class="row3">

    <!-- Faculty Ranking -->
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-building ci blue-c"></i> Top Targeted Faculties</span>
        <a href="/dashboard/network-map" class="hdr-link">Network Map <i class="ti ti-arrow-right"></i></a>
      </div>
      <div class="rank-body">
        {#if facultyRanking.length === 0}
          <div class="empty"><i class="ti ti-info-circle"></i> No internal IP data yet</div>
        {:else}
          {#each facultyRanking as f, i}
            <div class="rank-row">
              <span class="rnum" class:top3={i < 3}>{i+1}</span>
              <div class="rinfo">
                <span class="rname" title={f.name}>{f.name}</span>
                <div class="rbar-bg"><div class="rbar" style="width:{(f.count/facMax)*100}%;background:{i===0?'#ef4444':i===1?'#f97316':i===2?'#f59e0b':'#3b82f6'}"></div></div>
              </div>
              <span class="rcnt">{f.count}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Country Ranking -->
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-world ci green-c"></i> Top Attack Origins</span>
      </div>
      <div class="rank-body">
        {#if countryRanking.length === 0}
          <div class="empty"><i class="ti ti-info-circle"></i> No country data yet</div>
        {:else}
          {#each countryRanking as c, i}
            <div class="rank-row">
              <span class="rnum" class:top3={i < 3}>{i+1}</span>
              <div class="rinfo">
                <span class="rname">{c.country}</span>
                <div class="rbar-bg"><div class="rbar" style="width:{(c.count/cntMax)*100}%;background:{i===0?'#ef4444':i===1?'#f97316':i===2?'#f59e0b':'#10b981'}"></div></div>
              </div>
              <span class="rcnt">{c.count}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Recent Critical Events -->
    <div class="card">
      <div class="card-hdr">
        <span class="card-title"><i class="ti ti-alert-triangle ci red-c"></i> Recent Critical Events</span>
        <a href="/dashboard/explorer" class="hdr-link">View All <i class="ti ti-arrow-right"></i></a>
      </div>
      <div class="events-body">
        {#each criticalEvents.slice(0, 6) as e}
          <div class="ev-item">
            <div class="ev-accent"></div>
            <div class="ev-content">
              <div class="ev-row1">
                <span class="ev-ip"><i class="ti ti-map-pin"></i> {e.ip}</span>
                {#if e.country && e.country !== 'Local Network'}
                  <span class="ev-country">{e.country}</span>
                {/if}
              </div>
              <div class="ev-row2">
                <span class="ev-type">{e.type}</span>
                {#if e.mitreCode}
                  <span class="ev-mitre">{e.mitreCode}</span>
                {/if}
              </div>
              <div class="ev-row3">
                <span class="ev-time"><i class="ti ti-clock"></i> {formatEventTime(e.timeStr || e.createdAt)}</span>
                {#if e.organization}
                  <span class="ev-org"><i class="ti ti-building"></i> {e.organization}</span>
                {/if}
              </div>
            </div>
          </div>
        {/each}
        {#if criticalEvents.length === 0}
          <div class="empty" style="padding:32px 16px;">
            <i class="ti ti-shield-check" style="font-size:24px;color:#10b981;"></i>
            No critical events — all clear
          </div>
        {/if}
      </div>
    </div>

  </div><!-- /.row3 -->
</div><!-- /.dash -->

<style>
  /* ─── Layout ────────────────────────────────────────────────────────────── */
  .dash {
    display: flex; flex-direction: column; gap: 16px;
    padding: 10px 14px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* ─── Health Bar ─────────────────────────────────────────────────────────── */
  .health-bar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 8px 16px; font-size: 12px;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 8px; box-shadow: var(--shadow-sm);
    color: var(--text-secondary);
  }
  .hl { color: var(--text-secondary); }
  .hl b { color: var(--text-primary); }
  .hl-icon { font-size: 13px; color: var(--text-muted); }
  .sep { color: var(--border); font-size: 16px; }
  .ml-auto { margin-left: auto; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-green { background: #22c55e; box-shadow: 0 0 5px #22c55e; }
  .dot-red   { background: #ef4444; box-shadow: 0 0 5px #ef4444; }

  /* ─── KPI Cards ──────────────────────────────────────────────────────────── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
  }
  .kpi-card {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 16px 18px;
    display: flex; align-items: center; gap: 14px;
    box-shadow: var(--shadow-sm);
    transition: transform .18s, box-shadow .18s;
    position: relative; overflow: hidden;
  }
  .kpi-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }

  .kpi-top {
    position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 12px 12px 0 0;
  }
  .kpi-top.blue   { background: linear-gradient(90deg,#3b82f6,#60a5fa); }
  .kpi-top.red    { background: linear-gradient(90deg,#ef4444,#f87171); }
  .kpi-top.orange { background: linear-gradient(90deg,#f97316,#fb923c); }
  .kpi-top.green  { background: linear-gradient(90deg,#22c55e,#4ade80); }

  .kpi-icon {
    width: 46px; height: 46px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; flex-shrink: 0; position: relative;
  }
  .kpi-icon.blue   { background: rgba(59,130,246,.12);  color: #3b82f6; }
  .kpi-icon.red    { background: rgba(239,68,68,.12);   color: #ef4444; }
  .kpi-icon.orange { background: rgba(249,115,22,.12);  color: #f97316; }
  .kpi-icon.green  { background: rgba(34,197,94,.12);   color: #22c55e; }

  .pulsering::after {
    content: ''; position: absolute; inset: -4px; border-radius: 14px;
    border: 2px solid #ef4444; opacity: 0;
    animation: pulse 2s ease-out infinite;
  }
  @keyframes pulse { 0%{transform:scale(.85);opacity:.7} 100%{transform:scale(1.35);opacity:0} }

  .kpi-body  { display: flex; flex-direction: column; gap: 1px; }
  .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted); }
  .kpi-value { font-size: 30px; font-weight: 900; color: var(--text-primary); line-height: 1.1; font-variant-numeric: tabular-nums; }
  .kpi-sub   { font-size: 11px; color: var(--text-muted); }

  /* ─── Ticker ─────────────────────────────────────────────────────────────── */
  .ticker-wrap {
    display: flex; align-items: center;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden; height: 34px;
    box-shadow: var(--shadow-sm);
  }
  .ticker-badge {
    flex-shrink: 0; padding: 0 12px; height: 100%;
    display: flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 800; letter-spacing: .08em;
    color: #ef4444; background: rgba(239,68,68,.08);
    border-right: 1px solid var(--border);
  }
  .ticker-badge i { animation: blink 1.2s step-start infinite; }
  @keyframes blink { 0%,100%{opacity:1}50%{opacity:0} }

  .ticker-track { flex: 1; overflow: hidden; }
  .ticker-inner {
    display: flex; align-items: center; white-space: nowrap;
    animation: scroll 55s linear infinite;
  }
  .ticker-track:hover .ticker-inner { animation-play-state: paused; }
  @keyframes scroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }

  .t-item   { display: inline-flex; align-items: center; gap: 5px; padding: 0 14px; font-size: 11px; }
  .t-sev    { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 3px; border: 1px solid; }
  .t-ip     { font-family: monospace; font-weight: 700; color: var(--text-primary); }
  .t-type   { color: var(--text-secondary); }
  .t-country{ color: var(--text-muted); font-style: italic; }
  .t-dot    { color: var(--text-muted); margin: 0 2px; }

  /* ─── Cards ──────────────────────────────────────────────────────────────── */
  .card {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; box-shadow: var(--shadow-sm);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .card-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 16px; border-bottom: 1px solid var(--border);
    background: rgba(0,0,0,.015); flex-shrink: 0;
  }
  [data-theme="dark"] .card-hdr { background: rgba(255,255,255,.015); }

  .card-title { display: flex; align-items: center; gap: 7px; font-weight: 700; font-size: 13px; color: var(--text-primary); }
  .ci          { font-size: 14px; }
  .blue-c   { color: #3b82f6; }
  .purple-c { color: #a855f7; }
  .violet-c { color: #7c3aed; }
  .orange-c { color: #f97316; }
  .red-c    { color: #ef4444; }
  .green-c  { color: #22c55e; }

  .hdr-badge {
    font-size: 10px; font-weight: 700; padding: 2px 9px; border-radius: 20px;
    background: rgba(59,130,246,.1); color: #3b82f6;
  }
  .hdr-link {
    font-size: 11px; font-weight: 600; color: var(--text-muted);
    text-decoration: none; display: flex; align-items: center; gap: 3px; transition: color .15s;
  }
  .hdr-link:hover { color: #3b82f6; }

  /* Charts */
  .chart-box  { padding: 12px 16px; flex: 1; position: relative; }
  .chart-box canvas { width: 100% !important; height: 100% !important; }

  /* ─── 2-column row ───────────────────────────────────────────────────────── */
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  @media (max-width: 768px) {
    .row2 { grid-template-columns: 1fr; }
  }

  /* ─── 3-column row ───────────────────────────────────────────────────────── */
  .row3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
  }
  @media (max-width: 1024px) {
    .row3 { grid-template-columns: 1fr 1fr; }
    .row3 > .card:last-child { grid-column: span 2; }
  }
  @media (max-width: 640px) {
    .row3 { grid-template-columns: 1fr; }
    .row3 > .card:last-child { grid-column: span 1; }
  }


  /* ─── Ranking ────────────────────────────────────────────────────────────── */
  .rank-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 8px; }
  .rank-row  { display: flex; align-items: center; gap: 8px; }
  .rnum {
    width: 20px; height: 20px; border-radius: 5px; flex-shrink: 0;
    background: var(--bg-secondary); color: var(--text-muted);
    font-size: 10px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
  }
  .rnum.top3 { background: linear-gradient(135deg,#f59e0b,#ef4444); color: #fff; }
  .rinfo  { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .rname  { font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rbar-bg { width: 100%; height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
  .rbar   { height: 100%; border-radius: 2px; transition: width .5s ease; }
  .rcnt   { font-size: 12px; font-weight: 800; color: var(--text-primary); min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }

  /* ─── Events List ────────────────────────────────────────────────────────── */
  .events-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
  .ev-item {
    display: flex; border-radius: 7px;
    border: 1px solid var(--border); overflow: hidden;
    transition: border-color .15s;
  }
  .ev-item:hover { border-color: #ef4444; }
  .ev-accent  { width: 3px; flex-shrink: 0; background: #ef4444; }
  .ev-content { flex: 1; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
  .ev-row1 { display: flex; align-items: center; gap: 8px; }
  .ev-ip { font-family: monospace; font-size: 12px; font-weight: 700; color: #ef4444; display: flex; align-items: center; gap: 3px; }
  .ev-country { font-size: 10px; color: var(--text-muted); font-style: italic; }
  .ev-row2 { display: flex; align-items: center; gap: 6px; }
  .ev-type  { font-size: 11px; font-weight: 600; color: var(--text-primary); }
  .ev-mitre { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: rgba(168,85,247,.12); color: #a855f7; }
  .ev-row3  { display: flex; align-items: center; gap: 10px; }
  .ev-time, .ev-org { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 3px; }

  /* ─── Empty ──────────────────────────────────────────────────────────────── */
  .empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 6px; padding: 20px 12px; color: var(--text-muted); font-size: 12px; text-align: center;
  }
</style>
