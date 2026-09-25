<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { systemHealthStore } from '../../../stores/events';
  import Chart from 'chart.js/auto';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  
  let chartCanvas: HTMLCanvasElement;
  let chartInstance: Chart | null = null;
  let metricsHistory: any[] = [];
  let isLoading = true;
  let loadError = '';

  // Fallback ค่าเริ่มต้น — ใช้ null เพื่อแยกออกจาก "ข้อมูลจริงที่เป็น 0"
  $: health = $systemHealthStore || null;

  onMount(async () => {
    // ── 1. โหลด Current Health ทันที (ไม่รอ WebSocket cron 1 นาที) ──
    try {
      const res = await fetch('/api/system/health', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data) systemHealthStore.set(data);
      } else {
        loadError = `Server returned ${res.status}`;
      }
    } catch (e) {
      loadError = 'Cannot reach backend';
      console.error('Failed to load current health', e);
    } finally {
      isLoading = false;
    }

    // ── 2. โหลด 24h History สำหรับ Chart ──
    try {
      const res = await fetch('/api/system/metrics?hours=24', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        metricsHistory = await res.json();
        initChart();
      }
    } catch (e) {
      console.error('Failed to load metrics history', e);
    }
  });

  onDestroy(() => {
    if (chartInstance) chartInstance.destroy();
  });

  function initChart() {
    if (!chartCanvas || metricsHistory.length === 0) return;
    
    const labels = metricsHistory.map(m => new Date(m.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }));
    const cpuData = metricsHistory.map(m => m.cpuUsage);
    const ramData = metricsHistory.map(m => m.ramUsage);
    const diskData = metricsHistory.map(m => m.diskUsage);

    chartInstance = new Chart(chartCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'CPU Usage (%)', data: cpuData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.4, fill: true },
          { label: 'RAM Usage (%)', data: ramData, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4, fill: true },
          { label: 'Disk Usage (%)', data: diskData, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', tension: 0.4, fill: true }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%' } }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false }
      }
    });
  }

  // Reactive chart update เมื่อ WebSocket ส่ง real-time data มา
  $: if (chartInstance && $systemHealthStore) {
    const timeLabel = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    chartInstance.data.labels?.push(timeLabel);
    chartInstance.data.datasets[0].data.push($systemHealthStore.cpuUsage);
    chartInstance.data.datasets[1].data.push($systemHealthStore.ramUsage);
    chartInstance.data.datasets[2].data.push($systemHealthStore.diskUsage);
    
    if (chartInstance.data.labels!.length > 1440) {
      chartInstance.data.labels?.shift();
      chartInstance.data.datasets.forEach(d => d.data.shift());
    }
    chartInstance.update('none');
  }

  function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
  }

  function safeVal(v: any): number {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }
</script>

<svelte:head>
  <title>System Health | KKUSIEM</title>
</svelte:head>

