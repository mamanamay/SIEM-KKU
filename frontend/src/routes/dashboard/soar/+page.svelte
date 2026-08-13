<svelte:head><title>Incident & SOAR - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { onMount } from 'svelte';
  import { formatEventTime } from '../../../lib/formatTime';
  import AttackTimeline from '../../../lib/components/AttackTimeline.svelte';
  import { eventsStore, roleStore } from '../../../stores/events';
  import { getFacultyForIP } from '../../../stores/faculties';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import ExportPreviewModal from '../../../lib/components/ExportPreviewModal.svelte';

  $: events = $eventsStore;
  let searchIp = $page.url.searchParams.get('ip') || '';
  let searchTime = $page.url.searchParams.get('time') || '';
  let searchType = '';
  let searchSeverity = '';
  let searchCountry = '';
  let nlSearchQuery = '';
  let isNlSearchLoading = false;
  let lastUrl = $page.url.href;

  $: if ($page.url.href !== lastUrl) {
    lastUrl = $page.url.href;
    searchIp = $page.url.searchParams.get('ip') || '';
    searchTime = $page.url.searchParams.get('time') || '';
    if (searchIp || searchTime) {
      selectedRange = 'all';
    }
  }

  async function performNlSearch() {
    const query = nlSearchQuery.trim();
    if (!query) {
      clearFilters();
      return;
    }
    
    // Fast path: Exact IP Address lookup
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(query)) {
      clearFilters();
      searchIp = query;
      nlSearchQuery = query; // keep it in the input
      return;
    }
    
    isNlSearchLoading = true;
    try {
      const geminiKey = localStorage.getItem('cfg_gemini_key') || '';
      const res = await fetch('/api/attacks/nl-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-gemini-key': geminiKey
        },
        body: JSON.stringify({ query: nlSearchQuery })
      });
      const data = await res.json();
      if (data.filters) {
        searchIp = data.filters.ip || '';
        searchType = data.filters.type || '';
        searchSeverity = data.filters.severity || '';
        searchCountry = data.filters.country || '';
        if (data.filters.timeRange) {
          selectedRange = data.filters.timeRange;
        }
        resetAlertMode();
      }
    } catch (e) {
      console.error('NL Search failed:', e);
    } finally {
      isNlSearchLoading = false;
    }
  }

  function clearFilters() {
    searchIp = '';
    searchType = '';
    searchSeverity = '';
    searchCountry = '';
    nlSearchQuery = '';
    selectedRange = 'all';
    resetAlertMode();
  }

  function resetAlertMode() {
    searchTime = '';
    if ($page.url.searchParams.has('ip') || $page.url.searchParams.has('time')) {
      const newUrl = new URL($page.url);
      newUrl.searchParams.delete('ip');
      newUrl.searchParams.delete('time');
      lastUrl = newUrl.href;
      goto(newUrl.href, { replaceState: true, keepFocus: true, noScroll: true });
    }
  }

  let selectedRange = 'all';

  $: getTimeLimit = (range: string) => {
    if (range === 'all') return 0;
    const now = Date.now();
    const Day = 86400000;
    switch(range) {
      case '1h': return now - 3600000;
      case '6h': return now - 21600000;
      case '24h': return now - 86400000;
      case '1m': return now - (30 * Day);
      case '3m': return now - (90 * Day);
      case '6m': return now - (180 * Day);
      case '1y': return now - (365 * Day);
      default: return 0;
    }
  };

  $: timeLimit = getTimeLimit(selectedRange);

  $: filteredEvents = (events || []).filter(e => {
    if (searchIp) {
      const q = searchIp.toLowerCase();
      const ipMatch = (e.ip || '').toLowerCase().includes(q);
      const typeMatch = (e.type || '').toLowerCase().includes(q);
      const detailMatch = (e.detail || '').toLowerCase().includes(q);
      const payloadMatch = (e.payload || '').toLowerCase().includes(q);
      if (!ipMatch && !typeMatch && !detailMatch && !payloadMatch) return false;
    }
    if (searchType && !(e.type || '').toLowerCase().includes(searchType.toLowerCase())) return false;
    if (searchSeverity && (e.severity || '').toLowerCase() !== searchSeverity.toLowerCase()) return false;
    if (searchCountry && !(e.country || '').toLowerCase().includes(searchCountry.toLowerCase())) return false;
    
    if (searchTime) {
      const timeStr = String(e.timeStr || '');
      const createdAt = String(e.createdAt || '');
      const timestamp = String(e.timestamp || '');
      const time = String(e.time || '');
      const match = [timeStr, createdAt, timestamp, time].some(t => t && (t.includes(searchTime) || searchTime.includes(t)));
      if (!match) return false;
    }

    if (selectedRange !== 'all') {
      let eventTime = e.timestampMs ? Number(e.timestampMs) : 0;
      
      // Fallback 1: Parse createdAt/timestamp string with 'Z' appended
      if (!eventTime) {
        let rawTime = e.createdAt || e.timestamp;
        if (typeof rawTime === 'string' && !rawTime.endsWith('Z') && !rawTime.includes('+') && !rawTime.includes('T')) {
          rawTime = rawTime.replace(' ', 'T') + 'Z';
        } else if (typeof rawTime === 'string' && rawTime.includes('T') && !rawTime.endsWith('Z') && !rawTime.includes('+')) {
          rawTime = rawTime + 'Z';
        }
        eventTime = rawTime ? new Date(rawTime).getTime() : 0;
      }
      
      // Fallback: Parse timeStr (DD/MM/YYYY HH:MM:SS) directly into local timestamp
      if ((!eventTime || isNaN(eventTime)) && e.timeStr) {
        const parts = e.timeStr.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
        if (parts) {
          eventTime = new Date(parseInt(parts[3]), parseInt(parts[2])-1, parseInt(parts[1]), parseInt(parts[4]), parseInt(parts[5]), parseInt(parts[6])).getTime();
        }
      }

      if (isNaN(eventTime) || eventTime < timeLimit) return false;
    }
    return true;
  });

  let expandedEvent: any = null;
  let lastAutoExpandKey = '';
  
  // Auto-expand the event if IP is in the URL, but only once per URL
  // Only auto-expand if it came from Alerts (searchTime is present)
  $: {
    const currentKey = searchIp + searchTime;
    if (searchIp && filteredEvents.length > 0 && lastAutoExpandKey !== currentKey) {
      if (searchTime) {
        expandedEvent = filteredEvents[0];
      }
      lastAutoExpandKey = currentKey;
    }
  }

  let blockedIPs = new Set<string>();
  let isActionLoading: Record<string, boolean> = {};
  let portStatus:   Record<string, string> = {};  // ip → 'isolating' | 'isolated' | 'unknown'

  // Pagination
  let currentPage = 1;
  const itemsPerPage = 30;

  $: totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
  $: {
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
  }
  $: paginatedEvents = filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function prevPage() { if (currentPage > 1) currentPage--; }
  function nextPage() { if (currentPage < totalPages) currentPage++; }

  onMount(async () => {
    try {
      const res = await fetch('/api/attacks/blocked-ips');
      const data = await res.json();
      blockedIPs = new Set(data.map((b: any) => b.ip));
    } catch (e) {}
  });

  // ─── Resolve physical switch port from access layer data ──────────────────
  // If the event has real accessLayer data (from our SIEM correlation), use it.
  // Otherwise fall back to hash-based estimate and mark as UNVERIFIED.
  function getPortInfo(e: any): { port: string; building: string; floor: string; num: string; verified: boolean } {
    if (e.accessLayer?.faculty && e.accessLayer.faculty.port) {
      // Real data from access_layer.log via SIEM correlation
      return {
        port: e.accessLayer.faculty.port,
        building: e.accessLayer.faculty.name || 'Unknown',
        floor: '?',
        num: e.accessLayer.faculty.port.replace('Gi', '').replace('/', ':'),
        verified: true,
      };
    }
    const faculty = getFacultyForIP(e.ip);
    if (faculty) {
      // Internal IP — we know the faculty but not the exact physical port
      const hash = (e.ip || '').split('.').reduce((a: number, b: string) => a + parseInt(b || '0'), 0);
      const buildings = ['อาคารเรียนรวม', 'สำนักงานคณบดี', 'อาคารวิทยบริการ', 'ห้องสมุด', 'ศูนย์คอมพิวเตอร์'];
      const b = buildings[hash % buildings.length];
      const floor = (hash % 5) + 1;
      const portNum = (hash % 48) + 1;
      return {
        port: `Gi${(hash % 3) + 1}/0/${portNum}`,
        building: b,
        floor: String(floor),
        num: String(portNum),
        verified: false,  // ← ไม่แน่ใจตำแหน่ง จะขีดเส้นบน UI
      };
    }
    return { port: '', building: '', floor: '', num: '', verified: false };
  }

  function getCncInfo(e: any) {
    if (e.cncLayer) {
      return { ip: e.cncLayer.dst_ip, country: e.cncLayer.dst_country, command: e.cncLayer.command, real: true };
    }
    // Estimate based on event type
    const cncIps: Record<string, string> = {
      'SSH Brute Force': '185.15.20.10 (Russia)',
      'Aggressive Brute Force': '185.15.20.10 (Russia)',
      'System Compromised': '91.234.55.12 (China)',
      'Command Execution': '194.55.12.88 (Brazil)',
      'SQL Inject': '45.148.10.33 (USA)',
      'Web Scan': '93.184.216.34 (USA)',
    };
    return { ip: cncIps[e.type] || '—', country: '', command: '', real: false };
  }

  let customBlockReason = '';

  function toggleEvent(e: any) {
    if (expandedEvent === e) {
      expandedEvent = null;
    } else {
      expandedEvent = e;
      customBlockReason = `${e.type} — Severity: ${e.severity?.toUpperCase()} — ${e.detail}`;
    }
  }

  // ─── Modal State ──────────────────────────────────────────────────────────
  let showBlockModal = false;
  let showUnblockModal = false;
  let blockModalReason = '';
  let pendingBlockEvent: any = null;
  let pendingBlockIp = '';

  function openBlockModal(e: any) {
    pendingBlockEvent = e;
    pendingBlockIp = e.ip;
    blockModalReason = `${e.type} — Severity: ${e.severity?.toUpperCase()} — ${e.detail}`;
    showBlockModal = true;
  }

  function openUnblockModal(e: any) {
    pendingBlockEvent = e;
    pendingBlockIp = e.ip;
    showUnblockModal = true;
  }

  // ─── Action: Toggle Block IP ──────────────────────────────────────────────
  async function executeBlockIP() {
    if (!pendingBlockEvent) return;
    const ip = pendingBlockIp;
    const reason = blockModalReason.trim();
    
    isActionLoading = { ...isActionLoading, [ip]: true };
    showBlockModal = false;

    try {
      const res = await fetch('/api/attacks/block-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          reason,
          attackId: pendingBlockEvent.id,
          faculty: getFacultyForIP(ip),
        }),
      });
      if (res.ok) {
        blockedIPs.add(ip);
        blockedIPs = blockedIPs;
      }
    } catch (err) {
      console.error('Block toggle failed:', err);
    }
    isActionLoading = { ...isActionLoading, [ip]: false };
    pendingBlockEvent = null;
  }

  async function executeUnblockIP() {
    if (!pendingBlockEvent) return;
    const ip = pendingBlockIp;

    isActionLoading = { ...isActionLoading, [ip]: true };
    showUnblockModal = false;

    try {
      const res = await fetch('/api/attacks/unblock-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      if (res.ok) {
        blockedIPs.delete(ip);
        blockedIPs = blockedIPs; // trigger reactivity
      }
    } catch (err) {
      console.error('Block toggle failed:', err);
    }
    isActionLoading = { ...isActionLoading, [ip]: false };
    pendingBlockEvent = null;
  }

  // ─── Action: Isolate Switch Port ──────────────────────────────────────────
  async function isolatePort(e: any) {
    const key = e.ip;
    const portInfo = getPortInfo(e);
    if (!portInfo.port) return;

    portStatus = { ...portStatus, [key]: 'isolating' };
    try {
      const res = await fetch('/api/attacks/isolate-port', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: e.ip,
          switchPort: portInfo.port,
          building: portInfo.building,
          floor: portInfo.floor,
          portNumber: portInfo.num,
          faculty: getFacultyForIP(e.ip),
          attackId: e.id,
        }),
      });
      const data = await res.json();
      portStatus = { ...portStatus, [key]: data.success ? 'isolated' : 'error' };
    } catch {
      portStatus = { ...portStatus, [key]: 'error' };
    }
  }

  // ─── Severity badge color ─────────────────────────────────────────────────
  function sevClass(s: string) {
    if (s === 'critical') return 'red';
    if (s === 'high')     return 'orange';
    return 'blue';
  }

  // ─── MITRE Tactic name ────────────────────────────────────────────────────
  function mitreTactic(code: string) {
    const map: Record<string, string> = {
      'T1595': 'Reconnaissance', 'T1046': 'Discovery',
      'T1190': 'Initial Access', 'T1189': 'Initial Access',
      'T1110': 'Credential Access', 'T1078': 'Credential Access',
      'T1059': 'Execution', 'T1071': 'Command & Control',
      'T1043': 'Command & Control',
    };
    return map[code] || 'Unknown Tactic';
  }

  import { downloadCSV, downloadPDF } from '../../../lib/utils/export';
  let showExportModal = false;
  let showToast = false;

  function handleExport(e: CustomEvent) {
    const { format, selectedColumns, filteredData } = e.detail;

    if (format === 'csv') {
      downloadCSV(filteredData, selectedColumns, 'investigate_logs.csv');
    } else if (format === 'pdf') {
      downloadPDF(filteredData, selectedColumns, 'investigate_logs.pdf', 'KKUSIEM - Threat Investigation Report');
    }
    
    showExportModal = false;
    showToast = true;
    setTimeout(() => showToast = false, 3000);
  }

  $: fullExportData = (filteredEvents || []).map(log => ({
    "Time": log.time || log.timeStr,
    "Source IP": log.ip,
    "Country": log.country || 'Unknown',
    "Event Type": log.type || 'Unknown Event',
    "Severity": log.severity || 'medium',
    "Status": 'Investigating',
    "Threat Score": log.threatScore || 50,
    "Tool / Client": log.userAgent || '-',
    "MITRE Tactic": mitreTactic(log.tacticId),
    "Payload Details": log.payload || '-'
  }));
