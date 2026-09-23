<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { systemHealthStore } from '../../../stores/events';
  import Chart from 'chart.js/auto';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  
  let chartCanvas: HTMLCanvasElement;
  let chartInstance: Chart | null = null;
  let metricsHistory: any[] = [];
  
  $: health = $systemHealthStore || {
    cpuUsage: 0, ramUsage: 0, ramUsed: 0, ramTotal: 0, diskUsage: 0, diskUsed: 0, diskTotal: 0, uptime: 0
  };

  onMount(async () => {
    // Fetch 24h history
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
    if (!chartCanvas) return;
    
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

  // Reactive chart update when new realtime data arrives
  $: if (chartInstance && $systemHealthStore) {
    const timeLabel = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    chartInstance.data.labels?.push(timeLabel);
    chartInstance.data.datasets[0].data.push($systemHealthStore.cpuUsage);
    chartInstance.data.datasets[1].data.push($systemHealthStore.ramUsage);
    chartInstance.data.datasets[2].data.push($systemHealthStore.diskUsage);
    
    if (chartInstance.data.labels!.length > 1440) { // Keep max 24 hours of minutes
      chartInstance.data.labels?.shift();
      chartInstance.data.datasets.forEach(d => d.data.shift());
    }
    chartInstance.update('none'); // Update without full animation for performance
  }

  function formatUptime(seconds: number) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${h}h ${m}m`;
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

  <div class="metrics-grid">
    <!-- CPU -->
    <div class="metric-card">
      <div class="card-header">
        <div class="icon bg-red"><i class="ti ti-cpu"></i></div>
        <h3>CPU Usage</h3>
      </div>
      <div class="value-container">
        <span class="value {health.cpuUsage > 85 ? 'text-danger' : ''}">{health.cpuUsage.toFixed(1)}</span>
        <span class="unit">%</span>
      </div>
      <div class="progress-bg">
        <div class="progress-bar bg-red" style="width: {health.cpuUsage}%"></div>
      </div>
    </div>

    <!-- RAM -->
    <div class="metric-card">
      <div class="card-header">
        <div class="icon bg-blue"><i class="ti ti-device-computer-camera"></i></div>
        <h3>RAM Usage</h3>
      </div>
      <div class="value-container">
        <span class="value {health.ramUsage > 85 ? 'text-danger' : ''}">{health.ramUsage.toFixed(1)}</span>
        <span class="unit">%</span>
      </div>
      <div class="progress-bg">
        <div class="progress-bar bg-blue" style="width: {health.ramUsage}%"></div>
      </div>
      <div class="subtitle">{health.ramUsed.toFixed(1)} GB / {health.ramTotal.toFixed(1)} GB</div>
    </div>

    <!-- Disk -->
    <div class="metric-card">
      <div class="card-header">
        <div class="icon bg-green"><i class="ti ti-database"></i></div>
        <h3>Disk Space</h3>
      </div>
      <div class="value-container">
        <span class="value {health.diskUsage > 85 ? 'text-danger' : ''}">{health.diskUsage.toFixed(1)}</span>
        <span class="unit">%</span>
      </div>
      <div class="progress-bg">
        <div class="progress-bar bg-green" style="width: {health.diskUsage}%"></div>
      </div>
      <div class="subtitle">{health.diskUsed.toFixed(1)} GB / {health.diskTotal.toFixed(1)} GB</div>
    </div>

    <!-- Uptime -->
    <div class="metric-card uptime-card">
      <div class="card-header">
        <div class="icon bg-purple"><i class="ti ti-clock-play"></i></div>
        <h3>Server Uptime</h3>
      </div>
      <div class="value-container mt-3">
        <span class="value text-purple">{formatUptime(health.uptime)}</span>
      </div>
      <div class="subtitle mt-2">Continuous Operation</div>
    </div>
  </div>

  <div class="chart-section">
    <div class="chart-header">
      <h3>24-Hour Trend</h3>
      <span class="badge">Live Updates</span>
    </div>
    <div class="chart-container">
      <canvas bind:this={chartCanvas}></canvas>
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
</style>
