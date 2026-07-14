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

  let scorecard: any = null;
  let scorecardLoading = true;
  let scorecardError: string | null = null;
  let showScorecardModal = false;

  // ══════════════════════════════════════════════
  // ดึงข้อมูลผ่าน Proxy Backend ของเราเอง (แก้ปัญหา CORS & SSL)
  // ══════════════════════════════════════════════
  const SCORECARD_API_URL = '/api/scorecard';
  // ══════════════════════════════════════════════

  onMount(async () => {
    // Fetch Scorecard
    try {
      const res = await fetch(SCORECARD_API_URL, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`, // ส่ง Token เพื่อยืนยันว่าเป็น Admin ในระบบเรา
          'x-scorecard-url': localStorage.getItem('cfg_scorecard_url') || '',
          'x-scorecard-key': localStorage.getItem('cfg_scorecard_key') || ''
        }
      });
      if (res.ok) {
        scorecard = await res.json();
        scorecardError = null;
      } else {
        try {
          const errData = await res.json();
          scorecardError = errData.error || 'Error from API Proxy';
          console.warn('Scorecard API returned error:', errData);
        } catch {
          scorecardError = `HTTP Error ${res.status}`;
        }
      }
    } catch (e: any) {
      console.error('Failed to fetch scorecard', e);
      scorecardError = e.message || 'Network error';
    } finally {
      scorecardLoading = false;
    }

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

  function getCountryCode(country: string): string {
    if (country === 'Local Network') return 'LN';
    const map: Record<string, string> = {
      'United States': 'US', 'USA': 'US', 'China': 'CN', 'Russia': 'RU', 
      'Germany': 'DE', 'Thailand': 'TH', 'Brazil': 'BR', 'United Kingdom': 'UK', 
      'France': 'FR', 'Australia': 'AU', 'India': 'IN', 'Japan': 'JP', 'South Korea': 'KR'
    };
    return map[country] || country.substring(0, 2).toUpperCase();
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
      let biHourlyCounts: Record<string, number> = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfDayMs = today.getTime();
      const endOfDayMs = startOfDayMs + 24 * 60 * 60 * 1000;
      
      events.forEach(e => {
        let t = e.time || e.timeStr || e.createdAt || e.timestamp;
        let eventTimeMs = new Date(t).getTime();
        if (isNaN(eventTimeMs)) eventTimeMs = Date.now(); // fallback
        
        // Only count events for TODAY (midnight to midnight)
        if (eventTimeMs >= startOfDayMs && eventTimeMs < endOfDayMs) {
          let dateObj = new Date(eventTimeMs);
          let hour = dateObj.getHours();
          // Group by 2 hours (0, 2, 4, ...)
          let biHour = Math.floor(hour / 2) * 2;
          let biHourStr = biHour.toString().padStart(2, '0');
          biHourlyCounts[biHourStr] = (biHourlyCounts[biHourStr] || 0) + 1;
        }
      });

      const labels = [];
      const data = [];
      for(let i = 0; i < 24; i += 2) {
        let hStr = i.toString().padStart(2, '0');
        labels.push(`${hStr}:00`);
        data.push(biHourlyCounts[hStr] || 0);
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
        <div class="metric-sub">บันทึกสดจาก KKUSIEM</div>
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
    <div class="metric-card info" style="border-left: 4px solid var(--green); cursor: pointer; transition: box-shadow 0.2s, transform 0.15s;" title="คลิกเพื่อดู Security Posture Score รายละเอียด" on:click={() => showScorecardModal = true} role="button" tabindex="0">
      <div class="metric-icon-wrap" style="background: var(--green-bg); color: var(--green);"><i class="ti ti-shield-check"></i></div>
      <div class="metric-body">
        <div class="metric-label">Security Posture <i class="ti ti-external-link" style="font-size:10px; opacity:0.5;"></i></div>
        {#if scorecardLoading}
          <div class="metric-val skeleton-text" style="width: 80px; height: 28px; margin: 4px 0; border-radius:4px;"></div>
          <div class="metric-sub skeleton-text" style="width: 120px; height: 14px; border-radius:4px;"></div>
        {:else if scorecard}
          <div class="metric-val ds-kpi-val" style="color: var(--green); font-size:24px; padding:0;">{scorecard.score}<span style="font-size:14px;color:var(--text-muted)">/{scorecard.maxScore}</span></div>
          <div class="metric-sub" style="font-size:11px;">{scorecard.organization || 'ดูรายละเอียด →'}</div>
        {:else if scorecardError}
          <div class="metric-val ds-kpi-val" style="color: var(--red); font-size:14px; padding:0;">Error</div>
          <div class="metric-sub" style="font-size:10px; color:var(--red);">ไม่สามารถดึงข้อมูลได้</div>
        {:else}
          <div class="metric-val ds-kpi-val" style="color: var(--text-muted); font-size:18px; padding:0;">—</div>
          <div class="metric-sub" style="font-size:10px;">คลิกเพื่อโหลดใหม่</div>
        {/if}
      </div>
      <div class="metric-arrow"><i class="ti ti-info-circle" style="color: var(--green); opacity: 0.5;"></i></div>
    </div>
  </div>

  <!-- ══════ SCORECARD DETAIL MODAL ══════ -->
  {#if showScorecardModal}
  <div class="sc-backdrop" on:click={() => showScorecardModal = false} role="button" tabindex="-1">
    <div class="sc-modal" on:click|stopPropagation>
      <!-- Header -->
      <div class="sc-header">
        <div class="sc-header-left">
          <div class="sc-icon"><i class="ti ti-shield-check"></i></div>
          <div>
            <div class="sc-title">Security Posture Score</div>
            <div class="sc-subtitle">{scorecard?.organization || 'Organization Scorecard'}</div>
          </div>
        </div>
        <button class="sc-close" on:click={() => showScorecardModal = false}><i class="ti ti-x"></i></button>
      </div>

      {#if scorecardLoading}
        <div class="sc-loading">
          <div class="sc-spinner"></div>
          <span>กำลังโหลดข้อมูล...</span>
        </div>
      {:else if scorecardError}
        <div style="padding: 2rem; text-align: center; color: var(--red);">
          <i class="ti ti-alert-circle" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
          <strong>เกิดข้อผิดพลาดในการดึงข้อมูล Scorecard</strong>
          <p style="font-size: 13px; margin-top: 8px; color: var(--text-muted);">{scorecardError}</p>
          <div style="margin-top: 2rem; font-size: 12px; color: var(--text-secondary); text-align: left; background: var(--bg-secondary); padding: 1rem; border-radius: 8px;">
            <strong style="display:block; margin-bottom: 6px;">💡 คำแนะนำ:</strong>
            1. ตรวจสอบว่าใส่ API Endpoint ในหน้า Settings ถูกต้อง<br/>
            2. Endpoint ต้องคืนค่ากลับมาเป็นรูปแบบ <code>JSON</code> ไม่ใช่หน้าเว็บ <code>HTML</code><br/>
            3. ตรวจสอบ API Key ว่าถูกต้อง (ถ้ามี)
          </div>
        </div>
      {:else if scorecard}
        <!-- Score Ring -->
        <div class="sc-score-section">
          <div class="sc-ring-wrap">
            <svg viewBox="0 0 120 120" class="sc-ring">
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" stroke-width="10"/>
              <circle cx="60" cy="60" r="50" fill="none"
                stroke="{scorecard.score >= 80 ? 'var(--green)' : scorecard.score >= 60 ? 'var(--orange)' : 'var(--red)'}"
                stroke-width="10"
                stroke-linecap="round"
                stroke-dasharray="{(scorecard.score / scorecard.maxScore) * 314} 314"
                transform="rotate(-90 60 60)"
                style="transition: stroke-dasharray 1s ease;"
              />
            </svg>
            <div class="sc-ring-inner">
              <div class="sc-ring-score" style="color: {scorecard.score >= 80 ? 'var(--green)' : scorecard.score >= 60 ? 'var(--orange)' : 'var(--red)'}">{scorecard.score}</div>
              <div class="sc-ring-max">/{scorecard.maxScore}</div>
              <div class="sc-ring-status" style="background: {scorecard.score >= 80 ? 'var(--green-bg)' : 'var(--orange-bg)'}; color: {scorecard.score >= 80 ? 'var(--green)' : 'var(--orange)'}">{scorecard.status || 'N/A'}</div>
            </div>
          </div>
          <div class="sc-meta">
            {#if scorecard.lastUpdated}
            <div class="sc-meta-row"><i class="ti ti-clock"></i> อัปเดตล่าสุด: {new Date(scorecard.lastUpdated).toLocaleString('th-TH')}</div>
            {/if}
            {#if scorecard.breakdown}
              <div class="sc-breakdown-title">คะแนนแยกประเภท</div>
              {#each Object.entries(scorecard.breakdown) as [key, val]}
              <div class="sc-breakdown-row">
                <span class="sc-breakdown-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                <div class="sc-breakdown-bar-bg">
                  <div class="sc-breakdown-bar" style="width: {val}%; background: {Number(val) >= 80 ? 'var(--green)' : Number(val) >= 60 ? 'var(--orange)' : 'var(--red)'}"></div>
                </div>
                <span class="sc-breakdown-val">{val}</span>
              </div>
              {/each}
            {/if}
          </div>
        </div>

        <!-- Recommendations -->
        {#if scorecard.recommendations && scorecard.recommendations.length > 0}
        <div class="sc-recom-section">
          <div class="sc-recom-title"><i class="ti ti-bulb"></i> Recommendations</div>
          <ul class="sc-recom-list">
            {#each scorecard.recommendations as rec}
            <li class="sc-recom-item"><i class="ti ti-alert-triangle" style="color: var(--orange);"></i> {rec}</li>
            {/each}
          </ul>
        </div>
        {/if}
      {:else}
        <div class="sc-loading" style="flex-direction: column; gap: 12px;">
          <i class="ti ti-cloud-off" style="font-size: 36px; color: var(--text-muted); opacity: 0.4;"></i>
          <span style="color: var(--text-muted);">ไม่สามารถโหลดข้อมูลได้</span>
          <span style="font-size: 11px; color: var(--text-muted);">กรุณาตรวจสอบ API Key และ URL ใน +page.svelte</span>
        </div>
      {/if}

      <!-- Footer -->
      <div class="sc-footer">
        <span style="font-size: 11px; color: var(--text-muted);"><i class="ti ti-api"></i> Powered by External Scorecard API</span>
        <button class="sc-close-btn" on:click={() => showScorecardModal = false}>ปิด</button>
      </div>
    </div>
  </div>
  {/if}


  <!-- Filter Bar -->
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

  <!-- ═══════════ LIVE MAP — REDESIGNED ═══════════ -->
  <div class="map-panel">
    <!-- Map Header Bar -->
    <div class="map-header">
      <div class="map-header-left">
        <div class="map-logo"><i class="ti ti-radar"></i></div>
        <div>
          <div class="map-title">Live Global Threat Map</div>
          <div class="map-subtitle">Real-time attack origin tracking · Leaflet OpenStreetMap</div>
        </div>
      </div>
      <div class="map-header-right">
        <div class="map-stat-pill red-pill">
          <i class="ti ti-bolt"></i>
          <span>{events.filter(e => e.severity === 'critical').length} Critical</span>
        </div>
        <div class="map-stat-pill orange-pill">
          <i class="ti ti-map-pin"></i>
          <span>{new Set(events.map(e => e.country)).size} Countries</span>
        </div>
        <span class="live-badge"><span class="pulse-dot"></span> LIVE</span>
      </div>
    </div>

    <!-- Map body — full width map only -->
    <div class="map-body">
      <div class="map-container" id="threat-map"></div>
    </div>
  </div>


  <!-- Main Content Row -->
  <div class="main-grid">
    <!-- Left: Recent Events Table -->
    <div class="panel clickable panel-tall" on:click={() => navigateTo('/dashboard/logs')} title="คลิกเพื่อไปยังหน้า Threat Logs">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon blue-icon"><i class="ti ti-list-details"></i></div>
          <div>
            <div class="panel-title">Recent Attack Events</div>
            <div class="panel-subtitle">เหตุการณ์ล่าสุดจาก KKUSIEM</div>
          </div>
        </div>
        <span class="badge-count">{filteredEvents.length} events</span>
      </div>
      <table class="log-table" style="table-layout: fixed; width: 100%;">
        <thead><tr>
          <th style="width: 30%;">วันที่ &amp; เวลา</th>
          <th style="width: 25%;">Source IP</th>
          <th style="width: 25%;">ประเภท</th>
          <th style="width: 20%;">Severity</th>
        </tr></thead>
        <tbody>
          {#each filteredEvents.slice(0, 7) as event}
          <tr>
            <td class="ds-mono">{event.time || event.timeStr}</td>
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
      <div class="empty-state"><i class="ti ti-inbox"></i> ไม่พบ event ที่ตรงกับตัวกรองที่เลือก</div>
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
              <div class="panel-subtitle">ประเทศที่โจมตีสูงสุด</div>
            </div>
          </div>
        </div>
        <div class="country-bars">
          {#each topCountries as item}
            {@const maxVal = topCountries[0]?.count || 1}
            <div class="c-row">
              <div class="c-flag">{getCountryCode(item.country)}</div>
              <div class="c-label">{item.country === 'United States' ? 'USA' : item.country}</div>
              <div class="c-bar-bg"><div class="c-bar-fill" style="width:{Math.max((item.count/maxVal)*100,3)}%;background:{getCountryColor(item.country)}"></div></div>
              <div class="c-val">{item.count}</div>
            </div>
          {/each}
          {#if topCountries.length === 0}<div class="empty-state" style="padding:1rem 0">ไม่มีข้อมูล</div>{/if}
        </div>
      </div>
      <!-- Internal Threats -->
      <div class="panel clickable" on:click={() => navigateTo('/dashboard/investigate')} title="คลิกเพื่อแกะรอยภัยคุกคามภายใน">
        <div class="panel-header">
          <div class="panel-title-group">
            <div class="panel-icon red-icon"><i class="ti ti-building"></i></div>
            <div>
              <div class="panel-title">Internal Threats</div>
              <div class="panel-subtitle">ภัยคุกคามภายในองค์กร</div>
            </div>
          </div>
        </div>
        <div class="country-bars">
          {#each topFaculties as item}
            {@const maxVal = topFaculties[0]?.count || 1}
            <div class="c-row">
              <div class="c-code-badge">{item.code}</div>
              <div class="c-label" style="flex:1" title="{item.name}">{item.name.length > 16 ? item.name.slice(0,16)+'…' : item.name}</div>
              <div class="c-bar-bg" style="width:80px;flex:none"><div class="c-bar-fill" style="width:{Math.max((item.count/maxVal)*100,3)}%;background:var(--red)"></div></div>
              <div class="c-val">{item.count}</div>
            </div>
          {/each}
          {#if topFaculties.length === 0}<div class="empty-state" style="padding:1rem 0">ไม่พบการโจมตีจากภายใน</div>{/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Charts Row -->
  <div class="charts-grid">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon green-icon"><i class="ti ti-chart-line"></i></div>
          <div><div class="panel-title">Event Timeline</div><div class="panel-subtitle">จำนวนการโจมตีรายชั่วโมง</div></div>
        </div>
      </div>
      <div style="position:relative;width:100%;height:260px"><canvas id="timelineChart"></canvas></div>
    </div>
    <div class="panel clickable" on:click={() => navigateTo('/dashboard/mitre')} title="คลิกดู MITRE ATT&CK Matrix">
      <div class="panel-header">
        <div class="panel-title-group">
          <div class="panel-icon purple-icon"><i class="ti ti-chart-bar"></i></div>
          <div><div class="panel-title">Attack Distribution</div><div class="panel-subtitle">สัดส่วนประเภทการโจมตี → MITRE Map</div></div>
        </div>
      </div>
      <div class="custom-legend top-legend">
        {#each attackStats as stat}
          <div class="leg-item"><span class="leg-box" style="background:{stat.color}"></span>{stat.type}<span class="leg-count">{stat.count.toLocaleString()}</span></div>
        {/each}
      </div>
      <div style="position:relative;width:100%;height:220px;margin-top:10px"><canvas id="attackChart"></canvas></div>
    </div>
  </div>

</div>

<style>
/* ══════════════════════════════════════════════════
   DASHBOARD PAGE STYLES
   ══════════════════════════════════════════════════ */
.db-content {
  max-width: 1400px;
  margin: 0 auto;
  padding-bottom: 2.5rem;
}

/* ── KPI Metric Cards ── */
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
.metric-label { font-size: 11.5px; font-weight: 500; color: var(--text-secondary); margin-bottom: 3px; }
.metric-val   { font-size: 30px; font-weight: 700; line-height: 1.1; letter-spacing: -1.5px; color: var(--text-primary); }
.metric-sub   { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
.metric-card.danger .metric-val { color: var(--red); }
.metric-card.warn   .metric-val { color: var(--orange); }
.metric-card.ok     .metric-val { color: var(--green); }
.metric-card.info   .metric-val { color: var(--blue); }
.metric-arrow { color: var(--text-muted); font-size: 16px; flex-shrink: 0; }

/* ── Filter Bar ── */
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

/* ──────────────────────────────────────────────────
   NEW LIVE MAP PANEL
   ────────────────────────────────────────────────── */
.map-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  margin-bottom: 14px;
}

/* Map Header */
.map-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  gap: 12px;
  flex-wrap: wrap;
}
.map-header-left { display: flex; align-items: center; gap: 12px; }
.map-logo {
  width: 40px; height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05));
  border: 1px solid rgba(29,158,117,0.2);
  color: var(--green);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
.map-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.map-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.map-header-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Stat pills in header */
.map-stat-pill {
  display: flex; align-items: center; gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 11.5px; font-weight: 600;
  border: 1px solid;
}
.red-pill    { background: var(--red-bg);    color: var(--red);    border-color: rgba(163,45,45,0.2); }
.orange-pill { background: var(--orange-bg); color: var(--orange); border-color: rgba(133,79,11,0.2); }

/* Map Body = map + sidebar */
.map-body {
  display: flex;
  height: 420px;
}
.map-container {
  flex: 1;
  min-width: 0;
  background: #0e1117;
}

/* Map right sidebar */
.map-sidebar {
  width: 220px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-left: 1px solid var(--border);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.map-sidebar-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
  display: flex; align-items: center; gap: 5px;
}
.map-sidebar-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 4px 0;
}
.map-country-list { display: flex; flex-direction: column; gap: 8px; }
.map-country-row { display: flex; align-items: center; gap: 8px; }
.map-country-rank {
  width: 18px; height: 18px;
  border-radius: 4px;
  font-size: 9px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: var(--bg-secondary);
  color: var(--text-muted);
}
.map-country-rank.rank-1 { background: rgba(251,191,36,0.15); color: #d4a017; }
.map-country-rank.rank-2 { background: rgba(163,163,163,0.15); color: #888; }
.map-country-rank.rank-3 { background: rgba(180,120,80,0.15); color: #a0633a; }
.map-country-info { flex: 1; min-width: 0; }
.map-country-name { font-size: 11.5px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.map-country-bar-bg { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.map-country-bar { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
.map-country-count { font-size: 11px; font-weight: 700; color: var(--text-secondary); font-family: 'Courier New', monospace; flex-shrink: 0; }

.map-last-event { display: flex; flex-direction: column; gap: 6px; }
.map-last-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11.5px;
}
.map-last-row span:first-child { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
.map-mono { font-family: 'Courier New', monospace; font-size: 11px; }
.map-empty { text-align: center; color: var(--text-muted); font-size: 11px; padding: 10px 0; }
.map-empty i { font-size: 20px; display: block; opacity: 0.3; margin-bottom: 4px; }

/* ── Panel Base ── */
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
  margin-bottom: 1rem; gap: 8px;
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

/* ── Main Grid (events + side panels) ── */
.main-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 12px;
  margin-bottom: 12px;
  align-items: start;
}
.panel-tall { min-height: 360px; }
.side-panels { display: flex; flex-direction: column; gap: 12px; }

/* ── Charts Grid ── */
.charts-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 12px;
  margin-bottom: 12px;
}

/* ── Country Bars ── */
.country-bars { display: flex; flex-direction: column; gap: 10px; }
.c-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.c-flag { font-size: 16px; line-height: 1; width: 22px; text-align: center; flex-shrink: 0; }
.c-label { width: 70px; color: var(--text-primary); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-bar-bg { flex: 1; background: var(--bg-secondary); height: 6px; border-radius: 3px; overflow: hidden; }
.c-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.c-val { width: 36px; text-align: right; font-family: 'Courier New', monospace; font-size: 11px; color: var(--text-secondary); }
.c-code-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 5px; background: var(--red-bg); color: var(--red); white-space: nowrap; flex-shrink: 0; }

/* ── Log Table ── */
.log-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 4px; }
.log-table th { text-align: left; font-weight: 600; color: var(--text-muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 8px 8px 0; border-bottom: 1px solid var(--border); }
.log-table td { padding: 7px 8px 7px 0; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: middle; }
.log-table tr:last-child td { border-bottom: none; }
.log-table tbody tr { transition: background .1s; }
.log-table tbody tr:hover { background: var(--bg-secondary); }

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

/* ── Chart Legend ── */
.custom-legend { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.top-legend { border-bottom: 1px solid var(--border); padding-bottom: 10px; margin-bottom: 2px; }
.leg-item { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-secondary); }
.leg-box { width: 10px; height: 10px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
.leg-count { font-weight: 700; color: var(--text-primary); }

/* ── Live Badge ── */
.live-badge {
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(29,158,117,0.12); color: var(--green);
  padding: 4px 12px; border-radius: 20px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.5px;
  flex-shrink: 0;
  border: 1px solid rgba(29,158,117,0.2);
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

/* ══════ SCORECARD MODAL ══════ */
.sc-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  animation: scFadeIn 0.2s ease;
}
@keyframes scFadeIn { from { opacity: 0; } to { opacity: 1; } }

.sc-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 16px;
  width: 560px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0,0,0,0.4);
  animation: scSlideUp 0.25s ease;
}
@keyframes scSlideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)     scale(1); }
}

.sc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}
.sc-header-left { display: flex; align-items: center; gap: 12px; }
.sc-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--green-bg); color: var(--green);
  display: flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.sc-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.sc-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.sc-close {
  background: var(--bg-secondary); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  color: var(--text-muted); font-size: 15px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.sc-close:hover { background: var(--red-bg); color: var(--red); }

.sc-loading {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 48px 24px; color: var(--text-muted); font-size: 14px;
}
.sc-spinner {
  width: 24px; height: 24px; border-radius: 50%;
  border: 3px solid var(--border); border-top-color: var(--green);
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.sc-score-section {
  display: flex; align-items: flex-start; gap: 24px;
  padding: 24px;
}
.sc-ring-wrap {
  position: relative; width: 120px; height: 120px; flex-shrink: 0;
}
.sc-ring { width: 120px; height: 120px; }
.sc-ring-inner {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.sc-ring-score { font-size: 28px; font-weight: 800; line-height: 1; }
.sc-ring-max   { font-size: 12px; color: var(--text-muted); }
.sc-ring-status {
  margin-top: 4px; padding: 2px 8px; border-radius: 10px;
  font-size: 10px; font-weight: 700;
}

.sc-meta { flex: 1; min-width: 0; }
.sc-meta-row { font-size: 11.5px; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 5px; }
.sc-breakdown-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 10px; }
.sc-breakdown-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.sc-breakdown-label { font-size: 12px; font-weight: 600; color: var(--text-primary); width: 85px; flex-shrink: 0; }
.sc-breakdown-bar-bg { flex: 1; height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; }
.sc-breakdown-bar { height: 100%; border-radius: 3px; transition: width 0.8s ease; }
.sc-breakdown-val { font-size: 11px; font-weight: 700; font-family: 'Courier New', monospace; color: var(--text-secondary); width: 28px; text-align: right; flex-shrink: 0; }

.sc-recom-section {
  padding: 0 24px 20px;
  border-top: 1px solid var(--border);
  margin-top: 4px; padding-top: 16px;
}
.sc-recom-title { font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.sc-recom-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.sc-recom-item { font-size: 12.5px; color: var(--text-secondary); display: flex; align-items: flex-start; gap: 8px; line-height: 1.5; padding: 8px 12px; background: var(--bg-secondary); border-radius: 8px; }
.sc-recom-item i { flex-shrink: 0; margin-top: 2px; }

.sc-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  border-radius: 0 0 16px 16px;
}
.sc-close-btn {
  background: var(--bg-panel); border: 1px solid var(--border);
  color: var(--text-primary); font-size: 13px; font-weight: 600;
  padding: 6px 18px; border-radius: 8px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.sc-close-btn:hover { background: var(--green-bg); border-color: var(--green); color: var(--green); }
</style>
