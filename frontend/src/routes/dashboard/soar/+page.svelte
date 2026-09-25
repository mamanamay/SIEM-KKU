<svelte:head><title>SOAR Triage - KKUSIEM</title></svelte:head>
<script lang="ts">
  import OrgBadge from '../../../lib/components/OrgBadge.svelte';
  import { eventsStore } from '../../../stores/events';
  import { getFacultyForIP, getServerName } from '../../../stores/faculties';
  import { formatEventTime } from '../../../lib/formatTime';
  import { onMount } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import { callKKUAI } from '../../../lib/utils/kkuai';
  import AttackPathGraph from '../../../lib/components/AttackPathGraph.svelte';
  import AiAnalysisBlock from '../../../lib/components/AiAnalysisBlock.svelte';
  import AiEvidenceBlock from '../../../lib/components/AiEvidenceBlock.svelte';
  import AttackTimeline from '../../../lib/components/AttackTimeline.svelte';
  
  let isLive = true;
  let frozenEvents: any[] = [];
  $: events = isLive ? $eventsStore : frozenEvents;

  function toggleLive() {
    if (isLive) {
      frozenEvents = $eventsStore;
      isLive = false;
    } else {
      isLive = true;
    }
  }
  
  // Search & Filter
  let searchQuery = '';
  let searchTime = '';
  let exactMatchMode = false;
  let severityFilter = 'all';
  let dateFilter = '';

  const validSources = ['reproxy', 'syslog', 'firewall', 'generic'];
  const isProxyOrFirewall = (e: any) => {
    if (e.source && validSources.includes(e.source.toLowerCase())) return true;
    if (e.clientVersion && validSources.includes(e.clientVersion.toLowerCase())) return true;
    const type = (e.type || '').toLowerCase();
    if (type.includes('firewall') || type.includes('http') || type.includes('web') || type.includes('syslog') || type.includes('waf') || type.includes('proxy') || type.includes('brute force')) return true;
    return false;
  };

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const ip = params.get('ip');
    const time = params.get('time');
    const id = params.get('id');
    
    if (id) {
      searchQuery = id;
      exactMatchMode = true;
      setTimeout(() => {
        // Try to find the event by ID
        const found = events.find(e => e.id === id || e.incident_id === id);
        if (found) selectEvent(found);
      }, 100);
    } else if (ip || time) {
      if (ip) searchQuery = ip;
      if (time) searchTime = time;
      exactMatchMode = true;
      setTimeout(() => {
        if (filteredEvents.length > 0) selectEvent(filteredEvents[0]);
      }, 100);
    }
  });

  $: filteredEvents = events.filter((e: any) => {
    if (exactMatchMode) {
      // When navigated via direct link, show all events for this IP or ID
      return e.ip === searchQuery || e.id === searchQuery || e.incident_id === searchQuery;
    }
    
    const matchSearch = (e.ip || '').toLowerCase().includes(searchQuery.toLowerCase()) || (e.type || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchSeverity = severityFilter === 'all' ? true : e.severity === severityFilter;
    
    let matchDate = true;
    if (dateFilter) {
      const d = new Date(e.time || e.createdAt);
      const fd = new Date(dateFilter);
      if (d.toDateString() !== fd.toDateString()) matchDate = false;
    }
    
    return matchSearch && matchSeverity && matchDate;
  }).sort((a, b) => new Date(b.time || b.createdAt).getTime() - new Date(a.time || a.createdAt).getTime());
  
  let selectedEvent: any = null;
  function selectEvent(e: any) { 
    selectedEvent = e; 
    aiExplanation = e.aiAnalysis || '';
  }
  
  let showDevPopup = false;
  let devPopupTitle = '';
  let devPopupMsg = '';

  function openDevPopup(action: string) {
    devPopupTitle = action;
    devPopupMsg = action.toLowerCase().includes('isolat')
      ? 'ฟีเจอร์นี้ต้องเชื่อมต่อกับ Network Switch API (SNMP/SSH)\nเพื่อสั่ง shutdown port โดยอัตโนมัติ\nจะพร้อมใช้งานเมื่อ integrate กับระบบ Network จริง'
      : 'ฟีเจอร์นี้ต้องเชื่อมต่อกับ Firewall/WAF API จริง\nเพื่อ inject blocking rule แบบ real-time\nจะพร้อมใช้งานเมื่อ integrate กับ Firewall ขององค์กร';
    showDevPopup = true;
  }

  function clearExactMatch() {
    exactMatchMode = false;
    searchQuery = '';
    searchTime = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('ip');
    url.searchParams.delete('time');
    url.searchParams.delete('id');
    window.history.pushState({}, '', url);
  }

  let aiGeneratingBrief = false;
  let aiExplanation = '';
  
  async function generateAiBriefing() {
    if (!selectedEvent) return;
    
    aiGeneratingBrief = true;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/attacks/analyze-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify(selectedEvent)
      });
      
      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      
      // The backend returns { analysis: string, mode: string }
      // Sometimes it returns raw text if it doesn't wrap it in json? Let's check backend endpoint.
      // Wait, backend analyze-event returns { analysis, mode } for rule-based, and for AI it returns { analysis: text, mode: 'ai' }.
      aiExplanation = data.analysis;
      selectedEvent.ai_analysis = {
        summary: 'วิเคราะห์จากข้อมูลล่าสุด (On-Demand AI)',
        storyline: data.analysis,
        confidence_percentage: data.mode === 'ai' ? 95 : 70
      };
      // Force reactivity
      selectedEvent = { ...selectedEvent };
    } catch (e: any) {
      alert("AI Workflow Generation failed: " + e.message);
    } finally {
      aiGeneratingBrief = false;
    }
  }

  // Timeline logic
  $: timelineEvents = selectedEvent ? events.filter(e => e.ip === selectedEvent.ip).sort((a,b) => new Date(a.time || a.createdAt).getTime() - new Date(b.time || b.createdAt).getTime()) : [];
  
  // Extract deep forensic info from raw detail
  $: forensicData = (() => {
    if (!selectedEvent || !selectedEvent.detail) return null;
    const detail = selectedEvent.detail;
    
    const hostMatch = detail.match(/"host":\s*"([^"]+)"/);
    const reqMatch = detail.match(/"request":\s*"([^"]+)"/);
    const statusMatch = detail.match(/"response_status":\s*(\d+)/);
    const bytesMatch = detail.match(/"body_bytes_sent":\s*(\d+)/);
    const timeMatch = detail.match(/"request_time":\s*([\d\.]+)/);
    const uaMatch = detail.match(/"http_user_agent":\s*"([^"]+)"/);
    const methodMatch = detail.match(/"request_method":\s*"([^"]+)"/);
    
    if (hostMatch || reqMatch || statusMatch) {
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const bytes = bytesMatch ? parseInt(bytesMatch[1]) : 0;
      
      let outcome = 'Unknown Outcome';
      let riskLevel = 'medium'; // low, medium, high
      let riskColor = 'medium';
      
      if (status >= 200 && status < 300) {
        outcome = 'Reached Server (Success)';
        riskLevel = bytes > 1000 ? 'High Risk (Data Transfer)' : 'Medium Risk';
        riskColor = bytes > 1000 ? 'critical' : 'high';
      } else if (status >= 400 && status < 500) {
        outcome = (status === 403 || status === 401) ? 'Blocked / Unauthorized' : 'Failed / Not Found';
        riskLevel = 'Low Risk (Blocked)';
        riskColor = 'low';
      } else if (status >= 500) {
        outcome = 'Server Error (Possible Crash/DoS)';
        riskLevel = 'High Risk (Impact)';
        riskColor = 'critical';
      }
      
      return {
        host: hostMatch ? hostMatch[1] : 'Unknown',
        request: reqMatch ? reqMatch[1] : 'Unknown',
        method: methodMatch ? methodMatch[1] : (reqMatch ? reqMatch[1].split(' ')[0] : '-'),
        status: status ? status : '-',
        bytes: bytes,
        reqTime: timeMatch ? timeMatch[1] + 's' : '-',
        userAgent: uaMatch ? uaMatch[1] : 'Unknown',
        outcome,
        riskLevel,
        riskColor
      };
    }
    return null;
  })();

  function getMitreTactic(type: string) {
    const tactics: Record<string, any> = {
      'Authentication Brute Force': { tactic: 'Credential Access', code: 'TA0006', color: 'high' },
      'SSH Login Attempt': { tactic: 'Credential Access', code: 'TA0006', color: 'high' },
      'SQL Injection (SQLi)': { tactic: 'Initial Access', code: 'TA0001', color: 'critical' },
      'Cross-Site Scripting (XSS)': { tactic: 'Initial Access', code: 'TA0001', color: 'critical' },
      'Command Injection (RCE)': { tactic: 'Execution', code: 'TA0002', color: 'critical' },
      'Path Traversal / LFI': { tactic: 'Credential Access', code: 'TA0006', color: 'high' },
      'Network / Vulnerability Scanning': { tactic: 'Reconnaissance', code: 'TA0043', color: 'medium' },
      'Web Scan': { tactic: 'Reconnaissance', code: 'TA0043', color: 'medium' },
      'Denial of Service (DoS)': { tactic: 'Impact', code: 'TA0040', color: 'critical' },
      'Malware C2 Beacon': { tactic: 'Command and Control', code: 'TA0011', color: 'critical' }
    };
    return tactics[type] || { tactic: 'Unknown Tactic', code: 'N/A', color: 'medium' };
  }

  function generateAttackStory(event: any, forensic: any) {
    if (!event) return '';
    const country = event.country && event.country !== 'Unknown' && event.country !== 'UN' ? event.country : 'ไม่ระบุแหล่งที่มา';
    const type = event.type || 'การโจมตีบางอย่าง';
    const org = event.organization && event.organization !== '-' ? event.organization : '';
    
    let attacker = org ? `ผู้โจมตีจาก ${org} (เครือข่ายภายใน)` : `ผู้โจมตีจากประเทศ${country}`;
    
    if (!forensic) {
      return `${attacker} แสดงพฤติกรรมน่าสงสัยเกี่ยวกับ ${type}`;
    }
    
    const host = forensic.host !== 'Unknown' ? `เป้าหมายที่เซิร์ฟเวอร์ ${forensic.host}` : '';
    let outcomeText = '';
    
    const status = Number(forensic.status) || 0;
    
    if (status >= 200 && status < 300) {
       outcomeText = `และสามารถเจาะเข้าถึงเป้าหมายได้ (HTTP ${status})`;
       if (forensic.bytes > 1000) outcomeText += ` พร้อมทั้งมีการดึงข้อมูลออกไปขนาด ${forensic.bytes} Bytes! 🚨`;
    } else if (status >= 400 && status < 500) {
       outcomeText = `แต่ถูกระบบป้องกันบล็อกหรือปฏิเสธการเข้าถึง (HTTP ${status}) 🛡️`;
    } else if (status >= 500) {
       outcomeText = `ส่งผลให้เซิร์ฟเวอร์ทำงานผิดพลาดหรือล่ม (HTTP ${status}) 🔥`;
    } else {
       outcomeText = `(ไม่มีข้อมูลการตอบกลับจากเซิร์ฟเวอร์)`;
    }
    
    return `${attacker} พยายามทำการ ${type} ${host} ${outcomeText}`;
  }

  $: mitreData = selectedEvent ? getMitreTactic(selectedEvent.type) : null;
  $: attackStory = selectedEvent ? generateAttackStory(selectedEvent, forensicData) : '';

  // ── IP History Modal ──────────────────────────────────────────────────────
  let showIpHistoryModal = false;
  let ipHistoryData: any = null;
  let ipHistoryLoading = false;

  async function checkIpHistory(ip: string) {
    if (!ip) return;
    showIpHistoryModal = true;
    ipHistoryLoading = true;
    ipHistoryData = null;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/attacks/ip-history/${encodeURIComponent(ip)}`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ipHistoryData = await res.json();
    } catch (e: any) {
      ipHistoryData = { error: e.message || 'โหลดข้อมูลไม่ได้' };
    } finally {
      ipHistoryLoading = false;
    }
  }

  // ── Full Raw Log (reactive) ───────────────────────────────────────────────
  $: fullRawLog = selectedEvent ? JSON.stringify({
    timestamp:         selectedEvent.timeStr || selectedEvent.time || selectedEvent.createdAt,
    src_ip:            selectedEvent.ip,
    dest_ip:           selectedEvent.destIp || 'unknown',
    event_type:        selectedEvent.type,
    severity:          selectedEvent.severity,
    detail:            selectedEvent.detail,
    payload:           selectedEvent.payload,
    mitre_code:        selectedEvent.mitreCode,
    mitre_tactic:      selectedEvent.mitreTactic,
    threat_score:      selectedEvent.threatScore,
    country:           selectedEvent.country,
    organization:      selectedEvent.organization,
    source_sensor:     selectedEvent.source || selectedEvent.clientVersion,
    honeypot_port:     selectedEvent.honeypotPort,
    session_id:        selectedEvent.sessionId,
    correlation_chain: selectedEvent.correlationChain || [],
    attack_commands:   selectedEvent.attackCommands || [],
    credentials_used:  selectedEvent.credentialsUsed || null,
  }, null, 2) : '';

  // ── Dest IP Faculty ───────────────────────────────────────────────────────
  $: destFaculty = selectedEvent?.destIp ? getFacultyForIP(selectedEvent.destIp) : null;
</script>

<div style="display:flex;flex-direction:column;height:100%;gap:16px;">
  <PageHeader title="Deep Incident" description="Centralized Incident Response, Correlation, and SOC Playbooks." icon="ti-tool" />
  
  <div class="soar-layout">
    <!-- COL 1: Incident Queue -->
    <div class="col-list">
      <div class="list-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size: 16px; font-weight: 700;">คิวการแจ้งเตือน</div>
          <div style="font-size: 12px; color: var(--text-muted);">{exactMatchMode ? 'การค้นหาเจาะจง' : 'จากทุกแหล่งข้อมูล'} ({filteredEvents.length})</div>
        </div>
        <button class="btn-live-toggle {isLive ? 'live' : 'paused'}" on:click={toggleLive} title={isLive ? 'หยุดอัปเดตชั่วคราว' : 'เปิดรับข้อมูลแบบ Real-time'}>
          <i class="ti {isLive ? 'ti-player-play' : 'ti-player-pause'}"></i>
        </button>
      </div>
      
      <div class="list-filters">
        {#if exactMatchMode}
          <div class="exact-match-banner">
            <div>ระบุตัว: {searchQuery}</div>
            <button on:click={clearExactMatch}><i class="ti ti-x"></i></button>
          </div>
        {:else}
          <input type="text" placeholder="ค้นหา IP หรือ รูปแบบ..." bind:value={searchQuery} />
          <input type="date" bind:value={dateFilter} />
          <select bind:value={severityFilter}>
            <option value="all">ทุกระดับความรุนแรง</option>
            <option value="critical">Critical (วิกฤต)</option>
            <option value="high">High (สูง)</option>
            <option value="medium">Medium (ปานกลาง)</option>
          </select>
        {/if}
      </div>

      <div class="queue-items custom-scrollbar">
        {#each filteredEvents as event}
          <div class="q-item" class:selected={selectedEvent === event} on:click={() => selectEvent(event)}>
            <div class="q-header">
              <span class="q-type" title={event.type}>{event.type === "UNKNOWN" ? "Suspicious Activity" : (event.type.length > 22 ? event.type.substring(0,22)+"..." : event.type)}</span>
              <span class="q-sev {event.severity}">{event.severity.toUpperCase()}</span>
            </div>
            <div class="q-ip"><i class="ti ti-network"></i> {event.ip} {#if event.country && event.country !== "Unknown" && event.country !== "UN"}<span style="opacity:0.7; font-size:11px; margin-left:4px;">({event.country})</span>{/if}</div>
            <div class="q-time">{formatEventTime(event.time || event.createdAt)}</div>
          </div>
        {/each}
        {#if filteredEvents.length === 0}
          <div class="empty-state">ไม่พบเหตุการณ์ที่ตรงกับการค้นหา</div>
        {/if}
      </div>
    </div>

    <!-- COL 2: Correlation & Details -->
    <div class="col-main custom-scrollbar">
      {#if selectedEvent}
        <!-- Correlation Flow -->
        <h3 class="panel-title"><i class="ti ti-route"></i> เส้นทางการโจมตี (Attack Path)</h3>
        <div style="margin-bottom: 24px;">
          {#if selectedEvent.attack_session?.attack_path}
            <AttackPathGraph event={selectedEvent} />
          {:else}
            <div class="correlation-flow">
              <div class="flow-node attacker">
                <div class="fn-icon"><i class="ti ti-spy"></i></div>
                <div class="fn-title">IP ผู้โจมตี</div>
                <div class="fn-val">{selectedEvent.ip} <OrgBadge organization={selectedEvent.organization} country={selectedEvent.country} /></div>
              </div>
              <div class="flow-arrow"><i class="ti ti-arrow-right"></i></div>
              <div class="flow-node origin">
                <div class="fn-icon"><i class="ti ti-server"></i></div>
                <div class="fn-title">ระบบที่ตรวจจับ (Sensor)</div>
                <div class="fn-val">{selectedEvent.clientVersion || selectedEvent.source || 'Syslog Sensor'}</div>
              </div>
              <div class="flow-arrow"><i class="ti ti-arrow-right"></i></div>
              <div class="flow-node target">
                <div class="fn-icon"><i class="ti ti-building-community"></i></div>
                <div class="fn-title">IP เป้าหมาย</div>
                <div class="fn-val" style="font-family: monospace;">
                  {getServerName(selectedEvent.destIp || '10.101.104.234') || selectedEvent.destIp || 'ไม่ระบุ'}
                  {#if destFaculty}
                    <div style="font-size: 11px; margin-top: 4px; color: var(--color-cyan, #22d3ee);">{destFaculty.name}</div>
                  {:else if selectedEvent.destIp}
                    <div style="font-size: 11px; margin-top: 4px; color: var(--text-muted);">ไม่พบในฐานข้อมูล</div>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- AI Analyst Summary (Moved from Right Col) -->
        {#if selectedEvent.ai_analysis}
          <h3 class="panel-title"><i class="ti ti-brain"></i> สรุปเรื่องราวโดย AI (AI Analysis Storyline)</h3>
          <AiAnalysisBlock event={selectedEvent} />
        {:else}
          <h3 class="panel-title"><i class="ti ti-brain"></i> วิเคราะห์โดย AI (AI Investigation)</h3>
          <div class="ai-section" style="margin-bottom: 24px;">
            <div style="display:flex; justify-content:flex-start; margin-bottom:12px;">
              <button class="btn-refresh" on:click={generateAiBriefing} disabled={aiGeneratingBrief}>
                <i class="ti ti-refresh {aiGeneratingBrief ? 'ti-spin' : ''}"></i> {aiGeneratingBrief ? 'กำลังวิเคราะห์...' : 'เริ่มวิเคราะห์ Log นี้'}
              </button>
            </div>
            <div class="ai-chat-box">
              {#if aiGeneratingBrief}
                <div class="chat-bubble ai typing">
                  <div class="dot"></div><div class="dot"></div><div class="dot"></div>
                </div>
              {:else if aiExplanation}
                <div class="chat-bubble ai">
                  {@html aiExplanation}
                </div>
              {:else}
                <div class="chat-bubble ai text-muted">
                  คลิก "เริ่มวิเคราะห์ Log นี้" เพื่อให้ AI ช่วยสรุปเหตุการณ์ (สำหรับ Log เก่าที่ยังไม่ได้วิเคราะห์)
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Stages of Attack (Kill Chain) -->
        <h3 class="panel-title" style="margin-top: 24px;"><i class="ti ti-target"></i> ระยะของการโจมตี (Kill Chain)</h3>
        <div class="kill-chain">
          <div class="kc-step {['Network / Vulnerability Scanning', 'Web Scan'].includes(selectedEvent.type) ? 'active' : 'passed'}">
            <div class="kc-icon"><i class="ti ti-radar"></i></div>
            <div class="kc-label">Recon</div>
          </div>
          <div class="kc-line {['Network / Vulnerability Scanning', 'Web Scan'].includes(selectedEvent.type) ? '' : 'passed'}"></div>
          <div class="kc-step {['Authentication Brute Force', 'SSH Login Attempt'].includes(selectedEvent.type) ? 'active' : (['Network / Vulnerability Scanning', 'Web Scan'].includes(selectedEvent.type) ? '' : 'passed')}">
            <div class="kc-icon"><i class="ti ti-lock-open"></i></div>
            <div class="kc-label">Intrusion</div>
          </div>
          <div class="kc-line {['Authentication Brute Force', 'SSH Login Attempt', 'Network / Vulnerability Scanning', 'Web Scan'].includes(selectedEvent.type) ? '' : 'passed'}"></div>
          <div class="kc-step {['SQL Injection (SQLi)', 'Cross-Site Scripting (XSS)', 'Command Injection (RCE)', 'Path Traversal / LFI', 'SQL Inject'].includes(selectedEvent.type) ? 'active' : (['Denial of Service (DoS)', 'Malware C2 Beacon'].includes(selectedEvent.type) ? 'passed' : '')}">
            <div class="kc-icon"><i class="ti ti-bug"></i></div>
            <div class="kc-label">Exploitation</div>
          </div>
          <div class="kc-line {['Denial of Service (DoS)', 'Malware C2 Beacon'].includes(selectedEvent.type) ? 'passed' : ''}"></div>
          <div class="kc-step {selectedEvent.type === 'Malware C2 Beacon' ? 'active' : (selectedEvent.type === 'Denial of Service (DoS)' ? 'passed' : '')}">
            <div class="kc-icon"><i class="ti ti-satellite"></i></div>
            <div class="kc-label">C&C</div>
          </div>
          <div class="kc-line {selectedEvent.type === 'Denial of Service (DoS)' ? 'passed' : ''}"></div>
          <div class="kc-step {selectedEvent.type === 'Denial of Service (DoS)' ? 'active danger' : ''}">
            <div class="kc-icon"><i class="ti ti-skull"></i></div>
            <div class="kc-label">Impact</div>
          </div>
        </div>

        <!-- Details & Timeline Split -->
        <div class="main-bottom">
          <!-- Deep Attack Analysis (Forensic View) -->
          <div class="mb-box flex-2 custom-scrollbar" style="overflow-y: auto;">
            <div class="box-head" style="margin-bottom: 8px;"><i class="ti ti-microscope"></i> การวิเคราะห์เชิงลึกและโค้ดอันตราย (Deep Analysis)</div>
            
            <div class="forensic-grid">
              <!-- HIGHLIGHT BANNER: Instant Story & MITRE -->
              <div class="story-banner {forensicData ? forensicData.riskColor : 'medium'}">
                <div class="sb-header">
                  <div class="sb-title"><i class="ti ti-bolt"></i> สรุปแบบรวดเร็ว (Instant Story)</div>
                  {#if mitreData}
                    <div class="sb-mitre badge-sev {mitreData.color}">
                      <i class="ti ti-crosshair"></i> MITRE: {mitreData.tactic} ({mitreData.code})
                    </div>
                  {/if}
                </div>
                <div class="sb-text">
                  {attackStory}
                </div>
              </div>

              <!-- Basic Context -->
              <div class="f-row" style="margin-bottom: 16px;">
                <div class="f-col"><span class="f-label">เวลาที่เกิดเหตุ (Timestamp)</span><span class="f-val">{new Date(selectedEvent.time || selectedEvent.createdAt).toString()}</span></div>
                <div class="f-col"><span class="f-label">ประเภท (Event Type)</span><span class="f-val" style="font-weight:700;">{selectedEvent.type}</span></div>
                <div class="f-col"><span class="f-label">ความรุนแรง (Severity)</span><span class="badge-sev {selectedEvent.severity}" style="width:fit-content;">{selectedEvent.severity.toUpperCase()}</span></div>
              </div>

              {#if forensicData}
                <div class="forensic-cards">
                  <!-- Attacker & Target -->
                  <div class="f-card">
                    <div class="f-card-title"><i class="ti ti-shield"></i> ผู้โจมตีและเป้าหมาย (Attacker & Target)</div>
                    <div class="f-card-body">
                      <div class="d-row"><span class="d-label">Source IP:</span> <span class="d-val font-mono">{selectedEvent.ip} <OrgBadge organization={selectedEvent.organization} country={selectedEvent.country} /></span></div>
                      <div class="d-row"><span class="d-label">Target Host:</span> <span class="d-val font-mono" style="color:var(--color-cyan, #22d3ee); font-weight:700;">{forensicData.host}</span></div>
                      <div class="d-row"><span class="d-label">สถานะพอร์ต:</span> <span class="d-val">{selectedEvent.status || 'Opened'}</span></div>
                    </div>
                  </div>

                  <!-- Payload & Request -->
                  <div class="f-card">
                    <div class="f-card-title"><i class="ti ti-bomb"></i> คำสั่งและจุดที่ถูกโจมตี (Request)</div>
                    <div class="f-card-body">
                      <div class="d-row"><span class="d-label">Method:</span> <span class="d-val badge-sev high" style="background:rgba(59,130,246,0.15); color:#3b82f6;">{forensicData.method}</span></div>
                      <div class="d-row"><span class="d-label">Path/File:</span> <span class="d-val font-mono" style="word-break: break-all; color: #f43f5e;">{forensicData.request}</span></div>
                      <div class="d-row"><span class="d-label">User-Agent:</span> <span class="d-val text-muted" style="font-size:11px; word-break:break-all;">{forensicData.userAgent}</span></div>
                    </div>
                  </div>

                  <!-- Impact & Outcome -->
                  <div class="f-card">
                    <div class="f-card-title"><i class="ti ti-chart-bar"></i> ผลลัพธ์และผลกระทบ (Impact)</div>
                    <div class="f-card-body">
                      <div class="d-row">
                        <span class="d-label">Response:</span> 
                        <span class="d-val">
                          <span class="badge-sev {Number(forensicData.status) >= 400 ? 'low' : (Number(forensicData.status) >= 500 ? 'critical' : 'high')}" style="font-size: 10px;">HTTP {forensicData.status}</span>
                        </span>
                      </div>
                      <div class="d-row"><span class="d-label">Outcome:</span> <span class="d-val" style="font-weight:600;">{forensicData.outcome}</span></div>
                      <div class="d-row"><span class="d-label">Data Sent:</span> <span class="d-val">{forensicData.bytes} Bytes <span class="text-muted">({forensicData.reqTime})</span></span></div>
                      <div class="d-row" style="margin-top:4px;"><span class="d-label">Assessment:</span> <span class="badge-sev {forensicData.riskColor}">{forensicData.riskLevel}</span></div>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- ซ่อนกรอบ "ไม่มีข้อมูล Forensic" ออกไปเลยตามคำแนะนำ เพื่อความสะอาดตา -->
              {/if}
              
              <!-- Raw Evidence Box -->
              <div class="raw-evidence-box" style="margin-top: 16px;">
                <div class="re-header">
                  <span class="re-title"><i class="ti ti-code"></i> หลักฐานดิบ และโค้ดอันตราย (Raw Log & Payload)</span>
                </div>
                <div class="re-body font-mono" style="background:#1e1e1e; color:#d4d4d4; padding:16px; white-space: pre-wrap; word-break: break-all; line-height: 1.5; font-size: 11px;">
                  {fullRawLog}
                </div>
              </div>
            </div>
          </div>
        </div>
      {:else}
        <div class="empty-state" style="margin-top: 100px;">
          <i class="ti ti-hand-click" style="font-size:48px; color:var(--border);"></i>
          <p>กรุณาเลือกเหตุการณ์จากคิวเพื่อดูการวิเคราะห์เชิงลึก</p>
        </div>
      {/if}
    </div>

    <!-- COL 3: AI & Playbook -->
    <div class="col-ai">
      <div class="ai-header"><i class="ti ti-shield-check"></i> ข้อมูลประกอบและการรับมือ</div>
      
      <div class="ai-body custom-scrollbar">
        {#if selectedEvent}
          <!-- Evidence & Playbook Advisory -->
          <div style="margin-bottom: 24px;">
            {#if selectedEvent.detection_evidence || selectedEvent.recommended_actions}
              <AiEvidenceBlock event={selectedEvent} />
            {:else}
              <div class="playbook-section">
                <h4 class="section-title">SOC Playbook Actions</h4>
                <button class="playbook-btn" on:click={() => checkIpHistory(selectedEvent.ip)}>
                  <i class="ti ti-search"></i> ตรวจสอบประวัติ IP
                </button>
                <button class="playbook-btn" on:click={() => openDevPopup('Isolate Endpoint')}>
                  <i class="ti ti-shield-lock"></i> แยกเครื่องออกจากระบบ (Isolate)
                </button>
                <button class="playbook-btn danger" on:click={() => openDevPopup('Block IP at Firewall')}>
                  <i class="ti ti-ban"></i> บล็อก IP ที่ Firewall
                </button>
              </div>
            {/if}
          </div>

          <!-- Attack Timeline Moved Here -->
          <div class="timeline-box">
            <h4 class="section-title" style="margin-bottom:12px;">ลำดับเวลา (Timeline: {selectedEvent.ip})</h4>
            {#if selectedEvent.attack_session?.timeline}
              <AttackTimeline event={selectedEvent} />
            {:else}
              <div class="v-timeline">
                {#each timelineEvents as tEvent}
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <div class="vt-item" class:active={tEvent === selectedEvent} on:click={() => selectEvent(tEvent)}>
                    <div class="vt-dot {tEvent.severity}"></div>
                    <div class="vt-content">
                      <div class="vt-time">{formatEventTime(tEvent.time || tEvent.createdAt)}</div>
                      <div class="vt-type">{tEvent.type}</div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

        {:else}
          <div class="empty-state">รอการเลือกเหตุการณ์...</div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* Base Layout */
  .soar-layout { display: flex; flex: 1; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-panel); color: var(--text-primary); }
  
  /* Col 1 */
  .col-list { width: 300px; background: var(--bg-secondary); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .list-header { padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .list-filters { padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--border); }
  .list-filters input, .list-filters select { width: 100%; padding: 8px 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 13px; box-sizing: border-box;}
  
  .exact-match-banner { display:flex; align-items:center; justify-content:space-between; background:rgba(59,130,246,0.1); padding:8px 12px; border-radius:8px; border:1px solid #3b82f6; color:#3b82f6; font-size:12px; }
  .exact-match-banner button { background:transparent; border:none; color:#3b82f6; cursor:pointer; }
  
  .queue-items { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .q-item { padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: 0.2s; }
  .q-item:hover { border-color: #94a3b8; }
  .q-item.selected { border-color: #3b82f6; background: rgba(59,130,246,0.05); }
  .q-header { display: flex; justify-content: space-between; margin-bottom: 6px; }
  .q-type { font-size: 12px; font-weight: 700; }
  .q-sev { font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
  .q-sev.critical { background: rgba(239,68,68,0.2); color: #ef4444; }
  .q-sev.high { background: rgba(245,158,11,0.2); color: #f59e0b; }
  .q-sev.medium { background: rgba(234,179,8,0.2); color: #eab308; }
  .q-sev.low { background: rgba(34,197,94,0.2); color: #22c55e; }
  .q-ip { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; font-family: monospace; }
  .q-time { font-size: 11px; color: var(--text-muted); }


  .btn-live-toggle {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px;
    font-size: 14px; cursor: pointer; transition: 0.2s; border: 1px solid transparent;
  }
  .btn-live-toggle.live { background: rgba(16, 185, 129, 0.1); color: #10b981; border-color: rgba(16, 185, 129, 0.3); }
  .btn-live-toggle.paused { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border-color: rgba(245, 158, 11, 0.3); animation: pulse-orange 2s infinite; }
  @keyframes pulse-orange { 0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); } 70% { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0); } 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); } }

  .kill-chain { display: flex; align-items: center; justify-content: space-between; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 24px 40px; margin-bottom: 24px; }
  .kc-step { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; z-index: 2; opacity: 0.4; filter: grayscale(100%); transition: 0.3s; }
  .kc-step.passed { opacity: 1; filter: grayscale(0%); }
  .kc-step.active { opacity: 1; filter: grayscale(0%); transform: scale(1.1); }
  .kc-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--bg-secondary); border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--text-muted); }
  .kc-step.passed .kc-icon { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.1); }
  .kc-step.active .kc-icon { border-color: #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.1); box-shadow: 0 0 15px rgba(245,158,11,0.3); }
  .kc-step.active.danger .kc-icon { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.1); box-shadow: 0 0 15px rgba(239,68,68,0.3); }
  .kc-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
  .kc-step.passed .kc-label { color: #3b82f6; }
  .kc-step.active .kc-label { color: #f59e0b; }
  .kc-step.active.danger .kc-label { color: #ef4444; }
  .kc-line { flex: 1; height: 4px; background: var(--border); margin: 0 8px; transform: translateY(-10px); transition: 0.3s; position: relative; }
  .kc-line::after { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 0%; background: #3b82f6; transition: 0.5s; }
  .kc-line.passed::after { width: 100%; }

  /* Col 2 Main */
  .col-main { flex: 1; padding: 24px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; background: var(--bg); }
  .panel-title { margin: 0 0 16px; font-size: 15px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
  
  .correlation-flow { display: flex; align-items: center; justify-content: space-between; background: var(--bg-panel); border: 1px dashed var(--border); border-radius: 12px; padding: 24px; }
  .flow-node { flex: 1; display: flex; flex-direction: column; align-items: center; text-align: center; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 16px; min-height: 100px; justify-content: center; position: relative; }
  .flow-node.attacker { border-bottom: 3px solid #ef4444; }
  .flow-node.origin { border-bottom: 3px solid #3b82f6; }
  .flow-node.target { border-bottom: 3px solid #10b981; }
  .fn-icon { font-size: 24px; color: var(--text-muted); margin-bottom: 8px; }
  .fn-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
  .fn-val { font-size: 13px; font-weight: 600; font-family: monospace; }
  .flow-arrow { font-size: 24px; color: var(--border); padding: 0 16px; }

  .main-bottom { display: flex; gap: 24px; min-height: 300px; }
  .mb-box { flex: 1; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; }
  .mb-box.flex-2 { flex: 2; }
  .box-head { font-size: 14px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
  
  /* Forensic Deep Analysis Styles */
  .story-banner { padding: 16px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid transparent; display: flex; flex-direction: column; gap: 8px; }
  .story-banner.critical { background: rgba(239,68,68,0.1); border-color: #ef4444; }
  .story-banner.high { background: rgba(245,158,11,0.1); border-color: #f59e0b; }
  .story-banner.medium { background: rgba(234,179,8,0.1); border-color: #eab308; }
  .story-banner.low { background: rgba(34,197,94,0.1); border-color: #22c55e; }
  
  .sb-header { display: flex; justify-content: space-between; align-items: center; }
  .sb-title { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px; opacity: 0.8; }
  .sb-text { font-size: 15px; line-height: 1.5; font-weight: 600; color: var(--text-primary); }
  
  .forensic-grid { display: flex; flex-direction: column; gap: 16px; }
  .f-row { display: flex; flex-wrap: wrap; gap: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; border: 1px solid var(--border); }
  .f-col { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 150px; }
  .f-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .f-val { font-size: 13px; color: var(--text-primary); }
  
  .forensic-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
  .f-card { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
  .f-card-title { padding: 10px 14px; font-size: 12px; font-weight: 700; color: var(--text-primary); background: var(--bg-secondary); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
  .f-card-title i { color: var(--color-cyan, #22d3ee); font-size: 14px; }
  .f-card-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  
  .raw-evidence-box { margin-top: 8px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .re-header { background: rgba(0,0,0,0.2); padding: 8px 12px; border-bottom: 1px dashed var(--border); }
  .re-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; display: flex; align-items: center; gap: 6px; }
  .re-body { background: var(--bg-secondary); padding: 12px; font-size: 12px; color: var(--text-primary); word-break: break-all; max-height: 200px; overflow-y: auto; line-height: 1.5; }
  
  .details-grid { display: flex; flex-direction: column; gap: 12px; }
  .d-row { display: flex; font-size: 13px; }
  .d-label { width: 90px; font-weight: 600; color: var(--text-muted); flex-shrink: 0; }
  .d-val { flex: 1; word-break: break-all; }
  .d-val.raw-log { background: var(--bg-secondary); padding: 8px; border-radius: 6px; font-size: 12px; border: 1px solid var(--border); }
  .badge-sev { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; display: inline-block; }
  .badge-sev.critical { background: rgba(239,68,68,0.2); color: #ef4444; }
  .badge-sev.high { background: rgba(245,158,11,0.2); color: #f59e0b; }
  .badge-sev.medium { background: rgba(234,179,8,0.2); color: #eab308; }
  .badge-sev.low { background: rgba(34,197,94,0.2); color: #22c55e; }

  /* Vertical Timeline */
  .timeline-box { overflow-y: auto; }
  .v-timeline { display: flex; flex-direction: column; position: relative; padding-left: 12px; }
  .v-timeline::before { content: ''; position: absolute; left: 17px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .vt-item { position: relative; padding: 12px 0 12px 24px; cursor: pointer; opacity: 0.7; transition: 0.2s; }
  .vt-item:hover { opacity: 1; }
  .vt-item.active { opacity: 1; }
  .vt-dot { position: absolute; left: 0; top: 16px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--bg-panel); z-index: 2; background: #64748b; }
  .vt-dot.critical { background: #ef4444; }
  .vt-dot.high { background: #f59e0b; }
  .vt-dot.medium { background: #eab308; }
  .vt-time { font-size: 11px; color: var(--text-muted); font-family: monospace; margin-bottom: 2px; }
  .vt-type { font-size: 12px; font-weight: 600; }
  
  /* Col 3 AI */
  .col-ai { width: 340px; background: var(--bg-secondary); border-left: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .ai-header { padding: 16px 20px; border-bottom: 1px solid var(--border); font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .ai-body { flex: 1; overflow-y: auto; padding: 20px; }
  .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin: 0 0 12px; }
  
  .playbook-btn { width: 100%; padding: 10px 12px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-weight: 600; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; margin-bottom: 8px; }
  .playbook-btn:hover { border-color: #94a3b8; }
  .playbook-btn.danger { border-color: rgba(239,68,68,0.3); color: #ef4444; }
  .playbook-btn.danger:hover { background: rgba(239,68,68,0.1); }
  
  .action-result { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 11px; line-height: 1.4; display: flex; align-items: flex-start; gap: 8px; }
  .action-result.running { background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid rgba(59,130,246,0.2); }
  .action-result.done { background: rgba(245,158,11,0.1); color: #d97706; border: 1px dashed rgba(245,158,11,0.4); }

  .ai-section { margin-top: 32px; border-top: 1px solid var(--border); padding-top: 20px; }
  .btn-refresh { background: transparent; border: 1px solid var(--border); padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; color: var(--text-primary); }
  .btn-refresh:hover { background: var(--bg-panel); }
  
  .chat-bubble { padding: 12px 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; border: 1px solid var(--border); background: var(--bg-panel); }
  .chat-bubble.ai { border-color: rgba(59,130,246,0.3); background: rgba(59,130,246,0.05); }
  .chat-bubble :global(ul) { margin: 8px 0; padding-left: 20px; }
  .chat-bubble :global(li) { margin-bottom: 4px; }
  .chat-bubble :global(strong) { color: var(--text-primary); }

  .empty-state { padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 13px; }
  
  .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(150,150,150,0.3); border-radius: 3px; }

  /* Modals */
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px); }
  .modal-content { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
  .modal-content h3 { margin-top: 0; font-size: 16px; margin-bottom: 16px; }
  
  .dev-popup { text-align: center; max-width: 400px; }
  .dev-icon { font-size: 48px; margin-bottom: 16px; }
  .dev-action { font-size: 14px; font-weight: 700; color: var(--color-cyan, #22d3ee); margin-bottom: 12px; }
  .dev-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap; margin-bottom: 16px; }
  .dev-eta { font-size: 11px; color: var(--text-muted); background: var(--bg-secondary); padding: 8px; border-radius: 6px; margin-bottom: 20px; }
  .btn-close-modal { background: #3b82f6; color: white; border: none; padding: 8px 24px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .btn-close-modal:hover { background: #2563eb; }

  .ip-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .ip-stat-box { background: var(--bg-secondary); padding: 12px; border-radius: 8px; border: 1px solid var(--border); }
  .ip-stat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
  .ip-stat-val { font-size: 16px; font-weight: 700; }
</style>

<!-- Dev Popup Modal -->
{#if showDevPopup}
<div class="modal-overlay" on:click={() => showDevPopup = false}>
  <div class="modal-content dev-popup" on:click|stopPropagation>
    <div class="dev-icon">🚧</div>
    <h3>อยู่ระหว่างพัฒนา</h3>
    <p class="dev-action">{devPopupTitle}</p>
    <p class="dev-desc">{devPopupMsg}</p>
    <div class="dev-eta">ฟีเจอร์การเชื่อมต่ออุปกรณ์เครือข่ายจริงกำลังดำเนินการ</div>
    <button class="btn-close-modal" on:click={() => showDevPopup = false}>รับทราบ</button>
  </div>
</div>
{/if}

<!-- IP History Modal -->
{#if showIpHistoryModal}
<div class="modal-overlay" on:click={() => showIpHistoryModal = false}>
  <div class="modal-content" on:click|stopPropagation>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h3><i class="ti ti-history"></i> ประวัติ IP: {ipHistoryData?.ip || '...'}</h3>
      <button style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;" on:click={() => showIpHistoryModal = false}><i class="ti ti-x" style="font-size:20px;"></i></button>
    </div>
    
    {#if ipHistoryLoading}
      <div style="text-align:center; padding: 40px; color:var(--text-muted);">
        <i class="ti ti-loader ti-spin" style="font-size:32px; margin-bottom:16px; display:block;"></i>
        กำลังโหลดข้อมูลประวัติ...
      </div>
    {:else if ipHistoryData?.error}
      <div style="padding: 20px; background: rgba(239,68,68,0.1); color:#ef4444; border-radius: 8px;">
        {ipHistoryData.error}
      </div>
    {:else if ipHistoryData}
      <div class="ip-stat-grid">
        <div class="ip-stat-box">
          <div class="ip-stat-label">เหตุการณ์ทั้งหมด</div>
          <div class="ip-stat-val">{ipHistoryData.totalEvents} ครั้ง</div>
        </div>
        <div class="ip-stat-box">
          <div class="ip-stat-label">ความรุนแรงสูงสุด</div>
          <div class="ip-stat-val"><span class="badge-sev {ipHistoryData.maxSeverity}">{ipHistoryData.maxSeverity.toUpperCase()}</span></div>
        </div>
        <div class="ip-stat-box">
          <div class="ip-stat-label">พบครั้งแรก</div>
          <div class="ip-stat-val" style="font-size:12px;">{ipHistoryData.firstSeen ? new Date(ipHistoryData.firstSeen).toLocaleString() : '-'}</div>
        </div>
        <div class="ip-stat-box">
          <div class="ip-stat-label">พบล่าสุด</div>
          <div class="ip-stat-val" style="font-size:12px;">{ipHistoryData.lastSeen ? new Date(ipHistoryData.lastSeen).toLocaleString() : '-'}</div>
        </div>
      </div>
      
      {#if ipHistoryData.successCount > 0}
        <div style="margin-bottom:20px; padding:12px; background:rgba(239,68,68,0.1); border-left:4px solid #ef4444; border-radius:4px;">
          <strong style="color:#ef4444;"><i class="ti ti-alert-triangle"></i> แจ้งเตือนความเสี่ยงสูง:</strong> พบเหตุการณ์ที่มีแนวโน้มโจมตีสำเร็จ (Success/Command Execution) จำนวน {ipHistoryData.successCount} ครั้งจาก IP นี้
        </div>
      {/if}

      <div style="margin-bottom:12px; font-size:13px; font-weight:700;">ประเภทการโจมตีที่พบ:</div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:24px;">
        {#each ipHistoryData.uniqueTypes || [] as t}
          <span style="background:var(--bg-secondary); border:1px solid var(--border); padding:4px 8px; border-radius:12px; font-size:11px;">{t}</span>
        {/each}
      </div>

      <div style="margin-bottom:12px; font-size:13px; font-weight:700;">Timeline ล่าสุด:</div>
      <div class="v-timeline">
        {#each ipHistoryData.timeline || [] as tEvent}
          <div class="vt-item">
            <div class="vt-dot {tEvent.severity}"></div>
            <div class="vt-content">
              <div class="vt-time">{new Date(tEvent.time).toLocaleString()}</div>
              <div class="vt-type">{tEvent.type}</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:monospace; margin-top:4px;">
                เป้าหมาย: {getServerName(tEvent.destIp || '10.101.104.234') || tEvent.destIp || 'Unknown'} <br>
                {tEvent.detail}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
{/if}
