<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { formatEventTime } from '../../lib/formatTime';
  import { eventsStore } from '../../stores/events';
  import type { Unsubscriber } from 'svelte/store';
  import ExportPreviewModal from '../../lib/components/ExportPreviewModal.svelte';
  import AiTriageBanner from '../../lib/components/AiTriageBanner.svelte';
  import { downloadCSV, downloadPDF } from '../../lib/utils/export';
  import Chart from 'chart.js/auto';

  // ── Tab State ────────────────────────────────────────────────────────────
  let activeTab: 'inbound' | 'domestic' = 'inbound';
  let showExportModal = false;

  // ── Chart ────────────────────────────────────────────────────────────────
  let comparisonChart: any;
  let chartCanvas: HTMLCanvasElement;

  // ── Map ──────────────────────────────────────────────────────────────────
  let mapEl: HTMLDivElement;
  let map: any;
  let L: any;
  let arcCanvas: HTMLCanvasElement;
  let arcCtx: CanvasRenderingContext2D | null;
  let animFrame: number;
  let arcs: Arc[] = [];

  // KKU center coords
  const KKU_LAT = 16.4666;
  const KKU_LNG = 102.8399;

  // Country → approx coords
  const COUNTRY_COORDS: Record<string, [number, number]> = {
    'Russia': [55.75, 37.61],
    'China': [39.90, 116.40],
    'United States': [38.89, -77.03],
    'USA': [38.89, -77.03],
    'Germany': [52.52, 13.40],
    'Brazil': [-15.78, -47.93],
    'Japan': [35.68, 139.69],
    'Korea': [37.56, 126.97],
    'India': [28.61, 77.20],
    'Singapore': [1.35, 103.82],
    'Netherlands': [52.37, 4.89],
    'France': [48.85, 2.35],
    'United Kingdom': [51.50, -0.12],
    'UK': [51.50, -0.12],
    'Australia': [-35.28, 149.13],
    'Canada': [45.42, -75.69],
    'Finland': [60.17, 24.94],
    'Bulgaria': [42.69, 23.32],
    'Indonesia': [-6.21, 106.85],
    'Vietnam': [21.02, 105.83],
    'Local Network': [16.47, 102.84],
  };

  interface Arc {
    srcLat: number; srcLng: number;
    dstLat: number; dstLng: number;
    color: string;
    progress: number;
    speed: number;
    country: string;
    type: string;
    severity: string;
  }

  // ── Reactive Data ─────────────────────────────────────────────────────────
  $: events = $eventsStore;

  $: inboundEvents = events.filter(e => e.country && e.country !== 'Local Network');
  $: domesticEvents = events.filter(e => !e.country || e.country === 'Local Network');

  $: displayEvents = activeTab === 'inbound' ? inboundEvents : domesticEvents;

  // KPIs
  $: totalAttacks = displayEvents.length;
  $: criticalCount = displayEvents.filter(e => e.severity === 'critical').length;
  $: highCount = displayEvents.filter(e => e.severity === 'high').length;
  $: uniqueCountries = [...new Set(inboundEvents.map(e => e.country).filter(Boolean))].length;
  $: cncCount = displayEvents.filter(e => e.type?.toLowerCase().includes('c&c') || e.mitreCode === 'T1043').length;
  $: stealthCount = displayEvents.filter(e => e.severity === 'low').length;

  // Top countries
  $: topCountries = (() => {
    const counts: Record<string, number> = {};
    inboundEvents.forEach(e => {
      if (e.country) counts[e.country] = (counts[e.country] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  })();

  // Top Threat Types
  $: topThreatTypes = (() => {
    const counts: Record<string, number> = {};
    displayEvents.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  // Top threats (last 20)
  let chartFilterHourDiff: number | null = null;
  $: filteredDisplayEvents = chartFilterHourDiff !== null
    ? displayEvents.filter(e => {
        const nowMs = Date.now();
        const ts = e.timestampMs || new Date(e.createdAt || Date.now()).getTime();
        const hourDiff = Math.floor((nowMs - ts) / (1000 * 60 * 60));
        return hourDiff === chartFilterHourDiff;
      })
    : displayEvents;
    
  $: recentThreats = filteredDisplayEvents.slice(-20).reverse();

  // Severity color
  function sevColor(sev: string) {
    if (sev === 'critical') return '#ef4444';
    if (sev === 'high') return '#f97316';
    if (sev === 'medium') return '#f59e0b';
    return '#6b7280';
  }

  function countryFlag(country: string) {
    const flags: Record<string, string> = {
      'Russia': '🇷🇺', 'China': '🇨🇳', 'United States': '🇺🇸', 'USA': '🇺🇸',
      'Germany': '🇩🇪', 'Brazil': '🇧🇷', 'Japan': '🇯🇵', 'Korea': '🇰🇷',
      'India': '🇮🇳', 'Singapore': '🇸🇬', 'Netherlands': '🇳🇱', 'France': '🇫🇷',
      'United Kingdom': '🇬🇧', 'UK': '🇬🇧', 'Australia': '🇦🇺', 'Canada': '🇨🇦',
      'Finland': '🇫🇮', 'Bulgaria': '🇧🇬', 'Indonesia': '🇮🇩', 'Vietnam': '🇻🇳',
      'Local Network': '🏠',
    };
    return flags[country] || '🌍';
  }

  function updateChartData() {
    if (!comparisonChart) return;
    
    // Group events by hour over the last 12 hours
    const nowMs = Date.now();
    const inboundData = new Array(12).fill(0);
    const domesticData = new Array(12).fill(0);
    const labels = [];
    
    for (let i = 11; i >= 0; i--) {
      labels.push(`${i}h ago`);
    }

    $eventsStore.forEach(e => {
      const ts = e.timestampMs || new Date(e.createdAt || Date.now()).getTime();
      const hourDiff = Math.floor((nowMs - ts) / (1000 * 60 * 60));
      if (hourDiff >= 0 && hourDiff < 12) {
        const bucket = 11 - hourDiff;
        if (e.country && e.country !== 'Local Network') {
          inboundData[bucket]++;
        } else {
          domesticData[bucket]++;
        }
      }
    });

    comparisonChart.data.labels = labels;
    comparisonChart.data.datasets[0].data = inboundData;
    comparisonChart.data.datasets[1].data = domesticData;
    comparisonChart.update();
  }

  $: if (comparisonChart && events) {
    updateChartData();
  }

  function initChart() {
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    
    const gradRed = (ctx as any).createLinearGradient(0, 0, 0, 220);
    gradRed.addColorStop(0, 'rgba(239, 68, 68, 0.5)');
    gradRed.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
    
    const gradBlue = (ctx as any).createLinearGradient(0, 0, 0, 220);
    gradBlue.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradBlue.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    
    comparisonChart = new Chart(ctx as any, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Inbound Threats',
            data: [],
            borderColor: '#ef4444',
            backgroundColor: gradRed,
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#ef4444',
            pointHoverRadius: 6
          },
          {
            label: 'Domestic Threats',
            data: [],
            borderColor: '#3b82f6',
            backgroundColor: gradBlue,
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#3b82f6',
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: '#9ca3af', font: { size: 10 } } }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 9 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#9ca3af', font: { size: 9 }, stepSize: 1 }, beginAtZero: true }
        },
        interaction: { mode: 'index', intersect: false },
        onClick: (event, elements) => {
          if (elements && elements.length > 0) {
            const index = elements[0].index;
            const hourDiff = 11 - index;
            if (chartFilterHourDiff === hourDiff) {
              chartFilterHourDiff = null; // Toggle off
            } else {
              chartFilterHourDiff = hourDiff;
            }
          }
        },
        onHover: (event: any, elements) => {
          if (event.native) {
            event.native.target.style.cursor = elements && elements.length ? 'pointer' : 'default';
          }
        }
      }
    });
    updateChartData();
  }

  // ── Map + Animation ───────────────────────────────────────────────────────
  function buildArcs() {
    arcs = displayEvents
      .filter(e => {
        const coords = COUNTRY_COORDS[e.country || ''];
        return coords && e.country !== 'Local Network';
      })
      .slice(-40)
      .map(e => {
        const [srcLat, srcLng] = COUNTRY_COORDS[e.country!] || [0, 0];
        return {
          srcLat, srcLng,
          dstLat: KKU_LAT + (Math.random() - 0.5) * 0.02,
          dstLng: KKU_LNG + (Math.random() - 0.5) * 0.02,
          color: sevColor(e.severity),
          progress: Math.random(),
          speed: 0.003 + Math.random() * 0.004,
          country: e.country!,
          type: e.type,
          severity: e.severity,
        };
      });
  }

  function drawArc(ctx: CanvasRenderingContext2D, arc: Arc) {
    if (!map) return;
    const srcPt = map.latLngToContainerPoint([arc.srcLat, arc.srcLng]);
    const dstPt = map.latLngToContainerPoint([arc.dstLat, arc.dstLng]);

    const dx = dstPt.x - srcPt.x;
    const dy = dstPt.y - srcPt.y;
    const cx = (srcPt.x + dstPt.x) / 2 - dy * 0.3;
    const cy = (srcPt.y + dstPt.y) / 2 + dx * 0.3;

    // Draw full dim arc
    ctx.beginPath();
    ctx.moveTo(srcPt.x, srcPt.y);
    ctx.quadraticCurveTo(cx, cy, dstPt.x, dstPt.y);
    ctx.strokeStyle = arc.color + '22';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Animated bright head
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

    map = L.map(mapEl, {
      center: [20, 10],
      zoom: 2,
      minZoom: 2,
      maxZoom: 5,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CARTO',
    }).addTo(map);

    // KKU marker
    const kkuIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;border-radius:50%;background:#1d9e75;box-shadow:0 0 12px #1d9e75;border:2px solid #fff;"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      className: '',
    });
    L.marker([KKU_LAT, KKU_LNG], { icon: kkuIcon })
      .addTo(map)
      .bindTooltip('KKU Network', { permanent: false, className: 'kku-tooltip' });

    // Add country attack markers
    const countryHits: Record<string, number> = {};
    displayEvents.forEach(e => {
      if (e.country && e.country !== 'Local Network') {
        countryHits[e.country] = (countryHits[e.country] || 0) + 1;
      }
    });
    Object.entries(countryHits).forEach(([country, count]) => {
      const coords = COUNTRY_COORDS[country];
      if (!coords) return;
      const size = Math.min(8 + count * 2, 22);
      const icon = L.divIcon({
        html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#ef444488;border:1.5px solid #ef4444;box-shadow:0 0 8px #ef444466;"></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2], className: '',
      });
      L.marker(coords, { icon }).addTo(map)
        .bindTooltip(`${country}: ${count} attacks`, { className: 'atk-tooltip' });
    });

    // Canvas overlay for arcs
    arcCanvas = document.createElement('canvas');
    arcCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:500;';
    mapEl.appendChild(arcCanvas);
    arcCtx = arcCanvas.getContext('2d');
    resizeCanvas();

    buildArcs();
    animate();

    map.on('move zoom', () => {
      resizeCanvas();
    });
  }

  $: if (map && displayEvents) {
    buildArcs();
  }

  onMount(async () => {
    // Wait for Leaflet from CDN
    const check = setInterval(() => {
      if ((window as any).L) {
        clearInterval(check);
        initMap();
        initChart();
      }
    }, 100);
    window.addEventListener('resize', resizeCanvas);
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      if (animFrame) cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resizeCanvas);
      if (comparisonChart) comparisonChart.destroy();
    }
    if (map) map.remove();
  });

  // Live clock for display
  let displayTime = '';
  let clockInterval: any;
  onMount(() => {
    const update = () => {
      displayTime = new Date().toLocaleString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'
      });
    };
    update();
    clockInterval = setInterval(update, 60000);
    return () => clearInterval(clockInterval);
  });

  // Export Modal Logic
  let showToast = false;
  $: fullExportData = (displayEvents || []).map(e => ({
    'Time': e.timeStr || new Date(e.timestampMs || e.createdAt).toLocaleTimeString(),
    'Source IP': e.ip,
    'Country': e.country || 'Unknown',
    'Event Type': e.type,
    'Severity': e.severity,
    'Status': e.status || 'Opened'
  }));

  function handleExport(e: CustomEvent) {
    const { format, selectedColumns, filteredData } = e.detail;
    const title = 'Command Center Report';
    const filename = 'command_center_report';

    if (format === 'csv') {
      downloadCSV(filteredData, selectedColumns, `${filename}.csv`);
    } else if (format === 'pdf') {
      downloadPDF(filteredData, selectedColumns, `${filename}.pdf`, `KKUSIEM - ${title}`);
    }
    
    showExportModal = false;
    showToast = true;
    setTimeout(() => showToast = false, 3000);
  }
