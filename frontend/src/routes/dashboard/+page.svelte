<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { eventsStore } from '../../stores/events';
  import { formatEventTime } from '../../lib/formatTime';
  
  let events: any[] = [];
  const unsubscribe = eventsStore.subscribe(val => { events = val; });
  
  let timelineChart: any;
  let typeChart: any;
  let radarChart: any;
  let polarChart: any;
  
  let chartCanvas: HTMLCanvasElement;
  let typeChartCanvas: HTMLCanvasElement;
  let radarCanvas: HTMLCanvasElement;
  let polarCanvas: HTMLCanvasElement;
  
  $: criticalEvents = events.filter((e: any) => e.severity === 'critical');
  $: blockedEvents = events.filter((e: any) => e.action === 'blocked' || (e.type && e.type.toLowerCase().includes('block')));
  $: sshEvents = events.filter((e: any) => e.type && e.type.toLowerCase().includes('ssh'));
  
  onMount(async () => {
    if (chartCanvas && typeChartCanvas && radarCanvas && polarCanvas) {
      const { default: Chart } = await import('chart.js/auto');
      
      // 1. Timeline Chart (Bar)
      timelineChart = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
          datasets: [{
            label: 'Incidents',
            data: [12, 19, 3, 5, 2, 3],
            backgroundColor: 'rgba(59, 130, 246, 0.5)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } } }
      });

      // 2. Attack Types (Doughnut)
      typeChart = new Chart(typeChartCanvas, {
        type: 'doughnut',
        data: {
          labels: ['SSH Brute Force', 'SQL Injection', 'Malware', 'DDoS', 'Port Scan'],
          datasets: [{ data: [45, 25, 20, 5, 5], backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#10b981'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
      });
      
      // 3. Attack Vector Mapping (Radar)
      radarChart = new Chart(radarCanvas, {
        type: 'radar',
        data: {
          labels: ['Network', 'Application', 'Endpoint', 'Identity', 'Cloud', 'Social'],
          datasets: [{
            label: 'Current Threat Surface',
            data: [85, 65, 45, 90, 30, 10],
            backgroundColor: 'rgba(168, 85, 247, 0.3)',
            borderColor: '#a855f7',
            pointBackgroundColor: '#a855f7',
            borderWidth: 2
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { angleLines: { color: 'rgba(0,0,0,0.1)' }, grid: { color: 'rgba(0,0,0,0.1)' }, pointLabels: { font: { size: 11 } } } }, plugins: { legend: { display: false } } }
      });

      // 4. Severity Distribution (Polar Area)
      polarChart = new Chart(polarCanvas, {
        type: 'polarArea',
        data: {
          labels: ['Critical', 'High', 'Medium', 'Low', 'Info'],
          datasets: [{
            data: [15, 30, 45, 25, 10],
            backgroundColor: ['rgba(239, 68, 68, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(245, 158, 11, 0.7)', 'rgba(59, 130, 246, 0.7)', 'rgba(16, 185, 129, 0.7)'],
            borderWidth: 1
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, scales: { r: { display: false } } }
      });
    }
  });
  
  onDestroy(() => {
    unsubscribe();
    if (timelineChart) timelineChart.destroy();
    if (typeChart) typeChart.destroy();
    if (radarChart) radarChart.destroy();
    if (polarChart) polarChart.destroy();
  });
</script>

<svelte:head><title>Dashboard - KKUSIEM</title></svelte:head>

<div class="dash-container">
  <div class="header-section">
    <h1>Security Overview</h1>
    <p class="subtitle">Real-time monitoring and incident summary.</p>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-icon blue"><i class="ti ti-shield-lock"></i></div>
      <div class="kpi-info">
        <span class="kpi-label">Total Events (24h)</span>
        <span class="kpi-value">{events.length}</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon red"><i class="ti ti-alert-triangle"></i></div>
      <div class="kpi-info">
        <span class="kpi-label">Critical Incidents</span>
        <span class="kpi-value">{criticalEvents.length}</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon orange"><i class="ti ti-terminal"></i></div>
      <div class="kpi-info">
        <span class="kpi-label">SSH Attacks</span>
        <span class="kpi-value">{sshEvents.length}</span>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon green"><i class="ti ti-shield-check"></i></div>
      <div class="kpi-info">
        <span class="kpi-label">Blocked Connections</span>
        <span class="kpi-value">{blockedEvents.length}</span>
      </div>
    </div>
  </div>

  <div class="main-content-grid">
    <div class="card chart-card">
      <div class="card-header">Incident Activity Timeline</div>
      <div class="chart-wrapper">
        <canvas bind:this={chartCanvas}></canvas>
      </div>
    </div>
    <div class="card chart-card">
      <div class="card-header">Attack Types</div>
      <div class="chart-wrapper">
        <canvas bind:this={typeChartCanvas}></canvas>
      </div>
    </div>
    <div class="card chart-card">
      <div class="card-header">Attack Vector Mapping</div>
      <div class="chart-wrapper">
        <canvas bind:this={radarCanvas}></canvas>
      </div>
    </div>
    <div class="card chart-card">
      <div class="card-header">Severity Distribution</div>
      <div class="chart-wrapper">
        <canvas bind:this={polarCanvas}></canvas>
      </div>
    </div>
    <div class="card list-card" style="grid-column: span 2;">
      <div class="card-header">Recent Critical Events</div>
      <div class="list-wrapper" style="max-height: 300px;">
        {#each criticalEvents.slice(0, 8) as e}
          <div class="list-item">
            <div class="item-time">{formatEventTime(e.time || e.createdAt)}</div>
            <div class="item-ip">{e.ip}</div>
            <div class="item-type">{e.type}</div>
          </div>
        {/each}
        {#if criticalEvents.length === 0}
          <div class="empty-state">No critical events recently.</div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .dash-container {
    display: flex; flex-direction: column; gap: 24px; padding: 10px;
    height: 100%; min-height: 0; box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  
  .header-section h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px 0; color: var(--text-primary, #111827); }
  .header-section .subtitle { font-size: 14px; color: var(--text-muted, #6b7280); margin: 0; }
  
  .kpi-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; flex-shrink: 0;
  }
  .kpi-card {
    background: var(--bg-panel, #fff); border-radius: 12px; padding: 20px;
    display: flex; align-items: center; gap: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid var(--border, #e5e7eb);
  }
  .kpi-icon {
    width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 24px;
  }
  .kpi-icon.blue { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .kpi-icon.red { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .kpi-icon.orange { background: rgba(249, 115, 22, 0.1); color: #f97316; }
  .kpi-icon.green { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
  
  .kpi-info { display: flex; flex-direction: column; }
  .kpi-label { font-size: 12px; font-weight: 600; color: var(--text-muted, #6b7280); text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-value { font-size: 28px; font-weight: 700; color: var(--text-primary, #111827); line-height: 1.2; }
  
  .main-content-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex: 1; min-height: 0;
  }
  
  .card {
    background: var(--bg-panel, #fff); border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid var(--border, #e5e7eb);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .card-header {
    padding: 16px 20px; font-weight: 600; font-size: 15px; color: var(--text-primary, #111827);
    border-bottom: 1px solid var(--border, #e5e7eb); background: rgba(0,0,0,0.01);
  }
  
  .chart-wrapper { flex: 1; padding: 20px; min-height: 0; position: relative; }
  
  .list-wrapper { flex: 1; overflow-y: auto; padding: 10px; }
  .list-item {
    display: flex; flex-direction: column; padding: 12px; border-radius: 8px; margin-bottom: 8px;
    background: rgba(0,0,0,0.02); border: 1px solid transparent;
  }
  .list-item:hover { border-color: var(--border, #e5e7eb); background: var(--bg-panel, #fff); }
  .item-time { font-size: 12px; color: var(--text-muted, #6b7280); }
  .item-ip { font-size: 14px; font-weight: 600; color: var(--text-primary, #111827); font-family: monospace; margin: 4px 0; }
  .item-type { font-size: 12px; color: #ef4444; font-weight: 500; }
  .empty-state { text-align: center; padding: 40px 20px; color: var(--text-muted, #6b7280); font-size: 14px; }
  
  /* Dark mode overrides */
  :global([data-theme="dark"]) .dash-container { color: #f9fafb; }
  :global([data-theme="dark"]) .kpi-card, :global([data-theme="dark"]) .card { background: #1f2937; border-color: #374151; }
  :global([data-theme="dark"]) .header-section h1, :global([data-theme="dark"]) .kpi-value, :global([data-theme="dark"]) .card-header, :global([data-theme="dark"]) .item-ip { color: #f9fafb; }
  :global([data-theme="dark"]) .header-section .subtitle, :global([data-theme="dark"]) .kpi-label, :global([data-theme="dark"]) .item-time { color: #9ca3af; }
  :global([data-theme="dark"]) .card-header { background: var(--bg-hover); border-color: #374151; }
  :global([data-theme="dark"]) .list-item { background: rgba(255,255,255,0.03); }
  :global([data-theme="dark"]) .list-item:hover { border-color: #4b5563; background: #374151; }
</style>
