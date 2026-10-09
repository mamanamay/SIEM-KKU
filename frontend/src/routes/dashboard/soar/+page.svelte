<svelte:head><title>SOAR Triage - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { showUiMessage } from '../../../lib/workspace/feedback';
  import OrgBadge from '../../../lib/components/OrgBadge.svelte';
  import { lanEventsStore as eventsStore } from '../../../stores/events';
  import { getFacultyForIP, getServerName, getNetworkRouteForIP, isInternalIP, networkRecordsStore } from '../../../stores/faculties';
  import { formatEventTime } from '../../../lib/formatTime';
  import { onMount } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import { callKKUAI } from '../../../lib/utils/kkuai';
  import AttackPathGraph from '../../../lib/components/AttackPathGraph.svelte';
  import AiAnalysisBlock from '../../../lib/components/AiAnalysisBlock.svelte';
  import AiEvidenceBlock from '../../../lib/components/AiEvidenceBlock.svelte';
  import AttackTimeline from '../../../lib/components/AttackTimeline.svelte';
  
  import { buildIncidentQueue, incidentTime, incidentOutcome } from '../../../lib/utils/incidentQueue';
  let isLive = true;
  let frozenEvents: any[] = [];
  $: events = isLive ? $eventsStore : frozenEvents;
  $: incidentQueue = ($networkRecordsStore, buildIncidentQueue(events, isInternalIP));
  $: nonIncidentCount = events.filter(event => !incidentQueue.some(group => group.incidentMembers.includes(event))).length;

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
        const found = incidentQueue.find(e => e.incidentMembers.some((member: any) => String(member.id ?? member.incident_id) === id));
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

  $: filteredEvents = incidentQueue.filter((e: any) => {
    if (exactMatchMode) {
      // When navigated via direct link, show all events for this IP or ID
      return e.ip === searchQuery || e.destIp === searchQuery || e.incidentMembers.some((member: any) => String(member.id ?? member.incident_id) === searchQuery);
    }
    
    const matchSearch = [e.ip, e.destIp, e.type, getFacultyForIP(e.destIp)?.name, getNetworkRouteForIP(e.destIp)].some(value => String(value || '').toLowerCase().includes(searchQuery.toLowerCase()));
    const matchSeverity = severityFilter === 'all' ? true : e.severity === severityFilter;
    
    let matchDate = true;
    if (dateFilter) {
      const d = new Date(e.time || e.createdAt);
      const fd = new Date(dateFilter);
      if (d.toDateString() !== fd.toDateString()) matchDate = false;
    }
    
    return matchSearch && matchSeverity && matchDate;
  });
  
  let selectedEvent: any = null;
  $: if (selectedEvent) {
    const current = incidentQueue.find(group => group.groupId === selectedEvent.groupId);
    if (current !== selectedEvent) selectedEvent = current || null;
  }
  $: kcPhase = (function(event) {
    if (!event) return 'Recon';
    if (event.killChainPhase) return event.killChainPhase;
    const text = String(event.type || '').toLowerCase();
    if (/malware|trojan|ransomware|c2|beacon|miner|backdoor|botnet|wanna|crypto|coin|virus/i.test(text)) return 'C&C';
    if (/drop|delete|destroy|rm -rf|format|wipe|dos|ddos/i.test(text)) return 'Impact';
    if (/sql|xss|injection|rce|traversal|exploit/i.test(text)) return 'Exploitation';
    if (/brute|login|auth|ssh/i.test(text)) return 'Intrusion';
    if (['Authentication Brute Force', 'SSH Login Attempt'].includes(event.type)) return 'Intrusion';
    if (['SQL Injection (SQLi)', 'Cross-Site Scripting (XSS)', 'Command Injection (RCE)', 'Path Traversal / LFI', 'SQL Inject'].includes(event.type)) return 'Exploitation';
    if (event.type === 'Malware C2 Beacon') return 'C&C';
    if (event.type === 'Denial of Service (DoS)') return 'Impact';
    return 'Recon';
  })(selectedEvent);
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
      await showUiMessage("AI Workflow Generation failed: " + e.message);
    } finally {
      aiGeneratingBrief = false;
    }
  }

  // Timeline logic
  $: timelineEvents = selectedEvent ? selectedEvent.incidentMembers.slice().sort((a: any,b: any) => incidentTime(a) - incidentTime(b)) : [];
  
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
        outcome = 'HTTP response received; compromise unconfirmed';
        riskLevel = 'Impact unconfirmed';
        riskColor = 'medium';
      } else if (status >= 400 && status < 500) {
        outcome = (status === 403 || status === 401) ? 'Blocked / Unauthorized' : 'Failed / Not Found';
        riskLevel = 'Low Risk (Blocked)';
        riskColor = 'low';
      } else if (status >= 500) {
        outcome = 'Server Error; cause unconfirmed';
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
       outcomeText = `เซิร์ฟเวอร์ตอบกลับ HTTP ${status} แต่ยังไม่ยืนยันว่าการโจมตีสำเร็จ`;
       if (forensic.bytes > 0) outcomeText += ` ขนาดการตอบกลับ ${forensic.bytes} Bytes`;
    } else if (status >= 400 && status < 500) {
       outcomeText = `แต่ถูกระบบป้องกันบล็อกหรือปฏิเสธการเข้าถึง (HTTP ${status}) 🛡️`;
    } else if (status >= 500) {
       outcomeText = `พบการตอบกลับผิดพลาด HTTP ${status} ยังไม่ยืนยันสาเหตุ`;
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
      const res = await fetch(`/api/attacks/ip-history/${encodeURIComponent(ip)}?scope=lan`, {
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
    matched_subnet: getNetworkRouteForIP(selectedEvent.destIp),
    related_events: selectedEvent.incidentMembers,
    event_count: selectedEvent.relatedCount,
    attack_commands:   selectedEvent.attackCommands || [],
    credentials_used:  selectedEvent.credentialsUsed || null,
  }, null, 2) : '';

  // ── Dest IP Faculty ───────────────────────────────────────────────────────
  $: destFaculty = ($networkRecordsStore, selectedEvent?.destIp ? getFacultyForIP(selectedEvent.destIp) : null);
  $: targetSubnet = ($networkRecordsStore, selectedEvent?.destIp ? getNetworkRouteForIP(selectedEvent.destIp) : null);
</script>

<section class="siem-page siem-page--soar" aria-label="soar">
<div style="display:flex;flex-direction:column;height:100%;gap:16px;">
  <PageHeader title="Deep Incident" description="Centralized Incident Response, Correlation, and SOC Playbooks." icon="ti-tool" />
  
  <div class="soar-layout">
    <!-- COL 1: Incident Queue -->
    <div class="col-list">
      <div class="list-header" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size: 16px; font-weight: 700;">คิวเหตุการณ์ขององค์กร</div>
          <div style="font-size: 12px; color: var(--text-muted);">{exactMatchMode ? 'การค้นหาเจาะจง' : 'ภัยคุกคามต่อ subnet ที่บันทึกไว้'} ({filteredEvents.length})</div>
        </div>
        <button class="btn-live-toggle {isLive ? 'live' : 'paused'}" on:click={toggleLive} title={isLive ? 'หยุดอัปเดตชั่วคราว' : 'เปิดรับข้อมูลแบบ Real-time'}>
          <i class="ti {isLive ? 'ti-player-play' : 'ti-player-pause'}"></i>
        </button>
      </div>
      


      <div style="padding:10px 12px; font-size:12px; color:var(--text-muted);">รวมพฤติกรรมเดียวกันต่อเป้าหมายใน 5 นาที · log ที่ไม่ใช่ incident {nonIncidentCount} รายการ ดูได้ที่ Explorer</div>
      <div class="queue-items custom-scrollbar">
        {#each filteredEvents as event}
          <div class="q-item" class:selected={selectedEvent?.groupId === event.groupId} on:click={() => selectEvent(event)}>
            <div class="q-header">
              <span class="q-type" title={event.type}>{event.type === "UNKNOWN" ? "Suspicious Activity" : (event.type.length > 22 ? event.type.substring(0,22)+"..." : event.type)}</span>
              <span class="q-sev {event.severity}">{event.severity.toUpperCase()}</span>
            </div>
            <div class="q-ip"><i class="ti ti-network"></i> {event.ip} {#if event.country && event.country !== "Unknown" && event.country !== "UN"}<span style="opacity:0.7; font-size:11px; margin-left:4px;">({event.country})</span>{/if}</div>
            <div class="q-ip" style="margin-top:6px;">→ {event.destIp} · {getFacultyForIP(event.destIp)?.name || 'ยังไม่ระบุหน่วยงาน'}</div>
            <div class="q-time">{getNetworkRouteForIP(event.destIp)} · {event.relatedCount} ครั้ง</div>
            <div class="q-time">{formatEventTime(new Date(event.lastSeenMs).toISOString())}</div>
          </div>
        {/each}
        {#if filteredEvents.length === 0}
          <div class="empty-state">ไม่พบภัยคุกคามต่อ subnet ขององค์กรที่ตรงกับการค้นหา</div>
        {/if}
      </div>
    </div>

    <!-- COL 2: Correlation & Details -->
    <div class="col-main custom-scrollbar">
      {#if selectedEvent}
        <!-- 1. INSTANT HUMAN-READABLE DASHBOARD (Native, No AI) -->
        <h3 class="panel-title"><i class="ti ti-dashboard"></i> สรุปภัยคุกคามต่อเป้าหมายขององค์กร</h3>
        
        <div class="instant-dashboard" style="margin-bottom: 24px;">
          <!-- Source vs Dest Cards -->
          <div style="display:flex; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
            
            <!-- Attacker Card (RED) -->
            <div class="entity-card attacker" style="flex:1; min-width:250px; background:#fff1f2; border:1px solid #fda4af; border-radius:12px; padding:16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <div style="font-size:12px; font-weight:800; color:#e11d48; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                <i class="ti ti-spy" style="font-size:18px;"></i> ต้นทาง / ผู้กระทำ (SOURCE)
              </div>
              <div style="font-size:22px; font-weight:bold; font-family:monospace; color:#881337; margin-bottom:8px;">
                {selectedEvent.ip || 'Unknown'}
              </div>
              <div style="font-size:14px; color:#be123c; margin-bottom:6px;">
                📍 ประเทศ: <strong>{selectedEvent.country && selectedEvent.country !== 'Unknown' ? selectedEvent.country : 'ไม่ระบุ'}</strong>
              </div>
              <div style="font-size:13px; color:#9f1239; opacity:0.9; word-break:break-all;">
                📱 อุปกรณ์: {selectedEvent.agent || forensicData?.userAgent || 'ไม่ระบุ / ตรวจไม่พบ'}
              </div>
            </div>

            <div style="display:flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:32px;">
              <i class="ti ti-arrow-right"></i>
            </div>

            <!-- Target Card (GREEN) -->
            <div class="entity-card target" style="flex:1; min-width:250px; background:#f0fdf4; border:1px solid #86efac; border-radius:12px; padding:16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <div style="font-size:12px; font-weight:800; color:#16a34a; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
                <i class="ti ti-target" style="font-size:18px;"></i> ปลายทาง / เป้าหมาย (DESTINATION)
              </div>
              <div style="font-size:22px; font-weight:bold; font-family:monospace; color:#14532d; margin-bottom:8px;">
                {selectedEvent.destIp || 'Unknown'}
              </div>
              <div style="font-size:14px; color:#166534; margin-bottom:6px;">
                🏢 หน่วยงาน: <strong>{destFaculty?.name || 'ยังไม่ระบุหน่วยงานใน Network Map'}</strong>
              </div>
              <div style="font-size:14px; color:#166534; margin-bottom:6px;">
                🌐 Subnet องค์กร: <strong>{targetSubnet || 'ไม่พบ subnet'}</strong>
              </div>
              <div style="font-size:14px; color:#166534; margin-bottom:6px;">
                🌐 เซิร์ฟเวอร์: <strong>{selectedEvent.hostname || forensicData?.host || getServerName(selectedEvent.destIp) || 'ไม่ทราบชื่อ'}</strong>
              </div>
              <div style="font-size:13px; color:#14532d; opacity:0.9; word-break:break-all;">
                🔗 ไฟล์/URL: {selectedEvent.url || forensicData?.request || '-'}
              </div>
            </div>
          </div>

          <!-- Behavior & Outcome Banner -->
          <div style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:12px; padding:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div style="flex:2; min-width:200px;">
              <div style="font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">พฤติกรรมหลัก (Action & Behavior)</div>
              <div style="font-size:16px; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:12px; margin-bottom:6px;">
                {selectedEvent.type}
                {#if selectedEvent.httpmethod || forensicData?.method}
                  <span style="padding:4px 10px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:12px; color:var(--text-secondary); font-family:monospace;">Method: {selectedEvent.httpmethod || forensicData.method}</span>
                {/if}
              </div>
              <div style="font-size:14px; color:var(--text-secondary);">
                รายละเอียด: {selectedEvent.detail || selectedEvent.msg || 'ไม่มีคำอธิบายเพิ่มเติม'}
              </div>
            </div>
            
            <div style="flex:1; min-width:150px; text-align:right; border-left:2px dashed var(--border); padding-left:20px;">
              <div style="font-size:12px; font-weight:800; color:var(--text-muted); text-transform:uppercase; margin-bottom:8px;">ผลลัพธ์ (Outcome)</div>
              <div style="font-size:20px; font-weight:900; text-transform:uppercase; {['dropped','blocked'].includes((selectedEvent.action || '').toLowerCase()) ? 'color:#16a34a;' : 'color:#dc2626;'}">
                {incidentOutcome(selectedEvent)}
              </div>
              <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">
                ระบบที่ตรวจจับ: {selectedEvent.sensorSources.join(', ')} · หลักฐาน {selectedEvent.relatedCount} ครั้ง
              </div>
            </div>
          </div>
        </div>

        <!-- Stages of Attack (Kill Chain) -->
        <h3 class="panel-title" style="margin-top: 24px;"><i class="ti ti-target"></i> ระยะที่สัมพันธ์กับหลักฐาน (Kill Chain)</h3>
        <div class="kill-chain">
          <div class="kc-step {kcPhase === 'Recon' ? 'active' : ''}">
            <div class="kc-icon"><i class="ti ti-radar"></i></div>
            <div class="kc-label">Recon</div>
            {#if kcPhase === 'Recon'}<div class="kc-sublabel">สแกนหาช่องโหว่<br>(ก่อนเจาะระบบ)</div>{/if}
          </div>
          <div class="kc-line {kcPhase === 'Recon' ? '' : ''}"></div>
          
          <div class="kc-step {kcPhase === 'Intrusion' ? 'active' : (kcPhase === 'Recon' ? '' : '')}">
            <div class="kc-icon"><i class="ti ti-lock-open"></i></div>
            <div class="kc-label">Intrusion</div>
            {#if kcPhase === 'Intrusion'}<div class="kc-sublabel">พยายามเจาะเข้าสู่<br>ระบบล็อกอิน</div>{/if}
          </div>
          <div class="kc-line {['Recon', 'Intrusion'].includes(kcPhase) ? '' : ''}"></div>
          
          <div class="kc-step {kcPhase === 'Exploitation' ? 'active' : (['C&C', 'Impact'].includes(kcPhase) ? '' : '')}">
            <div class="kc-icon"><i class="ti ti-bug"></i></div>
            <div class="kc-label">Exploitation</div>
            {#if kcPhase === 'Exploitation'}<div class="kc-sublabel">โจมตีผ่านช่องโหว่<br>(อันตรายสูง)</div>{/if}
          </div>
          <div class="kc-line {['C&C', 'Impact'].includes(kcPhase) ? '' : ''}"></div>
          
          <div class="kc-step {kcPhase === 'C&C' ? 'active' : (kcPhase === 'Impact' ? '' : '')}">
            <div class="kc-icon"><i class="ti ti-satellite"></i></div>
            <div class="kc-label">C&C</div>
            {#if kcPhase === 'C&C'}<div class="kc-sublabel">มัลแวร์พยายาม<br>ติดต่อเซิร์ฟเวอร์</div>{/if}
          </div>
          <div class="kc-line {kcPhase === 'Impact' ? '' : ''}"></div>
          
          <div class="kc-step {kcPhase === 'Impact' ? 'active danger' : ''}">
            <div class="kc-icon"><i class="ti ti-skull"></i></div>
            <div class="kc-label">Impact</div>
            {#if kcPhase === 'Impact'}<div class="kc-sublabel">ระบบดาวน์ /<br>ถูกทำลาย</div>{/if}
          </div>
        </div>

        <!-- 2. AI DEEP DIVE (Optional/Copilot) -->
        <div class="ai-deep-dive" style="border-top:1px dashed var(--border); padding-top:24px;">
          {#if selectedEvent.ai_analysis}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h3 class="panel-title" style="margin: 0; color: var(--primary, #8e44ad);"><i class="ti ti-brain"></i> วิเคราะห์เชิงลึกด้วย AI (Deep Analysis Copilot)</h3>
              <button class="btn-refresh" on:click={generateAiBriefing} disabled={aiGeneratingBrief} style="background: var(--bg-secondary); border: 1px solid var(--border); padding: 6px 12px; border-radius: 4px; cursor: pointer; color: var(--text-primary); font-weight: bold; font-size: 12px;">
                <i class="ti ti-refresh {aiGeneratingBrief ? 'ti-spin' : ''}"></i> {aiGeneratingBrief ? 'กำลังวิเคราะห์...' : '🔄 วิเคราะห์ซ้ำ'}
              </button>
            </div>
            {#if aiGeneratingBrief}
              <div class="chat-bubble ai typing" style="margin-bottom: 24px;">
                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
              </div>
            {:else}
              <AiAnalysisBlock event={selectedEvent} />
            {/if}
          {:else}
            <h3 class="panel-title" style="color: var(--primary, #8e44ad);"><i class="ti ti-brain"></i> วิเคราะห์เชิงลึกด้วย AI (Deep Analysis Copilot)</h3>
            <div class="ai-section" style="margin-bottom: 24px;">
              <div style="display:flex; justify-content:flex-start; margin-bottom:12px;">
                <button class="btn-refresh" on:click={generateAiBriefing} disabled={aiGeneratingBrief} style="background: linear-gradient(135deg, #8e44ad, #3b82f6); color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
                  <i class="ti ti-sparkles {aiGeneratingBrief ? 'ti-spin' : ''}"></i> {aiGeneratingBrief ? 'กำลังให้ AI อ่าน Log...' : 'คลิกเพื่อเจาะลึก Payload ด้วย AI'}
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
                  <div class="chat-bubble ai text-muted" style="background: var(--bg-secondary, rgba(142, 68, 173, 0.05)); border: 1px dashed var(--border, rgba(142, 68, 173, 0.3)); color: var(--text-secondary);">
                    ข้อมูลด้านบนเพียงพอต่อการรู้ว่าเกิดอะไรขึ้น แต่หากคุณต้องการทราบว่า "แฮกเกอร์หวังผลอะไร" หรือ "Payload นี้ทำงานอย่างไร" สามารถให้ AI ช่วยวิเคราะห์ได้ครับ
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Raw Data -->
        <div class="raw-data-section" style="border-top:1px dashed var(--border); padding-top:24px;">
          <details>
            <summary style="font-weight: bold; cursor: pointer; color: var(--text-muted);"><i class="ti ti-code"></i> แสดงข้อมูล Log ดิบ (Raw Log)</summary>
            <div class="raw-evidence-box" style="margin-top: 16px;">
              <div class="re-body font-mono" style="background:#1e1e1e; color:#d4d4d4; padding:16px; white-space: pre-wrap; word-break: break-all; line-height: 1.5; font-size: 11px; border-radius: 8px;">
                {fullRawLog}
              </div>
            </div>
          </details>
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
      
      <div class="list-filters">
        {#if exactMatchMode}
          <div class="exact-match-banner">
            <div>ระบุตัว: {searchQuery}</div>
            <button on:click={clearExactMatch}><i class="ti ti-x"></i></button>
          </div>
        {:else}
          <input type="text" placeholder="ค้นหา IP เป้าหมาย, subnet, หน่วยงาน หรือพฤติกรรม..." bind:value={searchQuery} />
          <input type="date" bind:value={dateFilter} />
          <select bind:value={severityFilter}>
            <option value="all">ทุกระดับความรุนแรง</option>
            <option value="critical">Critical (วิกฤต)</option>
            <option value="high">High (สูง)</option>
            <option value="medium">Medium (ปานกลาง)</option>
          </select>
        {/if}
      </div>

      <div class="ai-body custom-scrollbar">
        {#if selectedEvent}
          <!-- Evidence & Playbook Advisory -->
          <div style="margin-bottom: 24px;">
            {#if selectedEvent.detection_evidence || selectedEvent.recommended_actions}
              <AiEvidenceBlock event={selectedEvent} />
            {:else}
              <div class="playbook-section" style="margin-bottom: 32px;">
                <h4 class="section-title" style="margin-bottom:16px;">SOC Playbook Actions</h4>
                
                <button class="playbook-btn pb-check" on:click={() => checkIpHistory(selectedEvent.ip)}>
                  <div class="pb-icon"><i class="ti ti-search"></i></div>
                  <div class="pb-text">
                    <strong>ตรวจสอบประวัติ IP</strong>
                    <span>ค้นหาพฤติกรรมย้อนหลังในระบบ</span>
                  </div>
                </button>

                <button class="playbook-btn pb-isolate" on:click={() => openDevPopup('Isolate Endpoint')}>
                  <div class="pb-icon"><i class="ti ti-shield-lock"></i></div>
                  <div class="pb-text">
                    <strong>แยกเครื่องเป้าหมาย (Isolate)</strong>
                    <span>ตัดการเชื่อมต่อเพื่อควบคุมความเสียหาย</span>
                  </div>
                </button>

                <button class="playbook-btn pb-block" on:click={() => openDevPopup('Block IP at Firewall')}>
                  <div class="pb-icon"><i class="ti ti-ban"></i></div>
                  <div class="pb-text">
                    <strong>บล็อก IP ที่ Firewall</strong>
                    <span>ระงับ IP ต้นทางทันทีที่ Gateway (ฉุกเฉิน)</span>
                  </div>
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
                      <div class="vt-type {tEvent.severity}">{tEvent.type}</div>
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

  .kill-chain { display:grid; grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr) 24px minmax(0,1fr) 24px minmax(0,1fr) 24px minmax(0,1fr); align-items:start; width:100%; box-sizing:border-box; background:var(--bg-panel); border:1px solid var(--border); border-radius:12px; padding:24px 12px; margin-bottom:24px; overflow:visible; }
  .kc-step { display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; z-index: 2; min-width:0; text-align:center; opacity: 0.4; filter: grayscale(100%); transition: 0.3s; }
  .kc-step.passed { opacity: 1; filter: grayscale(0%); }
  .kc-step.active { opacity: 1; filter: grayscale(0%); transform: none; }
  .kc-icon { width: 48px; height: 48px; border-radius: 50%; background: var(--bg-secondary); border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px; color: var(--text-muted); }
  .kc-step.passed .kc-icon { border-color: #3b82f6; color: #3b82f6; background: rgba(59,130,246,0.1); }
  .kc-step.active .kc-icon { border-color: #f59e0b; color: #f59e0b; background: rgba(245,158,11,0.1); box-shadow: 0 0 15px rgba(245,158,11,0.3); }
  .kc-step.active.danger .kc-icon { border-color: #ef4444; color: #ef4444; background: rgba(239,68,68,0.1); box-shadow: 0 0 15px rgba(239,68,68,0.3); }
  .kc-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
  .kc-step.passed .kc-label { color: #3b82f6; }
  .kc-step.active .kc-label { color: #f59e0b; }
  .kc-step.active.danger .kc-label { color: #ef4444; }
  .kc-sublabel { position:static; width:100%; box-sizing:border-box; overflow-wrap:anywhere; text-align:center; font-size:11px; font-weight:600; color:var(--text-primary); line-height:1.4; background:var(--bg-panel); padding:4px; border-radius:4px; border:1px dashed var(--border); }
  .kc-line { flex: 1; height: 4px; background: var(--border); margin:22px 2px 0; transition: 0.3s; position: relative; }
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
  .vt-time { font-size: 11px; color: var(--text-muted); font-family: monospace; margin-bottom: 4px; opacity: 0.8; }
  .vt-type { font-size: 13px; font-weight: 700; color: var(--text-primary); transition: 0.2s; }
  .vt-type.critical { color: #ef4444; }
  .vt-type.high { color: #f59e0b; }
  
  /* Col 3 AI */
  .col-ai { width: 340px; background: var(--bg-secondary); border-left: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .ai-header { padding: 16px 20px; border-bottom: 1px solid var(--border); font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .ai-body { flex: 1; overflow-y: auto; padding: 20px; }
  .section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin: 0 0 12px; }
  
  .playbook-btn { width: 100%; padding: 12px; border-radius: 8px; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.2s; margin-bottom: 12px; background: transparent; border: 1px solid transparent; }
  .pb-icon { font-size: 20px; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; }
  .pb-text { display: flex; flex-direction: column; gap: 4px; }
  .pb-text strong { font-size: 13px; font-weight: 700; }
  .pb-text span { font-size: 11px; font-weight: 500; opacity: 0.8; }
  
  .pb-check { border-color: rgba(59,130,246,0.3); color: #3b82f6; }
  .pb-check:hover { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.5); }
  .pb-check .pb-icon { background: rgba(59,130,246,0.15); }
  
  .pb-isolate { background: #f97316; color: white; box-shadow: 0 4px 6px -1px rgba(249,115,22,0.2); }
  .pb-isolate:hover { background: #ea580c; transform: translateY(-1px); box-shadow: 0 6px 8px -1px rgba(249,115,22,0.3); }
  .pb-isolate .pb-icon { background: rgba(255,255,255,0.2); }
  
  .pb-block { background: #ef4444; color: white; box-shadow: 0 4px 6px -1px rgba(239,68,68,0.2); }
  .pb-block:hover { background: #dc2626; transform: translateY(-1px); box-shadow: 0 6px 8px -1px rgba(239,68,68,0.3); }
  .pb-block .pb-icon { background: rgba(255,255,255,0.2); }
  
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
@media (max-width:600px) { .kill-chain { grid-template-columns:1fr; gap:12px; } .kc-line { width:4px; height:20px; margin:0 auto; } .kc-step { width:100%; } .kc-sublabel { max-width:220px; } }
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
                เป้าหมาย: {tEvent.destIp ? (getServerName(tEvent.destIp) || tEvent.destIp) : 'ไม่ระบุใน Log'} <br>
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
</section>
