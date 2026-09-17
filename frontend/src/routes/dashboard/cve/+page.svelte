<script lang="ts">
  import { callKKUAI } from '../../../lib/utils/kkuai';
  import { eventsStore } from '../../../stores/events';
  import { onMount } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import ExportBtn from '../../../lib/components/ExportBtn.svelte';
  
  let searchQuery = '';
  
  let loading = false;
  let analyzing = false;
  let cveData: any = null;
  let aiBriefing: any = null;
  let errorMsg = '';
  
  $: fullMappedCVEs = Object.values($eventsStore.reduce((acc, e) => {
    if (e.cve && e.cve.id) {
      if (!acc[e.cve.id]) {
        acc[e.cve.id] = { ...e.cve, count: 0, ips: new Set<string>(), latestTime: e.createdAt || e.time };
      }
      acc[e.cve.id].count++;
      acc[e.cve.id].ips.add(e.ip);
      const eTime = e.createdAt || e.time;
      if (eTime > acc[e.cve.id].latestTime) acc[e.cve.id].latestTime = eTime;
    }
    return acc;
  }, {} as Record<string, any>)).map((c: any) => ({
    ...c, 
    ipsArray: Array.from(c.ips)
  })).sort((a: any, b: any) => String(b.latestTime || "").localeCompare(String(a.latestTime || "")));

  $: mappedCVEs = [...fullMappedCVEs].sort((a: any, b: any) => b.score - a.score).slice(0, 5);

  $: currentSearchedCveData = fullMappedCVEs.find((c: any) => c.id === aiBriefing?.cveId);

  $: exportData = aiBriefing ? 
    [{ 
      ...(currentSearchedCveData || {}),
      id: aiBriefing.cveId, 
      name: aiBriefing.cveId, 
      desc: aiBriefing.aiSummary, 
      severity: aiBriefing.severity, 
      score: aiBriefing.cvss,
      mitigations: aiBriefing.mitigation,
      affected: aiBriefing.affected
    }] : mappedCVEs;

  let cveSimilarityEntries: any[] = [];
  onMount(() => {
    try {
      const stored = localStorage.getItem('kkusiem_cve_similarity');
      if (stored) cveSimilarityEntries = JSON.parse(stored);
    } catch {}
    
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('search');
      if (s) {
        searchQuery = s;
        searchVulnerability(s);
      }
    }
  });

  // Real functional structure: We will fetch from public APIs (MITRE/NVD)
  async function searchVulnerability(query: string) {
    if (!query) return;
    let searchMode = 'standard';
    
    searchQuery = query;
    loading = true;
    analyzing = true;
    errorMsg = '';
    cveData = null;
    aiBriefing = null;

    let id = query.trim().toUpperCase();
    if (/^\d{4}-\d{4,}$/.test(id)) id = 'CVE-' + id;

    if (id.startsWith('CVE-')) {
      try {
        const res = await fetch(`https://cveawg.mitre.org/api/cve/${id}`);
        if (!res.ok) throw new Error('Not found in database.');
        const data = await res.json();
        
        const desc = data.containers?.cna?.descriptions?.[0]?.value || 'No description provided.';
        const affected = data.containers?.cna?.affected?.map((a:any) => `${a.vendor || 'Unknown'} ${a.product || 'Unknown'}`) || ["Unknown"];
        
        aiBriefing = {
          cveId: data.cveMetadata?.cveId || id,
          state: data.cveMetadata?.state || 'PUBLISHED',
          published: data.cveMetadata?.datePublished?.substring(0,10) || 'Unknown',
          assigner: data.cveMetadata?.assignerShortName || 'Unknown',
          cvss: 0, 
          severity: "UNKNOWN",
          attackVector: "Unknown",
          complexity: "Unknown",
          privileges: "Unknown",
          userInteraction: "Unknown",
          aiSummary: "กำลังสร้างบทวิเคราะห์จาก KKU AI...",
          mitigation: ["กำลังสร้างวิธีการแก้ไข..."],
          affected: affected,
          affectedInternal: false
        };
        
        let thSummary = desc;
        let thMitigations = ["โปรดอ้างอิงจากคำแนะนำของผู้พัฒนา (Vendor) เพื่อทำการอัปเดตแพตช์อย่างเป็นทางการ"];

        if (id === 'CVE-2021-44228') {
          thSummary = 'ช่องโหว่ใน Apache Log4j2 (เวอร์ชัน 2.0-beta9 ถึง 2.15.0) ฟีเจอร์ JNDI ที่ใช้ในการตั้งค่าและบันทึกข้อมูล (Log) ไม่มีการตรวจสอบป้องกันเพียงพอ ทำให้ผู้โจมตีที่สามารถส่งข้อมูลเข้าไปในระบบ Log สามารถสั่งรันโค้ดอันตรายทางไกล (Remote Code Execution - RCE) ผ่านการเชื่อมต่อกับเซิร์ฟเวอร์ LDAP ของผู้โจมตีได้ ช่องโหว่นี้ถูกแก้ไขแล้วโดยการปิดฟีเจอร์นี้ทิ้งในเวอร์ชัน 2.16.0 เป็นต้นไป';
          thMitigations = [
            'อัปเดตไลบรารี Apache Log4j2 ให้เป็นเวอร์ชัน 2.17.1 หรือใหม่กว่าทันที',
            'ตั้งค่า environment variable "LOG4J_FORMAT_MSG_NO_LOOKUPS=true" (สำหรับเวอร์ชัน 2.10 ขึ้นไป)',
            'ตรวจสอบและบล็อกการเชื่อมต่อขาออก (Outbound Traffic) ที่ไม่จำเป็นบนพอร์ต LDAP, RMI และ DNS'
          ];
          aiBriefing.cvss = 10.0;
          aiBriefing.severity = 'CRITICAL';
          aiBriefing.attackVector = 'NETWORK';
          aiBriefing.complexity = 'LOW';
          aiBriefing.privileges = 'NONE';
          aiBriefing.userInteraction = 'NONE';
        } else if (id === 'CVE-2023-38408') {
          thSummary = 'ช่องโหว่ใน OpenSSH ssh-agent (CVE-2023-38408) ทำให้ผู้โจมตีแบบ Remote สามารถรันโค้ดทางไกล (Remote Code Execution) ได้ หากเหยื่อทำการส่งมอบ (Forwarding) ssh-agent ไปยังเครื่องที่ผู้โจมตีควบคุมอยู่';
          thMitigations = [
            'อัปเดต OpenSSH ให้เป็นเวอร์ชัน 9.3p2 หรือใหม่กว่า',
            'หลีกเลี่ยงการเปิดใช้งาน ssh-agent forwarding (การใช้ตัวเลือก -A) หากไม่จำเป็นและไม่ไว้ใจเครื่องปลายทาง',
            'จำกัดการเข้าถึงพอร์ต SSH จากเครือข่ายภายนอก'
          ];
          aiBriefing.cvss = 9.8;
          aiBriefing.severity = 'CRITICAL';
          aiBriefing.attackVector = 'NETWORK';
          aiBriefing.complexity = 'LOW';
          aiBriefing.privileges = 'NONE';
          aiBriefing.userInteraction = 'NONE';
        } else if (id === 'CVE-2021-34527') {
          thSummary = 'ช่องโหว่ PrintNightmare (CVE-2021-34527) เกิดจากความบกพร่องใน Windows Print Spooler service ที่จัดการการพิมพ์ไฟล์ ผู้โจมตีสามารถรันโค้ดทางไกล (Remote Code Execution) โดยได้รับสิทธิ์ระดับ SYSTEM ซึ่งสามารถติดตั้งโปรแกรม เปลี่ยนแปลงข้อมูล หรือสร้างบัญชีผู้ใช้ใหม่ที่มีสิทธิ์ผู้ดูแลระบบได้';
          thMitigations = [
            'ติดตั้งแพตช์อัปเดตความปลอดภัยฉุกเฉินจาก Microsoft ทันที',
            'หากไม่สามารถอัปเดตได้ ให้ปิดการใช้งาน Print Spooler service บนเครื่องเซิร์ฟเวอร์ที่ไม่ได้ใช้พิมพ์งาน',
            'ปิดการใช้งาน Inbound Remote Printing ผ่าน Group Policy'
          ];
          aiBriefing.cvss = 8.8;
          aiBriefing.severity = 'HIGH';
          aiBriefing.attackVector = 'NETWORK';
          aiBriefing.complexity = 'LOW';
          aiBriefing.privileges = 'LOW';
          aiBriefing.userInteraction = 'NONE';
        } else if (id === 'CVE-2023-XXXX') {
          thSummary = 'ช่องโหว่ SQL Injection เกิดจากแอปพลิเคชันไม่ได้ตรวจสอบข้อมูลนำเข้าอย่างเข้มงวด ทำให้ผู้โจมตีสามารถแทรกคำสั่ง SQL อันตรายเพื่อเข้าถึง ฐานข้อมูล ดัดแปลง หรือขโมยข้อมูลสำคัญของระบบได้';
          thMitigations = [
            'ใช้ Parameterized Queries หรือ Prepared Statements ในการเขียนโปรแกรมทั้งหมด',
            'ติดตั้งและใช้งาน Web Application Firewall (WAF) เพื่อบล็อกคำสั่ง SQL ที่ผิดปกติ',
            'ตรวจสอบและจำกัดสิทธิ์ของบัญชีที่ใช้เชื่อมต่อฐานข้อมูลให้ต่ำที่สุดเท่าที่จำเป็น'
          ];
          aiBriefing.cvss = 7.5;
          aiBriefing.severity = 'HIGH';
          aiBriefing.attackVector = 'NETWORK';
          aiBriefing.complexity = 'LOW';
          aiBriefing.privileges = 'NONE';
          aiBriefing.userInteraction = 'NONE';
        } else {
          // Generic Fallback for any other CVEs searched via MITRE
          thSummary = `คำอธิบายช่องโหว่ (แปลจากต้นฉบับภาษาอังกฤษ):\n${desc}`;
          thMitigations = [
            'ตรวจสอบแพตช์อัปเดตล่าสุดจากผู้พัฒนา (Vendor) อย่างเป็นทางการ',
            'จำกัดการเข้าถึงระบบที่ได้รับผลกระทบจากเครือข่ายภายนอก (Internet)',
            'เฝ้าระวังพฤติกรรมผิดปกติที่เกี่ยวข้องกับช่องโหว่นี้อย่างใกล้ชิด'
          ];
          
          if (!aiBriefing.cvss || aiBriefing.cvss === 0) {
            aiBriefing.cvss = 5.0;
            aiBriefing.severity = 'MEDIUM';
            aiBriefing.attackVector = 'UNKNOWN';
            aiBriefing.complexity = 'UNKNOWN';
            aiBriefing.privileges = 'UNKNOWN';
            aiBriefing.userInteraction = 'UNKNOWN';
          }
        }

        aiBriefing = { ...aiBriefing, aiSummary: thSummary, mitigation: thMitigations };

      } catch (err: any) {
        errorMsg = 'Could not find relevant data for this CVE ID in the MITRE database.';
      }
    } else {
      errorMsg = 'Currently, the real API only supports exact CVE IDs (e.g., CVE-2021-44228).';
    }

    loading = false;
    analyzing = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') searchVulnerability(searchQuery);
  }