</script>

<div style="display:flex;flex-direction:column;gap:16px;padding-bottom:2rem;">
  <div class="ds-card-head" style="margin-bottom:0;">
    <div class="ds-card-title"><i class="ti ti-zoom-scan"></i> Threat Investigation</div>
    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
      ระบบ SIEM เชื่อมโยง Log จาก 3 แหล่งข้อมูลและแสดงสายโจมตีครบวงจร
      คลิกที่แถวเพื่อดูรายละเอียดและดำเนินการตอบสนองภัยคุกคาม
    </div>
    <div class="log-sources-bar">
      <span class="log-src access"><i class="ti ti-shield"></i> FIREWALL TRAFFIC LOG</span>
      <span class="src-sep">+</span>
      <span class="log-src server"><i class="ti ti-server"></i> SERVER SYSLOG</span>
      <span class="src-sep">+</span>
      <span class="log-src cnc"><i class="ti ti-world"></i> NGINX ACCESS LOG</span>
      <span class="src-sep">=</span>
      <span class="log-src siem"><i class="ti ti-shield-bolt"></i> CORRELATED EVENT</span>
    </div>
  </div>

  <div class="ds-filters" style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:20px;flex-wrap:wrap;box-shadow:var(--shadow-sm);">
    <div style="display:flex;align-items:center;gap:12px;">
      <span style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Time Range:</span>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        {#each ['1h','6h','24h','1m','3m','6m','1y','all'] as r}
          <button on:click={() => { selectedRange = r; if (searchTime) searchIp = ''; resetAlertMode(); }} style="background:{selectedRange === r ? 'var(--green)' : 'var(--bg-secondary)'};color:{selectedRange === r ? '#fff' : 'var(--text-secondary)'};border:1px solid {selectedRange === r ? 'var(--green)' : 'var(--border)'};padding:5px 13px;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.18s;">
            {r === 'all' ? 'ทั้งหมด' : r}
          </button>
        {/each}
      </div>
    </div>
    
    <div style="display:flex;align-items:center;gap:12px;flex:1;max-width:800px;">
      <div class="ds-search" style="max-width:300px; flex:1;">
        <i class="ti ti-search"></i>
        <input type="text" bind:value={searchIp} placeholder="ค้นหา IP, ประเภท, รายละเอียด..." class="ds-search-input">
      </div>

      {#if searchIp || searchType || searchSeverity || searchCountry}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:11px;color:var(--text-muted);">Active Filters:</span>
          {#if searchIp}<span class="filter-badge">ค้นหา: {searchIp}</span>{/if}
          {#if searchType}<span class="filter-badge">Type: {searchType}</span>{/if}
          {#if searchSeverity}<span class="filter-badge" style="background:var(--danger)">Sev: {searchSeverity}</span>{/if}
          {#if searchCountry}<span class="filter-badge">Country: {searchCountry}</span>{/if}
          <button on:click={clearFilters} style="background:transparent;border:none;color:var(--danger);font-size:16px;cursor:pointer;padding:0;"><i class="ti ti-x"></i></button>
        </div>
      {/if}

      <button class="ds-btn primary" on:click={() => showExportModal = true} style="margin-left:auto;">
        <i class="ti ti-download"></i> Export Report
      </button>
    </div>
  </div>

  <style>
    .filter-badge {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      color: var(--text-primary);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
  </style>



  <div class="ds-card" style="padding:0;overflow:hidden;">
    <div class="ds-table-wrap"><table class="ds-table">
      <thead>
        <tr>
          <th style="width: 48px; min-width: 48px; text-align: center;"></th>
          <th style="width: 170px; min-width: 170px;">Time</th>
          <th style="width: 250px; min-width: 250px;">Source IP</th>
          <th style="width: auto;">Event Type</th>
          <th style="width: 140px; min-width: 140px;">Log Sources</th>
          <th style="width: 110px; min-width: 110px;">Severity</th>
        </tr>
      </thead>
      <tbody>
        {#each paginatedEvents as e}
          {@const hasAccess = !!e.accessLayer}
          {@const hasCnc    = !!e.cncLayer}
          <tr class="{expandedEvent === e ? 'selected-row' : ''} interactive-row" on:click={() => toggleEvent(e)}>
            <td class="text-center">
              <button class="toggle-btn">{expandedEvent === e ? '−' : '+'}</button>
            </td>
            <td class="ds-mono">{formatEventTime(e.time || e.timeStr || e.createdAt)}</td>
            <td class="mono">
              {e.ip}
              {#if getFacultyForIP(e.ip)}
                <span class="small-badge internal"><i class="ti ti-building"></i> {getFacultyForIP(e.ip)?.code}</span>
              {:else}
                <span class="small-badge external"><i class="ti ti-world"></i> External</span>
              {/if}
            </td>
            <td>
              <span class="type-text">{e.type}</span>
              <span class="mitre-tag">{e.mitreCode || ''}</span>
            </td>
            <td>
              <div class="log-dots">
                <span class="dot {hasAccess ? 'dot-access' : 'dot-off'}" title="Firewall Traffic Log">FW</span>
                <span class="dot dot-server" title="Server Syslog">SRV</span>
                <span class="dot {hasCnc ? 'dot-cnc' : 'dot-off'}" title="NGINX Access Log">WEB</span>
              </div>
            </td>
            <td>
              <span class="ds-badge {sevClass(e.severity)}">{(e.severity || 'medium').toUpperCase()}</span>
            </td>
          </tr>

          <!-- ─── Expanded Detail Row ─── -->
          {#if expandedEvent === e}
            {@const faculty  = getFacultyForIP(e.ip)}
            {@const portInfo = getPortInfo(e)}
            {@const cncInfo  = getCncInfo(e)}
            {@const isBlocked  = blockedIPs.has(e.ip)}
            {@const isIsolated = portStatus[e.ip]   === 'isolated'}
            <tr class="expanded-content-row">
              <td colspan="6">
                <div class="expanded-panel">

                  <!-- ── Correlation Chain Header ── -->
                  <div class="chain-header">
                    <i class="ti ti-git-merge"></i>
                    <strong>SIEM Correlation Chain</strong>
                    <span class="chain-sub">— สายโจมตีที่ระบบตรวจพบและเชื่อมโยงจาก Log ทั้ง 3 แหล่ง</span>
                  </div>

                  <!-- ── 3 Log Sources Visual ── -->
                  <div class="three-log-grid">

                    <!-- Log 1: Access Layer -->
                    <div class="log-card {e.accessLayer ? 'card-active-access' : 'card-dim'}">
                      <div class="log-card-header">
                        <span class="log-badge badge-access">FW</span>
                        <span>FIREWALL TRAFFIC LOG</span>
                        <span class="log-card-src">firewall.log</span>
                      </div>
                      <div class="log-card-icon"><i class="ti ti-router"></i></div>
                      {#if e.accessLayer}
                        <div class="log-field"><label>Source IP</label><code>{e.ip}</code></div>
                        <div class="log-field"><label>Network Layer</label><code>{e.accessLayer.layer || 'Core Switch → Server Zone'}</code></div>
                        <div class="log-field"><label>Faculty (Access SW)</label>
                          <code>{e.accessLayer.faculty?.name || faculty?.name || 'Unknown'}</code>
                        </div>
                        <div class="log-field"><label>Service Targeted</label><code>{e.accessLayer.service || 'SSH'}</code></div>
                        <div class="verified-badge"><i class="ti ti-check"></i> Correlated from real log</div>
                      {:else}
                        <div class="log-field"><label>Source IP</label><code>{e.ip}</code></div>
                        {#if faculty}
                          <div class="log-field"><label>Faculty (estimated)</label><code>{faculty.name}</code></div>
                        {:else}
                          <div class="log-field"><label>Origin</label><code>External / Internet</code></div>
                        {/if}
                        <div class="unverified-badge"><i class="ti ti-question-mark"></i> No access_layer.log match — proxy may not have captured this</div>
                      {/if}
                    </div>

                    <div class="chain-arrow"><i class="ti ti-arrow-right"></i></div>

                    <!-- Log 2: Server KKUSIEM -->
                    <div class="log-card card-active-server">
                      <div class="log-card-header">
                        <span class="log-badge badge-server">SRV</span>
                        <span>SERVER SYSLOG</span>
                        <span class="log-card-src">{e.type?.includes('Web') || e.type?.includes('SQL') || e.type?.includes('Scan') || e.type?.includes('XSS') ? 'webtrap.json' : 'edr_agent.json'}</span>
                      </div>
                      <div class="log-card-icon server-icon"><i class="ti ti-server"></i></div>
                      <div class="log-field"><label>Event ID</label><code>{e.mitreCode || 'T1110'}</code></div>
                      <div class="log-field"><label>Attack Type</label><code>{e.type}</code></div>
                      <div class="log-field"><label>Detail</label><code class="break-all">{e.detail || '—'}</code></div>
                      <div class="log-field"><label>Client / Tool</label><code>{e.clientVersion || 'Unknown'}</code></div>
                      <div class="log-field"><label>Threat Score</label>
                        <span class="score-bar">
                          <span class="score-fill-container">
                            <span class="score-fill" style="width:{e.threatScore || 50}%"></span>
                          </span>
                          <span class="score-num">{e.threatScore || 50}/100</span>
                        </span>
                      </div>
                    </div>

                    <div class="chain-arrow {hasCnc ? '' : 'arrow-dim'}">
                      <i class="ti ti-arrow-right"></i>
                    </div>

                    <!-- Log 3: C&C Outbound -->
                    <div class="log-card {hasCnc ? 'card-active-cnc' : 'card-dim'}">
                      <div class="log-card-header">
                        <span class="log-badge badge-cnc">WEB</span>
                        <span>NGINX ACCESS LOG</span>
                        <span class="log-card-src">access.log</span>
                      </div>
                      <div class="log-card-icon cnc-icon"><i class="ti ti-world-x"></i></div>
                      {#if hasCnc}
                        <div class="log-field"><label>C&C Server IP</label><code>{e.cncLayer.dst_ip}</code></div>
                        <div class="log-field"><label>Country</label><code>{e.cncLayer.dst_country || 'Unknown'}</code></div>
                        <div class="log-field"><label>Command Used</label><code class="break-all">{e.cncLayer.command || 'N/A'}</code></div>
                        <div class="log-field"><label>MITRE</label><code>T1071 — App Layer Protocol</code></div>
                        <div class="verified-badge"><i class="ti ti-check"></i> Correlated from real log</div>
                      {:else}
                        <div class="log-field"><label>C&C Server (estimated)</label>
                          <code class="text-muted-code">{cncInfo.ip}</code>
                        </div>
                        <div class="unverified-badge">
                          <i class="ti ti-clock"></i> Awaiting C&C outbound event — จะโชว์เมื่อ Cowrie รันคำสั่ง wget/curl
                        </div>
                      {/if}
                    </div>
                  </div>

                  <!-- ── Switch Port + Defense Section ── -->
                  <div class="defense-grid">

                    <!-- Physical Location -->
                    <div class="defense-box">
                      <h5><i class="ti ti-map-pin"></i> Physical Location (ตำแหน่งในเครือข่าย)</h5>
                      {#if faculty}
                        <div class="location-row">
                          <i class="ti ti-building"></i>
                          <div>
                            <div class="loc-title">{faculty.name}</div>
                            <div class="loc-sub">Faculty Network Segment</div>
                          </div>
                        </div>
                        <div class="location-row">
                          <i class="ti ti-plug"></i>
                          <div>
                            <div class="loc-title {portInfo.verified ? '' : 'text-unverified'}">
                              {portInfo.verified ? portInfo.port : `~${portInfo.port}`}
                              {#if !portInfo.verified}<span class="unverified-tag">ยังไม่ยืนยัน</span>{/if}
                            </div>
                            <div class="loc-sub">
                              {portInfo.verified ? 'ข้อมูลจาก access_layer.log' : `สวิตช์ ${portInfo.building} ชั้น ${portInfo.floor} พอร์ต ${portInfo.num} (ประมาณการ)`}
                            </div>
                          </div>
                        </div>
                        {#if !portInfo.verified}
                          <div class="location-note">
                            <i class="ti ti-info-circle"></i>
                            ตำแหน่ง Switch Port ประมาณจาก IP Range — ต้องยืนยันกับ NetFlow/SNMP ของ Core Switch จริงก่อนดำเนินการ
                          </div>
                        {/if}
                      {:else}
                        <div class="location-row">
                          <i class="ti ti-world"></i>
                          <div>
                            <div class="loc-title">External IP — ไม่มีพอร์ต Switch</div>
                            <div class="loc-sub">การโจมตีมาจากภายนอกเครือข่าย (Internet)</div>
                          </div>
                        </div>
                      {/if}
                    </div>

                    <!-- Attack Explanation -->
                    <div class="defense-box">
                      <h5><i class="ti ti-bug"></i> Attack Explanation (การโจมตีนี้คืออะไร)</h5>
                      <div class="mitre-row">
                        <span class="mitre-code">{e.mitreCode}</span>
                        <span class="mitre-tactic">{mitreTactic(e.mitreCode)}</span>
                      </div>
                      <p class="desc-text"><strong>{e.type}</strong></p>
                      <p class="desc-text">{e.detail || '—'}</p>
                      <div class="what-is-box">
                        {#if e.type?.includes('Brute')}
                          <p>แฮกเกอร์กำลังลองรหัสผ่าน SSH อย่างรัวๆ เพื่อเจาะเข้าเครื่อง Server หากสำเร็จจะได้รับ Shell เต็มสิทธิ์และสั่งรันโปรแกรมอันตรายได้ทันที</p>
                        {:else if e.type?.includes('SQL')}
                          <p>แฮกเกอร์ฝังคำสั่ง SQL ใน URL เพื่อหลอกให้ฐานข้อมูลเปิดเผยข้อมูลหรือลบข้อมูลออก ถือเป็นช่องโหว่ติดอันดับ OWASP Top 10</p>
                        {:else if e.type?.includes('Scan')}
                          <p>แฮกเกอร์กำลังสำรวจระบบเพื่อหาพอร์ตและบริการที่เปิดใช้งาน ถือเป็นขั้นตอน Reconnaissance ก่อนการโจมตีจริง</p>
                        {:else if e.type?.includes('Compromised')}
                          <p>เครื่อง Server ถูกเจาะสำเร็จ! แฮกเกอร์เข้าถึงได้ด้วย credential จริง ต้องดำเนินการแยกเครื่องและตรวจสอบทันที</p>
                        {:else if e.type?.includes('Command')}
                          <p>แฮกเกอร์ที่เจาะสำเร็จกำลังรันคำสั่งใน Shell — อาจดาวน์โหลดมัลแวร์ สร้าง backdoor หรือส่งข้อมูลออกไปยัง C&C Server</p>
                        {:else}
                          <p>{e.detail || 'ตรวจพบทราฟฟิกที่ผิดปกติในระบบเครือข่าย'}</p>
                        {/if}
                      </div>
                    </div>

                    <!-- Defense Actions -->
                    <div class="defense-box">
                      <h5><i class="ti ti-shield-check"></i> How to Defend? (การป้องกัน)</h5>
                      <p class="mitigation-text">{e.mitigation || 'Block IP at Firewall | Monitor for further attempts'}</p>

                      <div class="action-section">
                        <div class="action-label"><i class="ti ti-bolt"></i> SOAR Playbook: WAF / Firewall Action:</div>
                        {#if $roleStore === 'admin'}
                          <button
                            class="btn-action {isBlocked ? 'btn-done' : 'red'} {isActionLoading[e.ip] ? 'btn-loading' : ''}"
                            on:click|stopPropagation={() => isBlocked ? openUnblockModal(e) : openBlockModal(e)}
                            disabled={isActionLoading[e.ip]}
                          >
                            {#if isActionLoading[e.ip]}
                              <i class="ti ti-loader-2 spin"></i> Processing...
                            {:else if isBlocked}
                              <i class="ti ti-shield-check"></i> Unblock IP ({e.ip})
                            {:else}
                              <i class="ti ti-shield-x"></i> Block IP ({e.ip})
                            {/if}
                          </button>
                        {:else}
                          <div class="action-note warn"><i class="ti ti-lock"></i> Admin Only - Insufficient permissions</div>
                        {/if}

                        <hr style="border:0;border-top:1px solid var(--border);margin:16px 0;">
                        <AttackTimeline ip={e.ip} />

                        <div class="action-label" style="margin-top:10px">
                          <i class="ti ti-bolt"></i> SOAR Playbook: Switch Port Action:
                          {#if !faculty}
                            <span class="action-note">ไม่สามารถดำเนินการได้ — IP ภายนอก ไม่มี Switch Port</span>
                          {:else if !portInfo.verified}
                            <span class="action-note warn"><i class="ti ti-alert-triangle"></i> ตำแหน่งพอร์ตยังไม่แน่ชัด (ประมาณการ)</span>
                          {/if}
                        </div>

                        {#if faculty}
                          {#if $roleStore === 'admin'}
                            <button
                              class="btn-action orange {isIsolated ? 'btn-done' : ''} {!portInfo.verified ? 'btn-unverified' : ''} {portStatus[e.ip] === 'isolating' ? 'btn-loading' : ''}"
                              on:click|stopPropagation={() => isolatePort(e)}
                              disabled={isIsolated || portStatus[e.ip] === 'isolating'}
                              title="{portInfo.verified ? `Isolate ${portInfo.port}` : `พอร์ตประมาณการ: ~${portInfo.port} — ยังไม่ยืนยัน`}"
                            >
                              {#if portStatus[e.ip] === 'isolating'}
                                <i class="ti ti-loader-2 spin"></i> Isolating...
                              {:else if isIsolated}
                                <i class="ti ti-check"></i> Port Isolated
                              {:else if portInfo.verified}
                                <i class="ti ti-plug-x"></i> Isolate {portInfo.port}
                              {:else}
                                <i class="ti ti-plug-x"></i> <span style="text-decoration:line-through;opacity:0.6">Isolate ~{portInfo.port}</span> (ไม่แน่ใจ)
                              {/if}
                            </button>
                          {:else}
                            <div class="action-note warn"><i class="ti ti-lock"></i> Admin Only - Insufficient permissions</div>
                          {/if}
                          {#if !portInfo.verified && !isIsolated}
                            <div class="port-warning">
                              <i class="ti ti-alert-circle"></i>
                              ปุ่มนี้ยังใช้ได้แต่ตำแหน่งพอร์ตเป็นการประมาณ — ในระบบจริงต้องยืนยันจาก Core Switch SNMP ก่อน
                            </div>
                          {/if}
                          {#if isIsolated}
                            <div class="isolation-result">
                              <i class="ti ti-terminal"></i>
                              <div>
                                <div>คำสั่งที่ส่งไปสวิตช์ (จำลอง):</div>
                                <code>interface {portInfo.port}{'\n'} shutdown{'\n'} description [SIEM-BLOCKED]</code>
                              </div>
                            </div>
                          {/if}
                        {:else}
                          <button class="btn-action orange btn-disabled" disabled title="ไม่สามารถดำเนินการได้ — IP ภายนอก">
                            <i class="ti ti-plug-x"></i> Isolate Switch Port
                          </button>
                        {/if}
                      </div>
                    </div>
                  </div>

                  <!-- ── Correlation Chain Text Steps ── -->
                  {#if e.correlationChain?.length}
                    <div class="chain-steps-box">
                      <div class="chain-steps-title"><i class="ti ti-list-details"></i> Correlation Steps (จาก SIEM Engine)</div>
                      {#each e.correlationChain as step, i}
                        <div class="chain-step">
                          <span class="step-num">{i + 1}</span>
                          <span class="step-text">{step}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}

                </div>
              </td>
            </tr>
          {/if}
        {/each}

        {#if filteredEvents.length === 0}
          <tr>
            <td colspan="6" class="empty-state">
              <i class="ti ti-radar"></i>
              <div>ยังไม่มีเหตุการณ์</div>
            </td>
          </tr>
        {/if}
      </tbody>
    </table></div>
    
    <!-- Pagination Controls -->
    {#if totalPages > 1}
    <div class="ds-pagination">
      <button class="ds-page-btn" on:click={prevPage} disabled={currentPage === 1}>
        <i class="ti ti-chevron-left"></i> Previous
      </button>
      <div class="ds-pagination-info">Page {currentPage} of {totalPages}</div><div class="ds-pagination-btns"><button class="ds-page-btn" on:click={nextPage} disabled={currentPage === totalPages}>
        Next <i class="ti ti-chevron-right"></i>
      </button></div></div>{/if}
  </div>
</div>

<ExportPreviewModal 
  show={showExportModal} 
  title="Threat Investigation Logs" 
  columns={["Time", "Source IP", "Country", "Event Type", "Severity", "Status", "Threat Score", "Tool / Client", "MITRE Tactic", "Payload Details"]}
  data={fullExportData}
  ipColumn="Source IP"
  on:close={() => showExportModal = false}
  on:confirm={handleExport}
/>

<div class="toast {showToast ? 'show' : ''}">
  <i class="ti ti-check" style="color:var(--green)"></i>
  <span>Export Successful</span>
</div>

{#if showUnblockModal}
<div class="custom-modal-overlay" on:click={() => showUnblockModal = false}>
  <div class="custom-modal-content" on:click|stopPropagation>
    <div class="modal-icon-top warning"><i class="ti ti-alert-triangle"></i></div>
    <div class="modal-title">ยืนยันการ Unblock IP</div>
    <div class="modal-desc">
      คุณต้องการ Unblock <strong>{pendingBlockIp}</strong> ใช่หรือไม่?<br>
      IP นี้จะสามารถเชื่อมต่อระบบได้อีกครั้ง
    </div>
    <div class="modal-actions">
      <button class="modal-btn cancel" on:click={() => showUnblockModal = false}>ยกเลิก</button>
      <button class="modal-btn confirm-unblock" on:click={executeUnblockIP}>ยืนยัน Unblock</button>
    </div>
  </div>
</div>
{/if}

{#if showBlockModal}
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="custom-modal-overlay" on:click={() => showBlockModal = false}>
  <div class="custom-modal-content" on:click|stopPropagation>
    <div class="modal-icon-top danger"><i class="ti ti-shield-x"></i></div>
    <div class="modal-title">ยืนยันการ Block IP</div>
    <div class="modal-desc" style="text-align: left; margin-bottom: 15px;">
      คุณกำลังจะ Block IP <strong>{pendingBlockIp}</strong><br>
      <label style="display:block; margin-top:10px; font-size:12px; font-weight:bold; color:var(--text-muted);">เหตุผลในการบล็อก:</label>
      <input type="text" class="modal-input" bind:value={blockModalReason} placeholder="ระบุเหตุผล..." />
    </div>
    <div class="modal-actions">
      <button class="modal-btn cancel" on:click={() => showBlockModal = false}>ยกเลิก</button>
      <button class="modal-btn confirm-block" on:click={executeBlockIP}>ยืนยัน Block</button>
    </div>
  </div>
</div>
{/if}

<style>
  /* ─── Page Layout ────────────────────────────────────────────────────────── */
  
  
  
  
  

  /* ─── Log Sources Bar ────────────────────────────────────────────────────── */
  .log-sources-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .log-src { font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; display: flex; align-items: center; gap: 8px; }
  .log-src.access { background: rgba(0,200,255,0.15); color: #00c8ff; border: 1px solid rgba(0,200,255,0.4); }
  .log-src.server { background: rgba(46,204,113,0.15); color: #2ecc71; border: 1px solid rgba(46,204,113,0.4); }
  .log-src.cnc    { background: rgba(255,51,51,0.15);  color: #ff3333; border: 1px solid rgba(255,51,51,0.4); }
  .log-src.siem   { background: rgba(255,200,0,0.15);  color: #ffc800; border: 1px solid rgba(255,200,0,0.4); }
  
  .log-src i.ti-server { background: #2ecc71; color: #000; padding: 2px; border-radius: 4px; font-size: 12px; }
  .src-sep { color: var(--text-muted); font-weight: 700; font-size: 14px; }

  /* ─── Table ──────────────────────────────────────────────────────────────── */
  
  
  
  

  .interactive-row { cursor: pointer; transition: background 0.15s; }
  .interactive-row:hover { background: rgba(0,212,255,0.03); }
  .selected-row { background: rgba(0,212,255,0.05) !important; }
  .selected-row td { border-bottom: none; }

  .toggle-btn { background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary); width: 24px; height: 24px; border-radius: 4px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; }
  .selected-row .toggle-btn { background: var(--accent); color: #000; border-color: var(--accent); }

  .mono { font-family: 'Courier New', monospace; font-size: 12px; }
  .small-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; }
  .small-badge.internal { background: rgba(0,212,255,0.12); color: var(--accent); }
  .small-badge.external { background: rgba(255,200,0,0.12); color: #ffc800; }

  .type-text { display: block; font-weight: 600; }
  .mitre-tag { font-size: 10px; color: var(--text-muted); font-family: monospace; }

  /* Log Source Dots */
  .log-dots { display: flex; gap: 6px; }
  .dot { width: 28px; height: 22px; border-radius: 4px; font-size: 11px; font-weight: 900; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 8px rgba(0,0,0,0.5); }
  .dot-access { background: #00d4ff; color: #000; border: 1px solid #00d4ff; text-shadow: none; }
  .dot-server { background: #2ecc71; color: #000; border: 1px solid #2ecc71; text-shadow: none; }
  .dot-cnc    { background: #ff3333; color: #fff; border: 1px solid #ff3333; text-shadow: none; }
  .dot-off    { background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px dashed rgba(255,255,255,0.2); opacity: 0.5; }

  .badge { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 700; }
  .b-red    { background: rgba(255,51,51,0.15);  color: #ff3333; border: 1px solid rgba(255,51,51,0.4); }
  .b-orange { background: rgba(255,136,0,0.15);  color: #ff8800; border: 1px solid rgba(255,136,0,0.4); }
  .b-cyan   { background: rgba(0,212,255,0.15);  color: #00d4ff; border: 1px solid rgba(0,212,255,0.4); }

  .text-center { text-align: center; }

  /* ─── Expanded Panel ─────────────────────────────────────────────────────── */
  .expanded-content-row td { padding: 0; }
  .expanded-panel { padding: 20px 20px 25px 20px; border-bottom: 2px solid var(--border); background: rgba(0,0,0,0.12); word-break: break-word; overflow-wrap: anywhere; }

  .chain-header { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .chain-header i { color: var(--accent); font-size: 18px; }
  .chain-sub { font-size: 12px; font-weight: 400; color: var(--text-secondary); }

  /* ─── 3 Log Cards ────────────────────────────────────────────────────────── */
  .three-log-grid { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px; }
  .chain-arrow { display: flex; align-items: center; justify-content: center; padding: 0 5px; color: var(--accent); font-size: 20px; align-self: center; }
  .chain-arrow.arrow-dim { color: var(--text-muted); opacity: 0.4; }

  .log-card { flex: 1; min-width: 0; border-radius: 8px; padding: 14px; border: 1px solid var(--border); background: var(--bg-secondary); display: flex; flex-direction: column; gap: 8px; word-break: break-word; overflow-wrap: anywhere; }
  .card-active-access { border-color: rgba(0,200,255,0.4); background: rgba(0,200,255,0.04); }
  .card-active-server { border-color: rgba(46,204,113,0.4); background: rgba(46,204,113,0.04); }
  .card-active-cnc    { border-color: rgba(255,51,51,0.4);  background: rgba(255,51,51,0.04); }
  .card-dim { opacity: 0.6; }

  .log-card-header { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); flex-wrap: wrap; }
  .log-card-src { margin-left: auto; font-family: monospace; font-size: 10px; color: var(--text-muted); }
  .log-badge { width: 32px; height: 24px; border-radius: 4px; font-size: 12px; font-weight: 900; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
  .badge-access { background: #00d4ff; color: #000; }
  .badge-server { background: #2ecc71; color: #000; }
  .badge-cnc    { background: #ff3333; color: #fff; }

  .log-card-icon { text-align: center; font-size: 30px; color: var(--text-muted); margin: 5px 0; }
  .server-icon { color: #2ecc71; }
  .cnc-icon    { color: #ff3333; }

  .log-field { display: flex; flex-direction: column; gap: 2px; }
  .log-field label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
  .log-field code { font-family: monospace; font-size: 11px; color: var(--text-primary); background: rgba(0,0,0,0.2); padding: 3px 6px; border-radius: 3px; word-break: break-all; }
  .break-all { word-break: break-all; }
  .text-muted-code { color: var(--text-muted) !important; font-style: italic; }

  .verified-badge   { font-size: 10px; color: #2ecc71; display: flex; align-items: center; gap: 4px; margin-top: 4px; }
  .unverified-badge { font-size: 10px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 4px; font-style: italic; }

  .score-bar { display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 4px; }
  .score-fill-container { flex-grow: 1; height: 10px; background: var(--bg-secondary); border-radius: 5px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.2); }
  .score-fill { height: 100%; background: linear-gradient(90deg, #2ecc71, #f59e0b, #ef4444); border-radius: 5px; transition: width 0.3s ease; display: block; }
  .score-num { font-size: 13px; font-weight: 700; color: var(--text-primary); white-space: nowrap; width: 50px; text-align: right; }

  /* ─── Defense Grid ────────────────────────────────────────────────────────── */
  .defense-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 5px; }
  .defense-box { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
  .defense-box h5 { font-size: 12px; font-weight: 700; color: var(--text-primary); margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; text-transform: uppercase; }
  .defense-box h5 i { color: var(--accent); }

  /* Physical Location */
  .location-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 16px; color: var(--text-muted); }
  .loc-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .loc-sub { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  .text-unverified { text-decoration: line-through; color: var(--text-muted) !important; }
  .unverified-tag { font-size: 10px; background: rgba(255,200,0,0.15); color: #ffc800; border: 1px solid rgba(255,200,0,0.4); padding: 1px 6px; border-radius: 4px; margin-left: 6px; text-decoration: none; display: inline-block; vertical-align: middle; }
  .location-note { font-size: 11px; color: var(--text-muted); background: rgba(255,200,0,0.05); border: 1px solid rgba(255,200,0,0.2); border-radius: 6px; padding: 8px; display: flex; align-items: flex-start; gap: 6px; }

  /* MITRE */
  .mitre-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .mitre-code { background: rgba(0,212,255,0.1); color: var(--accent); font-family: monospace; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px; border: 1px solid rgba(0,212,255,0.3); }
  .mitre-tactic { font-size: 11px; color: var(--text-secondary); }
  .desc-text { font-size: 12px; color: var(--text-secondary); margin: 0 0 6px 0; line-height: 1.4; }
  .what-is-box { background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; margin-top: 8px; }
  .what-is-box p { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.5; }

  /* Mitigation & Action Buttons */
  .mitigation-text { font-size: 12px; color: #2ecc71; font-weight: 500; margin-bottom: 14px; line-height: 1.4; }
  .action-section { display: flex; flex-direction: column; gap: 6px; }
  .action-label { font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
  .action-note { font-weight: 400; color: var(--text-muted); font-style: italic; text-transform: none; margin-left: 6px; }
  .action-note.warn { color: #ffc800; }

  .btn-action { border: none; padding: 9px 16px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 7px; color: white; transition: opacity 0.2s, background 0.2s; }
  .btn-action:disabled { cursor: not-allowed; }
  .btn-action:not(:disabled):hover { opacity: 0.85; }
  .btn-action.red    { background: #d63031; }
  .btn-action.orange { background: #e17055; }
  .btn-action.btn-done     { background: #27ae60; }
  .btn-action.btn-loading  { background: #636e72; }
  .btn-action.btn-unverified { opacity: 0.65; }
  .btn-action.btn-disabled  { background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border); }

  .port-warning { font-size: 11px; color: #ffc800; background: rgba(255,200,0,0.08); border: 1px solid rgba(255,200,0,0.25); border-radius: 6px; padding: 7px 10px; display: flex; align-items: flex-start; gap: 6px; }
  .isolation-result { background: rgba(0,0,0,0.25); border-radius: 6px; padding: 10px; margin-top: 6px; display: flex; gap: 8px; font-size: 11px; color: var(--text-secondary); }
  .isolation-result code { display: block; font-family: monospace; font-size: 11px; color: #2ecc71; white-space: pre; margin-top: 4px; }

  /* ─── Correlation Steps ─────────────────────────────────────────────────── */
  .chain-steps-box { background: rgba(0,0,0,0.2); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-top: 14px; }
  .chain-steps-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
  .chain-step { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; font-size: 12px; color: var(--text-secondary); }
  .step-num { background: var(--accent); color: #000; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }
  .step-text { line-height: 1.4; font-family: monospace; }

  /* ─── Empty State ────────────────────────────────────────────────────────── */
  .empty-state { text-align: center; padding: 40px; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .empty-state i { font-size: 40px; opacity: 0.4; }
  .empty-state code { font-size: 12px; background: rgba(0,0,0,0.2); padding: 8px 16px; border-radius: 6px; }

  /* ─── Spinner ─────────────────────────────────────────────────────────────── */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 1s linear infinite; }

  /* ─── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 1100px) {
    .three-log-grid { flex-direction: column; }
    .chain-arrow { transform: rotate(90deg); }
    .defense-grid { grid-template-columns: 1fr; }
  }
  
  /* Pagination styles */
  .pagination { display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 20px; padding-bottom: 10px; }
  .page-btn {
    display: flex; align-items: center; gap: 5px; padding: 6px 12px;
    background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);
    border-radius: 6px; font-size: 12px; cursor: pointer; transition: 0.2s;
  }
  .page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .page-info { font-size: 12px; color: var(--text-secondary); font-weight: 600; }



  /* Custom Modal Styles */
  .custom-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(2px);
  }
  .custom-modal-content {
    background: var(--bg-panel);
    border-radius: 12px;
    padding: 30px;
    width: 380px;
    max-width: 90vw;
    text-align: center;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    animation: modalPop 0.2s ease-out;
  }
  @keyframes modalPop {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .modal-icon-top {
    font-size: 32px;
    margin-bottom: 15px;
  }
  .modal-icon-top.warning { color: #b45309; }
  .modal-icon-top.danger { color: #dc2626; }
  .modal-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 10px;
  }
  .modal-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 25px;
    line-height: 1.5;
  }
  .modal-input {
    width: 100%;
    padding: 10px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: 8px;
    margin-top: 5px;
    font-size: 13px;
  }
  .modal-input:focus {
    outline: none;
    border-color: var(--green);
    box-shadow: 0 0 0 2px rgba(16,185,129,0.1);
  }
  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .modal-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .modal-btn.cancel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  .modal-btn.cancel:hover { background: var(--bg-secondary); }
  .modal-btn.confirm-unblock {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--green);
    color: var(--green);
  }
  .modal-btn.confirm-unblock:hover { background: rgba(16, 185, 129, 0.2); }
  .modal-btn.confirm-block {
    background: rgba(220, 38, 38, 0.1);
    border: 1px solid var(--red);
    color: var(--red);
  }
  .modal-btn.confirm-block:hover { background: rgba(220, 38, 38, 0.2); }
</style>

