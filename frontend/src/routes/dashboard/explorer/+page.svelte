<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';
  
  let searchQuery = '';
  let dateRange = 'last24h';
  let isSearching = false;
  let searchResults: any[] = [];
  let executionTime = 0;
  
  // Histogram Data
  let chartCanvas: HTMLCanvasElement;
  let chartInstance: any = null;

  async function performSearch() {
    isSearching = true;
    const start = performance.now();
    
    // Simulate KQL parsing & filtering
    setTimeout(() => {
      const q = searchQuery.toLowerCase();
      searchResults = $eventsStore.filter((e: any) => {
        if (!q) return true;
        return (e.ip || '').toLowerCase().includes(q) || 
               (e.severity || '').toLowerCase().includes(q) ||
               (e.type || '').toLowerCase().includes(q) ||
               (e.payload || '').toLowerCase().includes(q);
      });
      executionTime = Math.round(performance.now() - start);
      isSearching = false;
      renderChart();
    }, 600);
  }

  function renderChart() {
    if (!chartCanvas) return;
    if (chartInstance) chartInstance.destroy();
    
    // Group by hour
    const buckets = new Array(24).fill(0);
    searchResults.forEach(e => {
      const d = new Date(e.time || e.createdAt);
      if(!isNaN(d.getTime())) {
        buckets[d.getHours()]++;
      } else {
        buckets[Math.floor(Math.random() * 24)]++; // Fallback
      }
    });

    const labels = Array.from({length:24}, (_,i) => `${i.toString().padStart(2,"0")}:00`);
    
    // @ts-ignore
    chartInstance = new Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Log Count',
          data: buckets,
          backgroundColor: '#3b82f6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
        }
      }
    });
  }

  onMount(() => {
    performSearch();
  });
</script>

<div class="explorer-wrap">
  <div class="kql-header">
    <div class="kql-search-box">
      <div class="kql-icon"><i class="ti ti-search"></i></div>
      <input type="text" class="kql-input" bind:value={searchQuery} on:keypress={(e) => e.key === 'Enter' && performSearch()} placeholder="e.g. source_ip='192.168.1.5' AND severity='CRITICAL'" />
      
      <select class="kql-date-picker" bind:value={dateRange}>
        <option value="last15m">Last 15 minutes</option>
        <option value="last1h">Last 1 hour</option>
        <option value="last24h">Last 24 hours</option>
        <option value="last7d">Last 7 days</option>
      </select>
      
      <button class="btn-search" on:click={performSearch} disabled={isSearching}>
        {#if isSearching}<i class="ti ti-loader rotate"></i>{:else}Search{/if}
      </button>
    </div>
    
    <div class="kql-meta">
      Found <strong>{searchResults.length.toLocaleString()}</strong> hits in {executionTime}ms.
    </div>
  </div>

  <div class="kql-chart">
    <canvas bind:this={chartCanvas}></canvas>
  </div>

  <div class="kql-table-wrap custom-scrollbar">
    <table class="kql-table">
      <thead>
        <tr>
          <th style="width: 150px;">Time</th>
          <th style="width: 120px;">Severity</th>
          <th style="width: 140px;">Source IP</th>
          <th style="width: 180px;">Event Type</th>
          <th>Raw Payload</th>
        </tr>
      </thead>
      <tbody>
        {#each searchResults as row}
          <tr>
            <td class="col-time">{new Date(row.time || row.createdAt).toLocaleString('en-GB')}</td>
            <td>
              <span class="badge {row.severity}">{row.severity?.toUpperCase()}</span>
            </td>
            <td class="col-ip">{row.ip}</td>
            <td class="col-type">{row.type}</td>
            <td class="col-raw">{row.payload || JSON.stringify(row)}</td>
          </tr>
        {/each}
        {#if searchResults.length === 0}
          <tr>
            <td colspan="5" style="text-align: center; padding: 40px; color: var(--text-muted);">
              <i class="ti ti-database-off" style="font-size: 32px; margin-bottom: 12px; display: block;"></i>
              No logs matched your query.
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  .explorer-wrap {
    display: flex; flex-direction: column; height: 100%; background: #030711; overflow: hidden;
  }
  
  /* Header & Search */
  .kql-header {
    padding: 24px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0;
  }
  .kql-search-box {
    display: flex; height: 48px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  }
  .kql-icon {
    width: 48px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 18px;
  }
  .kql-input {
    flex: 1; background: transparent; border: none; color: #fff; font-size: 14px; font-family: 'JetBrains Mono', monospace; outline: none; padding-right: 16px;
  }
  .kql-input::placeholder { color: rgba(255,255,255,0.2); }
  
  .kql-date-picker {
    background: rgba(255,255,255,0.05); border: none; border-left: 1px solid var(--border); color: var(--text-primary); padding: 0 16px; outline: none; cursor: pointer; font-size: 13px; font-weight: 600;
  }
  .btn-search {
    background: #3b82f6; color: white; border: none; padding: 0 24px; font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center;
  }
  .btn-search:hover:not(:disabled) { background: #2563eb; }
  .btn-search:disabled { opacity: 0.7; }
  
  .kql-meta { font-size: 12px; color: var(--text-muted); margin-top: 12px; }
  .kql-meta strong { color: #fff; }

  /* Chart */
  .kql-chart {
    height: 140px; padding: 16px 24px; background: var(--bg-panel); border-bottom: 1px solid var(--border); flex-shrink: 0;
  }

  /* Table */
  .kql-table-wrap {
    flex: 1; overflow-y: auto; padding: 0;
  }
  .kql-table {
    width: 100%; border-collapse: collapse; text-align: left;
  }
  .kql-table th {
    position: sticky; top: 0; background: rgba(15,23,42,0.95); backdrop-filter: blur(4px); color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 24px; border-bottom: 1px solid var(--border); z-index: 10;
  }
  .kql-table td {
    padding: 12px 24px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px; color: var(--text-primary);
  }
  .kql-table tr:hover td { background: rgba(255,255,255,0.02); }
  
  .col-time { color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .col-ip { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: #93c5fd; }
  .col-type { font-weight: 600; }
  .col-raw { color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; }
  
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; }
  .badge.critical { background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid rgba(239,68,68,0.5); }
  .badge.high { background: rgba(249,115,22,0.2); color: #f97316; border: 1px solid rgba(249,115,22,0.5); }
  .badge.medium { background: rgba(234,179,8,0.2); color: #eab308; border: 1px solid rgba(234,179,8,0.5); }
  .badge.low { background: rgba(59,130,246,0.2); color: #3b82f6; border: 1px solid rgba(59,130,246,0.5); }

  .rotate { animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  
  .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
</style>

