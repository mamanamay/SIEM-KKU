<script>
    import { eventsStore } from '../../../stores/events';
    $: events = $eventsStore;
  </script>
  <div class="page-container">
    <div class="page-title"><i class="ti ti-list-search"></i> Threat Investigation</div>
    <div class="filter-bar">
      <span class="filter-label">Search IP:</span>
      <input type="text" placeholder="e.g. 192.168.1.1" style="background:var(--bg-secondary);border:1px solid var(--border);padding:6px 12px;border-radius:6px;font-size:12px;outline:none;color:var(--text-primary)">
      <button class="range-btn active">🔍 Search</button>
      <div style="flex-grow:1"></div>
      <button class="refresh-btn">⟳ Refresh</button>
    </div>
    <div class="panel">
      <table class="data-table">
        <tr><th>Time</th><th>Source IP</th><th>Target Port</th><th>Protocol</th><th>Event Type</th></tr>
        {#each events.slice(0, 15) as e}
        <tr>
          <td>{e.time || e.timeStr}</td>
          <td style="font-family: monospace;">{e.ip}</td>
          <td>{e.port || 80}</td>
          <td>{e.protocol || 'TCP'}</td>
          <td>{e.type}</td>
        </tr>
        {/each}
        {#if events.length === 0}<tr><td colspan="5">No events found</td></tr>{/if}
      </table>
    </div>
  </div>
<style>
  .page-container { padding: 1.5rem; max-width: 1400px; margin: 0 auto; }
  .page-title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 8px; }
  .page-title i { color: var(--green); }
  
  .filter-bar {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 0.85rem 1.25rem; margin-bottom: 1.25rem; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; box-shadow: var(--shadow-sm);
  }
  .filter-label { font-size: 11px; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; margin-right: 4px; }
  .range-btns { display: flex; gap: 4px; }
  .range-btn {
    background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-secondary);
    font-size: 11px; padding: 5px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s;
  }
  .range-btn.active, .range-btn:hover { background: rgba(0, 212, 255, 0.15); border-color: var(--accent); color: var(--accent); }
  .refresh-btn { margin-left: auto; background: var(--accent); color: white; font-size: 11px; font-weight: 600; padding: 6px 16px; border: none; border-radius: 6px; cursor: pointer; }
  
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 1.25rem; }
  .kpi {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
    padding: 1rem; position: relative; overflow: hidden; box-shadow: var(--shadow-sm);
  }
  .kpi::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--kpi-color, var(--accent)); }
  .kpi-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
  .kpi-value { font-size: 24px; font-weight: bold; color: var(--text-primary); }
  .kpi-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

  .panel { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; box-shadow: var(--shadow-sm); margin-bottom: 1.25rem; }
  
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th { text-align: left; padding: 10px 8px; border-bottom: 2px solid var(--border); color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .data-table td { padding: 10px 8px; border-bottom: 1px solid var(--border); color: var(--text-primary); }
  .data-table tr:hover td { background: rgba(0, 212, 255, 0.05); }

  .badge { display: inline-block; font-size: 10px; padding: 3px 8px; border-radius: 4px; font-weight: 600; letter-spacing: 0.04em; }
  .b-red { background: rgba(255, 51, 51, 0.15); color: #ff3333; border: 1px solid rgba(255, 51, 51, 0.4); }
  .b-orange { background: rgba(255, 136, 0, 0.15); color: #ff8800; border: 1px solid rgba(255, 136, 0, 0.4); }
  .b-cyan { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.4); }
  
  .terminal-box { background: #0a0e17; border: 1px solid #1e2d45; border-radius: 8px; padding: 15px; font-family: monospace; color: #00ff00; height: 300px; overflow-y: auto; }
  .terminal-line { margin-bottom: 8px; font-size: 13px; }
</style>