<div class="page-container">
  <PageHeader 
    title="System Health Monitor" 
    description="Real-time CPU, RAM, and Disk resource utilization" 
    icon="ti-server" 
  />

  <!-- Error Banner -->
  {#if loadError}
    <div class="error-banner">
      <i class="ti ti-alert-triangle"></i>
      ไม่สามารถโหลดข้อมูล health ได้: <strong>{loadError}</strong>
      — ตรวจสอบว่า backend ทำงานอยู่และ token ถูกต้อง
    </div>
  {/if}

  <div class="metrics-grid">
    <!-- CPU -->
    <div class="metric-card">
      <div class="card-header">
        <div class="icon bg-red"><i class="ti ti-cpu"></i></div>
        <h3>CPU Usage</h3>
      </div>
      {#if isLoading}
        <div class="skeleton-value"></div>
        <div class="skeleton-bar"></div>
      {:else}
        <div class="value-container">
          <span class="value {safeVal(health?.cpuUsage) > 85 ? 'text-danger' : ''}">{safeVal(health?.cpuUsage).toFixed(1)}</span>
          <span class="unit">%</span>
        </div>
        <div class="progress-bg">
          <div class="progress-bar bg-red" style="width: {safeVal(health?.cpuUsage)}%"></div>
        </div>
      {/if}
    </div>

    <!-- RAM -->
    <div class="metric-card">
      <div class="card-header">
        <div class="icon bg-blue"><i class="ti ti-device-computer-camera"></i></div>
        <h3>RAM Usage</h3>
      </div>
      {#if isLoading}
        <div class="skeleton-value"></div>
        <div class="skeleton-bar"></div>
      {:else}
        <div class="value-container">
          <span class="value {safeVal(health?.ramUsage) > 85 ? 'text-danger' : ''}">{safeVal(health?.ramUsage).toFixed(1)}</span>
          <span class="unit">%</span>
        </div>
        <div class="progress-bg">
          <div class="progress-bar bg-blue" style="width: {safeVal(health?.ramUsage)}%"></div>
        </div>
        <div class="subtitle">{safeVal(health?.ramUsed).toFixed(1)} GB / {safeVal(health?.ramTotal).toFixed(1)} GB</div>
      {/if}
    </div>

    <!-- Disk -->
    <div class="metric-card">
      <div class="card-header">
        <div class="icon bg-green"><i class="ti ti-database"></i></div>
        <h3>Disk Space</h3>
      </div>
      {#if isLoading}
        <div class="skeleton-value"></div>
        <div class="skeleton-bar"></div>
      {:else}
        <div class="value-container">
          <span class="value {safeVal(health?.diskUsage) > 85 ? 'text-danger' : ''}">{safeVal(health?.diskUsage).toFixed(1)}</span>
          <span class="unit">%</span>
        </div>
        <div class="progress-bg">
          <div class="progress-bar bg-green" style="width: {safeVal(health?.diskUsage)}%"></div>
        </div>
        <div class="subtitle">{safeVal(health?.diskUsed).toFixed(1)} GB / {safeVal(health?.diskTotal).toFixed(1)} GB</div>
      {/if}
    </div>

    <!-- Uptime -->
    <div class="metric-card uptime-card">
      <div class="card-header">
        <div class="icon bg-purple"><i class="ti ti-clock-play"></i></div>
        <h3>Server Uptime</h3>
      </div>
      {#if isLoading}
        <div class="skeleton-value" style="width: 120px;"></div>
      {:else}
        <div class="value-container mt-3">
          <span class="value text-purple">{health ? formatUptime(safeVal(health.uptime)) : '—'}</span>
        </div>
        <div class="subtitle mt-2">Continuous Operation</div>
      {/if}
    </div>
  </div>

  <div class="chart-section">
    <div class="chart-header">
      <h3>24-Hour Trend</h3>
      <span class="badge">Live Updates</span>
    </div>
    <div class="chart-container">
      {#if metricsHistory.length === 0 && !isLoading}
        <div class="chart-empty">ยังไม่มีข้อมูลย้อนหลัง — ระบบจะเริ่มเก็บ metrics ทุก 1 นาที</div>
      {:else}
        <canvas bind:this={chartCanvas}></canvas>
      {/if}
    </div>
  </div>
</div>

<style>
  .page-container { padding: 24px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
  
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
  }
  
  .metric-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s;
  }
  .metric-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
  
  .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; color: white; }
  .bg-red { background: #ef4444; }
  .bg-blue { background: #3b82f6; }
  .bg-green { background: #10b981; }
  .bg-purple { background: #8b5cf6; }
  
  .card-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: var(--text-muted); }
  
  .value-container { display: flex; align-items: baseline; gap: 4px; margin-bottom: 12px; }
  .value { font-size: 36px; font-weight: 800; color: var(--text-primary); line-height: 1; }
  .unit { font-size: 18px; font-weight: 600; color: var(--text-muted); }
  
  .text-danger { color: #ef4444 !important; }
  .text-purple { color: #8b5cf6 !important; font-size: 28px; }
  .mt-3 { margin-top: 12px; }
  .mt-2 { margin-top: 8px; }
  
  .progress-bg { height: 8px; background: var(--bg-body); border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
  .progress-bar { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
  
  .subtitle { font-size: 13px; color: var(--text-muted); text-align: right; }
  
  .chart-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  }
  
  .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .chart-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); }
  .badge { background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.2); }
  
  .chart-container { height: 400px; width: 100%; position: relative; }

  /* ── Error Banner ── */
  .error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px;
    color: #ef4444;
    font-size: 14px;
  }

  /* ── Skeleton Loader ── */
  @keyframes shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }
  .skeleton-value {
    height: 44px;
    width: 80px;
    border-radius: 8px;
    background: linear-gradient(90deg, var(--border) 25%, var(--bg-body) 50%, var(--border) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
    margin-bottom: 12px;
  }
  .skeleton-bar {
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--border) 25%, var(--bg-body) 50%, var(--border) 75%);
    background-size: 800px 100%;
    animation: shimmer 1.4s infinite linear;
  }

  /* ── Chart Empty State ── */
  .chart-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    font-size: 14px;
    font-style: italic;
  }
</style>
