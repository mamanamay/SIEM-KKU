<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore, roleStore } from '../../stores/events';
  
  // Chart State
  let attackChart: any;
  let chartLoaded = false;
  
  // Real-time events from Store
  $: events = $eventsStore;
  
  // Filter State
  let activeSev = 'all';
  let searchText = '';
  $: filteredEvents = events.filter(e => {
    const sevOk = activeSev === 'all' || e.severity === activeSev;
    const q = searchText.toLowerCase();
    const textOk = !q || (e.ip && e.ip.includes(q)) || (e.type && e.type.toLowerCase().includes(q)) || (e.detail && e.detail.toLowerCase().includes(q));
    return sevOk && textOk;
  });

  onMount(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => {
      chartLoaded = true;
      initChart();
      updateChart();
    };
    document.head.appendChild(script);

    // Initial chart update in case events are already loaded
    return () => {
      if (attackChart) attackChart.destroy();
    };
  });

  // Reactively update chart when events change
  $: if (chartLoaded && events.length >= 0) { updateChart(); }

  function initChart() {
    if (!document.getElementById('attackChart')) return;
    const ctx = document.getElementById('attackChart') as HTMLCanvasElement;
    // @ts-ignore
    attackChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['SSH Brute', 'SQL Inject', 'Web Scan', 'Command Execution', 'Port Scan'],
        datasets: [{ 
          label: 'Events', 
          data: [0,0,0,0,0], 
          backgroundColor: ['#a32d2d','#1d9e75','#185fa5','#854f0b','#533ab7'],
          borderRadius: 5
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  function updateChart() {
    if (!attackChart) return;
    let counts = { 'SSH Brute Force':0, 'SQL Inject':0, 'Web Scan':0, 'Command Execution':0, 'Port Scan':0 };
    events.forEach(e => {
      if (counts[e.type] !== undefined) counts[e.type]++;
      else counts['Port Scan']++;
    });
    attackChart.data.datasets[0].data = [
      counts['SSH Brute Force'], counts['SQL Inject'], counts['Web Scan'], counts['Command Execution'], counts['Port Scan']
    ];
    attackChart.update();
  }

  function setFilter(sev: string) { activeSev = sev; }
</script>

<div class="db-content">
  <!-- Metric Cards -->
  <div class="metrics">
    <div class="metric-card danger">
      <div class="metric-label"><i class="ti ti-alert-triangle"></i> Critical Alerts</div>
      <div class="metric-val">{events.filter(e => e.severity === 'critical').length}</div>
      <div class="metric-sub">จากการโจมตีทั้งหมด</div>
    </div>
    <div class="metric-card warn">
      <div class="metric-label"><i class="ti ti-activity"></i> Total Events</div>
      <div class="metric-val">{events.length}</div>
      <div class="metric-sub">บันทึกสดจาก Honeypot</div>
    </div>
    <div class="metric-card ok">
      <div class="metric-label"><i class="ti ti-flag"></i> Unique Sources</div>
      <div class="metric-val">{new Set(events.map(e => e.ip)).size}</div>
      <div class="metric-sub">ไอพีที่ไม่ซ้ำกัน</div>
    </div>
    <div class="metric-card info">
      <div class="metric-label"><i class="ti ti-shield-exclamation"></i> Filtered Results</div>
      <div class="metric-val">{filteredEvents.length}</div>
      <div class="metric-sub">{activeSev === 'all' ? 'แสดงทุก severity' : `กรอง: ${activeSev}`}</div>
    </div>
  </div>

  <!-- Filter Bar -->
  <div class="filter-bar">
    <span class="filter-label"><i class="ti ti-filter" style="font-size:13px"></i> Severity Filter</span>
    <div class="filter-divider"></div>
    <div class="filter-chips">
      <button class="chip {activeSev === 'all' ? 'active-all' : ''}" on:click={() => setFilter('all')}>All <span style="opacity:.6">({events.length})</span></button>
      <button class="chip {activeSev === 'critical' ? 'active-critical' : ''}" on:click={() => setFilter('critical')}>🔴 Critical <span style="opacity:.6">({events.filter(e=>e.severity==='critical').length})</span></button>
      <button class="chip {activeSev === 'high' ? 'active-high' : ''}" on:click={() => setFilter('high')}>🟠 High <span style="opacity:.6">({events.filter(e=>e.severity==='high').length})</span></button>
      <button class="chip {activeSev === 'medium' ? 'active-medium' : ''}" on:click={() => setFilter('medium')}>🔵 Medium <span style="opacity:.6">({events.filter(e=>e.severity==='medium').length})</span></button>
      <button class="chip {activeSev === 'low' ? 'active-low' : ''}" on:click={() => setFilter('low')}>🟢 Low <span style="opacity:.6">({events.filter(e=>e.severity==='low').length})</span></button>
    </div>
    <div class="filter-right">
      <div class="search-wrap">
        <i class="ti ti-search"></i>
        <input type="text" class="filter-search" bind:value={searchText} placeholder="ค้นหา IP, ประเภท...">
      </div>
    </div>
  </div>

  <!-- Main Grid -->
  <div class="grid3">
    <!-- Events Table -->
    <div class="panel">
      <div class="panel-title">
        <span><i class="ti ti-list"></i> Recent Attack Events</span>
        <span class="badge-count">{filteredEvents.length} events</span>
      </div>
      <table class="log-table">
        <thead>
          <tr>
            <th>เวลา</th>
            <th>Source IP</th>
            <th>ประเภท</th>
            <th>Severity</th>
            <th>รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredEvents.slice(0, 8) as event}
          <tr>
            <td class="ip-mono">{event.time || event.timeStr}</td>
            <td class="ip-mono">{event.ip}</td>
            <td><span class="type-badge">{event.type}</span></td>
            <td><span class="sev {event.severity}">{event.severity}</span></td>
            <td style="font-size:11px;color:var(--text-secondary)">{event.detail}</td>
          </tr>
          {/each}
        </tbody>
      </table>
      {#if filteredEvents.length > 8}
      <div style="text-align:center; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 12px;">
        <a href="/dashboard/logs" style="font-size:12px; color:var(--blue); text-decoration:none; font-weight:500;">ดูข้อมูลทั้งหมด &rarr;</a>
      </div>
      {/if}
      {#if filteredEvents.length === 0}
      <div class="empty-state">
        <i class="ti ti-inbox"></i>
        ไม่พบ event ที่ตรงกับตัวกรองที่เลือก
      </div>
      {/if}
    </div>

    <!-- Side column -->
    <div class="side-col">
      <!-- Attack Chain -->
      <div class="panel">
        <div class="panel-title"><span><i class="ti ti-timeline"></i> System Services</span></div>
        <div>
          <div class="chain-step">
            <div class="chain-head">
              <div class="chain-num" style="background:var(--green-bg);color:var(--green)"><i class="ti ti-check"></i></div>
              <span>Cowrie Honeypot</span>
            </div>
            <div class="chain-desc">Port 2222 (SSH) is listening for attackers.</div>
          </div>
          <div class="chain-step">
            <div class="chain-head">
              <div class="chain-num" style="background:var(--blue-bg);color:var(--blue)"><i class="ti ti-database"></i></div>
              <span>PostgreSQL & Redis</span>
            </div>
            <div class="chain-desc">Data synchronization running optimally.</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Charts Row -->
  <div class="grid2">
    <div class="panel">
      <div class="panel-title"><span><i class="ti ti-chart-bar"></i> Attack Distribution by Type</span></div>
      <div style="position:relative;width:100%;height:200px">
        <canvas id="attackChart"></canvas>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title"><span><i class="ti ti-clock"></i> Timeline Overview</span></div>
      <div class="tl-list" style="margin-top:12px">
        {#each events.slice(0, 3) as ev}
        <div class="tl-item">
          <span class="tl-dot {ev.severity}"></span>
          <span class="tl-time">{ev.time || ev.timeStr}</span>
          <div><div class="tl-text">{ev.type} detected</div><div class="tl-sub">{ev.ip} — {ev.detail}</div></div>
        </div>
        {/each}
        {#if events.length === 0}
        <div style="font-size:12px; color:var(--text-muted); padding:1rem;">Waiting for incoming attacks...</div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
.db-content { max-width: 1400px; margin: 0 auto; padding-bottom: 2rem; }

/* ── Metric Cards ── */
.metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 1.25rem; }
.metric-card {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: .875rem 1rem;
  box-shadow: var(--shadow-sm);
  position: relative; overflow: hidden;
}
.metric-card::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0;
  width: 3px; border-radius: 0 2px 2px 0;
}
.metric-card.danger::before { background: var(--red); }
.metric-card.warn::before   { background: var(--orange); }
.metric-card.ok::before     { background: var(--green); }
.metric-card.info::before   { background: var(--blue); }
.metric-label { font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
.metric-val { font-size: 28px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
.metric-card.danger .metric-val { color: var(--red); }
.metric-card.warn   .metric-val { color: var(--orange); }
.metric-card.ok     .metric-val { color: var(--green); }
.metric-card.info   .metric-val { color: var(--blue); }
.metric-sub { font-size: 11px; color: var(--text-muted); margin-top: 5px; }

/* ── Filter Bar ── */
.filter-bar {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: .625rem 1rem;
  margin-bottom: 1.25rem; flex-wrap: wrap;
  box-shadow: var(--shadow-sm);
}
.filter-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.filter-divider { width: 1px; height: 20px; background: var(--border); }
.filter-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  font-size: 11.5px; font-weight: 500;
  padding: 4px 12px; border-radius: 20px;
  border: 1px solid transparent; cursor: pointer;
  transition: all .15s; background: var(--bg-secondary); color: var(--text-secondary);
  user-select: none;
}
.chip:hover { border-color: var(--border); }
.chip.active-all    { background: var(--text-primary); color: var(--bg); }
.chip.active-critical { background: var(--red-bg); color: var(--red); border-color: rgba(163,45,45,0.3); }
.chip.active-high   { background: var(--orange-bg); color: var(--orange); border-color: rgba(133,79,11,0.3); }
.chip.active-medium { background: var(--blue-bg); color: var(--blue); border-color: rgba(24,95,165,0.3); }
.chip.active-low    { background: #eaf3de; color: #3b6d11; border-color: rgba(59,109,17,0.3); }
.filter-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.filter-search {
  font-size: 12px; padding: 5px 10px 5px 30px;
  border: 1px solid var(--border); border-radius: 20px;
  background: var(--bg-secondary); color: var(--text-primary);
  outline: none; width: 180px;
  transition: border-color .15s;
  position: relative;
}
.filter-search:focus { border-color: var(--green); }
.search-wrap { position: relative; }
.search-wrap .ti { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 13px; pointer-events: none; }

/* ── Panels ── */
.grid3 { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 10px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.side-col { display: flex; flex-direction: column; gap: 10px; }
.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1rem 1.25rem;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column;
}
.panel-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  margin-bottom: .875rem; display: flex; align-items: center; justify-content: space-between;
}
.panel-title i { font-size: 15px; color: var(--text-secondary); margin-right: 6px; }
.panel-title .badge-count {
  font-size: 11px; font-weight: 500;
  background: var(--bg-secondary); color: var(--text-secondary);
  padding: 2px 8px; border-radius: 10px;
}

/* ── Log Table ── */
.log-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.log-table th {
  text-align: left; font-weight: 500; color: var(--text-muted);
  font-size: 11px; padding: 0 8px 8px 0;
  border-bottom: 1px solid var(--border);
}
.log-table td {
  padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border);
  color: var(--text-primary); vertical-align: top;
}
.log-table tr:last-child td { border-bottom: none; }
.log-table tbody tr { transition: background .1s; }
.log-table tbody tr:hover { background: var(--bg-secondary); }

.sev { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.2px; }
.sev.critical { background: var(--red-bg); color: var(--red); }
.sev.high     { background: var(--orange-bg); color: var(--orange); }
.sev.medium   { background: var(--blue-bg); color: var(--blue); }
.sev.low      { background: #eaf3de; color: #3b6d11; }

.type-badge {
  display: inline-block; padding: 2px 8px; border-radius: 8px;
  font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary);
}
.ip-mono { font-family: 'Courier New', monospace; font-size: 11.5px; color: var(--text-secondary); }

/* Empty state */
.empty-state { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 12px; }
.empty-state .ti { font-size: 28px; display: block; margin-bottom: 8px; }

/* ── Attack Chain & Timeline ── */
.chain-step { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.chain-step:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.chain-head { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; }
.chain-desc { font-size: 11px; color: var(--text-secondary); margin-top: 3px; line-height: 1.5; }
.chain-num { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }

.tl-item { display: flex; align-items: flex-start; gap: 10px; font-size: 12px; }
.tl-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; background: var(--green); }
.tl-dot.critical { background: var(--red); }
.tl-dot.high     { background: var(--orange); }
.tl-dot.medium   { background: var(--blue); }
.tl-time { color: var(--text-muted); font-family: 'Courier New', monospace; font-size: 11px; min-width: 52px; }
.tl-text { color: var(--text-primary); line-height: 1.4; }
.tl-sub { color: var(--text-muted); font-size: 11px; }
.tl-list { display: flex; flex-direction: column; gap: 8px; }

@media (max-width: 900px) {
  .grid3, .grid2 { grid-template-columns: 1fr; }
  .metrics { grid-template-columns: repeat(2,1fr); }
  .filter-search { width: 140px; }
}
</style>