</script>

<svelte:head>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <title>Dashboard - KKUSIEM</title>
</svelte:head>

<div class="otm-wrap">

  <!-- ── Top Header ─────────────────────────────────────────────────────── -->
  <div class="otm-header">
    <div class="otm-title">
      <i class="ti ti-dashboard"></i>
      Command Center Dashboard
    </div>
    <div class="otm-meta" style="align-items: center;">
      <span class="period-badge"><i class="ti ti-calendar"></i> Last 7 days</span>
      <span class="time-badge"><i class="ti ti-clock"></i> {displayTime}</span>
      <button class="ds-btn primary" on:click={() => showExportModal = true}>
        <i class="ti ti-download"></i> Export Report
      </button>
    </div>
  </div>

  <ExportPreviewModal 
    show={showExportModal} 
    title="Command Center Metrics"
    columns={['Time', 'Source IP', 'Country', 'Event Type', 'Severity', 'Status']}
    data={fullExportData}
    ipColumn="Source IP"
    on:close={() => showExportModal = false}
    on:confirm={handleExport}
  />

  <div class="toast {showToast ? 'show' : ''}">
    <i class="ti ti-check" style="color:var(--green)"></i>
    <span>Export Successful</span>
  </div>

  <AiTriageBanner {events} />

  <!-- ── KPI Cards ──────────────────────────────────────────────────────── -->
  <div class="kpi-row">
    <div class="kpi-card red">
      <div class="kpi-icon"><i class="ti ti-sword"></i></div>
      <div class="kpi-body">
        <div class="kpi-num">{totalAttacks.toLocaleString()}</div>
        <div class="kpi-lbl">Inbound Attacks</div>
      </div>
    </div>
    <div class="kpi-card orange">
      <div class="kpi-icon"><i class="ti ti-antenna"></i></div>
      <div class="kpi-body">
        <div class="kpi-num">{criticalCount.toLocaleString()}</div>
        <div class="kpi-lbl">Critical Severity</div>
      </div>
    </div>
    <div class="kpi-card yellow">
      <div class="kpi-icon"><i class="ti ti-wifi-off"></i></div>
      <div class="kpi-body">
        <div class="kpi-num">{uniqueCountries}</div>
        <div class="kpi-lbl">Source Countries</div>
      </div>
    </div>
    <div class="kpi-card blue">
      <div class="kpi-icon"><i class="ti ti-satellite"></i></div>
      <div class="kpi-body">
        <div class="kpi-num">{highCount.toLocaleString()}</div>
        <div class="kpi-lbl">High Severity</div>
      </div>
    </div>
    <div class="kpi-card purple">
      <div class="kpi-icon"><i class="ti ti-ghost-2"></i></div>
      <div class="kpi-body">
        <div class="kpi-num">{stealthCount}</div>
        <div class="kpi-lbl">Low / Stealth</div>
      </div>
    </div>
    <div class="kpi-card green">
      <div class="kpi-icon"><i class="ti ti-server-cog"></i></div>
      <div class="kpi-body">
        <div class="kpi-num">{cncCount}</div>
        <div class="kpi-lbl">APT C&amp;C</div>
      </div>
    </div>
    <!-- New AI Prediction KPI -->
    <div class="kpi-card" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(217, 70, 239, 0.1)); border: 1px solid rgba(217, 70, 239, 0.3);">
      <div class="kpi-icon" style="color: #d946ef;"><i class="ti ti-brain"></i></div>
      <div class="kpi-body">
        <div class="kpi-num" style="color: #d946ef;">{Math.min(99, Math.max(12, totalAttacks * 2.5)).toFixed(1)}%</div>
        <div class="kpi-lbl" style="color: #d946ef;">AI Risk Prediction</div>
      </div>
    </div>
  </div>

  <!-- ── Main Content ───────────────────────────────────────────────────── -->
  <div class="otm-main">

    <!-- Left: Map + Table -->
    <div class="otm-left">

      <!-- Tab Bar -->
      <div class="tab-bar">
        <button class="tab-btn {activeTab === 'inbound' ? 'active' : ''}"
          on:click={() => activeTab = 'inbound'}>
          <i class="ti ti-globe"></i> Overseas (Inbound)
        </button>
        <button class="tab-btn {activeTab === 'domestic' ? 'active' : ''}"
          on:click={() => activeTab = 'domestic'}>
          <i class="ti ti-building-community"></i> Domestic (Local)
        </button>
        <div class="tab-live">
          <span class="live-dot"></span> LIVE
        </div>
      </div>

      <!-- World Map -->
      <div class="map-container">
        <div bind:this={mapEl} class="leaflet-map"></div>
        {#if !events.length}
          <div class="map-empty">
            <i class="ti ti-radar-2"></i>
            <div>กำลังรอข้อมูล threat...</div>
          </div>
        {/if}
      </div>

      <!-- Comparison Chart -->
      <div class="chart-wrap">
        <div class="chart-header">
          <span class="ds-card-title" style="font-size:12px; font-weight:700; color:var(--text-muted);">
            <i class="ti ti-chart-area-line"></i> Threat Velocity Timeline (Inbound vs Domestic)
          </span>
        </div>
        <div class="chart-body">
          <canvas bind:this={chartCanvas}></canvas>
        </div>
      </div>

      <!-- Threat Table -->
      <div class="threat-table-wrap">
        <div class="threat-table-header">
          <span class="ds-card-title" style="font-size:12px;">
            <i class="ti ti-list"></i> Real-time Threat Monitoring
          </span>
          <span class="flex items-center gap-2">
            {#if chartFilterHourDiff !== null}
              <button 
                class="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] hover:bg-blue-600/30 transition flex items-center gap-1"
                on:click={() => chartFilterHourDiff = null}
              >
                Filtered: {chartFilterHourDiff}h ago
                <span class="font-bold">×</span>
              </button>
            {/if}
            <span style="font-size:11px;color:var(--text-muted);">{recentThreats.length} events</span>
          </span>
        </div>
        <div class="threat-scroll">
          <table class="threat-table">
            <thead>
              <tr>
                <th>Time Detected</th>
                <th>Source</th>
                <th>Threat Type</th>
                <th>Severity</th>
                <th>Description</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each recentThreats as e}
              <tr class="threat-row {e.severity}">
                <td class="mono">{formatEventTime(e.time || e.timeStr || e.timestampMs || e.createdAt)}</td>
                <td class="mono">
                  <span class="flag">{countryFlag(e.country || 'Local Network')}</span>
                  {e.ip}
                </td>
                <td>
                  <span class="type-badge" style="background:{sevColor(e.severity)}22;color:{sevColor(e.severity)}">
                    {e.type}
                  </span>
                </td>
                <td>
                  <span class="sev-dot" style="background:{sevColor(e.severity)}"></span>
                  <span style="color:{sevColor(e.severity)};font-weight:600;font-size:11px;">{e.severity?.toUpperCase()}</span>
                </td>
                <td class="detail-cell">{e.detail || '-'}</td>
                <td><span class="status-chip {e.status === 'Opened' ? 'open' : 'closed'}">{e.status || 'Opened'}</span></td>
              </tr>
              {/each}
              {#if !recentThreats.length}
              <tr><td colspan="6" class="empty-row">ไม่มีข้อมูล threat ในช่วงเวลานี้</td></tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Right: Stats Panel -->
    <div class="otm-right">

      <!-- Overview Summary -->
      <div class="stat-card">
        <div class="stat-card-title"><i class="ti ti-chart-bar"></i> Overview</div>
        <div class="overview-grid-sm">
          <div class="ov-item red"><div class="ov-val">{totalAttacks}</div><div class="ov-lbl">Total</div></div>
          <div class="ov-item orange"><div class="ov-val">{criticalCount}</div><div class="ov-lbl">Critical</div></div>
          <div class="ov-item yellow"><div class="ov-val">{highCount}</div><div class="ov-lbl">High</div></div>
          <div class="ov-item blue"><div class="ov-val">{uniqueCountries}</div><div class="ov-lbl">Countries</div></div>
        </div>
      </div>

      <!-- Top Countries -->
      <div class="stat-card">
        <div class="stat-card-title"><i class="ti ti-map-pin"></i> Top Source Countries</div>
        {#if topCountries.length}
          <div class="country-list">
            {#each topCountries as [country, count], i}
            <div class="country-row">
              <div class="country-rank" style="color:{i<3?'#ef4444':'var(--text-muted)'}">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
              </div>
              <div class="country-info">
                <div class="country-name">
                  <span class="flag">{countryFlag(country)}</span> {country}
                </div>
                <div class="country-bar-wrap">
                  <div class="country-bar"
                    style="width:{Math.round((count/totalAttacks)*100)}%;background:{i===0?'#ef4444':i<3?'#f97316':'#3b82f6'}">
                  </div>
                </div>
              </div>
              <div class="country-count">{count.toLocaleString()}</div>
            </div>
            {/each}
          </div>
        {:else}
          <div class="no-data"><i class="ti ti-database-off"></i> ไม่มีข้อมูล</div>
        {/if}
      </div>

      <!-- Top Threat Types -->
      <div class="stat-card">
        <div class="stat-card-title"><i class="ti ti-target"></i> Top Threat Types</div>
        {#each topThreatTypes as [type, count]}
          <div class="type-row">
            <span class="type-name">{type}</span>
            <span class="type-cnt">{count}</span>
          </div>
        {:else}
          <div class="no-data"><i class="ti ti-database-off"></i> ไม่มีข้อมูล</div>
        {/each}
      </div>

    </div>
  </div>
</div>

<style>
  :global(body) { overflow: hidden; }

  .otm-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: calc(100vh - 80px);
    overflow: hidden;
    padding-bottom: 8px;
  }

  /* ── Header ── */
  .otm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .otm-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 20px;
    font-weight: 800;
    color: var(--text-primary);
    letter-spacing: 0.02em;
  }
  .otm-title i { color: var(--green); font-size: 24px; }
  .otm-meta { display: flex; gap: 10px; }
  .period-badge, .time-badge {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 12px;
  }

  /* ── KPI Row ── */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    flex-shrink: 0;
  }
  .kpi-card {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
    position: relative;
    overflow: hidden;
    transition: transform 0.2s;
  }
  .kpi-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
  }
  .kpi-card.red::before   { background: #ef4444; }
  .kpi-card.orange::before{ background: #f97316; }
  .kpi-card.yellow::before{ background: #f59e0b; }
  .kpi-card.blue::before  { background: #3b82f6; }
  .kpi-card.purple::before{ background: #8b5cf6; }
  .kpi-card.green::before { background: #10b981; }
  .kpi-icon { font-size: 22px; }
  .kpi-card.red    .kpi-icon { color: #ef4444; }
  .kpi-card.orange .kpi-icon { color: #f97316; }
  .kpi-card.yellow .kpi-icon { color: #f59e0b; }
  .kpi-card.blue   .kpi-icon { color: #3b82f6; }
  .kpi-card.purple .kpi-icon { color: #8b5cf6; }
  .kpi-card.green  .kpi-icon { color: #10b981; }
  .kpi-num {
    font-size: 22px; font-weight: 800;
    color: var(--text-primary);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .kpi-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }

  /* ── Main Layout ── */
  .otm-main {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 10px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .otm-left {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }
  .otm-right {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  /* ── Tab Bar ── */
  .tab-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .tab-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    font-family: inherit;
  }
  .tab-btn.active { background: var(--green); color: #fff; border-color: var(--green); }
  .tab-btn:not(.active):hover { color: var(--text-primary); }
  .tab-live {
    margin-left: auto;
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; color: #ef4444;
    letter-spacing: 0.1em;
  }
  .live-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #ef4444;
    animation: blink 1s ease-in-out infinite;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.2} }

  /* ── Map ── */
  .map-container {
    position: relative;
    flex: 1;
    min-height: 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--border);
    background: #050a14;
  }
  .leaflet-map { width: 100%; height: 100%; }
  .map-empty {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 14px; gap: 10px;
    pointer-events: none;
  }
  .map-empty i { font-size: 36px; color: var(--green); opacity: 0.4; }

  /* ── Chart ── */
  .chart-wrap {
    flex-shrink: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    height: 220px;
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
  }
  .chart-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  .chart-body {
    flex: 1;
    padding: 10px;
    position: relative;
  }

  /* ── Threat Table ── */
  .threat-table-wrap {
    flex-shrink: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    max-height: 180px;
  }
  .threat-table-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  .threat-scroll { overflow-y: auto; max-height: 130px; scrollbar-width: thin; }
  .threat-table {
    width: 100%; border-collapse: collapse; font-size: 11px;
  }
  .threat-table th {
    position: sticky; top: 0;
    background: var(--bg-secondary);
    padding: 7px 10px;
    text-align: left;
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    color: var(--text-muted); letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
  }
  .threat-table td { padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.03); }
  .threat-row.critical td:first-child { border-left: 2px solid #ef4444; }
  .threat-row.high td:first-child     { border-left: 2px solid #f97316; }
  .threat-row.medium td:first-child   { border-left: 2px solid #f59e0b; }
  .threat-row:hover { background: rgba(255,255,255,0.02); }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 10px; }
  .flag { font-size: 13px; margin-right: 4px; }
  .type-badge {
    display: inline-block;
    padding: 2px 8px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
  }
  .sev-dot {
    display: inline-block;
    width: 6px; height: 6px; border-radius: 50%;
    margin-right: 4px; vertical-align: middle;
  }
  .status-chip {
    display: inline-block;
    padding: 2px 8px; border-radius: 20px;
    font-size: 10px; font-weight: 600;
  }
  .status-chip.open   { background: rgba(239,68,68,0.1);  color: #ef4444; }
  .status-chip.closed { background: rgba(16,185,129,0.1); color: #10b981; }
  .detail-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }
  .empty-row { text-align: center; padding: 20px; color: var(--text-muted); }

  /* ── Right Panel Cards ── */
  .stat-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
  }
  .stat-card-title {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--text-muted);
    margin-bottom: 12px;
  }
  .overview-grid-sm {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .ov-item {
    border-radius: 8px; padding: 10px;
    text-align: center;
    border: 1px solid var(--border);
  }
  .ov-item.red    { background: rgba(239,68,68,0.06);  }
  .ov-item.orange { background: rgba(249,115,22,0.06); }
  .ov-item.yellow { background: rgba(245,158,11,0.06); }
  .ov-item.blue   { background: rgba(59,130,246,0.06); }
  .ov-val { font-size: 20px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .ov-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

  .country-list { display: flex; flex-direction: column; gap: 8px; }
  .country-row { display: flex; align-items: center; gap: 8px; }
  .country-rank { font-size: 14px; width: 24px; text-align: center; }
  .country-info { flex: 1; min-width: 0; }
  .country-name { font-size: 11px; color: var(--text-primary); margin-bottom: 3px; display: flex; align-items: center; gap: 4px; }
  .country-bar-wrap { height: 4px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
  .country-bar { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .country-count { font-size: 12px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }

  .type-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
    font-size: 11px;
  }
  .type-name { color: var(--text-secondary); }
  .type-cnt { font-weight: 700; color: var(--text-primary); }
  .no-data { text-align: center; color: var(--text-muted); font-size: 12px; padding: 12px 0; }

  /* Leaflet tooltip overrides */
  :global(.kku-tooltip) { background: #1d9e75; color: #fff; border: none; font-weight: 700; }
  :global(.atk-tooltip) { background: rgba(20,20,30,0.9); color: #fca5a5; border: 1px solid #ef444444; font-size: 11px; }

  @media (max-width: 900px) {
    .otm-main { grid-template-columns: 1fr; }
    .otm-right { flex-direction: row; overflow-x: auto; }
    .stat-card { min-width: 240px; }
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
  }
</style>
