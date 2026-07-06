<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore, roleStore } from '../../../stores/events';
  import { getFacultyForIP } from '../../../stores/faculties';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  $: events = $eventsStore;
  let searchIp = $page.url.searchParams.get('ip') || '';
  let searchTime = $page.url.searchParams.get('time') || '';
  let lastUrl = $page.url.href;

  $: if ($page.url.href !== lastUrl) {
    lastUrl = $page.url.href;
    searchIp = $page.url.searchParams.get('ip') || '';
    searchTime = $page.url.searchParams.get('time') || '';
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

  $: filteredEvents = events.filter(e => {
    const matchIp = e.ip.includes(searchIp);
    if (!matchIp) return false;
    
    if (searchTime) {
      const rawTime = String(e.timeStr || e.createdAt || e.timestamp || e.time);
      if (rawTime !== String(searchTime)) return false;
    }

    if (selectedRange !== 'all') {
      const rawTime = e.createdAt || e.timestamp;
      const eventTime = rawTime ? new Date(rawTime).getTime() : 0;
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

  function toggleEvent(e: any) {
    expandedEvent = expandedEvent === e ? null : e;
  }

  // ─── Action: Toggle Block IP ──────────────────────────────────────────────
  async function toggleBlockIP(e: any) {
    const ip = e.ip;
    if (isActionLoading[ip]) return;
    isActionLoading = { ...isActionLoading, [ip]: true };

    try {
      if (blockedIPs.has(ip)) {
        // Unblock
        const res = await fetch('/api/attacks/unblock-ip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip }),
        });
        if (res.ok) {
          blockedIPs.delete(ip);
          blockedIPs = blockedIPs; // trigger reactivity
        }
      } else {
        // Block
        const res = await fetch('/api/attacks/block-ip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ip,
            reason: `${e.type} — Severity: ${e.severity?.toUpperCase()} — ${e.detail}`,
            attackId: e.id,
            faculty: getFacultyForIP(ip),
          }),
        });
        if (res.ok) {
          blockedIPs.add(ip);
          blockedIPs = blockedIPs;
        }
      }
    } catch (err) {
      console.error('Block toggle failed:', err);
    }
    isActionLoading = { ...isActionLoading, [ip]: false };
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
</script>

<div style="display:flex;flex-direction:column;gap:16px;padding-bottom:2rem;">
  <div class="ds-card-head" style="margin-bottom:0;">
    <div class="ds-card-title"><i class="ti ti-zoom-scan"></i> Threat Investigation</div>
    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
      ระบบ SIEM เชื่อมโยง Log จาก 3 แหล่งข้อมูลและแสดงสายโจมตีครบวงจร
      คลิกที่แถวเพื่อดูรายละเอียดและดำเนินการตอบสนองภัยคุกคาม
    </div>
    <div class="log-sources-bar">
      <span class="log-src access"><i class="ti ti-router"></i> ACCESS LAYER LOG</span>
      <span class="src-sep">+</span>
      <span class="log-src server"><i class="ti ti-server"></i> SERVER HONEYPOT LOG</span>
      <span class="src-sep">+</span>
      <span class="log-src cnc"><i class="ti ti-world-x"></i> C&C FIREWALL LOG</span>
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
    
    <div style="position:relative;flex:1;min-width:200px;max-width:300px;">
      <i class="ti ti-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);"></i>
      <input type="text" bind:value={searchIp} on:input={() => { resetAlertMode(); }} placeholder="ค้นหาด้วย IP Address..." style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);padding:8px 12px 8px 36px;border-radius:8px;font-size:13px;outline:none;transition:border-color 0.2s;">
    </div>
  </div>

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
            <td class="mono">{e.time || e.timeStr || '—'}</td>
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
                <span class="dot {hasAccess ? 'dot-access' : 'dot-off'}" title="Access Layer Log">A</span>
                <span class="dot dot-server" title="Server Honeypot Log">S</span>
                <span class="dot {hasCnc ? 'dot-cnc' : 'dot-off'}" title="C&C Outbound Log">C</span>
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
                        <span class="log-badge badge-access">A</span>
                        <span>ACCESS LAYER LOG</span>
                        <span class="log-card-src">access_layer.log</span>
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

                    <!-- Log 2: Server Honeypot -->
                    <div class="log-card card-active-server">
                      <div class="log-card-header">
                        <span class="log-badge badge-server">S</span>
                        <span>SERVER LOG</span>
                        <span class="log-card-src">{e.type?.includes('Web') || e.type?.includes('SQL') || e.type?.includes('Scan') || e.type?.includes('XSS') ? 'webtrap.json' : 'cowrie.json'}</span>
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
                        <span class="log-badge badge-cnc">C</span>
                        <span>C&C OUTBOUND LOG</span>
                        <span class="log-card-src">cnc_outbound.log</span>
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
                        <div class="action-label">WAF / Firewall Action:</div>
                        {#if $roleStore === 'admin'}
                          <button
                            class="btn-action {isBlocked ? 'btn-done' : 'red'} {isActionLoading[e.ip] ? 'btn-loading' : ''}"
                            on:click|stopPropagation={() => toggleBlockIP(e)}
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

                        <div class="action-label" style="margin-top:10px">
                          Switch Port Action:
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

<style>
  /* ─── Page Layout ────────────────────────────────────────────────────────── */
  
  
  
  
  

  /* ─── Log Sources Bar ────────────────────────────────────────────────────── */
  .log-sources-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .log-src { font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; display: flex; align-items: center; gap: 5px; }
  .log-src.access { background: rgba(0,200,255,0.12); color: #00c8ff; border: 1px solid rgba(0,200,255,0.3); }
  .log-src.server { background: rgba(46,204,113,0.12); color: #2ecc71; border: 1px solid rgba(46,204,113,0.3); }
  .log-src.cnc    { background: rgba(255,51,51,0.12);  color: #ff3333; border: 1px solid rgba(255,51,51,0.3); }
  .log-src.siem   { background: rgba(255,200,0,0.12);  color: #ffc800; border: 1px solid rgba(255,200,0,0.3); }
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
  .log-dots { display: flex; gap: 4px; }
  .dot { width: 20px; height: 20px; border-radius: 4px; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .dot-access { background: rgba(0,200,255,0.2); color: #00c8ff; border: 1px solid rgba(0,200,255,0.5); }
  .dot-server { background: rgba(46,204,113,0.2); color: #2ecc71; border: 1px solid rgba(46,204,113,0.5); }
  .dot-cnc    { background: rgba(255,51,51,0.2);  color: #ff3333; border: 1px solid rgba(255,51,51,0.5); }
  .dot-off    { background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border); opacity: 0.4; }

  .badge { font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: 700; }
  .b-red    { background: rgba(255,51,51,0.15);  color: #ff3333; border: 1px solid rgba(255,51,51,0.4); }
  .b-orange { background: rgba(255,136,0,0.15);  color: #ff8800; border: 1px solid rgba(255,136,0,0.4); }
  .b-cyan   { background: rgba(0,212,255,0.15);  color: #00d4ff; border: 1px solid rgba(0,212,255,0.4); }

  .text-center { text-align: center; }

  /* ─── Expanded Panel ─────────────────────────────────────────────────────── */
  .expanded-content-row td { padding: 0; }
  .expanded-panel { padding: 20px 20px 25px 20px; border-bottom: 2px solid var(--border); background: rgba(0,0,0,0.12); }

  .chain-header { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .chain-header i { color: var(--accent); font-size: 18px; }
  .chain-sub { font-size: 12px; font-weight: 400; color: var(--text-secondary); }

  /* ─── 3 Log Cards ────────────────────────────────────────────────────────── */
  .three-log-grid { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 20px; }
  .chain-arrow { display: flex; align-items: center; justify-content: center; padding: 0 5px; color: var(--accent); font-size: 20px; align-self: center; }
  .chain-arrow.arrow-dim { color: var(--text-muted); opacity: 0.4; }

  .log-card { flex: 1; min-width: 0; border-radius: 8px; padding: 14px; border: 1px solid var(--border); background: var(--bg-secondary); display: flex; flex-direction: column; gap: 8px; }
  .card-active-access { border-color: rgba(0,200,255,0.4); background: rgba(0,200,255,0.04); }
  .card-active-server { border-color: rgba(46,204,113,0.4); background: rgba(46,204,113,0.04); }
  .card-active-cnc    { border-color: rgba(255,51,51,0.4);  background: rgba(255,51,51,0.04); }
  .card-dim { opacity: 0.6; }

  .log-card-header { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); flex-wrap: wrap; }
  .log-card-src { margin-left: auto; font-family: monospace; font-size: 10px; color: var(--text-muted); }
  .log-badge { width: 18px; height: 18px; border-radius: 3px; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; }
  .badge-access { background: rgba(0,200,255,0.2); color: #00c8ff; }
  .badge-server { background: rgba(46,204,113,0.2); color: #2ecc71; }
  .badge-cnc    { background: rgba(255,51,51,0.2);  color: #ff3333; }

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
  .defense-box { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
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
</style>
