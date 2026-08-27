<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { formatEventTime } from '../../../lib/formatTime';
  import ExportReportBtn from '../../../lib/components/ExportReportBtn.svelte';

  $: events = $eventsStore;

  // Search state
  let searchIp = '';
  let searchType = '';
  let searchCountry = '';
  let searchSeverity = 'all';
  let dateFrom = '';
  let dateTo = '';
  let queryMode: 'simple' | 'kql' = 'simple';
  let kqlQuery = '';
  let isRunning = false;
  let hasSearched = false;

  $: results = (() => {
    let filtered = events;
    if (searchIp) filtered = filtered.filter(e => (e.ip || '').toLowerCase().includes(searchIp.toLowerCase()));
    if (searchType) filtered = filtered.filter(e => (e.type || '').toLowerCase().includes(searchType.toLowerCase()));
    if (searchCountry) filtered = filtered.filter(e => (e.country || '').toLowerCase().includes(searchCountry.toLowerCase()));
    if (searchSeverity !== 'all') filtered = filtered.filter(e => e.severity === searchSeverity);
    
    if (dateFrom) {
      const t = new Date(dateFrom).getTime();
      filtered = filtered.filter(e => new Date(e.createdAt || e.time || 0).getTime() >= t);
    }
    if (dateTo) {
      const t = new Date(dateTo + 'T23:59:59').getTime();
      filtered = filtered.filter(e => new Date(e.createdAt || e.time || 0).getTime() <= t);
    }
    return filtered;
  })();

  function runHunt() {
    isRunning = true;
    setTimeout(() => {
      isRunning = false;
      hasSearched = true;
    }, 500);
  }

  function resetHunt() {
    searchIp = ''; searchType = ''; searchCountry = ''; searchSeverity = 'all'; dateFrom = ''; dateTo = '';
    hasSearched = false;
  }

  $: exportData = results.map(e => ({
    Time: formatEventTime(e.time || e.createdAt),
    IP: e.ip,
    Country: e.country || 'Unknown',
    Type: e.type,
    Severity: e.severity
  }));

  let page = 1;
  const perPage = 25;
  $: totalPages = Math.ceil(results.length / perPage) || 1;
  $: { if (page > totalPages) page = 1; }
  $: paged = results.slice((page - 1) * perPage, page * perPage);
</script>

<svelte:head><title>Threat Hunting - KKUSIEM</title></svelte:head>

