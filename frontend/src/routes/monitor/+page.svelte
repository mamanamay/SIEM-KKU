<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { eventsStore, connectionState, initSocket, disconnectSocket } from '../../stores/events';

  // ── State ─────────────────────────────────────────────────────────────────
  let currentTime = '';
  let currentDate = '';
  let timeInterval: any;

  // ── Data ──────────────────────────────────────────────────────────────────
  $: events = $eventsStore;
  $: connected = $connectionState;

  $: total = events.length;
  $: critical = events.filter(e => e.severity === 'critical').length;
  $: high = events.filter(e => e.severity === 'high').length;
  $: medium = events.filter(e => e.severity === 'medium').length;
  $: uniqueIPs = [...new Set(events.map(e => e.ip))].length;
  $: uniqueCountries = [...new Set(events.map(e => e.country).filter(Boolean))].length;

  // High-priority alerts for the left feed
  $: recentAlerts = events.filter(e => e.severity === 'critical' || e.severity === 'high').slice(-25).reverse();
  
  // Real-time raw log feed for terminal view (ALL events)
  $: rawLogs = events.slice(-50).reverse();

  // EPS Calculation (Events Per Second) - mock smoothed over 1 min
  $: epsRate = Math.floor(events.slice(-60).length / 60) || (total > 0 ? 1 : 0);

  $: topIPs = (() => {
    const c: Record<string, number> = {};
    events.forEach(e => c[e.ip] = (c[e.ip] || 0) + 1);
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  // Target Port Analysis
  $: targetPorts = (() => {
    const c: Record<string, {count: number, label: string}> = {};
    events.forEach(e => {
      let port = '80/443'; let label = 'Web/HTTP';
      const t = (e.type || '').toLowerCase();
      if (t.includes('ssh') || t.includes('brute')) { port = '22'; label = 'SSH'; }
      else if (t.includes('sql') || t.includes('xss') || t.includes('path') || t.includes('scan')) { port = '80/443'; label = 'Web/HTTP'; }
      else if (t.includes('smb') || t.includes('eternal')) { port = '445'; label = 'SMB'; }
      else if (t.includes('c&c')) { port = 'Random'; label = 'C2 Comm'; }
      else { port = 'Any'; label = 'General'; }
      
      if (!c[port]) c[port] = { count: 0, label };
      c[port].count++;
    });
    return Object.entries(c).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  })();

  // MITRE ATT&CK Tactics Guess
  $: mitreTactics = (() => {
    const c: Record<string, number> = {
      'Initial Access': 0,
      'Execution': 0,
      'Credential Access': 0,
      'Discovery': 0,
      'Command & Control': 0
    };
    events.forEach(e => {
      const t = (e.type || '').toLowerCase();
      if (t.includes('brute') || t.includes('login')) c['Credential Access']++;
      else if (t.includes('rce') || t.includes('exec')) c['Execution']++;
      else if (t.includes('scan') || t.includes('probe')) c['Discovery']++;
      else if (t.includes('c&c') || t.includes('bot')) c['Command & Control']++;
      else c['Initial Access']++;
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  })();

  // Sparkline — last 20 values by minute buckets
  $: sparkData = (() => {
    const buckets = new Array(20).fill(0);
    const now = Date.now();
    events.forEach(e => {
      const ms = e.timestampMs || 0;
      const minutesAgo = Math.floor((now - ms) / 60000);
      if (minutesAgo >= 0 && minutesAgo < 20) {
        buckets[19 - minutesAgo]++;
      }
    });
    return buckets;
  })();
  $: maxSpark = Math.max(...sparkData, 1);

  // Status/Action count mock (for real-time tracking)
  $: actionBlocked = Math.floor(total * 0.15);
  $: actionDropped = Math.floor(total * 0.60);
  $: actionInvestigating = critical;

  function sevColor(sev: string) {
    if (sev === 'critical') return '#ef4444';
    if (sev === 'high') return '#f97316';
    if (sev === 'medium') return '#f59e0b';
    return '#6b7280';
  }

  function countryFlag(country: string) {
    const f: Record<string, string> = {
      'Russia':'🇷🇺','China':'🇨🇳','United States':'🇺🇸','USA':'🇺🇸','Germany':'🇩🇪',
      'Brazil':'🇧🇷','Japan':'🇯🇵','Korea':'🇰🇷','India':'🇮🇳','Singapore':'🇸🇬',
      'Netherlands':'🇳🇱','France':'🇫🇷','United Kingdom':'🇬🇧','UK':'🇬🇧',
      'Australia':'🇦🇺','Canada':'🇨🇦','Finland':'🇫🇮','Bulgaria':'🇧🇬',
      'Indonesia':'🇮🇩','Vietnam':'🇻🇳','Local Network':'🏠',
    };
    return f[country] || '🌍';
  }

  // ── Map State ──
  let mapEl: HTMLDivElement;
  let map: any;
  let L: any;
  let arcCanvas: HTMLCanvasElement;
  let arcCtx: CanvasRenderingContext2D | null;
  let animFrame: number;
  let arcs: any[] = [];
  const KKU_LAT = 16.4666;
  const KKU_LNG = 102.8399;
  const COUNTRY_COORDS: Record<string, [number, number]> = {
    'Russia': [55.75, 37.61], 'China': [39.90, 116.40], 'United States': [38.89, -77.03], 'USA': [38.89, -77.03],
    'Germany': [52.52, 13.40], 'Brazil': [-15.78, -47.93], 'Japan': [35.68, 139.69], 'Korea': [37.56, 126.97],
    'India': [28.61, 77.20], 'Singapore': [1.35, 103.82], 'Netherlands': [52.37, 4.89], 'France': [48.85, 2.35],
    'United Kingdom': [51.50, -0.12], 'UK': [51.50, -0.12], 'Australia': [-35.28, 149.13], 'Canada': [45.42, -75.69],
    'Finland': [60.17, 24.94], 'Bulgaria': [42.69, 23.32], 'Indonesia': [-6.21, 106.85], 'Vietnam': [21.02, 105.83],
    'Local Network': [16.47, 102.84],
  };

  function buildArcs() {
    arcs = events.filter(e => COUNTRY_COORDS[e.country || ''] && e.country !== 'Local Network').slice(-40).map(e => {
      const [srcLat, srcLng] = COUNTRY_COORDS[e.country!] || [0, 0];
      return {
        srcLat, srcLng, dstLat: KKU_LAT + (Math.random() - 0.5) * 0.02, dstLng: KKU_LNG + (Math.random() - 0.5) * 0.02,
        color: sevColor(e.severity), progress: Math.random(), speed: 0.003 + Math.random() * 0.004
      };
    });
  }

  function drawArc(ctx: CanvasRenderingContext2D, arc: any) {
    if (!map) return;
    const srcPt = map.latLngToContainerPoint([arc.srcLat, arc.srcLng]);
    const dstPt = map.latLngToContainerPoint([arc.dstLat, arc.dstLng]);
    const dx = dstPt.x - srcPt.x; const dy = dstPt.y - srcPt.y;
    const cx = (srcPt.x + dstPt.x) / 2 - dy * 0.3; const cy = (srcPt.y + dstPt.y) / 2 + dx * 0.3;

    ctx.beginPath();
    ctx.moveTo(srcPt.x, srcPt.y);
    ctx.quadraticCurveTo(cx, cy, dstPt.x, dstPt.y);
    ctx.strokeStyle = arc.color + '22';
    ctx.lineWidth = 1; ctx.stroke();

    const t = arc.progress;
    const hx = (1 - t) * (1 - t) * srcPt.x + 2 * (1 - t) * t * cx + t * t * dstPt.x;
    const hy = (1 - t) * (1 - t) * srcPt.y + 2 * (1 - t) * t * cy + t * t * dstPt.y;

    ctx.beginPath();
    const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6);
    grad.addColorStop(0, arc.color + 'ff');
    grad.addColorStop(1, arc.color + '00');
    ctx.fillStyle = grad;
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  function animate() {
    if (!arcCtx || !arcCanvas) return;
    arcCtx.clearRect(0, 0, arcCanvas.width, arcCanvas.height);
    arcs.forEach(arc => {
      drawArc(arcCtx!, arc);
      arc.progress += arc.speed;
      if (arc.progress > 1) arc.progress = 0;
    });
    animFrame = requestAnimationFrame(animate);
  }

  function resizeCanvas() {
    if (!arcCanvas || !mapEl) return;
    arcCanvas.width = mapEl.clientWidth;
    arcCanvas.height = mapEl.clientHeight;
  }

  async function initMap() {
    L = (window as any).L;
    if (!L) return;
    map = L.map(mapEl, { center: [20, 10], zoom: 2, minZoom: 2, maxZoom: 5, zoomControl: false, attributionControl: false, scrollWheelZoom: false, doubleClickZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 20 }).addTo(map);

    const kkuIcon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#10b981;border:2px solid #fff;box-shadow:0 0 10px #10b981, 0 0 20px #10b981;"></div>`,
      iconSize: [14, 14], iconAnchor: [7, 7], className: ''
    });
    L.marker([KKU_LAT, KKU_LNG], { icon: kkuIcon }).addTo(map);

    arcCanvas = document.createElement('canvas');
    arcCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:500;';
    mapEl.appendChild(arcCanvas);
    arcCtx = arcCanvas.getContext('2d');
    resizeCanvas();
    buildArcs();
    animate();
    map.on('move zoom', resizeCanvas);
  }

  $: if (map && events) { buildArcs(); }

  onMount(() => {
    initSocket();
    const update = () => {
      const now = new Date();
      currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });
      currentDate = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
    };
    update();
    timeInterval = setInterval(update, 1000);

    const check = setInterval(() => {
      if ((window as any).L) { clearInterval(check); initMap(); }
    }, 100);
    window.addEventListener('resize', resizeCanvas);

    return () => clearInterval(timeInterval);
  });

  onDestroy(() => {
    disconnectSocket();
    clearInterval(timeInterval);
    if (typeof window !== 'undefined') {
      if (animFrame) cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resizeCanvas);
    }
    if (map) map.remove();
  });
