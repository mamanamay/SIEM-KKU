<script></script>
  <div class="page-container">
    <div class="page-title"><i class="ti ti-target"></i> Indicators of Compromise (IOC)</div>
    <div class="panel">
      <table class="data-table">
        <tr><th>Indicator</th><th>Type</th><th>Threat Actor</th><th>Confidence</th><th>Last Seen</th></tr>
        <tr><td style="font-family:monospace">7b24afc8bc...</td><td><span class="badge b-orange">SHA256</span></td><td>Unknown</td><td>High</td><td>Just now</td></tr>
        <tr><td style="font-family:monospace">malicious-domain.com</td><td><span class="badge b-cyan">Domain</span></td><td>APT32</td><td>Medium</td><td>1h ago</td></tr>
        <tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">Awaiting full IOC stream...</td></tr>
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
  .b-green { background: rgba(46, 204, 113, 0.15); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.4); }
</style>
