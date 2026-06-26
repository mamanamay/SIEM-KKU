<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  
  $: events = $eventsStore;
  
  // Calculate Top IPs
  $: topIps = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.ip] = (counts[e.ip] || 0) + 1);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count, percent: Math.round((count / events.length) * 100) || 0 }));
  })();

  // Calculate Top Types
  $: topTypes = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.type] = (counts[e.type] || 0) + 1);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count, percent: Math.round((count / events.length) * 100) || 0 }));
  })();

</script>

<div class="analytics-page">
  <div class="grid-2">
    <!-- Top IPs -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="ti ti-map-pin"></i> Top Attacker IPs</div>
        <div class="subtitle">Frequent sources of intrusion</div>
      </div>
      
      <div class="stat-list">
        {#each topIps as item, i}
        <div class="stat-item">
          <div class="stat-rank">#{i + 1}</div>
          <div class="stat-info">
            <div class="stat-name">{item.ip}</div>
            <div class="bar-bg">
              <div class="bar-fill {i===0?'danger':(i<3?'warn':'info')}" style="width: {item.percent}%"></div>
            </div>
          </div>
          <div class="stat-val">{item.count} <span class="text-muted">hits</span></div>
        </div>
        {/each}
        {#if topIps.length === 0}
          <div class="empty-state">No data available</div>
        {/if}
      </div>
    </div>

    <!-- Top Attack Types -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="ti ti-target"></i> Attack Vectors</div>
        <div class="subtitle">Most common methods used</div>
      </div>
      
      <div class="stat-list">
        {#each topTypes as item, i}
        <div class="stat-item">
          <div class="stat-rank">#{i + 1}</div>
          <div class="stat-info">
            <div class="stat-name">{item.type}</div>
            <div class="bar-bg">
              <div class="bar-fill {i===0?'danger':(i<3?'warn':'info')}" style="width: {item.percent}%"></div>
            </div>
          </div>
          <div class="stat-val">{item.count} <span class="text-muted">hits</span></div>
        </div>
        {/each}
        {#if topTypes.length === 0}
          <div class="empty-state">No data available</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="panel mt-4">
    <div class="panel-header">
      <div class="panel-title"><i class="ti ti-key"></i> Extracted Credentials (Passwords / Payloads)</div>
      <div class="subtitle">Raw payloads captured by Cowrie Honeypot</div>
    </div>
    <div class="creds-grid">
      {#each events.filter(e => e.detail && e.detail.length > 5).slice(0, 12) as event}
        <div class="cred-card">
          <div class="cred-ip">{event.ip}</div>
          <div class="cred-payload">{event.detail}</div>
          <div class="cred-time">{event.time || event.timeStr}</div>
        </div>
      {/each}
      {#if events.filter(e => e.detail && e.detail.length > 5).length === 0}
        <div class="empty-state">No payloads captured yet.</div>
      {/if}
    </div>
  </div>
</div>

<style>
.analytics-page { max-width: 1400px; margin: 0 auto; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mt-4 { margin-top: 16px; }

.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1.5rem;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column;
}
.panel-header { margin-bottom: 1.5rem; }
.panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.panel-title i { color: var(--green); font-size: 18px; }
.subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 4px; padding-left: 26px; }

.stat-list { display: flex; flex-direction: column; gap: 16px; }
.stat-item { display: flex; align-items: center; gap: 12px; }
.stat-rank { width: 24px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-align: right; }
.stat-info { flex: 1; }
.stat-name { font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 6px; font-family: 'Courier New', monospace; }
.bar-bg { width: 100%; height: 6px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.bar-fill.danger { background: var(--red); }
.bar-fill.warn { background: var(--orange); }
.bar-fill.info { background: var(--green); }
.stat-val { font-size: 14px; font-weight: 600; color: var(--text-primary); min-width: 60px; text-align: right; }
.text-muted { font-size: 11px; font-weight: 400; color: var(--text-muted); }

.creds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.cred-card {
  background: var(--bg-secondary); border: 1px solid var(--border);
  padding: 12px; border-radius: var(--radius-sm);
}
.cred-ip { font-size: 11px; color: var(--text-secondary); font-weight: 600; margin-bottom: 6px; }
.cred-payload { font-family: 'Courier New', monospace; font-size: 12px; color: var(--red); word-break: break-all; margin-bottom: 8px; }
.cred-time { font-size: 10px; color: var(--text-muted); text-align: right; }

.empty-state { text-align: center; color: var(--text-muted); font-size: 13px; padding: 2rem; }

@media (max-width: 900px) {
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