</script>

<svelte:head>
  <title>SOC Monitor Wall - KKUSIEM</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; background: #030711; }
  </style>
</svelte:head>

<!-- Scanline & Vignette overlay -->
<div class="vignette"></div>
<div class="scanlines"></div>

<div class="monitor-wrap">

  <!-- ═══ TOP BAR ═══════════════════════════════════════════════════════════ -->
  <div class="top-bar">
    <div class="top-brand">
      <div class="brand-icon"><i class="ti ti-radar"></i></div>
      <div>
        <div class="brand-name">KKUSIEM SOC</div>
        <div class="brand-sub">Real-Time Threat Intelligence</div>
      </div>
    </div>

    <div class="top-kpis">
      <div class="top-kpi purple" title="Events Per Second"><span class="tkpi-num">{epsRate}</span><span class="tkpi-lbl">EPS VELOCITY</span></div>
      <div class="top-kpi red"><span class="tkpi-num">{critical}</span><span class="tkpi-lbl">CRITICAL</span></div>
      <div class="top-kpi orange"><span class="tkpi-num">{high}</span><span class="tkpi-lbl">HIGH</span></div>
      <div class="top-kpi yellow"><span class="tkpi-num">{medium}</span><span class="tkpi-lbl">MEDIUM</span></div>
      <div class="top-kpi blue"><span class="tkpi-num">{uniqueIPs}</span><span class="tkpi-lbl">TARGET IPs</span></div>
      <div class="top-kpi green"><span class="tkpi-num">{actionBlocked}</span><span class="tkpi-lbl">BLOCKED</span></div>
    </div>

    <div class="top-right">
      <div class="conn-status">
        <div class="conn-dot {connected ? 'on' : 'off'}"></div>
        <span style="color:{connected?'#10b981':'#ef4444'}">{connected ? 'LIVE' : 'OFFLINE'}</span>
      </div>
      <div class="clock-wrap">
        <div class="clock-time">{currentTime}</div>
        <div class="clock-date">{currentDate}</div>
      </div>
    </div>
  </div>

  <!-- ═══ DENSE GRID (3 Columns) ════════════════════════════════════════════ -->
  <div class="dense-grid">
    
    <!-- LEFT: Live Alerts Feed (High Priority) -->
    <div class="panel col-left">
      <div class="panel-head">
        <span><i class="ti ti-alert-triangle"></i> Priority Alerts</span>
        <span class="live-badge"><span class="ldot"></span></span>
      </div>
      <div class="feed-list custom-scrollbar">
        {#each recentAlerts as e}
        <div class="feed-item" style="border-left: 2px solid {sevColor(e.severity)};">
          <div class="feed-time">{e.timeStr || '--:--'}</div>
          <div class="feed-body">
            <div class="feed-ip">{e.ip} <span class="feed-flag">{countryFlag(e.country || 'Local Network')}</span></div>
            <div class="feed-type">{e.type}</div>
          </div>
          <div class="feed-sev" style="color:{sevColor(e.severity)}">{e.severity?.substring(0,4).toUpperCase()}</div>
        </div>
        {/each}
        {#if !recentAlerts.length}
          <div class="no-feed">No priority alerts</div>
        {/if}
      </div>
    </div>

    <!-- CENTER: Main Stats & Raw Terminal -->
    <div class="col-center">
      <!-- Top Center: Stats & Trend -->
      <div class="panel center-top">
        <div class="panel-head">
          <span><i class="ti ti-chart-bar"></i> Network Threat Activity</span>
          <span class="eps-chip">{total.toLocaleString()} Total</span>
        </div>
        
        <div class="big-stats">
          <div class="big-stat">
            <div class="big-num" style="color:#e8eaf0">{total.toLocaleString()}</div>
            <div class="big-lbl">EVENTS DETECTED</div>
          </div>
          <div class="stat-divider"></div>
          <div class="big-stat">
            <div class="big-num" style="color:#ef4444">{actionInvestigating}</div>
            <div class="big-lbl">OPEN INCIDENTS</div>
          </div>
          <div class="stat-divider"></div>
          <div class="big-stat">
            <div class="big-num" style="color:#10b981">{actionDropped}</div>
            <div class="big-lbl">PACKETS DROPPED</div>
          </div>
        </div>

        <div class="spark-wrap">
          <div class="sparkline">
            {#each sparkData as val, i}
            <div class="spark-bar-wrap">
              <div class="spark-bar"
                style="height:{Math.max(2, Math.round((val/maxSpark)*100))}%;
                       background:{val===0?'rgba(255,255,255,0.05)':val>10?'#ef4444':val>4?'#f97316':'#1d9e75'};">
              </div>
            </div>
            {/each}
          </div>
          <div class="spark-labels">
            <span>-20m</span><span>Trend</span><span>now</span>
          </div>
        </div>
      </div>

      <!-- Live Map (Central Focal Point) -->
      <div class="panel center-mid map-panel" style="flex: 1.8; min-height: 450px; margin-top: 12px; margin-bottom: 12px; position: relative; box-shadow: 0 0 40px rgba(0,212,255,0.15);">
        <div class="panel-head">
          <span><i class="ti ti-world"></i> Global Threat Map</span>
          <span style="font-size: 11px; color: #00ff88; text-shadow: 0 0 10px #00ff88;">LIVE TRACKING</span>
        </div>
        <div bind:this={mapEl} class="leaflet-map" style="width: 100%; height: calc(100% - 37px); background: #02050a; z-index: 1;"></div>
        {#if !events.length}
          <div class="map-empty" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; gap: 10px; pointer-events: none; z-index: 2;">
            <i class="ti ti-radar-2" style="font-size: 36px; color: #1d9e75; opacity: 0.4;"></i>
            <div>Awaiting threat telemetry...</div>
          </div>
        {/if}
      </div>

      <!-- Terminal (Logs) -->
      <div class="panel terminal-panel center-bottom" style="flex: 1; min-height: 200px;">
        <div class="panel-head">
          <span><i class="ti ti-terminal"></i> Security Logs</span>
          <span>Alpha-1 Node</span>
        </div>
        <div class="terminal-body custom-scrollbar" id="raw-term">
          {#each rawLogs as log}
            <div class="term-line">
              <span class="t-time">[{log.timeStr || '--:--'}]</span>
              <span class="t-ip">{log.ip}</span>
              <span class="t-sev {log.severity}">[{log.severity?.toUpperCase()}]</span>
              <span class="t-msg">{log.type} - {log.detail || log.payload || 'No payload detected'}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>

    <!-- RIGHT: Analytics & Vectors -->
    <div class="col-right">
      
      <!-- Top Attacker -->
      <div class="panel right-box">
        <div class="panel-head">
          <span><i class="ti ti-skull"></i> Top Attackers</span>
        </div>
        <div class="leaderboard custom-scrollbar" style="padding: 10px;">
          {#each topIPs as [ip, count], i}
          <div class="leader-row">
            <div class="leader-rank" style="color:{i===0?'#ef4444':'#9ca3af'}">{i+1}</div>
            <div class="leader-info">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span class="leader-ip">{ip}</span>
                <span class="leader-count">{count}</span>
              </div>
              <div class="leader-bar-wrap">
                <div class="leader-bar" style="width:{Math.round(count/topIPs[0][1]*100)}%; background:{i===0?'#ef4444':'#3b82f6'};"></div>
              </div>
            </div>
          </div>
          {/each}
        </div>
      </div>

      <!-- Target Ports -->
      <div class="panel right-box">
        <div class="panel-head">
          <span><i class="ti ti-target"></i> Target Ports</span>
        </div>
        <div class="port-grid custom-scrollbar" style="padding: 10px;">
          {#each targetPorts as [port, data], i}
          <div class="port-row">
            <div class="port-num">:{port}</div>
            <div class="port-info">
              <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:10px;">
                <span style="color:#9ca3af;">{data.label}</span>
                <span style="color:#e8eaf0; font-family:'JetBrains Mono';">{data.count}</span>
              </div>
              <div class="port-bar-w"><div class="port-bar" style="width:{Math.round(data.count/total*100)}%; background:{i===0?'#f97316':'#1d9e75'};"></div></div>
            </div>
          </div>
          {/each}
        </div>
      </div>

      <!-- MITRE TACTICS -->
      <div class="panel right-box">
        <div class="panel-head">
          <span><i class="ti ti-shield-half-filled"></i> MITRE ATT&CK</span>
        </div>
        <div class="mitre-list custom-scrollbar" style="padding: 10px;">
          {#each mitreTactics as [tactic, count]}
          <div class="mitre-row">
            <div class="mitre-lbl">{tactic}</div>
            <div class="mitre-val">{count}</div>
          </div>
          {/each}
        </div>
      </div>

    </div>


  <!-- ═══ BOTTOM BAR ═══════════════════════════════════════════════════════ -->
  <div class="bottom-bar">
    <div class="bb-left">
      <span class="bb-item"><i class="ti ti-radar"></i> KKUSIEM SOC Engine</span>
      <span class="bb-sep">|</span>
      <span class="bb-item">NODE: Alpha-1</span>
    </div>
    <div class="bb-right">
      <a href="/dashboard" class="exit-btn"><i class="ti ti-layout-dashboard"></i> Back to Dashboard</a>
    </div>
  </div>
</div>

<style>
  /* ── Base ── */
  .monitor-wrap {
    min-height: 100vh;
    background: #030711;
    display: flex; flex-direction: column;
    font-family: 'Inter', 'Noto Sans Thai', sans-serif;
    color: #e8eaf0;
    position: relative;
    z-index: 10;
  }
  .vignette {
    position: fixed; inset: 0; pointer-events: none; z-index: 1;
    background: radial-gradient(circle at center, transparent 40%, #000 120%);
  }
  .scanlines {
    position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    background: repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 1px, rgba(0,0,0,0.02) 1px, rgba(0,0,0,0.02) 2px);
  }

  /* ── Top Bar ── */
  .top-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 16px;
    background: rgba(10,15,28,0.8);
    border-bottom: 1px solid rgba(29,158,117,0.3);
    flex-shrink: 0;
  }
  .top-brand { display: flex; align-items: center; gap: 10px; }
  .brand-icon {
    width: 36px; height: 36px; border-radius: 8px;
    background: rgba(29,158,117,0.15);
    border: 1px solid rgba(29,158,117,0.4);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; color: #1d9e75;
    box-shadow: 0 0 12px rgba(29,158,117,0.3);
  }
  .brand-name { font-size: 15px; font-weight: 900; letter-spacing: 0.15em; color: #1d9e75; }
  .brand-sub { font-size: 9px; color: #5a6478; letter-spacing: 0.1em; text-transform: uppercase; }

  .top-kpis { display: flex; gap: 8px; flex: 1; justify-content: center; }
  .top-kpi {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 6px 12px; border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    min-width: 75px;
  }
  .top-kpi.red    { border-color: rgba(239,68,68,0.3);  background: rgba(239,68,68,0.08);  }
  .top-kpi.orange { border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.08); }
  .top-kpi.yellow { border-color: rgba(245,158,11,0.3); background: rgba(245,158,11,0.08); }
  .top-kpi.blue   { border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.08); }
  .top-kpi.green  { border-color: rgba(16,185,129,0.3); background: rgba(16,185,129,0.08); }
  .top-kpi.purple { border-color: rgba(168,85,247,0.4); background: rgba(168,85,247,0.12); box-shadow: 0 0 10px rgba(168,85,247,0.2); }
  
  .tkpi-num { font-size: 18px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
  .top-kpi.red .tkpi-num { color: #ef4444; } .top-kpi.orange .tkpi-num { color: #f97316; } .top-kpi.yellow .tkpi-num { color: #f59e0b; }
  .top-kpi.blue .tkpi-num { color: #3b82f6; } .top-kpi.green .tkpi-num { color: #10b981; } .top-kpi.purple .tkpi-num { color: #a855f7; }
  .tkpi-lbl { font-size: 9px; color: #9ca3af; letter-spacing: 0.05em; margin-top: 4px; }

  .top-right { display: flex; align-items: center; gap: 16px; min-width: 150px; justify-content: flex-end; }
  .conn-status { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
  .conn-dot { width: 8px; height: 8px; border-radius: 50%; }
  .conn-dot.on { background: #10b981; box-shadow: 0 0 8px #10b981; animation: blink 1.5s infinite; }
  .conn-dot.off { background: #ef4444; }
  @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
  .clock-time { font-size: 18px; font-weight: 900; font-family: 'JetBrains Mono', monospace; color: #00ff88; line-height: 1; text-align: right; }
  .clock-date { font-size: 9px; color: #5a6478; margin-top: 2px; text-align: right; text-transform: uppercase; }

  /* ── Dense Grid (3 Columns) ── */
  .dense-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 300px 1fr 280px; /* Left Narrow, Center Wide, Right Narrow */
    gap: 12px;
    padding: 12px;
    min-height: 700px;
  }
  @media (max-width: 1200px) {
    .dense-grid {
      grid-template-columns: 1fr;
      grid-template-rows: auto;
    }
    .col-left, .col-center, .col-right {
      min-height: 400px;
    }
  }
  .panel {
    background: rgba(5, 12, 24, 0.55);
    border: 1px solid rgba(0, 212, 255, 0.15);
    border-radius: 12px;
    display: flex; flex-direction: column;
    overflow: hidden;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
    transition: all 0.3s ease;
  }
  .panel:hover {
    border: 1px solid rgba(0, 212, 255, 0.35);
    box-shadow: 0 8px 32px 0 rgba(0, 212, 255, 0.1);
  }
  .panel-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.15em; color: #e8eaf0;
    border-bottom: 1px solid rgba(0, 212, 255, 0.2);
    background: linear-gradient(90deg, rgba(0,212,255,0.1) 0%, rgba(0,0,0,0) 100%);
    flex-shrink: 0;
  }
  .panel-head i { margin-right: 8px; color: #00d4ff; font-size: 14px; text-shadow: 0 0 8px rgba(0,212,255,0.6); }
  
  /* Scrollbar */
  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29,158,117,0.4); border-radius: 4px; }

  /* ── LEFT: Alerts Feed ── */
  .col-left { display: flex; flex-direction: column; min-height: 0; }
  .feed-list { flex: 1; overflow-y: auto; padding: 4px 0; min-height: 200px; }
  .feed-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.02);
    background: rgba(0,0,0,0.2);
  }
  .feed-item:hover { background: rgba(255,255,255,0.05); }
  .feed-time { font-size: 10px; color: #6b7280; font-family: 'JetBrains Mono', monospace; width: 45px; }
  .feed-body { flex: 1; min-width: 0; }
  .feed-ip { font-size: 11px; font-weight: 700; color: #e8eaf0; font-family: 'JetBrains Mono', monospace; }
  .feed-type { font-size: 9px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .feed-sev { font-size: 9px; font-weight: 800; padding: 2px 4px; border-radius: 4px; background: rgba(0,0,0,0.4); }

  /* ── CENTER: Stats & Terminal ── */
  .col-center { display: flex; flex-direction: column; gap: 12px; height: 100%; min-width: 0; }
  .center-top { flex: 0 0 auto; }
  .center-bottom { flex: 1; min-height: 0; }
  
  .big-stats { display: flex; align-items: center; justify-content: space-around; padding: 20px 12px 12px; }
  .big-stat { text-align: center; }
  .big-num { font-size: 48px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; text-shadow: 0 0 20px currentColor; }
  .big-lbl { font-size: 11px; font-weight: 800; color: #e8eaf0; margin-top: 10px; letter-spacing: 0.15em; text-transform: uppercase; }
  .stat-divider { width: 1px; height: 50px; background: linear-gradient(180deg, transparent, rgba(0,212,255,0.4), transparent); }

  .spark-wrap { display: flex; flex-direction: column; padding: 0 20px 20px; height: 90px; }
  .sparkline { flex: 1; display: flex; align-items: flex-end; gap: 5px; border-bottom: 1px solid rgba(0,212,255,0.2); }
  .spark-bar-wrap { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; }
  .spark-bar { width: 100%; border-radius: 3px 3px 0 0; transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px currentColor; }
  .spark-labels { display: flex; justify-content: space-between; margin-top: 6px; font-size: 10px; color: #9ca3af; font-weight: 600; }

  /* Terminal */
  .terminal-panel { background: rgba(0,0,0,0.6); border: 1px solid rgba(0,255,136,0.2); border-radius: 8px; box-shadow: inset 0 0 20px rgba(0,0,0,0.8); }
  .terminal-body { flex: 1; overflow-y: auto; padding: 14px; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.6; display: flex; flex-direction: column-reverse; }
  .term-line { border-bottom: 1px dotted rgba(0,255,136,0.15); padding: 5px 0; word-break: break-all; transition: background 0.2s; }
  .term-line:hover { background: rgba(0,255,136,0.08); }
  .t-time { color: #5a6478; margin-right: 8px; text-shadow: 0 0 5px rgba(90,100,120,0.5); }
  .t-ip { color: #00d4ff; margin-right: 8px; text-shadow: 0 0 8px rgba(0,212,255,0.6); font-weight: bold; }
  .t-sev.critical { color: #ff003c; text-shadow: 0 0 8px #ff003c; } .t-sev.high { color: #ff7b00; text-shadow: 0 0 8px #ff7b00; } .t-sev.medium { color: #ffbb00; text-shadow: 0 0 8px #ffbb00; } .t-sev.low { color: #00ff88; text-shadow: 0 0 8px #00ff88; }
  .t-msg { color: #d1d5db; margin-left: 8px; }

  /* ── RIGHT: Mini Panels ── */
  .col-right { display: flex; flex-direction: column; gap: 12px; height: 100%; }
  .right-box { flex: 1; min-height: 0; }
  
  .leader-row { margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
  .leader-rank { font-size: 14px; font-weight: 900; width: 20px; text-align: center; text-shadow: 0 0 8px currentColor; }
  .leader-info { flex: 1; }
  .leader-ip { font-size: 12px; font-family: 'JetBrains Mono'; color: #fff; font-weight: 700; }
  .leader-count { font-size: 12px; font-family: 'JetBrains Mono'; color: #00d4ff; font-weight: bold; }
  .leader-bar-wrap { height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; margin-top: 6px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }
  .leader-bar { height: 100%; border-radius: 3px; box-shadow: 0 0 10px currentColor; }

  .port-row { margin-bottom: 12px; display: flex; gap: 10px; align-items: center; }
  .port-num { font-size: 12px; font-weight: 900; color: #00ff88; font-family: 'JetBrains Mono'; width: 40px; text-shadow: 0 0 8px rgba(0,255,136,0.6); }
  .port-info { flex: 1; }
  .port-bar-w { height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5); }
  .port-bar { height: 100%; border-radius: 3px; box-shadow: 0 0 10px currentColor; }

  .mitre-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,212,255,0.1); }
  .mitre-lbl { font-size: 11px; color: #e8eaf0; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
  .mitre-val { font-size: 14px; font-weight: 900; font-family: 'JetBrains Mono'; color: #ff003c; text-shadow: 0 0 10px rgba(255,0,60,0.6); }

  /* ── Bottom Bar ── */
  .bottom-bar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 16px; background: rgba(0,0,0,0.8);
    border-top: 1px solid rgba(29,158,117,0.3);
    font-size: 9px; font-weight: 700; letter-spacing: 0.05em; color: #5a6478;
    flex-shrink: 0;
  }
  .bb-left { display: flex; align-items: center; gap: 10px; }
  .exit-btn { color: #5a6478; text-decoration: none; transition: color 0.2s; }
  .exit-btn:hover { color: #e8eaf0; }
</style>
