<script lang="ts">
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';
  import ExportBtn from '../../../lib/components/ExportBtn.svelte';
  import OrgBadge from '../../../lib/components/OrgBadge.svelte';
  let searchQuery = '';
  let dateRange = 'last24h';
  let isSearching = false;
  let searchResults: any[] = [];
  let executionTime = 0;
  let isLiveUpdates = false;
  
  let showModal = false;
  let selectedIncident = null;
  
  function openIncident(row) {
    if (row.id || row.incident_id) {
      window.location.href = `/dashboard/soar?id=${row.id || row.incident_id}`;
    } else {
      window.location.href = `/dashboard/soar?ip=${row.ip}&time=${row.time || row.createdAt}`;
    }
  }
  
  $: if(isLiveUpdates && $eventsStore) { performSearch(); }
  
  // Histogram Data
  

  async function performSearch() {
    isSearching = true;
    const start = performance.now();
    
    // Simulate KQL parsing & filtering
    setTimeout(() => {
      const q = searchQuery.toLowerCase();
      searchResults = $eventsStore.filter((e: any) => {
        if (!q) return true;
        return String(e.ip || '').toLowerCase().includes(q) || 
               String(e.severity || '').toLowerCase().includes(q) ||
               String(e.type || '').toLowerCase().includes(q) ||
               String(typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload || "")).toLowerCase().includes(q);
      });
      executionTime = Math.round(performance.now() - start);
      isSearching = false;
      
    }, 600);
  }

  

  onMount(() => {
    performSearch();
  });
</script>

<div class="explorer-wrap" style="display:flex;flex-direction:column;gap:16px;">
  <PageHeader title="Log Explorer" description="Perform ad-hoc queries across raw security events." icon="ti-file-search">
    <div slot="actions">
      
    </div>
  </PageHeader>
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
    
    
    <div class="kql-meta" style="display:flex;align-items:center;justify-content:space-between;">
      <span>Found <strong>{searchResults.length.toLocaleString()}</strong> hits in {executionTime}ms.</span>
      <button class="btn-pause-live" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid {isLiveUpdates ? '#10b981' : '#f59e0b'};background:{isLiveUpdates ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'};color:{isLiveUpdates ? '#10b981' : '#f59e0b'};cursor:pointer;transition:all 0.2s;" on:click={() => isLiveUpdates = !isLiveUpdates}>
        <i class="ti {isLiveUpdates ? 'ti-player-play' : 'ti-player-pause'}"></i>
        {isLiveUpdates ? 'Live Updates Active' : 'Live Updates Paused'}
      </button>
    </div>

  </div>

  

  <div class="kql-table-wrap custom-scrollbar">
    <table class="kql-table">
      <thead>
        <tr>
          <th style="width: 150px;">Time</th>
          <th style="width: 120px;">Severity</th>
          <th style="width: 180px;">Source IP / Org</th>
          <th style="width: 180px;">Event Type</th>
          <th>Raw Payload</th>
        </tr>
      </thead>
      <tbody>
        {#each searchResults as row}
          <tr on:click={() => openIncident(row)} style="cursor: pointer;">
            <td class="col-time">{new Date(row.time || row.createdAt).toLocaleString('en-GB')}</td>
            <td>
              <span class="badge {row.severity}">{String(row.severity || '').toUpperCase()}</span>
            </td>
              <td class="col-ip">
                <div style="display:flex; align-items:center; gap:8px;">
                  {row.ip} <OrgBadge organization={row.organization} country={row.country} />
                </div>
              </td>
              <td class="col-type">
                {row.type}
                {#if row.cve}
                  <a href="/dashboard/cve?search={row.cve.id}" target="_blank" class="badge-cve" title="{row.cve.name}" on:click|stopPropagation>
                    <i class="ti ti-bug"></i> {row.cve.id}
                  </a>
                {/if}
              </td>
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
    display: flex; flex-direction: column; flex: 1; background: var(--bg-app); overflow: hidden;
  }
  
  /* Header & Search */
  .kql-header {
    padding: 24px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0;
  }
  .kql-search-box {
    display: flex; height: 48px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  }
  .kql-icon {
    width: 48px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 18px;
  }
  .kql-input {
    flex: 1; background: transparent; border: none; color: var(--text-primary); font-size: 14px; font-family: 'JetBrains Mono', monospace; outline: none; padding-right: 16px;
  }
  .kql-input::placeholder { color: var(--text-muted); opacity: 0.5; }
  
  .kql-date-picker {
    background: var(--bg-surface-hover); border: none; border-left: 1px solid var(--border); color: var(--text-primary); padding: 0 16px; outline: none; cursor: pointer; font-size: 13px; font-weight: 600;
  }
  .btn-search {
    background: #3b82f6; color: var(--text-primary); border: none; padding: 0 24px; font-weight: 700; font-size: 14px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center;
  }
  .btn-search:hover:not(:disabled) { background: #2563eb; }
  .btn-search:disabled { opacity: 0.7; }
  
  .kql-meta { font-size: 12px; color: var(--text-muted); margin-top: 12px; }
  .kql-meta strong { color: var(--text-primary); }

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
    position: sticky; top: 0; background: var(--bg-secondary); backdrop-filter: blur(4px); color: var(--text-muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 24px; border-bottom: 1px solid var(--border); z-index: 10;
  }
  .kql-table td {
    padding: 12px 24px; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text-primary);
  }
  .kql-table tr:hover td { background: var(--bg-surface-hover); }
  
  .col-time { color: var(--text-muted); font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .col-ip { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--blue); }
  .col-type { font-weight: 600; }
  .col-raw { color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 400px; }
  
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; }
  .badge.critical { background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid rgba(239,68,68,0.5); }
  .badge.high { background: rgba(249,115,22,0.2); color: #f97316; border: 1px solid rgba(249,115,22,0.5); }
  .badge.medium { background: rgba(234, 179, 8, 0.2); color: #eab308; border-color: rgba(234, 179, 8, 0.3); }
  .badge.low { background: rgba(34, 197, 94, 0.2); color: #22c55e; border-color: rgba(34, 197, 94, 0.3); }
  .badge-cve {
    display: inline-flex; align-items: center; gap: 4px;
    margin-left: 8px; padding: 2px 6px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 4px; font-size: 10px; font-weight: 700;
    text-decoration: none; transition: 0.2s;
  }
  .badge-cve:hover { background: rgba(239, 68, 68, 0.2); }

  .rotate { animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  
  .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
</style>

