<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { eventsStore, roleStore } from '../../stores/events';
  import { getFacultyForIP } from '../../stores/faculties';
  
  // Chart & Map State
  let attackChart: any;
  let timelineChart: any;
  let map: any;
  let L: any;
  let mapLoaded = false;
  let chartLoaded = false;
  let attackStats: any[] = [];
  
  // Real-time events from Store
  $: events = $eventsStore;
  
  // Filter State
  let activeSev = 'all';
  let searchText = '';
  $: filteredEvents = events.filter(e => {
    const sevOk = activeSev === 'all' || e.severity === activeSev;
    const q = searchText.toLowerCase();
    const textOk = !q || (e.ip && e.ip.includes(q)) || (e.type && e.type.toLowerCase().includes(q)) || (e.detail && e.detail.toLowerCase().includes(q));
    return sevOk && textOk;
  });

  // Real Top Countries
  $: topCountries = (() => {
    const counts: Record<string, number> = {};
    events.forEach(e => {
      const c = e.country || 'Local Network';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([country, count]) => ({ country, count }));
  })();

  // Internal Faculty Threat mapping
  $: topFaculties = (() => {
    const counts: Record<string, {name: string, count: number}> = {};
    events.forEach(e => {
      const fac = getFacultyForIP(e.ip);
      if (fac) {
        if (!counts[fac.code]) {
          counts[fac.code] = { name: fac.name, count: 0 };
        }
        counts[fac.code].count++;
      }
    });
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([code, data]) => ({ code, name: data.name, count: data.count }));
  })();
  function getCountryColor(name: string) {
    if (name === 'China') return '#a32d2d';
    if (name === 'Russia') return '#854f0b';
    if (name === 'United States' || name === 'USA') return '#854f0b'; 
    if (name === 'Germany') return '#1d9e75';
    if (name === 'Brazil') return '#1d9e75';
    if (name === 'Local Network') return '#185fa5';
    return '#1d9e75';
  }

  function getTypeColor(type: string) {
    if (type === 'SSH Brute Force' || type === 'Aggressive Brute Force') return '#a32d2d'; // Red
    if (type === 'SSH Login Attempt') return '#e67e22'; // Orange
    if (type === 'Command Execution') return '#8e44ad'; // Purple
    if (type === 'System Compromised') return '#c0392b'; // Dark Red
    if (type === 'Port Scan') return '#854f0b'; // Brown
    if (type === 'SQL Inject' || type === 'Path Traversal' || type === 'XSS' || type === 'Web Scan') return '#1d9e75'; // Web attacks green
    return '#185fa5'; // Blue default
  }

  function getCoords(country: string) {
    // Map country name to approximate percentage (x,y) on a standard Robinson/Equirectangular world map
    const coords: Record<string, {x:number, y:number}> = {
      'United States': {x: 22, y: 35},
      'USA': {x: 22, y: 35},
      'China': {x: 75, y: 35},
      'Russia': {x: 70, y: 20},
      'Germany': {x: 52, y: 28},
      'Brazil': {x: 32, y: 65},
      'Local Network': {x: 50, y: 50}, // Center for local
      'Thailand': {x: 77, y: 48},
      'India': {x: 71, y: 45},
      'United Kingdom': {x: 48, y: 26},
      'France': {x: 50, y: 30},
      'Australia': {x: 85, y: 75}
    };
    return coords[country] || {x: 50, y: 50}; // Default center
  }

  function navigateTo(path: string) {
    goto(path);
  }

  onMount(() => {
    // Load Chart.js
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => {
      chartLoaded = true;
      initChart();
      updateChart();
    };
    document.head.appendChild(script);

    // Load Leaflet CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    // Load Leaflet JS
    const lscript = document.createElement('script');
    lscript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    lscript.onload = () => {
      // @ts-ignore
      L = window.L;
      mapLoaded = true;
      initMap();
    };
    document.head.appendChild(lscript);

    return () => {
      if (attackChart) attackChart.destroy();
      if (timelineChart) timelineChart.destroy();
      if (map) map.remove();
    };
  });

  $: if (chartLoaded && events.length >= 0) { updateChart(); }
  $: if (mapLoaded && events.length >= 0) { updateMap(); }

  // Map coordinates (approximate lat/lng)
  function getLatLng(country: string): [number, number] {
    const coords: Record<string, [number, number]> = {
      'United States': [38.0, -97.0], 'USA': [38.0, -97.0],
      'China': [35.8, 104.1], 'Russia': [61.5, 105.3],
      'Germany': [51.1, 10.4], 'Brazil': [-14.2, -51.9],
      'Local Network': [13.7, 100.5], // Bangkok as local center
      'Thailand': [15.8, 100.9], 'India': [20.5, 78.9],
      'United Kingdom': [55.3, -3.4], 'France': [46.2, 2.2],
      'Australia': [-25.2, 133.7]
    };
    return coords[country] || [13.7, 100.5];
  }

  function initChart() {
    if (document.getElementById('attackChart')) {
      const ctx = document.getElementById('attackChart') as HTMLCanvasElement;
      // @ts-ignore
      attackChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['SSH Brute', 'SQL Inject', 'Web Scan', 'Command Execution', 'Port Scan'],
          datasets: [{ 
            label: 'Events', data: [0,0,0,0,0], 
            backgroundColor: ['#a32d2d','#1d9e75','#185fa5','#854f0b','#533ab7'],
            borderRadius: 5
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    if (document.getElementById('timelineChart')) {
      const ctx2 = document.getElementById('timelineChart') as HTMLCanvasElement;
      // @ts-ignore
      timelineChart = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: ['03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00'],
          datasets: [{
            label: 'Events',
            data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Real data will populate here
            borderColor: '#1d9e75',
            backgroundColor: 'rgba(29, 158, 117, 0.1)',
            borderWidth: 2,
            pointBackgroundColor: '#1d9e75',
            fill: true,
            tension: 0.4
          }]
        },
        options: { 
          responsive: true, maintainAspectRatio: false, 
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  }

  function updateChart() {
    if (attackChart) {
      let counts: Record<string, number> = {};
      events.forEach(e => {
        let type = e.type || 'Unknown';
        counts[type] = (counts[type] || 0) + 1;
      });
      // Sort by count descending and take top 5
      const types = Object.keys(counts).sort((a,b) => counts[b] - counts[a]).slice(0, 5);
      
      attackStats = types.map(t => ({
        type: t === 'Aggressive Brute Force' ? 'SSH Brute' : (t === 'SSH Brute Force' ? 'SSH Brute' : (t === 'SSH Login Attempt' ? 'SSH Login' : t)),
        count: counts[t],
        color: getTypeColor(t)
      }));
      
      attackChart.data.labels = attackStats.map(s => s.type);
      attackChart.data.datasets[0].data = attackStats.map(s => s.count);
      attackChart.data.datasets[0].backgroundColor = attackStats.map(s => s.color);
      attackChart.update();
    }

    if (timelineChart) {
      let hourlyCounts: Record<string, number> = {};
      events.forEach(e => {
        let t = e.time || e.timeStr || new Date().toISOString();
        let hourMatch = t.match(/T(\d{2}):/) || t.match(/^(\d{2}):/);
        let hour = hourMatch ? hourMatch[1] : new Date().getHours().toString().padStart(2, '0');
        hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
      });

      const labels = [];
      const data = [];
      const currentHour = new Date().getHours();
      for(let i=9; i>=0; i--) {
        let h = (currentHour - i + 24) % 24;
        let hStr = h.toString().padStart(2, '0');
        labels.push(`${hStr}:00`);
        data.push(hourlyCounts[hStr] || 0);
      }
      
      timelineChart.data.labels = labels;
      timelineChart.data.datasets[0].data = data;
      timelineChart.update();
    }
  }

  let markers: any[] = [];
  function initMap() {
    if (!document.getElementById('threat-map') || !L) return;
    map = L.map('threat-map', {
      center: [20, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: false
    });
    
    // Enterprise Dark Theme map tiles (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    updateMap();
  }

  function updateMap() {
    if (!map || !L) return;
    // Clear old markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    events.slice(0, 50).forEach(e => {
      let latlng = getLatLng(e.country || 'Local Network');
      // Add slight random jitter to prevent overlapping
      let lat = latlng[0] + (Math.random() - 0.5) * 2;
      let lng = latlng[1] + (Math.random() - 0.5) * 2;
      
      let color = getTypeColor(e.type || '');
      
      const iconHtml = `
        <div style="position:relative; width: 12px; height: 12px;">
          <div style="position:absolute; width: 12px; height: 12px; background: ${color}; border-radius: 50%; z-index: 2;"></div>
          <div style="position:absolute; top: -6px; left: -6px; width: 24px; height: 24px; border: 2px solid ${color}; border-radius: 50%; animation: radarPulse 2s infinite; opacity: 0;"></div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-map-icon',
        html: iconHtml,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });

      let marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      marker.bindTooltip(`<b>${e.ip}</b><br>${e.type || 'Unknown'}`, { direction: 'top', offset: [0, -10] });
      markers.push(marker);
    });
  }

  function setFilter(sev: string) { activeSev = sev; }
</script>

<div class="db-content">
  <!-- Metric Cards -->
  <div class="metrics">
    <div class="metric-card danger">
      <div class="metric-label"><i class="ti ti-alert-triangle"></i> Critical Alerts</div>
      <div class="metric-val">{events.filter(e => e.severity === 'critical').length}</div>
      <div class="metric-sub">จากการโจมตีทั้งหมด</div>
    </div>
    <div class="metric-card warn">
      <div class="metric-label"><i class="ti ti-activity"></i> Total Events</div>
      <div class="metric-val">{events.length}</div>
      <div class="metric-sub">บันทึกสดจาก Honeypot</div>
    </div>
    <div class="metric-card ok">
      <div class="metric-label"><i class="ti ti-flag"></i> Unique Sources</div>
      <div class="metric-val">{new Set(events.map(e => e.ip)).size}</div>
      <div class="metric-sub">ไอพีที่ไม่ซ้ำกัน</div>
    </div>
    <div class="metric-card info">
      <div class="metric-label"><i class="ti ti-shield-exclamation"></i> Filtered Results</div>
      <div class="metric-val">{filteredEvents.length}</div>
      <div class="metric-sub">{activeSev === 'all' ? 'แสดงทุก severity' : `กรอง: ${activeSev}`}</div>
    </div>
  </div>

  <!-- Filter Bar -->
  <div class="filter-bar">
    <span class="filter-label"><i class="ti ti-filter" style="font-size:13px"></i> Severity Filter</span>
    <div class="filter-divider"></div>
    <div class="filter-chips">
      <button class="chip {activeSev === 'all' ? 'active-all' : ''}" on:click={() => setFilter('all')}>All <span style="opacity:.6">({events.length})</span></button>
      <button class="chip {activeSev === 'critical' ? 'active-critical' : ''}" on:click={() => setFilter('critical')}>🔴 Critical <span style="opacity:.6">({events.filter(e=>e.severity==='critical').length})</span></button>
      <button class="chip {activeSev === 'high' ? 'active-high' : ''}" on:click={() => setFilter('high')}>🟠 High <span style="opacity:.6">({events.filter(e=>e.severity==='high').length})</span></button>
      <button class="chip {activeSev === 'medium' ? 'active-medium' : ''}" on:click={() => setFilter('medium')}>🔵 Medium <span style="opacity:.6">({events.filter(e=>e.severity==='medium').length})</span></button>
      <button class="chip {activeSev === 'low' ? 'active-low' : ''}" on:click={() => setFilter('low')}>🟢 Low <span style="opacity:.6">({events.filter(e=>e.severity==='low').length})</span></button>
    </div>
    <div class="filter-right">
      <div class="search-wrap">
        <i class="ti ti-search"></i>
        <input type="text" class="filter-search" bind:value={searchText} placeholder="ค้นหา IP, ประเภท...">
      </div>
    </div>
  </div>

  <!-- Threat Map -->
  <div class="panel map-panel">
    <div class="panel-title">
      <span><i class="ti ti-map-pin"></i> Live Threat Map</span>
      <span class="live-badge"><span class="pulse-dot"></span> LIVE</span>
    </div>
    <div class="map-container" id="threat-map">
      <!-- Leaflet map will render here -->
    </div>
  </div>

  <!-- Main Grid 1 -->
  <div class="grid3">
    <!-- Events Table -->
    <div class="panel clickable" on:click={() => navigateTo('/dashboard/logs')} title="คลิกเพื่อไปยังหน้า Threat Logs">
      <div class="panel-title">
        <span><i class="ti ti-list"></i> Recent Attack Events <span style="font-size:10px;font-weight:400;color:var(--blue);margin-left:8px">(คลิกเพื่อดู Threat Logs)</span></span>
        <span class="badge-count">{filteredEvents.length} events</span>
      </div>
      <table class="log-table">
        <thead>
          <tr>
            <th>วันที่ & เวลา</th>
            <th>Source IP</th>
            <th>ประเภท</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredEvents.slice(0, 6) as event}
          <tr>
            <td class="ip-mono">{event.time || event.timeStr}</td>
            <td class="ip-mono">
              <a href="/dashboard/logs?ip={event.ip}" class="ip-link" on:click|stopPropagation title="ดูรายละเอียด IP นี้">{event.ip}</a>
            </td>
            <td><span class="type-badge">{event.type}</span></td>
            <td><span class="sev {event.severity}">{event.severity}</span></td>
          </tr>
          {/each}
        </tbody>
      </table>
      {#if filteredEvents.length === 0}
      <div class="empty-state">
        <i class="ti ti-inbox"></i>
        ไม่พบ event ที่ตรงกับตัวกรองที่เลือก
      </div>
      {/if}
    </div>

    <!-- Top Source Countries -->
    <div class="panel clickable" on:click={() => navigateTo('/dashboard/analytics')} title="คลิกเพื่อไปยังหน้า Analyst Center">
      <div class="panel-title">
        <span><i class="ti ti-world"></i> Top Source Countries <span style="font-size:10px;font-weight:400;color:var(--blue);margin-left:8px">(Analyst)</span></span>
      </div>
      <div class="country-bars">
        {#each topCountries as item}
          {@const maxVal = topCountries[0]?.count || 1}
          <div class="c-row">
            <div class="c-label">{item.country === 'United States' ? 'USA' : item.country}</div>
            <div class="c-bar-bg">
              <div class="c-bar-fill" style="width: {Math.max((item.count / maxVal) * 100, 2)}%; background: {getCountryColor(item.country)}"></div>
            </div>
            <div class="c-val">{item.count.toLocaleString()}</div>
          </div>
        {/each}
        {#if topCountries.length === 0}
          <div class="empty-state" style="padding: 1rem 0;">ไม่มีข้อมูลประเทศจากการโจมตี</div>
        {/if}
      </div>
    </div>

    <!-- Top Internal Faculties -->
    <div class="panel clickable" on:click={() => navigateTo('/dashboard/investigate')} title="คลิกเพื่อแกะรอยภัยคุกคาม (Investigate)">
      <div class="panel-title">
        <span><i class="ti ti-building"></i> Internal Threats <span style="font-size:10px;font-weight:400;color:var(--orange);margin-left:8px">(คลิกเพื่อวิเคราะห์เชิงลึก)</span></span>
      </div>
      <div class="country-bars">
        {#each topFaculties as item}
          {@const maxVal = topFaculties[0]?.count || 1}
          <div class="c-row">
            <div class="c-label" style="width: 50px;" title="{item.name}">{item.code}</div>
            <div class="c-bar-bg">
              <div class="c-bar-fill" style="width: {Math.max((item.count / maxVal) * 100, 2)}%; background: var(--orange)"></div>
            </div>
            <div class="c-val">{item.count.toLocaleString()}</div>
          </div>
        {/each}
        {#if topFaculties.length === 0}
          <div class="empty-state" style="padding: 1rem 0;">ไม่พบการโจมตีจากภายใน</div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Charts Row -->
  <div class="grid3-timeline">
    <div class="panel">
      <div class="panel-title"><span><i class="ti ti-clock"></i> Event Timeline (รายชั่วโมง)</span></div>
      <div style="position:relative;width:100%;height:350px">
        <canvas id="timelineChart"></canvas>
      </div>
    </div>

    <div class="panel clickable" on:click={() => navigateTo('/dashboard/mitre')} title="คลิกเพื่อวิเคราะห์เทคนิคตาม MITRE ATT&CK">
      <div class="panel-title"><span><i class="ti ti-grid-dots"></i> Attack Distribution (MITRE Map) <span style="font-size:10px;font-weight:400;color:var(--blue);margin-left:8px">(คลิกดู Matrix)</span></span></div>
      
      <div class="custom-legend top-legend">
        {#each attackStats as stat}
          <div class="leg-item">
            <span class="leg-box" style="background:{stat.color}"></span> {stat.type} <span class="leg-count">{stat.count.toLocaleString()}</span>
          </div>
        {/each}
      </div>

      <div style="position:relative;width:100%;height:300px;margin-top:15px">
        <canvas id="attackChart"></canvas>
      </div>
    </div>
  </div>
</div>

<style>
.db-content { max-width: 1400px; margin: 0 auto; padding-bottom: 2rem; }

/* Metrics */
.metrics { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 1.25rem; }
.metric-card {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: .875rem 1rem;
  box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
}
.metric-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 0 2px 2px 0; }
.metric-card.danger::before { background: var(--red); }
.metric-card.warn::before   { background: var(--orange); }
.metric-card.ok::before     { background: var(--green); }
.metric-card.info::before   { background: var(--blue); }
.metric-label { font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
.metric-val { font-size: 28px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
.metric-card.danger .metric-val { color: var(--red); }
.metric-card.warn   .metric-val { color: var(--orange); }
.metric-card.ok     .metric-val { color: var(--green); }
.metric-card.info   .metric-val { color: var(--blue); }
.metric-sub { font-size: 11px; color: var(--text-muted); margin-top: 5px; }

/* Filter Bar */
.filter-bar {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-md); padding: .625rem 1rem;
  margin-bottom: 1.25rem; flex-wrap: wrap; box-shadow: var(--shadow-sm);
}
.filter-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.filter-divider { width: 1px; height: 20px; background: var(--border); }
.filter-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  font-size: 11.5px; font-weight: 500; padding: 4px 12px; border-radius: 20px;
  border: 1px solid transparent; cursor: pointer; transition: all .15s; 
  background: var(--bg-secondary); color: var(--text-secondary); user-select: none;
}
.chip:hover { border-color: var(--border); }
.chip.active-all    { background: var(--text-primary); color: var(--bg); }
.chip.active-critical { background: var(--red-bg); color: var(--red); border-color: rgba(163,45,45,0.3); }
.chip.active-high   { background: var(--orange-bg); color: var(--orange); border-color: rgba(133,79,11,0.3); }
.chip.active-medium { background: var(--blue-bg); color: var(--blue); border-color: rgba(24,95,165,0.3); }
.chip.active-low    { background: #eaf3de; color: #3b6d11; border-color: rgba(59,109,17,0.3); }
.filter-right { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.filter-search {
  font-size: 12px; padding: 5px 10px 5px 30px; border: 1px solid var(--border); border-radius: 20px;
  background: var(--bg-secondary); color: var(--text-primary); outline: none; width: 180px; transition: border-color .15s;
}
.filter-search:focus { border-color: var(--green); }
.search-wrap { position: relative; }
.search-wrap .ti { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 13px; pointer-events: none; }

/* Panels */
.grid3 { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.grid3-timeline { display: grid; grid-template-columns: 2fr 1fr; gap: 10px; margin-bottom: 10px; }
.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1rem 1.25rem;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column;
}
.panel.clickable { cursor: pointer; transition: transform 0.1s, box-shadow 0.1s, border-color 0.1s; }
.panel.clickable:hover { border-color: var(--green); box-shadow: var(--shadow-md); transform: translateY(-1px); }

.panel-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  margin-bottom: .875rem; display: flex; align-items: center; justify-content: space-between;
}
.panel-title i { font-size: 15px; color: var(--text-secondary); margin-right: 6px; }
.panel-title .badge-count { font-size: 11px; font-weight: 500; background: var(--bg-secondary); color: var(--text-secondary); padding: 2px 8px; border-radius: 10px; }

/* Country Bars */
.country-bars { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.c-row { display: flex; align-items: center; gap: 10px; font-size: 12px; }
.c-label { width: 70px; color: var(--text-primary); font-weight: 500; }
.c-bar-bg { flex: 1; background: var(--bg-secondary); height: 6px; border-radius: 3px; overflow: hidden; }
.c-bar-fill { height: 100%; border-radius: 3px; }
.c-val { width: 40px; text-align: right; font-family: 'Courier New', monospace; color: var(--text-secondary); }

/* Log Table */
.log-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.log-table th { text-align: left; font-weight: 500; color: var(--text-muted); font-size: 11px; padding: 0 8px 8px 0; border-bottom: 1px solid var(--border); }
.log-table td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: top; }
.log-table tr:last-child td { border-bottom: none; }
.log-table tbody tr { transition: background .1s; }
.log-table tbody tr:hover { background: var(--bg-secondary); }

.sev { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.2px; }
.sev.critical { background: var(--red-bg); color: var(--red); }
.sev.high     { background: var(--orange-bg); color: var(--orange); }
.sev.medium   { background: var(--blue-bg); color: var(--blue); }
.sev.low      { background: #eaf3de; color: #3b6d11; }

.type-badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary); }
.ip-mono { font-family: 'Courier New', monospace; font-size: 11.5px; color: var(--text-secondary); }

.empty-state { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 13px; }
.empty-state i { font-size: 24px; margin-bottom: 5px; display: block; }

/* Custom Legend */
.custom-legend { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.top-legend { margin-bottom: 10px; border-bottom: 1px dashed var(--border); padding-bottom: 12px; }
.leg-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }
.leg-box { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
.leg-count { font-weight: 700; color: var(--text-primary); margin-left: 2px; }

/* Threat Map */
.map-panel {
  margin-bottom: 10px;
}
.map-container {
  position: relative;
  width: 100%;
  height: 400px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.map-bg {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 500"><path fill="%23d1d5db" d="M150,150 Q200,100 250,150 T350,150" opacity="0.3"/><circle cx="220" cy="175" r="5" fill="%239ca3af"/><circle cx="500" cy="250" r="5" fill="%239ca3af"/><circle cx="750" cy="175" r="5" fill="%239ca3af"/><circle cx="700" cy="100" r="5" fill="%239ca3af"/><circle cx="520" cy="140" r="5" fill="%239ca3af"/><circle cx="320" cy="325" r="5" fill="%239ca3af"/><circle cx="850" cy="375" r="5" fill="%239ca3af"/><circle cx="480" cy="130" r="5" fill="%239ca3af"/><circle cx="770" cy="240" r="5" fill="%239ca3af"/><circle cx="710" cy="225" r="5" fill="%239ca3af"/></svg>');
  background-size: cover;
  background-position: center;
  opacity: 0.6;
}
:global(body[data-theme='dark']) .map-bg { opacity: 0.2; }

.map-pin {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 2;
}
.pin-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  position: relative;
  z-index: 2;
}
.pin-ring {
  position: absolute;
  top: 50%; left: 50%;
  width: 24px; height: 24px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 2px solid;
  animation: radarPulse 2s infinite ease-out;
  opacity: 0;
}
.pin-label {
  position: absolute;
  top: 12px; left: 50%;
  transform: translateX(-50%);
  font-family: 'Courier New', monospace;
  font-size: 10px;
  color: var(--text-primary);
  background: var(--bg-panel);
  padding: 1px 4px;
  border-radius: 4px;
  border: 1px solid var(--border);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.map-pin:hover .pin-label { opacity: 1; }

@keyframes radarPulse {
  0% { transform: translate(-50%, -50%) scale(0.1); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}

.live-badge {
  display: flex; align-items: center; gap: 6px;
  background: rgba(29,158,117,0.1); color: var(--green);
  padding: 4px 8px; border-radius: 12px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.5px;
}
.pulse-dot {
  width: 6px; height: 6px; background: var(--green); border-radius: 50%;
  animation: pulseDot 1.5s infinite;
}
@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.8); }
}

@media (max-width: 900px) {
  .grid3, .grid3-timeline { grid-template-columns: 1fr; }
  .metrics { grid-template-columns: repeat(2,1fr); }
  .filter-search { width: 140px; }
  .map-container { height: 250px; }
}

.ip-link { color: var(--blue); text-decoration: none; font-weight: 500; cursor: pointer; transition: color 0.15s; }
.ip-link:hover { color: #0f46a6; text-decoration: underline; }
</style>
