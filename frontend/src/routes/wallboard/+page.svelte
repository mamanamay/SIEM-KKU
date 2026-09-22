<svelte:head>
  <title>SOC Wallboard - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import OrgBadge from '../../lib/components/OrgBadge.svelte';
  import { eventsStore } from '../../stores/events';
  import { onMount, onDestroy } from 'svelte';
  import WorldMap from '../../lib/components/WorldMap.svelte';
  
  let isFullscreen = false;
  let isPaused = false;
  let showCriticalOnly = false;
  
  let events: any[] = [];
  let animationFrameId: number;

  const unsub = eventsStore.subscribe(val => {
    if (!isPaused) {
      if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animationFrameId = requestAnimationFrame(() => {
          events = val;
        });
      } else {
        events = val; // fallback for SSR
      }
    }
  });

  onDestroy(() => {
    unsub();
    if (typeof window !== 'undefined' && window.cancelAnimationFrame && animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  });

  function toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(err => console.error(err));
      isFullscreen = true;
    } else {
      document.exitFullscreen();
      isFullscreen = false;
    }
  }

  function navigateToSoar(event: any) {
    const ip = event.ip || event.sourceIp || '';
    const time = event.time || event.createdAt || '';
    window.open(`/dashboard/soar?ip=${ip}&time=${time}`, '_blank');
  }
  
  $: totalEvents = events.length;
  $: criticalEvents = events.filter(e => e.severity === 'critical');
  $: highEvents = events.filter(e => e.severity === 'high');
  $: criticalHighEvents = [...criticalEvents, ...highEvents].slice(0, 30); // Show recent criticals
  
  // Top IPs
  $: sourceIPs = events.reduce((acc, e) => {
    const ip = e.ip || e.sourceIp || 'Unknown';
    if (!acc[ip]) acc[ip] = { count: 0, severity: e.severity, type: e.type, events: [], country: e.country || 'Unknown', latitude: e.latitude, longitude: e.longitude };
    acc[ip].count++;
    acc[ip].events.push(e);
    if (!acc[ip].latitude && e.latitude) acc[ip].latitude = e.latitude;
    if (!acc[ip].longitude && e.longitude) acc[ip].longitude = e.longitude;
    if (e.severity === 'critical') acc[ip].severity = 'critical';
    return acc;
  }, {});
  $: topAttackers = Object.entries(sourceIPs).map(([ip, data]: any) => ({ ip, ...data })).sort((a,b) => b.count - a.count).slice(0, 8);
  
  // Convert real latitude/longitude to map X,Y percentages using Web Mercator projection
  function getPosFromLatLng(lat: number, lng: number, country: string, ip: string) {
    if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
       // Web Mercator approximation mapped to 0-100%
       const x = (lng + 180) / 360 * 100;
       const latRad = lat * Math.PI / 180;
       const mercN = Math.log(Math.tan((Math.PI / 4) + (latRad / 2)));
       const y = (1 - (mercN / Math.PI)) / 2 * 100;
       
       // Fine-tuning the projection to fit the SVG map viewBox (0-950, 0-620)
       // The SVG map might not be a perfect Web Mercator. 
       // Adjusted scaling for better visual alignment:
       const adjustedX = x * 0.98 + 1; // minor padding
       const adjustedY = y * 1.05 - 5; // shift up a bit due to map cropping
       return { x: adjustedX, y: adjustedY };
    }

    // Fallback if no lat/lng available
    const c = (country || '').toLowerCase();
    const jitterX = (ip.charCodeAt(ip.length-1) % 4) - 2; // small random spread
    const jitterY = (ip.charCodeAt(ip.length-2) % 4) - 2;
    
    if (c.includes('united states') || c === 'us') return { x: 26 + jitterX, y: 32 + jitterY };
    if (c.includes('russia') || c === 'ru') return { x: 68 + jitterX, y: 22 + jitterY };
    if (c.includes('china') || c === 'cn') return { x: 74 + jitterX, y: 37 + jitterY };
    if (c.includes('brazil') || c === 'br') return { x: 33 + jitterX, y: 62 + jitterY };
    if (c.includes('germany') || c === 'de') return { x: 49 + jitterX, y: 28 + jitterY };
    if (c.includes('thailand') || c === 'th' || c.includes('local')) return { x: 76 + jitterX, y: 45 + jitterY };

    // Pseudo-random but avoiding deep oceans (x < 25)
    let hash = 0;
    for (let i = 0; i < ip.length; i++) hash = Math.imul(31, hash) + ip.charCodeAt(i) | 0;
    hash = Math.abs(hash);
    return {
      x: 28 + (hash % 50),
      y: 20 + ((hash >> 8) % 40)
    };
  }