<div class="hunt-container">
  <!-- Top Filters Panel -->
  <div class="filter-panel">
    <div class="panel-header">
      <div class="title"><i class="ti ti-binoculars"></i> Advanced Threat Hunting</div>
      <div class="actions">
        <button class="btn btn-outline" on:click={resetHunt}><i class="ti ti-refresh"></i> Reset</button>
        <button class="btn btn-primary" on:click={runHunt}>
          {#if isRunning}
            <i class="ti ti-loader ti-spin"></i> Hunting...
          {:else}
            <i class="ti ti-search"></i> Search Logs
          {/if}
        </button>
      </div>
    </div>
    <div class="filter-grid">
      <div class="form-group">
        <label>Time Range (From)</label>
        <input type="date" bind:value={dateFrom} class="input" />
      </div>
      <div class="form-group">
        <label>Time Range (To)</label>
        <input type="date" bind:value={dateTo} class="input" />
      </div>
      <div class="form-group">
        <label>Source IP Address</label>
        <input type="text" bind:value={searchIp} placeholder="e.g. 192.168.1.1" class="input" />
      </div>
      <div class="form-group">
        <label>Event Type / Signature</label>
        <input type="text" bind:value={searchType} placeholder="e.g. SSH Brute Force" class="input" />
      </div>
      <div class="form-group">
        <label>Severity</label>
        <select bind:value={searchSeverity} class="input">
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div class="form-group">
        <label>Country Code</label>
        <input type="text" bind:value={searchCountry} placeholder="e.g. CN, RU" class="input" />
      </div>
    </div>
  </div>

  <!-- Data Grid Results -->
  <div class="results-panel">
    <div class="results-header">
      <div class="results-info">
        {#if hasSearched}
          Found <strong>{results.length}</strong> matching events
        {:else}
          Showing recent events <strong>({events.length})</strong>
        {/if}
      </div>
      <div class="results-actions">
        <ExportReportBtn 
          data={exportData} 
          columns={['Time', 'IP', 'Country', 'Type', 'Severity']} 
          title="Threat Hunting Results" 
          filename="hunting_results" 
        />
      </div>
    </div>
    
    <div class="data-grid-wrap custom-scrollbar">
      <table class="data-grid">
        <thead>
          <tr>
            <th>Time</th>
            <th>Source IP</th>
            <th>Country</th>
            <th>Event Type / Alert</th>
            <th>Severity</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each paged as e}
            <tr>
              <td class="font-mono text-muted">{formatEventTime(e.time || e.createdAt)}</td>
              <td class="font-mono font-bold text-ip">{e.ip}</td>
              <td>
                <span class="flag-badge">{(e.country || 'UN').substring(0, 2).toUpperCase()}</span> 
                {e.country || 'Unknown'}
              </td>
              <td>{e.type}</td>
              <td>
                <span class="sev-badge {e.severity}">{e.severity}</span>
              </td>
              <td>
                <a href="/dashboard/soar?ip={e.ip}&time={e.time || e.createdAt}" class="btn-sm btn-outline">Investigate</a>
              </td>
            </tr>
          {/each}
          {#if paged.length === 0}
            <tr><td colspan="6" class="text-center py-8 text-muted">No events match your search criteria.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="pagination">
        <button class="page-btn" disabled={page === 1} on:click={() => page--}><i class="ti ti-chevron-left"></i> Prev</button>
        <span class="page-info">Page {page} of {totalPages}</span>
        <button class="page-btn" disabled={page === totalPages} on:click={() => page++}>Next <i class="ti ti-chevron-right"></i></button>
      </div>
    {/if}
  </div>
</div>

<style>
  .hunt-container {
    display: flex; flex-direction: column; gap: 20px;
    height: 100%; min-height: 0;
  }
  
  /* Filter Panel */
  .filter-panel {
    background: var(--bg-panel, #181b24);
    border: 1px solid var(--border, rgba(255,255,255,0.1));
    border-radius: 12px;
    padding: 20px;
  }
  .panel-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px;
  }
  .panel-header .title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
  .actions { display: flex; gap: 10px; }
  
  .filter-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;
  }
  .form-group label {
    display: block; font-size: 11px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.05em;
  }
  .input {
    width: 100%; padding: 10px 14px; box-sizing: border-box;
    background: var(--bg-secondary); border: 1px solid var(--border);
    color: var(--text-primary); border-radius: 6px; font-size: 13px;
  }
  .input:focus { border-color: var(--color-cyan, #22d3ee); outline: none; }

  /* Results Panel */
  .results-panel {
    background: var(--bg-panel, #181b24);
    border: 1px solid var(--border, rgba(255,255,255,0.1));
    border-radius: 12px;
    display: flex; flex-direction: column; flex: 1; min-height: 0;
  }
  .results-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
  }
  .results-info { font-size: 14px; color: var(--text-muted); }
  .results-info strong { color: var(--text-primary); }

  /* Data Grid */
  .data-grid-wrap { flex: 1; overflow-y: auto; }
  .data-grid { width: 100%; border-collapse: collapse; }
  .data-grid th {
    position: sticky; top: 0; background: var(--bg-secondary, #1e222d);
    padding: 12px 20px; font-size: 11px; font-weight: 700; text-transform: uppercase;
    color: var(--text-muted); text-align: left; border-bottom: 1px solid var(--border); z-index: 1;
  }
  .data-grid td {
    padding: 14px 20px; font-size: 13px; border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }
  .data-grid tr:hover td { background: var(--bg-hover); }
  
  .font-mono { font-family: 'JetBrains Mono', monospace; }
  .text-muted { color: var(--text-muted); }
  .text-ip { color: var(--color-cyan, #22d3ee); }
  .font-bold { font-weight: 700; }
  .text-center { text-align: center; }
  .py-8 { padding-top: 32px !important; padding-bottom: 32px !important; }

  .flag-badge {
    display: inline-block; padding: 2px 6px; background: rgba(255,255,255,0.1);
    border-radius: 4px; font-size: 10px; font-weight: 700; margin-right: 6px; color: #fff;
  }
  .sev-badge {
    display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 800; text-transform: uppercase;
  }
  .sev-badge.critical { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
  .sev-badge.high { background: rgba(249, 115, 22, 0.15); color: #f97316; }
  .sev-badge.medium { background: rgba(234, 179, 8, 0.15); color: #eab308; }
  .sev-badge.low { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

  /* Buttons */
  .btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
  .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
  .btn-primary { background: var(--color-cyan, #22d3ee); color: #000; }
  .btn-primary:hover { background: #06b6d4; }
  .btn-sm { display: inline-flex; align-items: center; justify-content: center; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; text-decoration: none; }

  /* Pagination */
  .pagination {
    display: flex; align-items: center; justify-content: flex-end; gap: 16px;
    padding: 12px 20px; border-top: 1px solid var(--border); background: var(--bg-panel);
  }
  .page-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
    background: transparent; border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-primary); font-size: 12px; cursor: pointer;
  }
  .page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .page-info { font-size: 12px; color: var(--text-muted); }
</style>

