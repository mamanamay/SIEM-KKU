const fs = require('fs');
const file = 'src/routes/dashboard/monitor/+page.svelte';

const content = `<svelte:head>
  <title>SOC Monitor Wall - KKUSIEM</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet">
</svelte:head>

<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { formatEventTime } from '../../../lib/formatTime';

  $: events = $eventsStore;
  
  // Alert Stream (last 30 events)
  $: alertStream = events.slice(0, 30);
  
  // Top Attackers
  $: topAttackers = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => counts[e.ip] = (counts[e.ip] || 0) + 1);
    return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0, 5);
  })();

  $: totalAttacks = events.length;
  $: criticalAttacks = events.filter(e => e.severity === 'critical').length;
  
  function sevColor(sev: string) {
    if (sev === 'critical') return '#ff003c';
    if (sev === 'high') return '#ff8a00';
    if (sev === 'medium') return '#eab308';
    return '#00ff88';
  }

  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }
</script>

<div class="soc-wall">
  <div class="wall-header">
    <div class="glow-text">SOC OPERATIONS CENTER</div>
    <button class="fs-btn" on:click={toggleFullScreen}><i class="ti ti-maximize"></i> FULLSCREEN</button>
  </div>

  <div class="wall-grid">
    <!-- Top Left: Live Threat Map Placeholder or Activity -->
    <div class="wall-panel">
      <div class="panel-title">GLOBAL THREAT MAP</div>
      <div class="map-placeholder">
        <i class="ti ti-radar" style="font-size: 80px; color: #0088ff; animation: pulse 2s infinite;"></i>
        <div style="margin-top: 20px; font-family: 'Orbitron', sans-serif; color: #0088ff; font-size: 14px; letter-spacing: 2px;">SCANNING SECTORS...</div>
      </div>
    </div>

    <!-- Top Right: Alert Stream -->
    <div class="wall-panel">
      <div class="panel-title">LIVE ALERT STREAM</div>
      <div class="stream-container">
        {#each alertStream as ev (ev.id || Math.random())}
          <div class="stream-row">
            <span class="st-time">{formatEventTime(ev.time || ev.createdAt)}</span>
            <span class="st-ip" style="color: {sevColor(ev.severity)}">{ev.ip}</span>
            <span class="st-type">{ev.type}</span>
          </div>
        {/each}
        {#if alertStream.length === 0}
           <div style="color: #00ff88; font-family: 'Orbitron', sans-serif; text-align: center; padding: 20px;">NO ALERTS DETECTED</div>
        {/if}
      </div>
    </div>

    <!-- Bottom Left: Attack Stats -->
    <div class="wall-panel">
      <div class="panel-title">THREAT STATISTICS</div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="sb-val" style="color: #00ff88;">{totalAttacks.toLocaleString()}</div>
          <div class="sb-lbl">TOTAL EVENTS</div>
        </div>
        <div class="stat-box">
          <div class="sb-val" style="color: #ff003c;">{criticalAttacks.toLocaleString()}</div>
          <div class="sb-lbl">CRITICAL ALERTS</div>
        </div>
      </div>
    </div>

    <!-- Bottom Right: Top Attackers -->
    <div class="wall-panel">
      <div class="panel-title">TOP ADVERSARIES</div>
      <div class="adversary-list">
        {#each topAttackers as [ip, count], i}
          <div class="adv-row">
            <span class="adv-rank">0{i+1}</span>
            <span class="adv-ip">{ip}</span>
            <span class="adv-count">{count} HITS</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  :global(body:fullscreen) .sidebar { display: none !important; }
  :global(body:fullscreen) .layout-wrapper { grid-template-columns: 1fr !important; }
  
  .soc-wall {
    background: #050a14;
    min-height: calc(100vh - 100px);
    padding: 20px;
    font-family: 'Inter', sans-serif;
    color: #e2e8f0;
  }
  
  :global(body:fullscreen) .soc-wall {
    min-height: 100vh;
  }

  .wall-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .glow-text {
    font-family: 'Orbitron', sans-serif;
    font-size: 28px;
    font-weight: 900;
    color: #00ff88;
    text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
    letter-spacing: 4px;
  }

  .fs-btn {
    background: transparent;
    border: 1px solid #0088ff;
    color: #0088ff;
    padding: 8px 16px;
    font-family: 'Orbitron', sans-serif;
    cursor: pointer;
    border-radius: 4px;
    transition: 0.2s;
  }
  .fs-btn:hover {
    background: rgba(0, 136, 255, 0.2);
    box-shadow: 0 0 15px rgba(0, 136, 255, 0.4);
  }

  .wall-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 50vh 30vh;
    gap: 20px;
  }

  .wall-panel {
    background: rgba(0, 20, 40, 0.5);
    border: 1px solid #003366;
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    box-shadow: inset 0 0 20px rgba(0, 136, 255, 0.05);
    overflow: hidden;
    position: relative;
  }
  
  .wall-panel::before {
    content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
    background: linear-gradient(90deg, transparent, #0088ff, transparent);
  }

  .panel-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 14px;
    color: #0088ff;
    margin-bottom: 20px;
    letter-spacing: 2px;
    border-bottom: 1px solid #003366;
    padding-bottom: 8px;
  }

  .map-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 136, 255, 0.05) 2px, rgba(0, 136, 255, 0.05) 4px);
  }

  @keyframes pulse { 0% { opacity: 0.5; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.5; transform: scale(0.9); } }

  .stream-container {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .stream-container::-webkit-scrollbar { width: 4px; }
  .stream-container::-webkit-scrollbar-thumb { background: #003366; }

  .stream-row {
    display: grid;
    grid-template-columns: 80px 140px 1fr;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    padding: 6px;
    background: rgba(0,0,0,0.3);
    border-left: 2px solid #00ff88;
  }
  
  .st-time { color: #64748b; }
  .st-type { color: #cbd5e1; }

  .stats-grid {
    display: flex;
    gap: 20px;
    height: 100%;
  }

  .stat-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: rgba(0,0,0,0.4);
    border: 1px solid #003366;
    border-radius: 8px;
  }

  .sb-val { font-family: 'Orbitron', sans-serif; font-size: 48px; font-weight: 900; }
  .sb-lbl { font-family: 'Orbitron', sans-serif; font-size: 12px; color: #64748b; letter-spacing: 2px; }

  .adversary-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .adv-row {
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
    background: rgba(0,0,0,0.4);
    padding: 10px;
    border-radius: 4px;
    border-left: 2px solid #ff003c;
  }
  .adv-rank { color: #ff003c; font-weight: bold; margin-right: 15px; }
  .adv-ip { color: #e2e8f0; flex: 1; }
  .adv-count { color: #ff8a00; font-weight: bold; }

</style>
`;

fs.writeFileSync(file, content);
console.log('SOC monitor wall created!');