</script>

<!-- Global Force Dark Theme -->
<div class="wallboard">
  <!-- Scanlines Overlay -->
  <div class="scanlines"></div>

  <!-- Header -->
  <header class="wb-header">
    <div class="wb-brand">
      <i class="ti ti-radar pulse-icon"></i>
      <div>
        <h1>SOC OPERATIONS CENTER</h1>
        <div class="wb-subtitle">KKUSIEM INTELLIGENCE PLATFORM v3.0</div>
      </div>
    </div>

    <div class="wb-stats-top">
      <div class="wb-stat-box">
        <span class="label">LIVE EVENTS</span>
        <span class="value text-info">{totalEvents.toLocaleString()}</span>
      </div>
      <div class="wb-stat-box">
        <span class="label">CRITICAL</span>
        <span class="value text-critical">{criticalEvents.length}</span>
      </div>
      
      <!-- Mini EPS Chart Placeholder -->
      <div class="eps-chart">
         <span class="eps-label">EPS</span>
         <div class="eps-bars">
           {#each Array(10) as _, i}
             <div class="eps-bar" style="height: {Math.random() * 80 + 20}%;"></div>
           {/each}
         </div>
         <span class="eps-val">{Math.floor(Math.random() * 50 + 10)}/s</span>
      </div>
    </div>

    <div class="wb-controls">
      <div class="status-indicator">
        <span class="pulse-dot {isPaused ? 'paused' : ''}"></span>
        <span>{isPaused ? 'PAUSED' : 'LIVE'}</span>
      </div>
      <button on:click={() => isPaused = !isPaused} class="icon-btn" title="Pause/Play Live Feed">
        <i class="ti {isPaused ? 'ti-player-play' : 'ti-player-pause'}"></i>
      </button>
      <button on:click={toggleFullscreen} class="icon-btn" title="Fullscreen Wallboard">
        <i class="ti {isFullscreen ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}"></i>
      </button>
    </div>
  </header>

  <!-- Main Grid Layout -->
  <main class="wb-main">
    
    <!-- Left Column: Map -->
    <section class="wb-col map-col">
      <div class="cyber-panel h-100">
        <div class="panel-header">
          <i class="ti ti-world"></i> GLOBAL ATTACK MAP (LIVE)
          <div class="panel-tools">[ VIEW: ORBITAL ]</div>
        </div>
        
        <div class="map-container">
          <div class="grid-overlay"></div>
          
          <div class="map-svg-wrap">
            <WorldMap stroke="var(--map-stroke)" fill="var(--map-fill)" strokeWidth="0.8" />
          </div>

          <!-- Radar HQ Target (Calibrated to Thailand) -->
          <div class="map-target" style="left: 77%; top: 44%;">
            <div class="radar-sweep"></div>
            <div class="target-dot pulse-glow"></div>
            <div class="target-label">HQ-TH</div>
          </div>

          <!-- Active Attack Nodes and Arcs -->
          {#each topAttackers as attacker (attacker.ip)}
            {@const pos = getPosFromLatLng(attacker.latitude, attacker.longitude, attacker.country, attacker.ip)}
            {@const hqX = 77}
            {@const hqY = 44}
            {@const controlX = (hqX - pos.x) / 2}
            {@const controlY = (hqY - pos.y) / 2 - 20}
            
            <!-- Source Node -->
            <div class="map-node" style="left: {pos.x}%; top: {pos.y}%;">
              <div class="node-dot severity-{attacker.severity} pulse"></div>
              <div class="node-tooltip">
                <span class="ip">{attacker.ip}</span><br/>
                <span class="count">{attacker.count} Events</span>
              </div>
            </div>

            <!-- Attack Arc to HQ -->
            <svg class="attack-arc" preserveAspectRatio="none" style="position: absolute; top:0; left:0; width: 100%; height: 100%; pointer-events:none; z-index:10; overflow:visible;">
              <path id="arc-{attacker.ip.replace(/\./g, '-')}" d="M {pos.x}% {pos.y}% Q {(pos.x + hqX)/2}% {(pos.y + hqY)/2 - 15}% {hqX}% {hqY}%" 
                    stroke="var(--color-{attacker.severity})" 
                    stroke-width="1.5" 
                    fill="none"
                    class="anim-arc" />
              <!-- Moving Projectile -->
              <circle r="3" fill="var(--color-{attacker.severity})" filter="drop-shadow(0 0 5px var(--color-{attacker.severity}))">
                <animateMotion dur="{1 + (attacker.count % 3)}s" repeatCount="indefinite">
                  <mpath href="#arc-{attacker.ip.replace(/\./g, '-')}" />
                </animateMotion>
              </circle>
            </svg>
          {/each}
        </div>
      </div>
    </section>

    <!-- Right Column: Security Incidents & Threat Actors -->
    <section class="wb-col side-col">
      <!-- High Priority Incidents (Top) -->
      <div class="cyber-panel h-50 mb-15">
        <div class="panel-header">
          <i class="ti ti-alert-triangle"></i> ACTIVE INCIDENTS
          <div class="panel-tools text-critical">{criticalEvents.length} CRITICAL</div>
        </div>
        <div class="panel-body custom-scrollbar">
          {#each criticalHighEvents as event (event.id || event.time)}
            <div class="critical-item severity-{event.severity} clickable-log" 
                 role="button" tabindex="0"
                 on:click={() => navigateToSoar(event)}
                 on:keydown={(e) => e.key === 'Enter' && navigateToSoar(event)}>
              <div class="ci-head">
                <span class="ci-sev">{event.severity.toUpperCase()}</span>
                <span class="ci-time">{new Date(event.time || event.createdAt).toLocaleTimeString()}</span>
              </div>
              <div class="ci-type">{event.type}</div>
              <div class="ci-detail">SRC: <span class="ci-ip">{event.ip || event.sourceIp}</span></div>
            </div>
          {/each}
          {#if criticalHighEvents.length === 0}
             <div class="empty-state">> ALL SYSTEMS NOMINAL. No active incidents.</div>
          {/if}
        </div>
      </div>

      <!-- Threat Actors (Bottom) -->
      <div class="cyber-panel h-50">
        <div class="panel-header">
          <i class="ti ti-target"></i> TOP THREAT ACTORS
          <div class="panel-tools">[ REAL-TIME ]</div>
        </div>
        <div class="panel-body custom-scrollbar">
          <div class="attacker-list">
            {#each topAttackers as attacker (attacker.ip)}
              <div class="attacker-item">
                <div class="ai-ip" style="display:flex; align-items:center; gap:8px;">{attacker.ip} <OrgBadge organization={attacker.organization || attacker.events[0]?.organization} country={attacker.country || attacker.events[0]?.country} /></div>
                <div class="ai-bar-wrap">
                   <div class="ai-bar bg-{attacker.severity}" style="width: {Math.min(attacker.count * 2, 100)}%;"></div>
                </div>
                <div class="ai-count">{attacker.count}</div>
              </div>
            {/each}
            {#if topAttackers.length === 0}
               <div class="empty-state">> NO ATTACKERS DETECTED.</div>
            {/if}
          </div>
        </div>
      </div>
    </section>

  </main>

  <!-- Bottom Row: Terminal Log Stream -->
  <footer class="wb-footer">
    <div class="cyber-panel h-100">
      <div class="panel-header">
        <div style="display:flex; align-items:center; gap: 15px;">
          <span><i class="ti ti-terminal"></i> RAW LOG STREAM (syslog)</span>
          <button class="filter-toggle {showCriticalOnly ? 'active' : ''}" on:click={() => showCriticalOnly = !showCriticalOnly}>
            [ {showCriticalOnly ? 'CRITICAL ONLY' : 'ALL EVENTS'} ]
          </button>
        </div>
        <div class="panel-tools blink">_</div>
      </div>
      <div class="panel-body terminal-feed custom-scrollbar">
        {#each (showCriticalOnly ? criticalEvents : events).slice(0, 50) as event (event.id || event.time)}
          <div class="term-line {event.severity} clickable-log"
               role="button" tabindex="0"
               on:click={() => navigateToSoar(event)}
               on:keydown={(e) => e.key === 'Enter' && navigateToSoar(event)}
               title="Click to Investigate in SOAR">
             <span class="t-time">[{new Date(event.time || event.createdAt).toISOString()}]</span>
             <span class="t-fac">{event.source || 'syslog'}.alert</span>
             <span class="t-ip" style="display:flex; align-items:center; gap:8px;">{event.ip || event.sourceIp} <OrgBadge organization={event.organization} country={event.country} /></span>
             <span class="t-type" style="width: 250px;">[{event.type ? event.type.replace(/ /g, '_').toUpperCase() : 'UNKNOWN_ATTACK'}]</span>
             <span class="t-mitre" style="width: 80px; color: var(--color-medium); font-weight: bold;">{event.mitreCode || 'T0000'}</span>
             <span class="t-msg">
                 <span style="color: #fff;">DETAIL:</span> {event.detail || event.description || event.message || 'Suspicious Activity Detected'} 
                 {#if event.mitigation}
                   <span style="color: var(--color-info); margin-left: 10px;">| <span style="color: #fff;">RECOMMEND:</span> {event.mitigation}</span>
                 {/if}
                 <span style="color: var(--text-dim); margin-left: 10px;">| SCORE: {event.threatScore || 50}</span>
             </span>
          </div>
        {/each}
      </div>
    </div>
  </footer>

</div>

<style>
  /* =========================================================
     WALLBOARD PURE DARK THEME (STANDALONE)
     ========================================================= */
  :global(body) {
    margin: 0; padding: 0; background: #000; overflow: hidden;
  }
  
  .wallboard {
    --bg-base: #020617;
    --bg-panel: rgba(2, 6, 23, 0.85);
    --bg-header: rgba(2, 6, 23, 0.95);
    --border-dim: #1e293b;
    --border-glow: #334155;
    
    --text-main: #e2e8f0;
    --text-dim: #64748b;
    --text-term: #10b981; /* Terminal bright green */
    
    --color-critical: #ff2a2a;
    --color-high: #ff8c00;
    --color-medium: #eab308;
    --color-low: #22c55e;
    --color-info: #0ea5e9;
    
    --map-fill: #064e3b; /* Dark emerald/cyan-ish */
    --map-stroke: #0ea5e9; /* Glowing cyber blue */
    
    width: 100vw;
    height: 100vh;
    background: radial-gradient(circle at center, #020617 0%, #000000 100%);
    color: var(--text-main);
    display: flex;
    flex-direction: column;
    font-family: 'Inter', -apple-system, sans-serif;
    position: relative;
    overflow: hidden;
  }

  .text-critical { color: var(--color-critical); font-weight: 800; }
  .text-info { color: var(--color-info); font-weight: 800; }
  .mb-15 { margin-bottom: 15px; }

  /* Scanlines Overlay */
  .scanlines {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.3));
    background-size: 100% 4px; pointer-events: none; z-index: 999; opacity: 0.5;
  }

  /* Header */
  .wb-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 20px; background: var(--bg-header); border-bottom: 1px solid var(--border-glow);
    z-index: 10; height: 60px; flex-shrink: 0;
  }
  
  .wb-brand { display: flex; align-items: center; gap: 12px; }
  .pulse-icon { font-size: 24px; color: var(--color-info); animation: pulse-dot 2s infinite; }
  .wb-brand h1 { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: 3px; color: #fff; text-shadow: 0 0 10px rgba(14,165,233,0.5); }
  .wb-subtitle { font-size: 10px; color: var(--text-dim); letter-spacing: 2px; font-family: monospace; }

  .wb-stats-top { display: flex; align-items: center; gap: 20px; }
  .wb-stat-box { display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.5); padding: 4px 16px; border: 1px solid var(--border-dim); border-radius: 4px; }
  .wb-stat-box .label { font-size: 9px; font-weight: 800; color: var(--text-dim); letter-spacing: 1px; }
  .wb-stat-box .value { font-size: 18px; line-height: 1.2; text-shadow: 0 0 10px currentColor; }

  /* EPS Sparkline */
  .eps-chart { display: flex; align-items: center; gap: 10px; background: rgba(0,0,0,0.5); padding: 4px 12px; border-radius: 4px; border: 1px solid var(--border-dim); height: 42px;}
  .eps-label { font-size: 9px; font-weight: 800; color: var(--color-info); }
  .eps-bars { display: flex; align-items: flex-end; gap: 2px; height: 20px; width: 40px; }
  .eps-bar { width: 3px; background: var(--color-info); opacity: 0.8; }
  .eps-val { font-family: monospace; font-size: 14px; color: #fff; width: 40px; text-align: right; }

  .wb-controls { display: flex; align-items: center; gap: 15px; }
  .status-indicator { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 800; color: var(--color-low); letter-spacing: 1px; }
  .pulse-dot { width: 8px; height: 8px; background: var(--color-low); border-radius: 50%; box-shadow: 0 0 10px var(--color-low); animation: pulse-dot 1s infinite; }
  .pulse-dot.paused { background: var(--color-medium); box-shadow: 0 0 10px var(--color-medium); animation: none; }
  .status-indicator:has(.paused) { color: var(--color-medium); }

  @keyframes pulse-dot { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

  .icon-btn { background: #000; border: 1px solid var(--border-dim); color: var(--text-main); width: 32px; height: 32px; border-radius: 4px; cursor: pointer; transition: 0.2s; }
  .icon-btn:hover { background: var(--border-dim); color: #fff; }

  /* Main Grid */
  .wb-main {
    display: flex; flex: 1; padding: 15px; gap: 15px; overflow: hidden;
  }
  .wb-col { display: flex; flex-direction: column; }
  .map-col { flex: 3; }
  .side-col { flex: 1; min-width: 350px; }
  .wb-footer { height: 250px; padding: 0 15px 15px 15px; flex-shrink: 0; }

  /* Panels */
  .cyber-panel {
    background: var(--bg-panel); border: 1px solid var(--border-dim); border-radius: 6px;
    box-shadow: 0 4px 30px rgba(0,0,0,0.8); display: flex; flex-direction: column; overflow: hidden;
    backdrop-filter: blur(10px);
  }
  .h-100 { height: 100%; }
  .h-50 { height: calc(50% - 7.5px); }

  .panel-header {
    background: rgba(0,0,0,0.6); border-bottom: 1px solid var(--border-glow);
    padding: 8px 16px; font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #fff;
    display: flex; align-items: center; justify-content: space-between;
  }
  .panel-tools { font-family: monospace; font-size: 10px; color: var(--text-dim); }
  .panel-body { flex: 1; overflow-y: auto; padding: 12px; }
  .blink { animation: blink 1s infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  
  .filter-toggle {
    background: transparent; border: none; color: var(--text-dim);
    font-family: monospace; font-size: 10px; cursor: pointer; padding: 2px 6px;
    border-radius: 2px; transition: 0.2s;
  }
  .filter-toggle:hover { color: #fff; background: rgba(255,255,255,0.1); }
  .filter-toggle.active { color: var(--color-critical); font-weight: bold; }

  /* MAP */
  .map-container {
    flex: 1; position: relative; background: #000; overflow: hidden;
  }
  .grid-overlay {
    position: absolute; top:0; left:0; width:100%; height:100%;
    background-image: linear-gradient(rgba(14, 165, 233, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(14, 165, 233, 0.1) 1px, transparent 1px);
    background-size: 50px 50px; z-index: 1;
  }
  .map-svg-wrap {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;
    opacity: 0.7; filter: drop-shadow(0 0 10px rgba(14,165,233,0.5));
  }
  
  .map-target { position: absolute; transform: translate(-50%, -50%); z-index: 10; text-align: center; }
  .target-dot { width: 12px; height: 12px; background: #fff; border-radius: 50%; box-shadow: 0 0 20px 5px var(--color-info); margin: 0 auto; position: relative; z-index: 11;}
  .target-label { font-size: 11px; font-weight: 900; margin-top: 6px; color: var(--color-info); text-shadow: 0 0 8px var(--color-info); letter-spacing: 1px; position: relative; z-index: 11; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--color-info);}
  
  .radar-sweep {
    position: absolute; top: 50%; left: 50%; width: 500px; height: 500px;
    margin-top: -250px; margin-left: -250px;
    border-radius: 50%; border: 1px solid rgba(14, 165, 233, 0.3);
    background: conic-gradient(from 0deg, transparent 70%, rgba(14, 165, 233, 0.4) 100%);
    animation: sweep 4s linear infinite; z-index: 10; pointer-events: none;
  }
  @keyframes sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  .map-node { position: absolute; z-index: 20; transform: translate(-50%, -50%); }
  .node-dot { width: 8px; height: 8px; background: var(--color-critical); border-radius: 50%; box-shadow: 0 0 15px 3px var(--color-critical); }
  .node-dot.severity-high { background: var(--color-high); box-shadow: 0 0 15px 3px var(--color-high); }
  
  .node-tooltip {
    position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.9); border: 1px solid var(--border-dim);
    padding: 6px 10px; font-size: 11px; border-radius: 4px; font-family: monospace;
    white-space: nowrap; opacity: 0; pointer-events: none; transition: 0.2s; color: #fff;
    text-align: center;
  }
  .node-tooltip .ip { font-weight: 700; color: var(--color-info); }
  .node-tooltip .count { color: var(--text-dim); font-size: 10px; }
  .map-node:hover .node-tooltip { opacity: 1; }

  @keyframes dash-arc { to { stroke-dashoffset: -100; } }
  .anim-arc { stroke-dasharray: 8 15; stroke-linecap: round; animation: dash-arc 1.5s linear infinite; filter: drop-shadow(0 0 8px currentColor); }

  /* Clickable Logs & Incidents */
  .clickable-log { cursor: pointer; transition: background-color 0.2s, box-shadow 0.2s; }
  .clickable-log:hover { background-color: rgba(255,255,255,0.08); box-shadow: inset 0 0 10px rgba(255,255,255,0.1); }
  .clickable-log:focus { outline: 1px solid var(--color-info); }

  /* Incidents Panel */
  .critical-item {
    background: rgba(255,255,255,0.02); border: 1px solid var(--border-dim); border-left: 3px solid var(--color-critical);
    padding: 10px 12px; border-radius: 4px; margin-bottom: 8px; font-family: monospace;
  }
  .critical-item.severity-high { border-left-color: var(--color-high); }
  
  .ci-head { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .ci-sev { font-size: 10px; font-weight: 900; color: var(--color-critical); letter-spacing: 1px;}
  .critical-item.severity-high .ci-sev { color: var(--color-high); }
  .ci-time { font-size: 10px; color: var(--text-dim); }
  .ci-type { font-weight: 700; font-size: 12px; color: #fff; margin-bottom: 2px; }
  .ci-detail { font-size: 11px; color: var(--text-dim); }
  .ci-ip { color: var(--color-info); font-weight: 700; }

  .empty-state { font-family: monospace; font-size: 11px; color: var(--text-dim); padding: 10px; }

  /* Threat Actors Panel */
  .attacker-list { display: flex; flex-direction: column; gap: 8px; }
  .attacker-item {
    display: flex; align-items: center; gap: 12px;
    background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 4px; border: 1px solid var(--border-dim);
  }
  .ai-ip { font-weight: 700; font-family: monospace; font-size: 12px; color: #fff; width: 190px; flex-shrink: 0; }
  .ai-bar-wrap { flex: 1; height: 6px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden; }
  .ai-bar { height: 100%; box-shadow: 0 0 10px currentColor; }
  .bg-critical { background: var(--color-critical); color: var(--color-critical); }
  .bg-high { background: var(--color-high); color: var(--color-high); }
  .ai-count { font-size: 11px; font-weight: 800; color: var(--text-dim); width: 40px; text-align: right; }

  /* Terminal Feed */
  .terminal-feed { background: #000; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.6; padding: 15px; }
  .term-line { display: flex; gap: 20px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px; align-items: center; }
  .t-time { color: var(--text-dim); width: 175px; flex-shrink: 0; }
  .t-fac { color: #6b7280; width: 90px; flex-shrink: 0; }
  .t-ip { color: var(--color-info); width: 190px; flex-shrink: 0; font-weight: 700; }
  .t-type { color: #fff; width: 230px; flex-shrink: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.5px; }
  .t-msg { color: var(--text-term); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  
  .term-line.critical .t-ip { color: var(--color-critical); text-shadow: 0 0 5px var(--color-critical); }
  .term-line.critical .t-type { color: var(--color-critical); font-weight: 900; }
  .term-line.high .t-ip { color: var(--color-high); }
</style>
