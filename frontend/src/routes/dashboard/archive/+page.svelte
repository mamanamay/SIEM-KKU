<svelte:head><title>Threat Archive - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { formatEventTime } from '../../../lib/formatTime';

  let startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  let endDate = new Date().toISOString().split('T')[0];
  let searchQuery = '';
  let selectedSeverity = 'all';
  let isSearching = false;

  $: filteredLogs = $eventsStore.filter(e => {
    const logTime = new Date(e.createdAt || e.timestamp || e.time).getTime();
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime() + 86399999; // end of the day

    if (logTime < startMs || logTime > endMs) return false;
    
    if (selectedSeverity !== 'all' && e.severity !== selectedSeverity) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const textMatch = (e.ip && e.ip.includes(q)) || (e.type && e.type.toLowerCase().includes(q)) || (e.detail && e.detail.toLowerCase().includes(q));
      if (!textMatch) return false;
    }

    return true;
  });

  function performSearch() {
    isSearching = true;
    setTimeout(() => {
      isSearching = false;
    }, 600);
  }
</script>

<div class="bento-dashboard archive-dashboard">
  <div class="bento-header">
    <div class="header-title">
      <h2><i class="ti ti-terminal"></i> Data Lake & Threat Archive</h2>
      <div class="subtitle">Long-term telemetry retention and historical querying</div>
    </div>
  </div>

  <!-- Query Builder Panel -->
  <div class="bento-cell query-terminal">
    <div class="terminal-header">
      <div class="term-dots"><span></span><span></span><span></span></div>
      <div class="term-title">SIEM Query Builder</div>
    </div>
    
    <div class="terminal-body">
      <div class="query-row">
        <div class="query-block">
          <label>START DATE</label>
          <input type="date" bind:value={startDate}>
        </div>
        <div class="query-block">
          <label>END DATE</label>
          <input type="date" bind:value={endDate}>
        </div>
        <div class="query-block">
          <label>SEVERITY</label>
          <select bind:value={selectedSeverity}>
            <option value="all">ALL</option>
            <option value="critical">CRITICAL</option>
            <option value="high">HIGH</option>
            <option value="medium">MEDIUM</option>
            <option value="low">LOW</option>
          </select>
        </div>
      </div>
      
      <div class="query-row full">
        <div class="query-block full">
          <label>KQL / SEARCH QUERY</label>
          <div class="term-input-wrap">
            <span class="prompt">_&gt;</span>
            <input type="text" bind:value={searchQuery} placeholder="Search by IP, Threat Type, MITRE Tactic, or Payload Signature..." on:keydown={(e) => e.key === 'Enter' && performSearch()}>
          </div>
        </div>
        <button class="bento-btn glow-cyan run-btn" on:click={performSearch} disabled={isSearching}>
          {#if isSearching}
            <i class="ti ti-loader rotate"></i> RUNNING...
          {:else}
            <i class="ti ti-player-play"></i> EXECUTE
          {/if}
        </button>
      </div>
    </div>
  </div>

  <!-- Results Grid -->
  <div class="bento-cell results-grid">
    <div class="cell-header">
      <span><i class="ti ti-database-export"></i> Query Results ({filteredLogs.length} events found)</span>
    </div>
    
    <div class="table-wrap custom-scrollbar">
      <table class="bento-table">
        <thead>
          <tr>
            <th>TIMESTAMP</th>
            <th>SOURCE IP</th>
            <th>SEVERITY</th>
            <th>THREAT VECTOR</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredLogs as log}
            <tr class="log-row">
              <td class="mono">{formatEventTime(log.createdAt || log.timestamp || log.time)}</td>
              <td class="mono font-bold text-main">{log.ip}</td>
              <td><span class="sev-badge {log.severity}">{log.severity.toUpperCase()}</span></td>
              <td>{log.type}</td>
              <td>
                <a href="/dashboard/soar?ip={log.ip}&time={log.createdAt || log.timestamp || log.time}" class="action-link"><i class="ti ti-external-link"></i> Trace</a>
              </td>
            </tr>
          {/each}
          {#if filteredLogs.length === 0}
            <tr>
              <td colspan="5">
                <div class="empty">No historical records match the query.</div>
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
.bento-dashboard { display: flex; flex-direction: column; gap: 20px; height: 100%; }
.bento-header { display: flex; justify-content: space-between; align-items: flex-start; }
.header-title h2 { font-size: 20px; font-weight: 800; color: var(--text-main); margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px; }
.header-title h2 i { color: var(--color-cyan); }
.header-title .subtitle { font-size: 12px; color: var(--text-dim); }

.bento-cell { background: var(--bg-surface); backdrop-filter: blur(12px); border: 1px solid var(--border-subtle); border-radius: var(--radius-xl); display: flex; flex-direction: column; overflow: hidden; position: relative; }
.cell-header { padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; }
.cell-header i { font-size: 14px; margin-right: 4px; color: var(--color-cyan); }

/* Query Terminal */
.query-terminal { background: var(--bg-surface-solid); border-color: var(--border-focus); }
.terminal-header { background: var(--bg-surface-hover); padding: 8px 16px; display: flex; align-items: center; border-bottom: 1px solid var(--border-subtle); }
.term-dots { display: flex; gap: 6px; }
.term-dots span { width: 10px; height: 10px; border-radius: 50%; background: #475569; }
.term-dots span:nth-child(1) { background: var(--color-rose); }
.term-dots span:nth-child(2) { background: var(--color-amber); }
.term-dots span:nth-child(3) { background: var(--color-emerald); }
.term-title { flex: 1; text-align: center; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.1em; margin-left: -40px; }

.terminal-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.query-row { display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; }
.query-block { display: flex; flex-direction: column; gap: 8px; }
.query-block.full { flex: 1; }
.query-block label { font-size: 10px; font-weight: 800; color: var(--color-cyan); font-family: var(--font-mono); letter-spacing: 0.1em; }
.query-block input[type="date"], .query-block select { background: var(--border-subtle); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 14px; color: var(--text-main); font-size: 12px; font-family: var(--font-mono); outline: none; }
.query-block input[type="date"]:focus, .query-block select:focus { border-color: var(--color-cyan); }

.term-input-wrap { display: flex; align-items: center; background: var(--bg-surface-hover); border: 1px solid var(--border-focus); border-radius: 6px; padding: 0 16px; overflow: hidden; }
.term-input-wrap .prompt { color: var(--color-emerald); font-weight: 900; font-family: var(--font-mono); margin-right: 12px; }
.term-input-wrap input { flex: 1; background: transparent; border: none; padding: 16px 0; color: var(--color-emerald); font-size: 14px; font-family: var(--font-mono); outline: none; }
.term-input-wrap input::placeholder { color: rgba(16, 185, 129, 0.3); }

.bento-btn { background: var(--bg-surface); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 8px 16px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s; }
.bento-btn.glow-cyan { color: #000; background: var(--color-cyan); border-color: var(--color-cyan); padding: 14px 32px; font-size: 14px; font-weight: 800; font-family: var(--font-mono); border-radius: 6px; }
.bento-btn.glow-cyan:hover:not([disabled]) { box-shadow: 0 0 24px var(--glow-cyan); filter: brightness(1.2); }
.bento-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

.rotate { animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }

/* Table */
.results-grid { flex: 1; min-height: 0; }
.table-wrap { flex: 1; overflow-y: auto; padding: 0; }
.bento-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.bento-table thead { background: var(--bg-surface-hover); position: sticky; top: 0; z-index: 10; }
.bento-table th { padding: 12px 16px; text-align: left; font-size: 10px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-subtle); }
.bento-table td { padding: 16px; border-bottom: 1px solid var(--border-subtle); color: var(--text-dim); }
.log-row:hover td { background: var(--bg-surface-hover); }

.mono { font-family: var(--font-mono); }
.font-bold { font-weight: 800; }
.text-main { color: var(--text-main); }

.sev-badge { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.05em; }
.sev-badge.critical { background: rgba(244, 63, 94, 0.2); color: var(--color-rose); border: 1px solid rgba(244, 63, 94, 0.4); }
.sev-badge.high { background: rgba(245, 158, 11, 0.2); color: var(--color-amber); border: 1px solid rgba(245, 158, 11, 0.4); }
.sev-badge.medium { background: rgba(6, 182, 212, 0.2); color: var(--color-cyan); border: 1px solid rgba(6, 182, 212, 0.4); }
.sev-badge.low { background: rgba(16, 185, 129, 0.2); color: var(--color-emerald); border: 1px solid rgba(16, 185, 129, 0.4); }

.action-link { color: var(--color-cyan); text-decoration: none; font-weight: 600; display: flex; align-items: center; gap: 4px; transition: 0.2s; }
.action-link:hover { text-decoration: underline; text-shadow: 0 0 8px var(--glow-cyan); }

.empty { padding: 48px; text-align: center; color: var(--text-muted); font-size: 13px; font-style: italic; }
</style>