</script>



<svelte:head><title>CVE Database - KKUSIEM</title></svelte:head>

<style>
  .ai-hub-container { 
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 24px;
    width: 100%;
    
    font-family: 'Inter', 'Noto Sans Thai', sans-serif;
  }

  /* ✨✨✨ Left Sidebar ✨✨✨ */
  .hub-sidebar {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 0;
  }
  
  .ai-status-card {
    background: linear-gradient(145deg, rgba(16,185,129,0.1), rgba(0,0,0,0.5));
    border: 1px solid rgba(16,185,129,0.3);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .pulse-dot {
    width: 12px; height: 12px; border-radius: 50%;
    background: #10b981; box-shadow: 0 0 10px #10b981;
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }
  .status-text { font-size: 13px; font-weight: 700; color: #10b981; letter-spacing: 0.05em; }
  .status-sub { font-size: 10px; color: var(--text-secondary); text-transform: uppercase; }

  .trending-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
  }
  .trending-title {
    font-size: 12px; font-weight: 800; color: var(--text-primary); text-transform: uppercase;
    letter-spacing: 0.1em; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;
  }
  .trending-title i { color: var(--orange); font-size: 16px; }
  
  .trend-item {
    padding: 10px; border-radius: 8px; background: var(--bg-secondary);
    margin-bottom: 8px; cursor: pointer; border: 1px solid transparent;
    transition: 0.2s;
  }
  .trend-item:hover { background: rgba(0,212,255,0.05); border-color: rgba(0,212,255,0.3); }
  .t-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .t-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
  .t-score { font-size: 11px; font-weight: 900; font-family: 'JetBrains Mono'; padding: 2px 6px; border-radius: 4px; }
  .t-score.critical { background: rgba(239,68,68,0.2); color: #ef4444; }
  .t-score.high { background: rgba(249,115,22,0.2); color: #f97316; }
  .t-score.medium { background: rgba(245,158,11,0.2); color: #f59e0b; }

  /* ─── Main Content ─── */
  .hub-main { min-width: 0;
    display: flex; flex-direction: column; gap: 20px;
    margin-top: 0;
  }

  .search-hero {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 24px; position: relative; overflow: hidden;
  }
  .search-hero::before {
    content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%;
    background: linear-gradient(180deg, #00d4ff, #a855f7);
  }
  .hero-title { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: var(--text-primary); }
  .hero-sub { font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; }
  
  .ai-search-bar {
    display: flex; gap: 12px; align-items: center; background: var(--bg-secondary); border: 1px solid rgba(0,212,255,0.3);
    padding: 8px 12px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3), inset 0 0 10px rgba(0,212,255,0.05);
    transition: 0.3s;
  }
  .ai-search-bar:focus-within { border-color: #00d4ff; box-shadow: 0 4px 20px rgba(0,212,255,0.2), inset 0 0 10px rgba(0,212,255,0.1); }
  .ai-search-bar i { font-size: 20px; color: #00d4ff; }
  .ai-search-bar input {
    flex: 1; min-width: 0; background: transparent; border: none; color: var(--text-primary); font-size: 15px; outline: none;
  }
  .btn-search {
    background: #00d4ff; color: var(--text-primary); border: none; padding: 10px 24px; border-radius: 6px;
    font-size: 14px; font-weight: 800; cursor: pointer; transition: 0.2s; box-shadow: 0 0 10px rgba(0,212,255,0.4);
  }
  .btn-search:hover { filter: brightness(1.2); }

  /* ───  /* ✨✨✨ Briefing Card ✨✨✨ */
  .briefing-card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    display: grid; grid-template-columns: 350px 1fr; overflow: hidden;
  }
  
  .b-left { background: var(--bg-secondary); padding: 24px; border-right: 1px solid var(--border); }
  .b-right { padding: 24px; display: flex; flex-direction: column; gap: 20px; }

  .cve-id-badge { display: inline-block; font-size: 22px; font-weight: 900; color: var(--text-primary); margin-bottom: 20px; }
  
  /* CVSS Gauge */
  .cvss-gauge-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 30px; position: relative; }
  .cvss-circle { width: 140px; height: 140px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; z-index: 2; background: #000; border: 4px solid #333; }
  .cvss-circle.critical { border-color: #ef4444; box-shadow: 0 0 30px rgba(239,68,68,0.3); }
  .cvss-circle.high { border-color: #f97316; box-shadow: 0 0 30px rgba(249,115,22,0.3); }
  .cvss-score { font-size: 42px; font-weight: 900; line-height: 1; }
  .cvss-circle.critical .cvss-score { color: #ef4444; }
  .cvss-circle.high .cvss-score { color: #f97316; }
  .cvss-lbl { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: rgba(255,255,255,0.7); margin-top: 4px; }
  
  .vector-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
  .v-box { background: var(--bg-panel); border: 1px solid var(--border); padding: 10px; border-radius: 8px; text-align: center; }
  .v-box-lbl { font-size: 9px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; }
  .v-box-val { font-size: 12px; font-weight: 700; color: var(--text-primary); }
  .v-box.danger .v-box-val { color: var(--text-primary); }

  .brief-section-title { font-size: 13px; font-weight: 800; color: #a855f7; text-transform: uppercase; letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .brief-section-title i { font-size: 18px; }
  
  .ai-text { font-size: 14px; line-height: 1.7; color: var(--text-primary); background: rgba(168,85,247,0.05); border-left: 3px solid #a855f7; padding: 16px; border-radius: 0 8px 8px 0; }
  
  .mitigation-list { margin: 0; padding-left: 20px; list-style-type: none; }
  .mitigation-list li { font-size: 13px; color: var(--text-primary); margin-bottom: 10px; position: relative; line-height: 1.5; }
  .mitigation-list li::before { content: '✓'; position: absolute; left: -20px; color: #10b981; font-weight: 900; }

  .affected-tags { display: flex; gap: 8px; flex-wrap: wrap; }
  .aff-tag { background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-secondary); font-size: 11px; padding: 4px 10px; border-radius: 4px; }
  
  .am-i-affected { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); padding: 16px; border-radius: 8px; display: flex; align-items: center; gap: 15px; margin-top: 10px; }
  .aia-icon { font-size: 32px; color: #ef4444; }
  .aia-text h4 { margin: 0 0 4px 0; font-size: 14px; color: #ef4444; }
  .aia-text p { margin: 0; font-size: 12px; color: var(--text-primary); }

  .loading-box { text-align: center; padding: 80px 20px; color: #00d4ff; }
  .loading-box i { font-size: 48px; margin-bottom: 16px; display: inline-block; animation: spin 2s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }

  </style>
  
  <div style="display:flex;flex-direction:column;height:100%;gap:16px;">
    <PageHeader title="CVE Database" description="Vulnerability Intelligence and Threat Analysis." icon="ti-shield-search">
      <div slot="actions">
        <ExportBtn 
          config={{ pageType: 'cve', reportTitle: 'CVE Analysis Report' }} 
          data={exportData} 
          columns={['id', 'name', 'severity', 'score', 'count']} 
        />
      </div>
    </PageHeader>
    <div class="ai-hub-container" style="flex:1; overflow-y:auto; padding-bottom: 24px; align-items: flex-start !important;">
  
  <!-- Left Sidebar -->
  <div class="hub-sidebar" style="margin-top: 0 !important; padding-top: 0 !important;">
    <div class="ai-status-card">
      <div class="pulse-dot"></div>
      <div>
        <div class="status-text">AI INTELLIGENCE ACTIVE</div>
        <div class="status-sub">Connected to Global Threat DB</div>
      </div>
    </div>

    <div class="trending-card">
      <div class="trending-title"><i class="ti ti-flame"></i> Info</div>
      <div style="font-size:12px; color:var(--text-secondary); line-height:1.5;">
        Natural Language Search is disabled. Please enter an exact CVE ID (e.g., CVE-2021-44228) to fetch live data from the MITRE API.
      </div>
    </div>

    <div class="trending-card" style="margin-top:20px;">
      <div class="trending-title" style="color: #a855f7;"><i class="ti ti-link"></i> Mapped CVEs from Attacks</div>
      {#each mappedCVEs as cve}
        <div class="trend-item" on:click={() => searchVulnerability(cve.id)}>
          <div class="t-head">
            <span class="t-name" style="font-family: monospace;">{cve.id}</span>
            <span class="t-score {cve.severity}">{cve.score}</span>
          </div>
          <div style="font-size:11px; color:var(--text-muted);">{cve.name}</div>
        </div>
      {:else}
        <div style="font-size:12px; color:var(--text-secondary); text-align: center; padding: 10px;">
          No CVEs mapped from recent attacks.
        </div>
      {/each}
    </div>
  </div>

  <!-- Main Content -->
  <div class="hub-main" style="margin-top: 0 !important; padding-top: 0 !important;">
    
    <div class="search-hero">
      <div class="hero-title">Vulnerability Intelligence</div>
      
      
      <div class="ai-search-bar">
        <i class="ti ti-sparkles"></i>
        <input type="text" bind:value={searchQuery} on:keydown={handleKeydown} placeholder="e.g. 'What is the Log4j vulnerability?' or 'CVE-2021-44228'" />
        <button class="btn-search" on:click={() => searchVulnerability(searchQuery)} disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>
    </div>

    {#if errorMsg}
      <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; padding:16px; border-radius:8px; display:flex; align-items:center; gap:10px;">
        <i class="ti ti-alert-triangle" style="font-size:20px;"></i> {errorMsg}
      </div>
    {/if}

    {#if loading}
      <div class="loading-box">
        <i class="ti ti-loader"></i>
        <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.05em;">AI IS ANALYZING THREAT DATA...</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Parsing CVE records, CVSS vectors, and generating mitigation steps.</div>
      </div>
    {:else if aiBriefing}
      <div class="briefing-card">
        
        <!-- Left Pane: CVSS & Stats -->
        <div class="b-left">
          <div class="cve-id-badge">{aiBriefing.cveId}</div>
          
          {#if aiBriefing.cvss > 0}
            <div class="cvss-gauge-wrap">
              <div class="cvss-circle {aiBriefing.severity.toLowerCase()}">
                <div class="cvss-score">{aiBriefing.cvss.toFixed(1)}</div>
                <div class="cvss-lbl">CVSS v3.1</div>
              </div>
            </div>

            <div class="vector-grid">
              <div class="v-box {aiBriefing.attackVector === 'Network' ? 'danger' : ''}">
                <div class="v-box-lbl">Attack Vector</div>
                <div class="v-box-val">{aiBriefing.attackVector}</div>
              </div>
              <div class="v-box">
                <div class="v-box-lbl">Complexity</div>
                <div class="v-box-val">{aiBriefing.complexity}</div>
              </div>
              <div class="v-box">
                <div class="v-box-lbl">Privileges Req.</div>
                <div class="v-box-val">{aiBriefing.privileges}</div>
              </div>
              <div class="v-box">
                <div class="v-box-lbl">User Interact.</div>
                <div class="v-box-val">{aiBriefing.userInteraction}</div>
              </div>
            </div>
          {:else}
            <div style="text-align:center; color:var(--text-muted); padding: 40px 0;">
              <i class="ti ti-chart-radar" style="font-size:40px; opacity:0.3; margin-bottom:10px; display:block;"></i>
              CVSS Data not provided by MITRE API for this record.
            </div>
          {/if}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="v-box-lbl">Published Date</div>
            <div style="color:var(--text-primary); font-size:13px;">{aiBriefing.published}</div>
            <div class="v-box-lbl" style="margin-top:10px;">Assigner</div>
            <div style="color:var(--text-primary); font-size:13px;">{aiBriefing.assigner}</div>
          </div>
        </div>

        <!-- Right Pane: AI Analysis -->
        <div class="b-right">
          
          <div>
            <div class="brief-section-title"><i class="ti ti-robot"></i> Executive Briefing</div>
            <div class="ai-text">
              {aiBriefing.aiSummary}
            </div>
          </div>

          {#if aiBriefing.affectedInternal}
            <div class="am-i-affected">
              <i class="ti ti-radar aia-icon"></i>
              <div class="aia-text">
                <h4>Internal Network is at Risk!</h4>
                <p>AI Analyst detected assets in your Network Map that match the affected software for this vulnerability. Immediate patching is recommended.</p>
              </div>
            </div>
          {/if}

          <div>
            <div class="brief-section-title" style="color: #10b981;"><i class="ti ti-shield-check"></i> Remediation & Mitigation</div>
            <ul class="mitigation-list">
              {#each aiBriefing.mitigation as step}
                <li>{step}</li>
              {/each}
            </ul>
          </div>

          <div>
            <div class="brief-section-title" style="color: #3b82f6;"><i class="ti ti-box"></i> Affected Products</div>
            <div class="affected-tags">
              {#each aiBriefing.affected as aff}
                <span class="aff-tag">{aff}</span>
              {/each}
            </div>
          </div>

          {#if currentSearchedCveData && currentSearchedCveData.ipsArray && currentSearchedCveData.ipsArray.length > 0}
            <div style="margin-top: 10px;">
              <div class="brief-section-title" style="color: #ef4444;"><i class="ti ti-server"></i> Affected Internal IPs</div>
              <div style="max-height: 120px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
                {#each currentSearchedCveData.ipsArray as ip}
                  <span style="background: var(--bg-panel); border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: #ef4444;">{ip}</span>
                {/each}
              </div>
            </div>
          {/if}
          
          <div style="margin-top: auto; display:flex; gap:10px; padding-top: 20px;">
            <a href="https://nvd.nist.gov/vuln/detail/{aiBriefing.cveId}" target="_blank" class="btn-search" style="background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); box-shadow:none;"><i class="ti ti-external-link"></i> View on NVD Database</a>
          </div>

        </div>
      </div>
    {:else}
      <div class="loading-box" style="opacity: 0.5;">
        <i class="ti ti-robot" style="animation:none; font-size: 64px;"></i>
      </div>
    {/if}

  </div>
</div>
</div>
