<svelte:head>
  <title>SOC Wallboard - KKUSIEM</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import OrgBadge from '../../lib/components/OrgBadge.svelte';
  import { eventsStore } from '../../stores/events';
  import { getFacultyForIP } from '../../stores/faculties';
  import facultyCoords from '$lib/data/faculty_coordinates.json';

  const FACULTY_BASE = [
    { code: 'AG', nameEn: 'Agriculture', subnets: ['10.53.64.0/20','10.53.80.0/20'], wifiSubnets: ['10.53.79.254/20'], color: '#22c55e' },
    { code: 'AMS', nameEn: 'Allied Health Sci.', subnets: ['10.53.96.0/20'], wifiSubnets: ['10.53.111.254/20'], color: '#0ea5e9' },
    { code: 'ARCH', nameEn: 'Architecture', subnets: ['10.53.208.0/20'], wifiSubnets: ['10.53.223.254/20'], color: '#f97316' },
    { code: 'ART', nameEn: 'Fine & Applied Arts', subnets: ['10.53.160.0/20'], wifiSubnets: ['10.53.175.254/20'], color: '#a855f7' },
    { code: 'COLA', nameEn: 'Local Govt. College', subnets: ['10.53.240.0/20'], wifiSubnets: ['10.53.255.254/20'], color: '#06b6d4' },
    { code: 'CP', nameEn: 'Computing', subnets: ['10.198.0.0/16'], wifiSubnets: [], color: '#3b82f6' },
    { code: 'DENT', nameEn: 'Dentistry', subnets: ['10.146.0.0/16'], wifiSubnets: [], color: '#ec4899' },
    { code: 'EDU', nameEn: 'Education', subnets: ['10.53.176.0/20'], wifiSubnets: ['10.53.191.254/20'], color: '#84cc16' },
    { code: 'EN', nameEn: 'Engineering', subnets: ['10.53.32.0/20'], wifiSubnets: ['10.53.47.254/20'], color: '#f59e0b' },
    { code: 'GS', nameEn: 'Graduate School', subnets: ['10.135.0.0/16'], wifiSubnets: [], color: '#64748b' },
    { code: 'HUSO', nameEn: 'Humanities & Social', subnets: ['10.136.0.0/16'], wifiSubnets: [], color: '#d97706' },
    { code: 'LAW', nameEn: 'Law', subnets: ['10.53.16.0/20'], wifiSubnets: ['10.53.31.254/20'], color: '#dc2626' },
    { code: 'MBA', nameEn: 'MBA College', subnets: ['10.117.0.0/16'], wifiSubnets: [], color: '#7c3aed' },
    { code: 'MED', nameEn: 'Medicine', subnets: ['10.87.0.0/16'], wifiSubnets: [], color: '#ef4444' },
    { code: 'MS/KKBS', nameEn: 'Business & Acct.', subnets: ['10.114.0.0/16'], wifiSubnets: [], color: '#0891b2' },
    { code: 'NU', nameEn: 'Nursing', subnets: ['10.53.128.0/20'], wifiSubnets: ['10.53.143.254/20'], color: '#db2777' },
    { code: 'ODT', nameEn: 'Digital Tech. (HQ)', subnets: ['10.52.0.0/20','10.101.0.0/16'], wifiSubnets: ['10.52.15.254/20'], color: '#00d4ff', isHQ: true },
    { code: 'PH', nameEn: 'Public Health', subnets: ['10.53.224.0/20'], wifiSubnets: ['10.53.239.254/20'], color: '#10b981' },
    { code: 'Px', nameEn: 'Pharmacy', subnets: ['10.53.112.0/20'], wifiSubnets: ['10.53.127.254/20'], color: '#22d3ee' },
    { code: 'SC', nameEn: 'Science', subnets: ['10.53.48.0/20','10.53.64.0/24'], wifiSubnets: ['10.53.63.254/20'], color: '#6366f1' },
    { code: 'TE', nameEn: 'Technology', subnets: ['10.53.80.0/20'], wifiSubnets: ['10.53.95.254/20'], color: '#f97316' },
    { code: 'VET', nameEn: 'Veterinary', subnets: ['10.52.144.0/20'], wifiSubnets: ['10.52.159.254/20'], color: '#84cc16' },
    { code: 'NKC', nameEn: 'Nong Khai Campus', subnets: [], wifiSubnets: [], color: '#a3e635' }
  ];

  // Merge the base data with the coordinates from the JSON file
  let FACULTY_DATA = FACULTY_BASE.map(base => {
    const coords = facultyCoords.find(c => c.code === base.code) || { name: base.code, lat: 16.45, lng: 102.82 };
    return {
      ...base,
      name: coords.name,
      lat: coords.lat,
      lng: coords.lng,
      wifiSubnets: base.wifiSubnets || []
    };
  });

  let isFullscreen = false;
  let isPaused = false;
  let soundEnabled = true;
  let activeTab: 'INCIDENTS' | 'FACULTY' = 'INCIDENTS';
  let selectedFaculty: any = null;
  let events: any[] = [];
  
  // Real-time EPS
  let currentEps = 0;
  let eventCountsInWindow: number[] = [];
  
  // Clocks
  let timeTH = '';
  let timeUTC = '';
  let clockInterval: any;

  // Sound Context
  let audioCtx: AudioContext | null = null;
  let lastCriticalCount = 0;

  // Leaflet
  let map: any;
  let L: any;
  let markerInstances: Record<string, any> = {};

  const unsub = eventsStore.subscribe(val => {
    if (!isPaused) {
      const prevEvents = events;
      events = val;

      const now = Date.now();
      if (val.length > prevEvents.length) {
         const newIncoming = val.length - prevEvents.length;
         for(let i=0; i < newIncoming; i++) eventCountsInWindow.push(now);
      }
      
      eventCountsInWindow = eventCountsInWindow.filter(t => now - t < 5000);
      currentEps = Math.floor(eventCountsInWindow.length / 5);

      const currentCriticals = events.filter(e => e.severity === 'critical').length;
      if (currentCriticals > lastCriticalCount) {
         playBeep();
      }
      lastCriticalCount = currentCriticals;
    }
  });

  onMount(async () => {
    clockInterval = setInterval(() => {
      const d = new Date();
      timeTH = d.toLocaleTimeString('en-US', { timeZone: 'Asia/Bangkok', hour12: false });
      timeUTC = d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });
    }, 1000);

    if (browser) {
      // Initialize Leaflet
      const L_module = await import('leaflet');
      // @ts-ignore - svelte-check complains about .default but it's needed for vite SSR
      L = L_module.default || L_module;
      
      // Initialize map
      map = L.map('kku-map', {
        zoomControl: false,
        attributionControl: false
      }).setView([16.468, 102.825], 15);

      // Add zoom control manually to bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Use OpenStreetMap (Free, highly detailed for campus)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      // Draw markers initially
      updateMarkers();
    }
  });

  onDestroy(() => {
    unsub();
    if (clockInterval) clearInterval(clockInterval);
    if (audioCtx) audioCtx.close();
    if (map) map.remove();
  });

  function playBeep() {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio disabled or not supported", e);
    }
  }

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

  function selectFaculty(fac: any) {
    selectedFaculty = fac;
    activeTab = 'FACULTY';
    if (map) {
      map.flyTo([fac.lat, fac.lng], 16, { duration: 0.5 });
    }
  }
  
  $: totalEvents = events.length;
  $: criticalEvents = events.filter(e => e.severity === 'critical');
  $: highEvents = events.filter(e => e.severity === 'high');
  $: criticalHighEvents = [...criticalEvents, ...highEvents].slice(0, 50);
  
  // Threat Score Gauge
  $: threatScore = Math.min(100, Math.floor((criticalEvents.length * 8 + highEvents.length * 3 + totalEvents * 0.1)));
  $: gaugeColor = threatScore > 75 ? '#ff2a2a' : threatScore > 40 ? '#ff8c00' : '#22c55e';

  // Top Attackers
  $: sourceIPs = events.reduce((acc, e) => {
    const ip = e.ip || e.sourceIp || 'Unknown';
    if (!acc[ip]) acc[ip] = { count: 0, severity: e.severity, type: e.type, events: [], country: e.country || 'Unknown', latitude: e.latitude, longitude: e.longitude };
    acc[ip].count++;
    acc[ip].events.push(e);
    if (e.severity === 'critical') acc[ip].severity = 'critical';
    return acc;
  }, {});
  $: topAttackers = Object.entries(sourceIPs).map(([ip, data]: any) => ({ ip, ...data })).sort((a,b) => b.count - a.count).slice(0, 10);
  
  // Top Countries
  $: sourceCountries = events.reduce((acc, e) => {
    const c = e.country || 'Unknown';
    if(c !== 'Unknown') acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  $: topCountriesList = Object.entries(sourceCountries).sort((a:any, b:any) => b[1] - a[1]).slice(0, 5);

  // Faculty Attacks Stats
  $: facultyStats = (() => {
    const stats: Record<string, { count: number, events: any[] }> = {};
    FACULTY_DATA.forEach(f => stats[f.code] = { count: 0, events: [] });
    
    events.forEach(e => {
      const targetIp = e.destIp || e.ip || '';
      const facData = getFacultyForIP(targetIp) || getFacultyForIP(e.sourceIp || '');
      if (facData) {
         let code = facData.code;
         if (code === 'MS/KKBS') code = 'MS/KKBS'; 
         const f = FACULTY_DATA.find(f => f.code === code || f.name === facData.name);
         if (f) {
           stats[f.code].count++;
           if (stats[f.code].events.length < 5) stats[f.code].events.push(e);
         }
      }
    });
    return stats;
  })();

  // Update Leaflet Markers when facultyStats changes
  $: if (browser && L && map) {
    // We bind it to facultyStats reactivity to auto-trigger
    const _forceTrigger = facultyStats;
    const _forceTrigger2 = selectedFaculty;
    updateMarkers();
  }

  function generateMarkerHtml(fac: any, isActive: boolean, isSelected: boolean, count: number) {
    const borderColor = isActive ? '#ff2a2a' : fac.color;
    const textColor = isActive ? '#ff2a2a' : '#ffffff';
    
    return `
      <div class="siem-marker ${isActive ? 'is-attacked' : ''} ${isSelected ? 'is-selected' : ''}">
        ${isActive ? '<div class="pulse-ring"></div>' : ''}
        <div class="icon-circle" style="border-color: ${borderColor}; color: ${textColor};">
          ${fac.code}
        </div>
        <div class="label-badge">${fac.code}</div>
        ${isActive ? '<div class="count-badge">' + count + '</div>' : ''}
      </div>
    `;
  }

  function updateMarkers() {
    if (!L || !map) return;
    
    FACULTY_DATA.forEach(fac => {
      const stats = facultyStats[fac.code];
      const isActive = stats.count > 0;
      const isSelected = selectedFaculty?.code === fac.code;
      const htmlStr = generateMarkerHtml(fac, isActive, isSelected, stats.count);

      if (markerInstances[fac.code]) {
        // Update existing
        const newIcon = L.divIcon({
          className: 'transparent-leaflet-icon',
          html: htmlStr,
          iconSize: [60, 60],
          iconAnchor: [30, 30]
        });
        markerInstances[fac.code].setIcon(newIcon);
      } else {
        // Create new
        const icon = L.divIcon({
          className: 'transparent-leaflet-icon',
          html: htmlStr,
          iconSize: [60, 60],
          iconAnchor: [30, 30]
        });
        const marker = L.marker([fac.lat, fac.lng], { icon }).addTo(map);

        marker.on('click', () => {
          selectFaculty(fac);
        });
        markerInstances[fac.code] = marker;
      }
    });
  }
</script>

<div class="wallboard-wrapper">
  <div class="scanlines"></div>

  <!-- TOP HEADER -->
  <header class="wb-header">
    <div class="brand">
      <div class="radar-icon pulse"><i class="ti ti-radar"></i></div>
      <div class="titles">
        <h1>SOC OPERATIONS CENTER</h1>
        <div class="subtitle">KKUSIEM v3.0 INTELLIGENCE PLATFORM</div>
      </div>
    </div>
    
    <div class="kpi-row">
      <div class="kpi-box">
        <span class="label">LIVE EVENTS</span>
        <span class="val text-info">{totalEvents.toLocaleString()}</span>
      </div>
      <div class="kpi-box">
        <span class="label">CRITICAL</span>
        <span class="val text-critical">{criticalEvents.length}</span>
      </div>
      <div class="kpi-box">
        <span class="label">LAN ATTACKS</span>
        <span class="val text-warning">{Object.values(facultyStats).reduce((a, b) => a + b.count, 0)}</span>
      </div>
      <div class="kpi-box eps-box">
        <span class="label">EPS</span>
        <span class="val text-success">{currentEps}<small>/s</small></span>
      </div>
    </div>

    <div class="clocks">
      <div>🇹🇭 {timeTH || '00:00:00'} THA</div>
      <div class="text-dim">🌐 {timeUTC || '00:00:00'} UTC</div>
    </div>

    <div class="controls">
      <div class="status {isPaused ? 'paused' : 'live'}">
        <span class="dot"></span> {isPaused ? 'PAUSED' : 'LIVE'}
      </div>
      <button class="icon-btn" on:click={() => soundEnabled = !soundEnabled} title="Toggle Sound">
        <i class="ti {soundEnabled ? 'ti-volume' : 'ti-volume-off'}"></i>
      </button>
      <button class="icon-btn" on:click={() => isPaused = !isPaused} title="Pause/Play">
        <i class="ti {isPaused ? 'ti-player-play' : 'ti-player-pause'}"></i>
      </button>
      <button class="icon-btn" on:click={toggleFullscreen} title="Fullscreen">
        <i class="ti {isFullscreen ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}"></i>
      </button>
    </div>
  </header>

  <!-- MAIN GRID -->
  <main class="wb-main">
    
    <!-- LEFT PANEL -->
    <aside class="panel left-panel">
      <!-- Threat Level Gauge -->
      <div class="widget">
        <div class="w-header">SYSTEM THREAT LEVEL</div>
        <div class="gauge-container">
           <svg viewBox="0 0 100 50" class="gauge">
             <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="12" stroke-linecap="round"/>
             <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="{gaugeColor}" stroke-width="12" stroke-linecap="round" 
                   stroke-dasharray="125.6" stroke-dashoffset="{125.6 - (threatScore/100)*125.6}" style="transition: stroke-dashoffset 1s ease-in-out;"/>
           </svg>
           <div class="gauge-value" style="color: {gaugeColor}">
             <div class="score">{threatScore}</div>
             <div class="score-label">/ 100</div>
           </div>
        </div>
      </div>

      <!-- Top Countries -->
      <div class="widget fill-flex">
        <div class="w-header">TOP ORIGIN COUNTRIES</div>
        <div class="country-list custom-scrollbar">
           {#each topCountriesList as [country, count]}
             <div class="country-item">
               <OrgBadge country={country} organization="" hideText={false} />
               <div class="c-bar">
                 <div class="c-fill" style="width: {Math.min(100, (count / events.length) * 500)}%"></div>
               </div>
               <div class="c-count">{count}</div>
             </div>
           {/each}
           {#if topCountriesList.length === 0}
             <div class="empty-state">No origin data available.</div>
           {/if}
        </div>
      </div>
    </aside>

    <!-- CENTER PANEL (LEAFLET MAP) -->
    <section class="panel center-panel">
      <div id="kku-map" class="map-container fade-in"></div>
      
      <!-- Overlay Title on Map -->
      <div class="map-overlay-title">
        <div style="margin-bottom: 5px;"><i class="ti ti-map-pin"></i> CAMPUS SELECTOR</div>
        <div class="campus-btns">
          <button class="campus-btn" on:click={() => map.flyTo([16.468, 102.825], 15)}>🏢 Khon Kaen (Main)</button>
          <button class="campus-btn" on:click={() => map.flyTo([17.8276, 102.7380], 16)}>🚀 Nong Khai (NKC)</button>
        </div>
      </div>
    </section>

    <!-- RIGHT PANEL -->
    <aside class="panel right-panel">
      <div class="panel-tabs">
        <button class="tab-btn {activeTab === 'INCIDENTS' ? 'active' : ''}" on:click={() => activeTab = 'INCIDENTS'}>🔥 INCIDENTS</button>
        <button class="tab-btn {activeTab === 'FACULTY' ? 'active' : ''}" on:click={() => activeTab = 'FACULTY'}>🏫 FACULTY INFO</button>
      </div>

      <div class="panel-content custom-scrollbar">
        {#if activeTab === 'INCIDENTS'}
           <div class="list-wrapper">
             {#each criticalHighEvents as event (event.id || event.time)}
               <div class="feed-card severity-{event.severity}" on:click={() => navigateToSoar(event)}>
                 <div class="fc-head">
                   <span class="sev-badge">{event.severity.toUpperCase()}</span>
                   <span class="fc-time">{new Date(event.time || event.createdAt).toLocaleTimeString()}</span>
                 </div>
                 <div class="fc-title">{event.type || 'Unknown Attack'}</div>
                 <div class="fc-meta">
                   <span>SRC: {event.ip || event.sourceIp}</span>
                   {#if event.mitreCode}<span class="mitre-tag">{event.mitreCode}</span>{/if}
                 </div>
               </div>
             {/each}
             {#if criticalHighEvents.length === 0}
               <div class="empty-state">No active high/critical incidents.</div>
             {/if}
           </div>
        
        {:else if activeTab === 'FACULTY'}
           {#if selectedFaculty}
             {@const stats = facultyStats[selectedFaculty.code]}
             <div class="fac-detail fade-in">
               <div class="fd-header" style="border-bottom: 2px solid {selectedFaculty.color}">
                 <h2>{selectedFaculty.name}</h2>
                 <div class="fd-subtitle">{selectedFaculty.nameEn} ({selectedFaculty.code})</div>
               </div>
               
               <div class="fd-stats">
                 <div class="stat-big">
                   <span class="lbl">ACTIVE ATTACKS</span>
                   <span class="val {stats.count > 0 ? 'text-critical' : 'text-success'}">{stats.count}</span>
                 </div>
               </div>

               <div class="fd-section">
                 <h3>LAN Subnets ({selectedFaculty.subnets.length})</h3>
                 <div class="subnet-list">
                   {#each selectedFaculty.subnets as sn}
                     <span class="sn-badge">{sn}</span>
                   {/each}
                 </div>
               </div>

               {#if selectedFaculty.wifiSubnets && selectedFaculty.wifiSubnets.length > 0}
               <div class="fd-section" style="margin-top: 15px;">
                 <h3>WiFi Subnets ({selectedFaculty.wifiSubnets.length})</h3>
                 <div class="subnet-list">
                   {#each selectedFaculty.wifiSubnets as sn}
                     <span class="sn-badge wifi-badge">{sn}</span>
                   {/each}
                 </div>
               </div>
               {/if}

               <div class="fd-section">
                 <h3>Recent Attacks in Faculty</h3>
                 {#each stats.events as ev}
                   <div class="mini-event severity-{ev.severity}">
                     <div class="me-time">{new Date(ev.time || ev.createdAt).toLocaleTimeString()}</div>
                     <div class="me-type">{ev.type}</div>
                     <div class="me-ip">from {ev.ip || ev.sourceIp}</div>
                   </div>
                 {/each}
                 {#if stats.events.length === 0}
                   <div class="empty-state" style="padding: 10px 0;">No recent attacks detected for this faculty.</div>
                 {/if}
               </div>
             </div>
           {:else}
             <div class="empty-state" style="margin-top: 30px;">
               <i class="ti ti-map-pin" style="font-size: 32px; margin-bottom: 10px; display:block; color:var(--color-info);"></i>
               Click on a faculty node on the map to view network subnets and active attacks.
             </div>
             
             <!-- Show Top Actors if no faculty selected -->
             <div class="w-header" style="margin-top:30px;">TOP THREAT ACTORS</div>
             <div class="actor-list">
                {#each topAttackers.slice(0,5) as attacker}
                  <div class="actor-item">
                    <div class="ac-ip">{attacker.ip} <OrgBadge country={attacker.country} hideText={true} /></div>
                    <div class="ac-bar"><div class="ac-fill bg-{attacker.severity}" style="width: {Math.min(100, attacker.count*5)}%"></div></div>
                    <div class="ac-cnt">{attacker.count}</div>
                  </div>
                {/each}
             </div>
           {/if}
        {/if}
      </div>
    </aside>
  </main>

  <!-- BOTTOM PANEL: Terminal -->
  <footer class="wb-footer">
    <div class="panel h-100 term-panel">
      <div class="term-header">
        <i class="ti ti-terminal"></i> LIVE LOG STREAM (SYSLOG)
        <div class="blink" style="margin-left: auto;">_</div>
      </div>
      <div class="term-body custom-scrollbar">
        {#each events.slice(0, 40) as event (event.id || event.time)}
          <div class="term-line {event.severity}" on:click={() => navigateToSoar(event)}>
             <span class="t-time">[{new Date(event.time || event.createdAt).toISOString()}]</span>
             <span class="t-ip">{event.ip || event.sourceIp} <OrgBadge country={event.country} hideText={true}/></span>
             <span class="t-dir">-></span>
             <span class="t-dest">{getFacultyForIP(event.destIp || event.ip)?.code || 'LAN'} ({event.destIp || 'INTERNAL'})</span>
             <span class="t-type">[{event.type || 'UNKNOWN'}]</span>
             <span class="t-msg">{event.detail || event.description || 'Suspicious Activity Detected'}</span>
          </div>
        {/each}
      </div>
    </div>
  </footer>
</div>

<style>
  :global(body) { margin: 0; background: #000005; overflow: hidden; font-family: 'Inter', sans-serif; color: #e2e8f0; }
  
  .wallboard-wrapper {
    --color-critical: #ff2a2a;
    --color-high: #ff8c00;
    --color-medium: #eab308;
    --color-low: #22c55e;
    --color-info: #0ea5e9;
    --bg-dark: #020617;
    --border-dim: #0f2040;
    --border-glow: #1a3a6e;
    
    display: flex; flex-direction: column; height: 100vh; width: 100vw; position: relative;
    background: radial-gradient(circle at top, #061126 0%, #000005 100%);
  }

  .text-critical { color: var(--color-critical); }
  .text-warning { color: var(--color-high); }
  .text-info { color: var(--color-info); }
  .text-success { color: var(--color-low); }
  .bg-critical { background: var(--color-critical); box-shadow: 0 0 10px var(--color-critical); }
  .bg-high { background: var(--color-high); box-shadow: 0 0 10px var(--color-high); }

  .scanlines {
    position: absolute; inset: 0; pointer-events: none; z-index: 9999; opacity: 0.15;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,1) 50%, rgba(0,0,0,1));
    background-size: 100% 4px;
  }

  /* HEADER */
  .wb-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 20px; height: 60px; background: rgba(2,6,18,0.9);
    border-bottom: 1px solid var(--border-glow); box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    z-index: 10;
  }
  .brand { display: flex; align-items: center; gap: 15px; }
  .radar-icon { color: var(--color-info); font-size: 28px; }
  .pulse { animation: pulse-opacity 2s infinite; }
  @keyframes pulse-opacity { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .titles h1 { margin: 0; font-size: 18px; font-weight: 900; letter-spacing: 2px; color: #fff; text-shadow: 0 0 10px rgba(14,165,233,0.5); }
  .subtitle { font-size: 10px; font-family: monospace; color: #64748b; letter-spacing: 1.5px; }

  .kpi-row { display: flex; gap: 20px; }
  .kpi-box { display: flex; flex-direction: column; align-items: center; padding: 4px 15px; background: rgba(0,0,0,0.4); border: 1px solid var(--border-dim); border-radius: 4px; }
  .kpi-box .label { font-size: 9px; font-weight: 800; color: #64748b; }
  .kpi-box .val { font-size: 18px; font-weight: 800; text-shadow: 0 0 8px currentColor; }
  .eps-box { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); }

  .clocks { text-align: right; font-family: monospace; font-size: 14px; font-weight: bold; }
  .text-dim { color: #64748b; font-size: 12px; }

  .controls { display: flex; align-items: center; gap: 15px; }
  .status { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: bold; letter-spacing: 1px; }
  .status.live { color: var(--color-low); }
  .status.paused { color: var(--color-medium); }
  .status .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
  .icon-btn { background: #000; border: 1px solid var(--border-dim); color: #fff; width: 32px; height: 32px; border-radius: 4px; cursor: pointer; transition: 0.2s; }
  .icon-btn:hover { background: var(--border-glow); }

  /* MAIN GRID */
  .wb-main {
    display: grid; grid-template-columns: 280px 1fr 340px; gap: 15px; padding: 15px; flex: 1; min-height: 0;
  }
  .panel { background: rgba(4,10,24,0.85); border: 1px solid var(--border-dim); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
  .w-header { padding: 10px 15px; background: rgba(0,0,0,0.4); font-size: 11px; font-weight: 800; letter-spacing: 1px; border-bottom: 1px solid var(--border-dim); color: #94a3b8; }
  
  /* LEFT PANEL */
  .left-panel { gap: 0; }
  .widget { display: flex; flex-direction: column; border-bottom: 1px solid var(--border-dim); }
  .fill-flex { flex: 1; min-height: 0; }
  
  .gauge-container { padding: 20px; position: relative; display: flex; justify-content: center; align-items: center; }
  .gauge { width: 100%; max-width: 180px; overflow: visible; }
  .gauge-value { position: absolute; text-align: center; top: 55%; transform: translateY(-50%); }
  .score { font-size: 36px; font-weight: 900; line-height: 1; text-shadow: 0 0 15px currentColor; }
  .score-label { font-size: 10px; font-weight: bold; color: #64748b; }

  .country-list { padding: 10px; overflow-y: auto; flex: 1; }
  .country-item { margin-bottom: 12px; }
  .c-bar { height: 4px; background: #0f2040; margin-top: 4px; border-radius: 2px; overflow: hidden; }
  .c-fill { height: 100%; background: var(--color-info); box-shadow: 0 0 8px var(--color-info); }
  .c-count { font-size: 10px; text-align: right; color: #64748b; margin-top: 2px; }

  /* CENTER PANEL (LEAFLET) */
  .center-panel { position: relative; background: #000; padding: 0 !important; }
  .map-container { width: 100%; height: 100%; position: absolute; inset: 0; z-index: 1; background: #020617; }
  
  .map-overlay-title {
    position: absolute; top: 15px; left: 15px; z-index: 400; /* above leaflet (z-index 400) */
    background: rgba(0,0,0,0.7); border: 1px solid var(--border-glow);
    padding: 10px 12px; border-radius: 6px; font-size: 11px; font-weight: bold; color: var(--color-info);
    backdrop-filter: blur(4px); box-shadow: 0 0 15px rgba(0,0,0,0.8);
  }
  .campus-btns { display: flex; gap: 5px; margin-top: 5px; }
  .campus-btn { 
    background: #0f172a; border: 1px solid #1e293b; color: #cbd5e1; padding: 4px 8px; 
    border-radius: 4px; font-size: 10px; cursor: pointer; transition: 0.2s;
  }
  .campus-btn:hover { background: var(--color-info); color: #fff; border-color: #fff; }

  .fade-in { animation: fadeIn 0.5s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }

  /* LEAFLET OVERRIDES & MARKER DESIGN */
  :global(.transparent-leaflet-icon) { background: transparent; border: none; }
  :global(.leaflet-control-zoom) { border: 1px solid var(--border-dim) !important; margin-bottom: 25px !important; margin-right: 15px !important; }
  :global(.leaflet-control-zoom a) { background: rgba(4,10,24,0.9) !important; color: #fff !important; border-color: var(--border-dim) !important; }
  :global(.leaflet-control-zoom a:hover) { background: #1e3a8a !important; }
  :global(.leaflet-container) { font-family: 'Inter', sans-serif; }
  
  /* OSM Dark Mode Hack: Inverts map colors to create a beautiful SIEM look */
  :global(.leaflet-tile-pane) {
    filter: invert(100%) hue-rotate(180deg) brightness(85%) contrast(110%) grayscale(20%);
  }

  :global(.siem-marker) {
    position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
    width: 60px; height: 60px; cursor: pointer; transition: 0.2s;
  }
  :global(.siem-marker .icon-circle) {
    width: 38px; height: 38px; border-radius: 50%; background: #0f172a; border: 2px solid;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 12px; z-index: 2;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5); transition: all 0.3s;
  }
  :global(.siem-marker .label-badge) {
    background: #020617; color: #94a3b8; font-size: 10px; padding: 2px 8px; font-weight: bold;
    border-radius: 4px; margin-top: -8px; z-index: 3; border: 1px solid #1e293b; transition: 0.3s;
  }
  :global(.siem-marker .count-badge) {
    position: absolute; top: 0px; right: 2px; background: #ff2a2a; color: #fff;
    font-size: 10px; font-weight: 900; width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; z-index: 4;
    box-shadow: 0 0 10px #ff2a2a; border: 1px solid #fff;
  }
  
  :global(.is-attacked .icon-circle) {
    background: rgba(255, 42, 42, 0.25); box-shadow: 0 0 15px #ff2a2a; transform: scale(1.1);
  }
  :global(.is-attacked .label-badge) {
    color: #ff2a2a; border-color: #ff2a2a; box-shadow: 0 0 5px rgba(255,42,42,0.5); background: #000;
  }
  
  :global(.pulse-ring) {
    position: absolute; top: 50%; left: 50%; width: 44px; height: 44px;
    margin-top: -25px; margin-left: -22px; border-radius: 50%; border: 2px solid #ff2a2a;
    animation: radar-pulse 1.2s ease-out infinite; z-index: 1; pointer-events: none;
  }
  @keyframes radar-pulse {
    0% { transform: scale(0.9); opacity: 1; }
    100% { transform: scale(2.5); opacity: 0; }
  }

  :global(.is-selected .icon-circle) { transform: scale(1.2); border-color: #fff !important; box-shadow: 0 0 20px #fff; }
  :global(.is-selected .label-badge) { color: #fff; border-color: #fff; }

  /* RIGHT PANEL */
  .panel-tabs { display: flex; border-bottom: 1px solid var(--border-dim); }
  .tab-btn { flex: 1; background: transparent; border: none; color: #64748b; padding: 12px 0; font-size: 11px; font-weight: 800; cursor: pointer; transition: 0.2s; }
  .tab-btn.active { color: #fff; background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--color-info); }
  .panel-content { flex: 1; overflow-y: auto; padding: 15px; }
  
  .feed-card { background: rgba(0,0,0,0.4); border: 1px solid var(--border-dim); border-left: 3px solid #333; padding: 10px; border-radius: 4px; margin-bottom: 10px; cursor: pointer; transition: 0.2s; }
  .feed-card:hover { background: rgba(255,255,255,0.05); }
  .feed-card.severity-critical { border-left-color: var(--color-critical); }
  .feed-card.severity-high { border-left-color: var(--color-high); }
  .fc-head { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px; }
  .sev-badge { font-weight: 900; }
  .severity-critical .sev-badge { color: var(--color-critical); }
  .severity-high .sev-badge { color: var(--color-high); }
  .fc-time { color: #64748b; }
  .fc-title { font-size: 13px; font-weight: bold; color: #fff; margin-bottom: 4px; }
  .fc-meta { display: flex; justify-content: space-between; font-size: 11px; color: var(--color-info); font-family: monospace; }
  .mitre-tag { background: rgba(255,255,255,0.1); color: #cbd5e1; padding: 2px 4px; border-radius: 2px; }

  /* Faculty Detail Info */
  .fac-detail { display: flex; flex-direction: column; gap: 15px; }
  .fd-header h2 { margin: 0 0 5px 0; font-size: 18px; color: #fff; }
  .fd-subtitle { font-size: 11px; color: #94a3b8; font-family: monospace; margin-bottom: 10px; }
  .stat-big { display: flex; flex-direction: column; align-items: center; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 6px; border: 1px solid var(--border-dim); }
  .stat-big .lbl { font-size: 10px; font-weight: bold; color: #64748b; }
  .stat-big .val { font-size: 32px; font-weight: 900; }
  
  .fd-section h3 { font-size: 11px; color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid var(--border-dim); padding-bottom: 5px; margin-bottom: 10px; }
  .subnet-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .sn-badge { background: #0f2040; border: 1px solid #1e3a8a; color: #60a5fa; font-family: monospace; font-size: 11px; padding: 3px 6px; border-radius: 3px; }
  .wifi-badge { background: #064e3b; border-color: #059669; color: #34d399; }
  
  .mini-event { background: rgba(0,0,0,0.3); border-left: 2px solid #555; padding: 6px 10px; margin-bottom: 6px; font-size: 11px; }
  .mini-event.severity-critical { border-left-color: var(--color-critical); }
  .mini-event.severity-high { border-left-color: var(--color-high); }
  .me-time { color: #64748b; margin-bottom: 2px; font-size: 10px; }
  .me-type { color: #fff; font-weight: bold; }
  .me-ip { color: var(--color-info); font-family: monospace; }

  .empty-state { text-align: center; color: #64748b; font-size: 12px; padding: 20px; font-style: italic; }

  .actor-list { padding: 10px 0; }
  .actor-item { margin-bottom: 12px; }
  .ac-ip { font-family: monospace; font-size: 12px; color: #fff; margin-bottom: 4px; display: flex; justify-content: space-between; }
  .ac-bar { height: 4px; background: #0f2040; border-radius: 2px; overflow: hidden; }
  .ac-fill { height: 100%; box-shadow: 0 0 5px currentColor; }
  .ac-cnt { font-size: 10px; text-align: right; color: #64748b; margin-top: 2px; }

  /* BOTTOM PANEL: TERMINAL */
  .wb-footer { height: 200px; padding: 0 15px 15px 15px; flex-shrink: 0; }
  .term-panel { background: rgba(0,0,0,0.8); }
  .term-header { background: rgba(2,6,18,0.9); padding: 8px 15px; font-size: 11px; font-weight: 800; color: #94a3b8; border-bottom: 1px solid var(--border-dim); display: flex; }
  .blink { animation: blink 1s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .term-body { padding: 10px 15px; font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 11.5px; line-height: 1.6; flex: 1; overflow-y: auto; }
  
  .term-line { display: flex; gap: 15px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 4px; cursor: pointer; transition: 0.2s; }
  .term-line:hover { background: rgba(255,255,255,0.05); }
  .t-time { color: #64748b; width: 180px; flex-shrink: 0; }
  .t-ip { color: var(--color-info); width: 140px; flex-shrink: 0; font-weight: bold; }
  .t-dir { color: #475569; }
  .t-dest { color: #8b5cf6; width: 150px; flex-shrink: 0; font-weight: bold; }
  .t-type { color: #fff; width: 200px; flex-shrink: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t-msg { color: #10b981; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  
  .term-line.critical .t-ip, .term-line.critical .t-dest { color: var(--color-critical); text-shadow: 0 0 5px var(--color-critical); }
  .term-line.critical .t-type { color: var(--color-critical); }
  .term-line.critical .t-msg { color: #fca5a5; }
  .term-line.high .t-type { color: var(--color-high); }
  
  /* UTILS */
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
</style>
