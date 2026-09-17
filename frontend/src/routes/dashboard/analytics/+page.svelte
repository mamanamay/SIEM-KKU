<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { downloadHTML, downloadPDF, downloadCSV } from '../../../lib/utils/export';
  import Chart from 'chart.js/auto';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import ExportBtn from '../../../lib/components/ExportBtn.svelte'; 

  let events: any[] = [];
  
  const REFRESH_INTERVAL_MS = 90000;
  let intervalId: any;

  onMount(() => {
    events = get(eventsStore);
    intervalId = setInterval(() => {
      events = get(eventsStore);
    }, REFRESH_INTERVAL_MS);
  });

  onDestroy(() => {
    if (intervalId) clearInterval(intervalId);
  });


  let activeTab = 'overview';

  // ─── Data Computations ──────────────────────────────────────────────────────

  $: topIps = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.ip] = (counts[e.ip] || 0) + 1);
    const total = events.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count, percent: Math.round((count / total) * 100) }));
  })();

  $: topTypes = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    const total = events.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, percent: Math.round((count / total) * 100) }));
  })();

  $: topCountries = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      const c = e.country || 'Local Network';
      counts[c] = (counts[c] || 0) + 1;
    });
    const total = events.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([country, count]) => ({ country, count, percent: Math.round((count / total) * 100) }));
  })();

  $: payloadEvents = events.filter(e => e.detail && e.detail.length > 3);

  let chartType: any;
  let chartIp: any;
  let chartCanvasType: HTMLCanvasElement;
  let chartCanvasIp: HTMLCanvasElement;

  $: if (activeTab === 'overview' && chartCanvasType && topTypes.length) {
    if (chartType) chartType.destroy();
    chartType = new Chart(chartCanvasType, {
      type: 'doughnut',
      data: {
        labels: topTypes.map(t => shortType(t.type)),
        datasets: [{
          data: topTypes.map(t => t.count),
          backgroundColor: topTypes.map(t => getTypeColor(t.type)),
          borderWidth: 0
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#9ca3af' } } } }
    });
  }

  $: if (activeTab === 'overview' && chartCanvasIp && topIps.length) {
    if (chartIp) chartIp.destroy();
    chartIp = new Chart(chartCanvasIp, {
      type: 'bar',
      data: {
        labels: topIps.slice(0, 5).map(t => t.ip),
        datasets: [{
          label: 'Hits',
          data: topIps.slice(0, 5).map(t => t.count),
          backgroundColor: topIps.slice(0, 5).map((t,i) => i===0?'#ef4444':i<3?'#f97316':'#10b981'),
          borderRadius: 4
        }]
      },
      options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af', font: { size: 10 } } },
          y: { ticks: { color: '#9ca3af' }, beginAtZero: true }
        }
      }
    });
  }


  // ─── Helpers ────────────────────────────────────────────────────────────────
  const TYPE_COLORS: Record<string, string> = {
    ssh: '#ef4444', compromised: '#ef4444', brute: '#ef4444',
    port: '#f97316', scan: '#3b82f6', web: '#3b82f6',
    sql: '#10b981', command: '#10b981', ftp: '#8b5cf6', recon: '#a855f7',
    wazuh: '#f59e0b'
  };
  
  function getTypeColor(type: string) {
    const t = type.toLowerCase();
    for (const [key, color] of Object.entries(TYPE_COLORS)) {
      if (t.includes(key)) return color;
    }
    return '#6b7280';
  }

  function getTypeBg(type: string) {
    return getTypeColor(type) + '1a';
  }

  function getTypeIcon(type: string) {
    const t = type.toLowerCase();
    if (t.includes('wazuh')) return 'ti-eye';
    if (t.includes('ssh') || t.includes('brute') || t.includes('login')) return 'ti-lock';
    if (t.includes('sql') || t.includes('inject')) return 'ti-database';
    if (t.includes('web') || t.includes('scan')) return 'ti-world-search';
    if (t.includes('command') || t.includes('compromised')) return 'ti-terminal';
    if (t.includes('recon')) return 'ti-radar';
    if (t.includes('port')) return 'ti-plug';
    return 'ti-shield-exclamation';
  }

  function getCountryColor(name: string) {
    if (name === 'China') return '#ef4444';
    if (name === 'Russia') return '#f97316';
    if (name === 'United States' || name === 'USA') return '#3b82f6';
    if (name === 'Germany') return '#f59e0b';
    if (name === 'Brazil') return '#10b981';
    if (name === 'Local Network') return '#6366f1';
    return '#8b5cf6';
  }

  function getFlagEmoji(country: string) {
    const flags: Record<string, string> = {
      'Russia': '🇷🇺', 'China': '🇨🇳', 'Brazil': '🇧🇷',
      'United States': '🇺🇸', 'USA': '🇺🇸', 'Germany': '🇩🇪',
      'Local Network': '🖥️'
    };
    return flags[country] || '🏳️';
  }

  function shortType(type: string) {
    if (type === 'Aggressive Brute Force' || type === 'SSH Brute Force') return 'SSH Brute';
    if (type === 'SSH Login Attempt') return 'SSH Login';
    return type;
  }

  function rankColor(i: number) {
    if (i === 0) return '#ef4444';
    if (i === 1) return '#f97316';
    if (i === 2) return '#f59e0b';
    return 'var(--text-muted)';
  }
  let showExportMenu = false;
  function handleExportPDF() {
    const data = topIps.map(r => ({'IP': r.ip, 'Hits': String(r.count), 'Percent': r.percent+'%'}));
    downloadPDF(data, ['IP','Hits','Percent'], 'analytics-top-ips.pdf', 'Top Attack IPs Report');
    showExportMenu = false;
  }
  function handleExportHTML() {
    const data = topIps.map(r => ({'IP': r.ip, 'Hits': String(r.count), 'Percent': r.percent+'%'}));
    downloadHTML(data, ['IP','Hits','Percent'], 'analytics-top-ips.html', 'Top Attack IPs Report');
    showExportMenu = false;
  }
</script>

<svelte:head><title>Attacker Analytics - KKUSIEM</title></svelte:head>

<div style="display:flex;flex-direction:column;gap:16px;padding:24px 32px 2rem;max-width:1400px;margin:0 auto;">
  <!-- Page Header -->
  <PageHeader title="Analyst Center" description="Analyze attacker IPs, countries, attack vectors, and payload activity." icon="ti-chart-bar">
    <!-- <div slot="actions">
      <ExportBtn config={{ pageType: 'analytics', reportTitle: 'Attacker Analytics', supportedFormats: ['pdf', 'html', 'csv'], aiEnabled: true, csvEnabled: true, sections: [] }} data={events} /> -->
    <!-- </div> -->
  </PageHeader>

  <!-- ─── Tab Navigation ──────────────────────────────────────────────────── -->

  <div class="ds-filters">
    <button class="ds-btn {activeTab === 'overview' ? 'primary' : ''}" on:click={() => activeTab = 'overview'}>
      <i class="ti ti-chart-bar"></i> Overview
    </button>
    <button class="ds-btn {activeTab === 'geographic' ? 'primary' : ''}" on:click={() => activeTab = 'geographic'}>
      <i class="ti ti-map-pin"></i> Geographic
    </button>
    <button class="ds-btn {activeTab === 'vectors' ? 'primary' : ''}" on:click={() => activeTab = 'vectors'}>
      <i class="ti ti-target"></i> Attack Vectors
    </button>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- OVERVIEW TAB                                                          -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  {#if activeTab === 'overview'}
    <!-- Stat Cards Row -->
    <div class="ds-kpi-row" style="margin-bottom:0;">
      <div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--green);background:var(--green-bg)">
        <i class="ti ti-activity"></i></div><div class="ds-kpi-body">
          <div class="ds-kpi-val">{events.length.toLocaleString()}</div>
          <div class="ds-kpi-lbl">Total Events</div>
        </div>
      </div>
      <div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--blue);background:var(--blue-bg)">
        <i class="ti ti-device-desktop"></i></div><div class="ds-kpi-body">
          <div class="ds-kpi-val">{topIps.length}</div>
          <div class="ds-kpi-lbl">Unique Attacker IPs</div>
        </div>
      </div>
      <div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--orange);background:var(--orange-bg)">
        <i class="ti ti-world"></i></div><div class="ds-kpi-body">
          <div class="ds-kpi-val">{topCountries.length}</div>
          <div class="ds-kpi-lbl">Source Countries</div>
        </div>
      </div>
      <div class="ds-kpi"><div class="ds-kpi-icon" style="color:var(--red);background:var(--red-bg)">
        <i class="ti ti-target"></i></div><div class="ds-kpi-body">
          <div class="ds-kpi-val">{topTypes.length}</div>
          <div class="ds-kpi-lbl">Attack Vectors</div>
        </div>
      </div>
    </div>

    <!-- Two-column layout -->
    <div class="overview-grid">
      <!-- Top IPs Panel -->
      <div class="ds-card" style="padding:0;overflow:hidden;">
        <div class="ds-card-head" style="padding:16px;border-bottom:1px solid var(--border);">
          <div class="ds-card-title"><i class="ti ti-device-desktop-analytics"></i> Top Attacker IPs</div>
          <span class="panel-badge">Real Data</span>
        </div>
        {#if topIps.length === 0}
          <div class="empty-state"><i class="ti ti-database-off"></i><br>ไม่พบข้อมูล</div>
        {:else}
          <div style="height: 200px; padding: 16px;"><canvas bind:this={chartCanvasIp}></canvas></div>
          <div class="rank-list" style="border-top:1px solid var(--border);">
            {#each topIps as item, i}
              <div class="rank-row">
                <div class="rank-num" style="color: {rankColor(i)}">
                  {#if i < 3}<i class="ti ti-medal"></i>{:else}#{i + 1}{/if}
                </div>
                <div class="rank-info">
                  <div class="rank-label">{item.ip}</div>
                  <div class="rank-bar-wrap">
                    <div class="rank-bar" style="width:{item.percent}%; background:{i===0?'#ef4444':i<3?'#f97316':'#10b981'}"></div>
                  </div>
                </div>
                <div class="rank-val">
                  <span class="rv-num">{item.count}</span>
                  <span class="rv-unit">hits</span>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Attack Distribution Panel -->
      <div class="ds-card" style="padding:0;overflow:hidden;">
        <div class="ds-card-head" style="padding:16px;border-bottom:1px solid var(--border);">
          <div class="ds-card-title"><i class="ti ti-chart-donut"></i> Attack Distribution</div>
          <span class="panel-badge">By Type</span>
        </div>
        {#if topTypes.length === 0}
          <div class="empty-state"><i class="ti ti-database-off"></i><br>ไม่พบข้อมูล</div>
        {:else}
          <div style="height: 200px; padding: 16px;"><canvas bind:this={chartCanvasType}></canvas></div>
          <div class="type-chips" style="border-top:1px solid var(--border);">
            {#each topTypes as item}
              <div class="type-chip" style="border-color:{getTypeColor(item.type)}22; background:{getTypeBg(item.type)}">
                <i class="ti {getTypeIcon(item.type)}" style="color:{getTypeColor(item.type)}"></i>
                <span class="tc-name">{shortType(item.type)}</span>
                <span class="tc-count" style="color:{getTypeColor(item.type)}">{item.count}</span>
                <span class="tc-pct">{item.percent}%</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- GEOGRAPHIC TAB                                                        -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  {#if activeTab === 'geographic'}
    <div class="ds-card" style="padding:0;overflow:hidden;">
      <div class="ds-card-head" style="padding:16px;border-bottom:1px solid var(--border);">
        <div class="ds-card-title"><i class="ti ti-map-pin-filled"></i> Top Source Countries</div>
        <span class="panel-badge">Real Data</span>
      </div>


      {#if topCountries.length === 0}
        <div class="empty-state"><i class="ti ti-world-off"></i><br>ไม่พบข้อมูล</div>
      {:else}
        <div class="geo-list">
          {#each topCountries as item, i}
            <div class="geo-row">
              <div class="geo-rank">{i + 1}</div>
              <div class="geo-flag">{getFlagEmoji(item.country)}</div>
              <div class="geo-info">
                <div class="geo-name">{item.country}</div>
                <div class="geo-bar-wrap">
                  <div class="geo-bar" style="width:{item.percent}%; background:{getCountryColor(item.country)}"></div>
                </div>
              </div>
              <div class="geo-right">
                <span class="geo-hits">{item.count}</span>
                <span class="geo-pct">{item.percent}%</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  <!-- ATTACK VECTORS TAB                                                    -->
  <!-- ═══════════════════════════════════════════════════════════════════════ -->
  {#if activeTab === 'vectors'}
    <div class="ds-card" style="padding:0;overflow:hidden;">
      <div class="ds-card-head" style="padding:16px;border-bottom:1px solid var(--border);">
        <div class="ds-card-title"><i class="ti ti-crosshair"></i> Attack Vectors</div>
        <span class="panel-badge">Ranked by Frequency</span>
      </div>


      {#if topTypes.length === 0}
        <div class="empty-state"><i class="ti ti-shield-off"></i><br>ไม่พบข้อมูล</div>
      {:else}
        <div class="vector-list">
          {#each topTypes as item, i}
            <div class="vector-row">
              <div class="vector-icon" style="background:{getTypeBg(item.type)}; color:{getTypeColor(item.type)}">
                <i class="ti {getTypeIcon(item.type)}"></i>
              </div>
              <div class="vector-info">
                <div class="vector-header">
                  <span class="vector-name">{item.type}</span>
                  <span class="vector-rank" style="color:{rankColor(i)}"># {i + 1}</span>
                </div>
                <div class="vector-bar-wrap">
                  <div class="vector-bar" style="width:{item.percent}%; background:{getTypeColor(item.type)}"></div>
                  <span class="vector-pct">{item.percent}%</span>
                </div>
              </div>
              <div class="vector-val">
                <span class="vv-num">{item.count}</span>
                <span class="vv-unit">hits</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

</div>
<style>
/* ─── Page ──────────────────────────────────────────────────────────────────── */
.analytics-page {
  padding: 0 0 2rem 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Tab Bar ───────────────────────────────────────────────────────────────── */
.tabs-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 6px;
  overflow-x: auto;
}
.tab-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.18s;
  white-space: nowrap;
  position: relative;
}
.tab-btn i { font-size: 15px; }

.tab-btn.active {
  background: var(--green);
  color: var(--text-primary);
  box-shadow: 0 2px 8px rgba(29,158,117,0.3);
}
.tab-badge {
  background: rgba(255,255,255,0.25);
  color: inherit;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 99px;
  margin-left: 2px;
}
.tab-btn:not(.active) .tab-badge {
  background: var(--green);
  color: var(--text-primary);
}

/* ─── Stat Cards ─────────────────────────────────────────────────────────────── */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.stat-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s;
}
.stat-card:hover { transform: translateY(-2px); }
.sc-icon {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}
.accent-green .sc-icon { background: rgba(16,185,129,0.12); color: #10b981; }
.accent-blue  .sc-icon { background: rgba(59,130,246,0.12); color: #3b82f6; }
.accent-orange.sc-icon { background: rgba(249,115,22,0.12); color: #f97316; }
.accent-red   .sc-icon { background: rgba(239,68,68,0.12);  color: #ef4444; }
.accent-green { border-left: 3px solid #10b981; }
.accent-blue  { border-left: 3px solid #3b82f6; }
.accent-orange { border-left: 3px solid #f97316; }
.accent-red   { border-left: 3px solid #ef4444; }
.sc-val { font-size: 26px; font-weight: 800; color: var(--text-primary); line-height: 1; }
.sc-lbl { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }

/* ─── Panel ──────────────────────────────────────────────────────────────────── */
.overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.panel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-title i { font-size: 18px; color: var(--green); }
.panel-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: 99px;
  background: var(--green-bg);
  color: var(--green);
  border: 1px solid var(--green);
}
.panel-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 18px 0;
}

/* ─── Rank List (Top IPs / Overview) ────────────────────────────────────────── */
.rank-list { display: flex; flex-direction: column; gap: 0; margin-top: 10px; padding: 0 16px 16px; }
.rank-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.rank-row:last-child { border-bottom: none; }
.rank-num { width: 28px; font-size: 13px; font-weight: 800; text-align: center; flex-shrink: 0; }
.rank-num i { font-size: 15px; }
.rank-info { flex: 1; min-width: 0; }
.rank-label { font-size: 13px; font-weight: 600; color: var(--text-primary); font-family: 'Courier New', monospace; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rank-bar-wrap { height: 6px; background: var(--bg-secondary); border-radius: 99px; overflow: hidden; }
.rank-bar { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
.rank-val { text-align: right; flex-shrink: 0; }
.rv-num { font-size: 15px; font-weight: 700; color: var(--text-primary); display: block; }
.rv-unit { font-size: 10px; color: var(--text-muted); font-weight: 500; }

/* ─── Type Chips (Attack Distribution) ──────────────────────────────────────── */
.type-chips { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding: 0 16px 16px; }
.type-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid;
  transition: opacity 0.18s;
}
.type-chip i { font-size: 16px; flex-shrink: 0; }
.tc-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.tc-count { font-size: 14px; font-weight: 800; }
.tc-pct { font-size: 11px; color: var(--text-muted); font-weight: 600; min-width: 36px; text-align: right; }

/* ─── Geographic List ────────────────────────────────────────────────────────── */
.geo-list { display: flex; flex-direction: column; gap: 0; padding: 0 16px 16px; }
.geo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 0;
  border-bottom: 1px solid var(--border);
}
.geo-row:last-child { border-bottom: none; }
.geo-rank { width: 24px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-align: center; flex-shrink: 0; }
.geo-flag { font-size: 24px; width: 32px; text-align: center; flex-shrink: 0; }
.geo-info { flex: 1; min-width: 0; }
.geo-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.geo-bar-wrap { height: 7px; background: var(--bg-secondary); border-radius: 99px; overflow: hidden; }
.geo-bar { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
.geo-right { text-align: right; flex-shrink: 0; }
.geo-hits { font-size: 16px; font-weight: 800; color: var(--text-primary); display: block; }
.geo-pct { font-size: 11px; color: var(--text-muted); font-weight: 600; }

/* ─── Vector List ────────────────────────────────────────────────────────────── */
.vector-list { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 16px; }
.vector-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border);
  transition: transform 0.15s;
}
.vector-row:hover { transform: translateX(4px); }
.vector-icon {
  width: 44px; height: 44px;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.vector-info { flex: 1; min-width: 0; }
.vector-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.vector-name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.vector-rank { font-size: 11px; font-weight: 800; text-transform: uppercase; }
.vector-bar-wrap { display: flex; align-items: center; gap: 8px; }
.vector-bar-wrap div:first-child { flex: 1; }
.vector-bar-outer { flex: 1; height: 8px; background: var(--border); border-radius: 99px; overflow: hidden; }
.vector-bar { height: 8px; border-radius: 99px; transition: width 0.6s ease; }
.vector-pct { font-size: 11px; font-weight: 700; color: var(--text-muted); flex-shrink: 0; min-width: 32px; text-align: right; }
.vector-val { text-align: right; flex-shrink: 0; }
.vv-num { font-size: 18px; font-weight: 800; color: var(--text-primary); display: block; }
.vv-unit { font-size: 11px; color: var(--text-muted); font-weight: 500; }

/* ─── Payload List ───────────────────────────────────────────────────────────── */
.payload-list { display: flex; flex-direction: column; gap: 10px; padding: 0 16px 16px; }
.payload-row {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.payload-row:hover { border-color: var(--red); }
.payload-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.p-ip { font-size: 12px; font-weight: 700; color: var(--text-primary); font-family: 'Courier New', monospace; display: flex; align-items: center; gap: 5px; }
.p-ip i { font-size: 12px; }
.p-type {
  font-size: 10px; font-weight: 700; padding: 2px 10px;
  border-radius: 99px; text-transform: uppercase; letter-spacing: 0.06em;
}
.p-time { font-size: 11px; color: var(--text-muted); margin-left: auto; display: flex; align-items: center; gap: 4px; }
.payload-code {
  padding: 10px 14px;
  font-family: 'Courier New', monospace;
  font-size: 12.5px;
  color: #ef4444;
  word-break: break-all;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.payload-prompt { font-size: 12px; color: var(--text-muted); flex-shrink: 0; margin-top: 1px; }

/* ─── Empty State ────────────────────────────────────────────────────────────── */
.empty-state {
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  padding: 3rem 1rem;
  border-radius: 10px;
  background: var(--bg-secondary);
  line-height: 2;
}
.empty-state i { font-size: 28px; opacity: 0.4; }

/* ─── Responsive ─────────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .stat-cards { grid-template-columns: 1fr 1fr; }
  .overview-grid { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
  .stat-cards { grid-template-columns: 1fr; }
}
</style>
