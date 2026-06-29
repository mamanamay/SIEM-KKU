<script>
    import { eventsStore } from '../../../stores/events';
    $: events = $eventsStore.filter(e => e.type.includes('Brute') || e.type.includes('Exploit'));
  </script>
  <div class="page-container">
    <div class="page-title"><i class="ti ti-grid-dots"></i> MITRE ATT&CK Framework</div>
    <div class="panel">
      <table class="data-table" style="border: 1px solid var(--border)">
        <tr>
          <th style="border: 1px solid var(--border)">Initial Access</th>
          <th style="border: 1px solid var(--border)">Execution</th>
          <th style="border: 1px solid var(--border)">Persistence</th>
          <th style="border: 1px solid var(--border)">Privilege Escalation</th>
          <th style="border: 1px solid var(--border)">Credential Access</th>
        </tr>
        <tr>
          <td style="border: 1px solid var(--border); vertical-align: top;">
            {#each events.slice(0,2) as e}
              <div style="padding:8px; border-radius:6px; background:var(--bg-secondary); margin-bottom:8px; font-size:11px;">
                <div style="color:var(--red);font-weight:bold">T1190 - Exploit Public-Facing App</div>
                <div style="font-family:monospace; margin-top:4px;">{e.ip}</div>
              </div>
            {/each}
          </td>
          <td style="border: 1px solid var(--border); vertical-align: top;">
            {#each events.slice(2,4) as e}
              <div style="padding:8px; border-radius:6px; background:var(--bg-secondary); margin-bottom:8px; font-size:11px;">
                <div style="color:var(--orange);font-weight:bold">T1059 - Command and Scripting</div>
                <div style="font-family:monospace; margin-top:4px;">{e.ip}</div>
              </div>
            {/each}
          </td>
          <td style="border: 1px solid var(--border)"></td>
          <td style="border: 1px solid var(--border)"></td>
          <td style="border: 1px solid var(--border); vertical-align: top;">
            {#if events.length > 0}
              <div style="padding:8px; border-radius:6px; background:var(--bg-secondary); margin-bottom:8px; font-size:11px;">
                <div style="color:var(--red);font-weight:bold">T1110 - Brute Force</div>
                <div style="font-family:monospace; margin-top:4px;">Multiple Sources</div>
              </div>
            {/if}
          </td>
        </tr>
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
  
  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
  .data-table th { width: 20%; text-align: left; padding: 10px 12px; border-bottom: 2px solid var(--border); color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(0,0,0,0.02); }
  .data-table td { padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-primary); }
  .data-table tr:hover td { background: rgba(0, 212, 255, 0.05); }

  .badge { display: inline-block; font-size: 10px; padding: 3px 8px; border-radius: 4px; font-weight: 600; letter-spacing: 0.04em; }
  .b-red { background: rgba(255, 51, 51, 0.15); color: #ff3333; border: 1px solid rgba(255, 51, 51, 0.4); }
  .b-orange { background: rgba(255, 136, 0, 0.15); color: #ff8800; border: 1px solid rgba(255, 136, 0, 0.4); }
  .b-cyan { background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.4); }
  .b-green { background: rgba(46, 204, 113, 0.15); color: #2ecc71; border: 1px solid rgba(46, 204, 113, 0.4); }
</style>
