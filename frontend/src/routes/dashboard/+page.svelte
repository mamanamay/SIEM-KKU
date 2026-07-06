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
          labels: [],
          datasets: [{
            label: 'Events',
            data: [], // Real data will populate here
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
      const nowMs = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      
      events.forEach(e => {
        let t = e.time || e.timeStr || e.createdAt || e.timestamp;
        let eventTimeMs = new Date(t).getTime();
        if (isNaN(eventTimeMs)) eventTimeMs = nowMs; // fallback
        
        // Only count events within the last 24 hours
        if (nowMs - eventTimeMs <= oneDayMs) {
          let dateObj = new Date(eventTimeMs);
          let hourStr = dateObj.getHours().toString().padStart(2, '0');
          hourlyCounts[hourStr] = (hourlyCounts[hourStr] || 0) + 1;
        }
      });

      const labels = [];
      const data = [];
      const currentHour = new Date().getHours();
      for(let i=23; i>=0; i--) {
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

  <!-- â•â•â• KPI Metric Cards â•â•â• -->
  <div class="metrics">
    <div class="metric-card danger" on:click={() => navigateTo('/dashboard/logs?severity=critical')} title="ดู Critical Alerts">
      <div class="metric-icon-wrap danger-icon"><i class="ti ti-alert-octagon"></i></div>
      <div class="metric-body">
        <div class="metric-label">Critical Alerts</div>
        <div class="metric-val">{events.filter(e => e.severity === 'critical').length}</div>
        <div class="metric-sub">ต้องการความสนใจทันที</div>
      </div>
      <div class="metric-arrow"><i class="ti ti-chevron-right"></i></div>
    </div>
    <div class="metric-card warn" on:click={() => navigateTo('/dashboard/logs')} title="ดู All Events">
      <div class="metric-icon-wrap warn-icon"><i class="ti ti-activity"></i></div>
      <div class="metric-body">
        <div class="metric-label">Total Events</div>
        <div class="metric-val">{events.length}</div>
        <div class="metric-sub">บันทึกสดจาก Honeypot</div>
      </div>
      <div class="metric-arrow"><i class="ti ti-chevron-right"></i></div>
    </div>
    <div class="metric-card ok" on:click={() => navigateTo('/dashboard/analytics')} title="ดู Analytics">
      <div class="metric-icon-wrap ok-icon"><i class="ti ti-network"></i></div>
      <div class="metric-body">
        <div class="metric-label">Unique Sources</div>
        <div class="metric-val">{new Set(events.map(e => e.ip)).size}</div>
        <div class="metric-sub">IP ที่ไม่ซ้ำกัน</div>
      </div>
      <div class="metric-arrow"><i class="ti ti-chevron-right"></i></div>
    </div>
    <div class="metric-card info" on:click={() => navigateTo('/dashboard/mitre')} title="ดู MITRE ATT&CK">
      <div class="metric-icon-wrap info-icon"><i class="ti ti-shield-lock"></i></div>
      <div class="metric-body">
        <div class="metric-label">Filtered Results</div>
        <div class="metric-val">{filteredEvents.length}</div>
        <div class="metric-sub">{activeSev === 'all' ? 'แสดงทุก severity' : `กรอง: ${activeSev}`}</div>
      </div>
      <div class="metric-arrow"><i class="ti ti-chevron-right"></i></div>
    </div>
  </div>

  <!-- --- Filter Bar --- -->
  <div class="filter-bar">
    <div class="filter-left">
      <span class="filter-label"><i class="ti ti-adjustments-horizontal"></i> Severity</span>
      <div class="filter-divider"></div>
      <div class="filter-chips">
        <button class="chip {activeSev === 'all' ? 'active-all' : ''}" on:click={() => setFilter('all')}>All <span class="chip-count">{events.length}</span></button>
        <button class="chip {activeSev === 'critical' ? 'active-critical' : ''}" on:click={() => setFilter('critical')}><span class="chip-dot critical-dot"></span>Critical <span class="chip-count">{events.filter(e=>e.severity==='critical').length}</span></button>
        <button class="chip {activeSev === 'high' ? 'active-high' : ''}" on:click={() => setFilter('high')}><span class="chip-dot high-dot"></span>High <span class="chip-count">{events.filter(e=>e.severity==='high').length}</span></button>
        <button class="chip {activeSev === 'medium' ? 'active-medium' : ''}" on:click={() => setFilter('medium')}><span class="chip-dot medium-dot"></span>Medium <span class="chip-count">{events.filter(e=>e.severity==='medium').length}</span></button>
        <button class="chip {activeSev === 'low' ? 'active-low' : ''}" on:click={() => setFilter('low')}><span class="chip-dot low-dot"></span>Low <span class="chip-count">{events.filter(e=>e.severity==='low').length}</span></button>
      </div>
    </div>
    <div class="filter-right">
      <div class="search-wrap">
        <i class="ti ti-search"></i>
        <input type="text" class="filter-search" bind:value={searchText} placeholder="ค้นหา IP, ประเภท...">
      </div>
    </div>
  </div>

  <!-- --- Threat Map (Full Width) --- -->
  <div class="panel map-panel">
    <div class="panel-header">
      <div class="panel-title-group">
        <div class="panel-icon green-icon"><i class="ti ti-map-2"></i></div>
        <div>
          <div class="panel-title">Live Threat Map</div>
          <div class="panel-subtitle">แผนที่แสดงแหล่งที่มาของการโจมตีแบบเรียลไทม์</div>
        </div>
      </div>
      <span class="live-badge"><span class="pulse-dot"></span> LIVE</span>
    </div>
    <div class="map-container" id="threat-map"></div>
  </div>

  <!-- --- Main Content Row --- -->
  <div class="main-grid">

    <!-- Left: Recent Events Table -->
    <div class="panel clickable panel-tall" on:click={() => navigateTo('/dashboard/logs')} title="คลิกเพื่อไปยังหน้า Threat Logs">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon blue-icon"><i class="ti ti-list-details"></i></div>
          <div>
            <div class="panel-title">Recent Attack Events</div>
            <div class="panel-subtitle">เหตุการณ์ล่าสุดจาก Honeypot</div>
          </div>
        </div>
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
          {#each filteredEvents.slice(0, 7) as event}
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
      <div class="panel-footer-link">
        <span>ดูทั้งหมดใน Threat Logs</span>
        <i class="ti ti-arrow-right"></i>
      </div>
    </div>

    <!-- Right: Side Panels -->
    <div class="side-panels">

      <!-- Top Countries -->
      <div class="panel clickable" on:click={() => navigateTo('/dashboard/analytics')} title="คลิกเพื่อไปยัง Analyst Center">
        <div class="panel-header">
          <div class="panel-title-group">
            <div class="panel-icon orange-icon"><i class="ti ti-world"></i></div>
            <div>
              <div class="panel-title">Top Source Countries</div>
              <div class="panel-subtitle">ประเทศที่โจมตีสูงสุด -> Analyst</div>
            </div>
          </div>
        </div>
        <div class="country-bars">
          {#each topCountries as item}
            {@const maxVal = topCountries[0]?.count || 1}
            <div class="c-row">
              <div class="c-flag">{item.country === 'Local Network' ? '🔒' : item.country === 'China' ? '🇨🇳' : item.country === 'Russia' ? '🇷🇺' : item.country === 'United States' || item.country === 'USA' ? '🇺🇸' : item.country === 'Germany' ? '🇩🇪' : item.country === 'Thailand' ? '🇹🇭' : '🌍'}</div>
              <div class="c-label">{item.country === 'United States' ? 'USA' : item.country}</div>
              <div class="c-bar-bg">
                <div class="c-bar-fill" style="width: {Math.max((item.count / maxVal) * 100, 3)}%; background: {getCountryColor(item.country)}"></div>
              </div>
              <div class="c-val">{item.count.toLocaleString()}</div>
            </div>
          {/each}
          {#if topCountries.length === 0}
            <div class="empty-state" style="padding: 1rem 0;">ไม่มีข้อมูลประเทศจากการโจมตี</div>
          {/if}
        </div>
      </div>

      <!-- Internal Threats -->
      <div class="panel clickable" on:click={() => navigateTo('/dashboard/investigate')} title="คลิกเพื่อแกะรอยภัยคุกคามภายใน">
        <div class="panel-header">
          <div class="panel-title-group">
            <div class="panel-icon red-icon"><i class="ti ti-building"></i></div>
            <div>
              <div class="panel-title">Internal Threats</div>
              <div class="panel-subtitle">ภัยคุกคามภายในองค์กร → Investigate</div>
            </div>
          </div>
        </div>
        <div class="country-bars">
          {#each topFaculties as item}
            {@const maxVal = topFaculties[0]?.count || 1}
            <div class="c-row">
              <div class="c-code-badge">{item.code}</div>
              <div class="c-label" style="flex:1;" title="{item.name}">{item.name.length > 16 ? item.name.slice(0,16) + '…' : item.name}</div>
              <div class="c-bar-bg" style="width: 80px; flex: none;">
                <div class="c-bar-fill" style="width: {Math.max((item.count / maxVal) * 100, 3)}%; background: var(--red)"></div>
              </div>
              <div class="c-val">{item.count}</div>
            </div>
          {/each}
          {#if topFaculties.length === 0}
            <div class="empty-state" style="padding: 1rem 0;">ไม่พบการโจมตีจากภายใน</div>
          {/if}
        </div>
      </div>

    </div>
  </div>

  <!-- --- Charts Row --- -->
  <div class="charts-grid">
    <!-- Timeline Chart -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon green-icon"><i class="ti ti-chart-line"></i></div>
          <div>
            <div class="panel-title">Event Timeline</div>
            <div class="panel-subtitle">จำนวนการโจมตีรายชั่วโมง</div>
          </div>
        </div>
      </div>
      <div style="position:relative;width:100%;height:260px">
        <canvas id="timelineChart"></canvas>
      </div>
    </div>

    <!-- Attack Distribution Chart -->
    <div class="panel clickable" on:click={() => navigateTo('/dashboard/mitre')} title="คลิกดู MITRE ATT&CK Matrix">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon purple-icon"><i class="ti ti-chart-bar"></i></div>
          <div>
            <div class="panel-title">Attack Distribution</div>
            <div class="panel-subtitle">สัดส่วนประเภทการโจมตี → MITRE Map</div>
          </div>
        </div>
      </div>
      <div class="custom-legend top-legend">
        {#each attackStats as stat}
          <div class="leg-item">
            <span class="leg-box" style="background:{stat.color}"></span>
            {stat.type}
            <span class="leg-count">{stat.count.toLocaleString()}</span>
          </div>
        {/each}
      </div>
      <div style="position:relative;width:100%;height:220px;margin-top:10px">
        <canvas id="attackChart"></canvas>
      </div>
    </div>
  </div>

</div>

<style>
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DASHBOARD PAGE STYLES
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
.db-content {
  max-width: 1400px;
  margin: 0 auto;
  padding-bottom: 2.5rem;
}

/* â”€â”€ KPI Metric Cards â”€â”€ */
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 1.25rem;
}
.metric-card {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem 1.125rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
  position: relative;
  overflow: hidden;
}
.metric-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.metric-card.danger:hover { border-color: var(--red); }
.metric-card.warn:hover   { border-color: var(--orange); }
.metric-card.ok:hover     { border-color: var(--green); }
.metric-card.info:hover   { border-color: var(--blue); }
.metric-card::after {
  content: '';
  position: absolute; inset: 0;
  opacity: 0; transition: opacity 0.2s;
}

.metric-icon-wrap {
  width: 44px; height: 44px;
  border-radius: var(--radius-md);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.danger-icon { background: var(--red-bg);    color: var(--red); }
.warn-icon   { background: var(--orange-bg); color: var(--orange); }
.ok-icon     { background: var(--green-bg);  color: var(--green); }
.info-icon   { background: var(--blue-bg);   color: var(--blue); }

.metric-body { flex: 1; min-width: 0; }
.metric-label { font-size: 11.5px; font-weight: 500; color: var(--text-secondary); margin-bottom: 3px; letter-spacing: 0.2px; }
.metric-val   { font-size: 30px; font-weight: 700; line-height: 1.1; letter-spacing: -1.5px; color: var(--text-primary); }
.metric-sub   { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.metric-card.danger .metric-val { color: var(--red); }
.metric-card.warn   .metric-val { color: var(--orange); }
.metric-card.ok     .metric-val { color: var(--green); }
.metric-card.info   .metric-val { color: var(--blue); }

.metric-arrow { color: var(--text-muted); font-size: 16px; flex-shrink: 0; }

/* â”€â”€ Filter Bar â”€â”€ */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: .625rem 1rem;
  margin-bottom: 1.25rem;
  box-shadow: var(--shadow-sm);
}
.filter-left { display: flex; align-items: center; gap: 10px; flex: 1; flex-wrap: wrap; }
.filter-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.filter-divider { width: 1px; height: 20px; background: var(--border); }
.filter-chips { display: flex; gap: 5px; flex-wrap: wrap; }

.chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 500;
  padding: 5px 12px;
  border-radius: 20px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all .15s;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  user-select: none;
}
.chip:hover { border-color: var(--border); color: var(--text-primary); }
.chip.active-all      { background: var(--text-primary); color: var(--bg); }
.chip.active-critical { background: var(--red-bg);    color: var(--red);    border-color: rgba(163,45,45,0.25); }
.chip.active-high     { background: var(--orange-bg); color: var(--orange); border-color: rgba(133,79,11,0.25); }
.chip.active-medium   { background: var(--blue-bg);   color: var(--blue);   border-color: rgba(24,95,165,0.25); }
.chip.active-low      { background: #eaf3de;           color: #3b6d11;       border-color: rgba(59,109,17,0.25); }

.chip-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.critical-dot { background: var(--red); }
.high-dot     { background: var(--orange); }
.medium-dot   { background: var(--blue); }
.low-dot      { background: #3b6d11; }
.chip-count { font-size: 10.5px; opacity: 0.65; font-weight: 400; }

.filter-right { margin-left: auto; }
.search-wrap { position: relative; }
.search-wrap .ti { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 13px; pointer-events: none; }
.filter-search {
  font-size: 12px; padding: 6px 10px 6px 30px;
  border: 1px solid var(--border); border-radius: 20px;
  background: var(--bg-secondary); color: var(--text-primary);
  outline: none; width: 190px; transition: border-color .15s, box-shadow 0.15s;
}
.filter-search:focus { border-color: var(--green); box-shadow: 0 0 0 3px rgba(29,158,117,0.1); }

/* â”€â”€ Panel Base â”€â”€ */
.panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.125rem 1.25rem;
  box-shadow: var(--shadow-sm);
  display: flex; flex-direction: column;
}
.panel.clickable { cursor: pointer; transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
.panel.clickable:hover { border-color: var(--green); box-shadow: var(--shadow-md); transform: translateY(-1px); }

.panel-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  margin-bottom: 1rem;
  gap: 8px;
}
.panel-title-group { display: flex; align-items: center; gap: 10px; }
.panel-icon {
  width: 34px; height: 34px;
  border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}
.green-icon  { background: var(--green-bg);  color: var(--green); }
.blue-icon   { background: var(--blue-bg);   color: var(--blue); }
.orange-icon { background: var(--orange-bg); color: var(--orange); }
.red-icon    { background: var(--red-bg);    color: var(--red); }
.purple-icon { background: rgba(108,56,179,0.12); color: #6c38b3; }

.panel-title    { font-size: 13.5px; font-weight: 700; color: var(--text-primary); line-height: 1.3; }
.panel-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.badge-count { font-size: 11px; font-weight: 500; background: var(--bg-secondary); color: var(--text-secondary); padding: 3px 9px; border-radius: 12px; white-space: nowrap; flex-shrink: 0; }

.panel-footer-link {
  display: flex; align-items: center; justify-content: flex-end; gap: 4px;
  margin-top: auto; padding-top: 10px;
  font-size: 11.5px; color: var(--green); font-weight: 500;
  opacity: 0.75; transition: opacity 0.15s;
}
.panel.clickable:hover .panel-footer-link { opacity: 1; }

/* â”€â”€ Threat Map â”€â”€ */
.map-panel { margin-bottom: 12px; }
.map-container {
  width: 100%; height: 380px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

/* â”€â”€ Main Grid (events + side panels) â”€â”€ */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 12px;
  margin-bottom: 12px;
  align-items: start;
}
.panel-tall { min-height: 360px; }
.side-panels { display: flex; flex-direction: column; gap: 12px; }

/* â”€â”€ Charts Grid â”€â”€ */
.charts-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 12px;
  margin-bottom: 12px;
}

/* â”€â”€ Country Bars â”€â”€ */
.country-bars { display: flex; flex-direction: column; gap: 10px; }
.c-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.c-flag { font-size: 16px; line-height: 1; width: 22px; text-align: center; flex-shrink: 0; }
.c-label { width: 70px; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-bar-bg { flex: 1; background: var(--bg-secondary); height: 6px; border-radius: 3px; overflow: hidden; }
.c-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.c-val { width: 36px; text-align: right; font-family: 'Courier New', monospace; font-size: 11px; color: var(--text-secondary); }
.c-code-badge {
  font-size: 10px; font-weight: 700;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--red-bg); color: var(--red);
  white-space: nowrap; flex-shrink: 0;
}

/* â”€â”€ Log Table â”€â”€ */
.log-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
.log-table th { text-align: left; font-weight: 600; color: var(--text-muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 8px 8px 0; border-bottom: 1px solid var(--border); }
.log-table td { padding: 7px 8px 7px 0; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: middle; }
.log-table tr:last-child td { border-bottom: none; }
.log-table tbody tr { transition: background .1s; }
.log-table tbody tr:hover { background: var(--bg-secondary); border-radius: 6px; }

.sev { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.2px; }
.sev.critical { background: var(--red-bg);    color: var(--red); }
.sev.high     { background: var(--orange-bg); color: var(--orange); }
.sev.medium   { background: var(--blue-bg);   color: var(--blue); }
.sev.low      { background: #eaf3de;           color: #3b6d11; }

.type-badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ip-mono { font-family: 'Courier New', monospace; font-size: 11.5px; color: var(--text-secondary); }
.ip-link { color: var(--blue); text-decoration: none; font-weight: 500; cursor: pointer; transition: color 0.15s; }
.ip-link:hover { color: #0f46a6; text-decoration: underline; }

.empty-state { text-align: center; padding: 2.5rem 1rem; color: var(--text-muted); font-size: 13px; }
.empty-state i { font-size: 28px; margin-bottom: 8px; display: block; opacity: 0.5; }

/* â”€â”€ Chart Legend â”€â”€ */
.custom-legend { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.top-legend { border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 2px; }
.leg-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }
.leg-box { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
.leg-count { font-weight: 700; color: var(--text-primary); }

/* â”€â”€ Live Badge â”€â”€ */
.live-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(29,158,117,0.12); color: var(--green);
  padding: 4px 10px; border-radius: 12px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px;
  flex-shrink: 0;
}
.pulse-dot { width: 6px; height: 6px; background: var(--green); border-radius: 50%; animation: pulseDot 1.5s infinite; flex-shrink: 0; }
@keyframes pulseDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.7); }
}

/* â”€â”€ Map pins â”€â”€ */
@keyframes radarPulse {
  0%   { transform: translate(-50%, -50%) scale(0.1); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2);   opacity: 0; }
}

/* â”€â”€ Responsive â”€â”€ */
@media (max-width: 1100px) {
  .main-grid { grid-template-columns: 1fr; }
  .side-panels { flex-direction: row; }
  .side-panels .panel { flex: 1; }
}
@media (max-width: 900px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .charts-grid { grid-template-columns: 1fr; }
  .side-panels { flex-direction: column; }
  .filter-search { width: 140px; }
  .map-container { height: 250px; }
}
@media (max-width: 600px) {
  .metrics { grid-template-columns: 1fr 1fr; }
  .metric-val { font-size: 24px; }
}
</style>