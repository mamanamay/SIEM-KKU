<script lang="ts">
  import { showUiMessage } from '../../../lib/workspace/feedback';
  import { incidentUrl } from '../../../lib/utils/incidentLink';
  import { formatEventTime } from '../../../lib/formatTime';
  import { lanEventsStore as eventsStore } from '../../../stores/events';
  import { onMount } from 'svelte';
  import PageHeader from '../../../lib/components/PageHeader.svelte';
  import ExportBtn from '../../../lib/components/ExportBtn.svelte';
  import ConfirmModal from '../../../lib/components/ConfirmModal.svelte';
  
  let searchQuery = '';
  
  let loading = false;
  let analyzing = false;
  let cveData: any = null;
  let aiBriefing: any = null;
  let errorMsg = '';
  let thaiInfo:any=null;
  let translationLoading=false;
  const thaiTerms:Record<string,string>={NETWORK:'ผ่านเครือข่าย',ADJACENT_NETWORK:'เครือข่ายใกล้เคียง',LOCAL:'ภายในเครื่อง',PHYSICAL:'ต้องเข้าถึงอุปกรณ์',LOW:'ต่ำ',HIGH:'สูง',NONE:'ไม่ต้องมี',REQUIRED:'จำเป็น',PASSIVE:'แบบรับข้อมูล',ACTIVE:'ต้องดำเนินการ',UNKNOWN:'ไม่ระบุ',CRITICAL:'วิกฤต',MEDIUM:'ปานกลาง'};
  const thaiValue=(value:string)=>thaiTerms[String(value).toUpperCase()]||value;
  const canTranslate=()=>['admin','analyst','analyst_l2','threat_hunter'].includes(localStorage.getItem('role')||'');
  async function translateThai(id:string,run=searchGeneration){
    if(!canTranslate()||translationLoading)return;
    translationLoading=true;
    try {
      const response=await fetch('/api/cve/'+encodeURIComponent(id)+'/thai',{method:'POST',headers:{Authorization:'Bearer '+localStorage.getItem('token')}});
      const data=await response.json();
      if(run!==searchGeneration)return;
      thaiInfo=response.ok?data:{status:'unavailable',issue:{message:data.message||'แปลภาษาไทยไม่สำเร็จ'}};
      if(thaiInfo.status==='ready')aiBriefing={...aiBriefing,aiSummary:thaiInfo.descriptionTh,mitigation:thaiInfo.solutionsTh?.length?thaiInfo.solutionsTh:['ตรวจเอกสารและคำแนะนำของผู้พัฒนาจากแหล่งอ้างอิงด้านล่าง ต้นฉบับไม่มีแนวทางแก้ไขในช่อง solutions']};
    }catch {if(run===searchGeneration)thaiInfo={status:'unavailable',issue:{message:'เชื่อมต่อบริการแปลไม่สำเร็จ'}};}
    finally{if(run===searchGeneration)translationLoading=false;}
  }
  
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
  let selectedHistoryIds: string[] = [];

  $: uniqueCveHistory = cveSimilarityEntries.reduce((acc, curr) => {
    if (!acc.find((item: any) => item.cveId === curr.cveId)) {
      acc.push(curr);
    }
    return acc;
  }, []);

  let showDeleteConfirm = false;

  function toggleHistorySelect(cveId: string) {
    if (selectedHistoryIds.includes(cveId)) {
      selectedHistoryIds = selectedHistoryIds.filter(id => id !== cveId);
    } else {
      selectedHistoryIds = [...selectedHistoryIds, cveId];
    }
  }

  function requestDeleteHistory() {
    if (selectedHistoryIds.length === 0) return;
    showDeleteConfirm = true;
  }

  async function confirmDeleteHistory() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/cve/history/delete', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedHistoryIds })
      });
      if (res.ok) {
        cveSimilarityEntries = cveSimilarityEntries.filter(item => !selectedHistoryIds.includes(item.cveId));
        selectedHistoryIds = [];
        showDeleteConfirm = false;
      } else {
        await showUiMessage('Failed to delete history');
      }
    } catch (e) {
      console.error(e);
      await showUiMessage('Error deleting history');
    }
  }

  let cveFindings: any[] = [];
  let searchGeneration = 0;
  function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter') void searchVulnerability(searchQuery); }
  onMount(async () => {
    const headers = {Authorization:'Bearer '+localStorage.getItem('token')};
    const params = new URLSearchParams(window.location.search);
    const incident = params.get('incidentId');
    try {
      const [history, findings] = await Promise.all([fetch('/api/cve/history',{headers}),fetch('/api/cve/findings'+(incident?'?incidentId='+encodeURIComponent(incident):''),{headers})]);
      if(history.ok)cveSimilarityEntries=await history.json();
      if(findings.ok)cveFindings=await findings.json();
    } catch { errorMsg='โหลดประวัติ CVE ไม่สำเร็จ'; }
    const search=params.get('search');if(search)void searchVulnerability(search);
  });
  async function searchVulnerability(query: string) {
    const run=++searchGeneration;
    let id=query.trim().toUpperCase();if(/^\d{4}-\d{4,}$/.test(id))id='CVE-'+id;
    searchQuery=id;errorMsg='';aiBriefing=null;thaiInfo=null;translationLoading=false;loading=true;analyzing=false;
    try {
      if(!/^CVE-\d{4}-\d{4,19}$/.test(id))throw new Error('กรุณาระบุ CVE ID ที่ถูกต้อง');
      const headers={Authorization:'Bearer '+localStorage.getItem('token')};
      const response=await fetch('/api/cve/'+id,{headers});const data=await response.json();
      if(!response.ok)throw new Error(data.message||'อ่าน CVE จากแหล่งอ้างอิงไม่สำเร็จ');
      if(run!==searchGeneration)return;
      cveData=data;const d=data.siem;thaiInfo=data.thai;
      if(d.state!=='PUBLISHED')throw new Error('CVE นี้มีสถานะ '+d.state+' และยังไม่ใช้เป็นผลความสัมพันธ์ที่ตรวจสอบแล้ว');
      aiBriefing={cveId:d.cveId,state:d.state,published:data.cveMetadata?.datePublished?.slice(0,10)||'ไม่ระบุ',
        assigner:data.cveMetadata?.assignerShortName||'ไม่ระบุ',cvss:d.cvssScore,severity:d.severity||'UNKNOWN',
        attackVector:d.attackVector||'UNKNOWN',complexity:d.complexity||'UNKNOWN',privileges:d.privileges||'UNKNOWN',
        userInteraction:d.userInteraction||'UNKNOWN',aiSummary:thaiInfo?.descriptionTh||d.description||'ไม่มีคำอธิบายจากแหล่งอ้างอิง',
        mitigation:thaiInfo?.solutionsTh?.length?thaiInfo.solutionsTh:(data.containers?.cna?.solutions||[]).map((item:any)=>item.value).filter(Boolean),
        affected:[d.affectedProduct||'ไม่ระบุ'],affectedInternal:cveFindings.some(f=>f.cveId===d.cveId)};
      if(!aiBriefing.mitigation.length)aiBriefing.mitigation=['ตรวจข้อมูลและคำแนะนำแก้ไขในเอกสารของผู้พัฒนาที่แนบกับ CVE นี้'];
      if(thaiInfo?.status!=='ready'&&canTranslate())void translateThai(id,run);
      const saved=await fetch('/api/cve/history',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({cveId:id,aiSummary:d.description})});
      if(saved.ok&&run===searchGeneration){const entry=await saved.json();cveSimilarityEntries=[entry,...cveSimilarityEntries.filter(h=>h.cveId!==entry.cveId)].slice(0,100);}
    }catch(error:any){if(run===searchGeneration)errorMsg=error.message;}
    finally{if(run===searchGeneration){loading=false;analyzing=false;}}
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
  
  .cve-original {padding:12px;border:1px solid var(--border);border-radius:8px;overflow-wrap:anywhere;}
  .translation-status {font-size:12px;color:var(--text-secondary);line-height:1.6;}
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
  
  <section class="siem-page siem-page--cve" aria-label="cve">
<div style="display:flex;flex-direction:column;height:100%;gap:16px;">
    <PageHeader title="ฐานข้อมูล CVE" description="คำอธิบายช่องโหว่ภาษาไทย พร้อมต้นฉบับและหลักฐานที่เกี่ยวข้อง" icon="ti-shield-search">
      <div slot="actions">
        <ExportBtn 
          config={{ pageType: 'cve', reportTitle: 'CVE Analysis Report', supportedFormats:['pdf','html','csv'], aiEnabled:true, csvEnabled:true, sections:[] }}
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
        <div class="status-text">ข้อมูลอ้างอิง CVE</div>
        <div class="status-sub">อ่านข้อมูลจากทะเบียน CVE</div>
      </div>
    </div>

    <div class="trending-card">
      <div class="trending-title"><i class="ti ti-flame"></i> วิธีค้นหา</div>
      <div style="font-size:12px; color:var(--text-secondary); line-height:1.5;">
        ระบุรหัส CVE เช่น CVE-2021-44228 เพื่ออ่านต้นฉบับจากทะเบียน CVE และคำอธิบายภาษาไทยเมื่อมี
      </div>
    </div>

    <div class="trending-card" style="margin-top:20px;">
      <div class="trending-title" style="color: #a855f7;"><i class="ti ti-link"></i> CVE ที่เชื่อมโยงจากเหตุการณ์</div>
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
          ยังไม่มี CVE ที่เชื่อมโยงจากเหตุการณ์ล่าสุด
        </div>
      {/each}
    </div>

    <div class="trending-card" style="margin-top:20px;">
      <div class="trending-title">ประวัติ CVE จากการวิเคราะห์ Incident</div>
      <p>ตรวจพบความสัมพันธ์กับ CVE ที่เผยแพร่แล้ว — ยังไม่ยืนยันการมีช่องโหว่หรือการเจาะสำเร็จ</p>
      {#each cveFindings as finding}
        <div class="trend-item">
          <button class="btn-search" on:click={() => searchVulnerability(finding.cveId)}>{finding.cveId}</button>
          <p>{finding.sourceIp} → {finding.targetIp || 'ไม่ระบุ'}<br>{finding.reason}</p>
          <a href={incidentUrl({id:finding.incidentId}) || '/dashboard/soar'}>Incident {finding.incidentId} / หลักฐาน</a>
          <p>{formatEventTime(finding.updatedAt)} · {finding.actor}</p>
        </div>
      {:else}<p>ยังไม่มีผล CVE ที่ตรวจสอบและบันทึกเชื่อมกับ Incident</p>{/each}
    </div>

    <div class="trending-card" style="margin-top:20px;">
      <div class="trending-title" style="color: #00d4ff; display: flex; justify-content: space-between; align-items: center;">
        <span><i class="ti ti-history"></i> ประวัติการค้นหา CVE</span>
        {#if selectedHistoryIds.length > 0}
          <button on:click={requestDeleteHistory} style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; display: flex; align-items: center; gap: 4px; transition: 0.2s;">
            <i class="ti ti-trash"></i> Delete Selected ({selectedHistoryIds.length})
          </button>
        {/if}
      </div>
      {#each uniqueCveHistory as history}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div class="trend-item" style="display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" checked={selectedHistoryIds.includes(history.cveId)} on:click|stopPropagation={() => toggleHistorySelect(history.cveId)} style="cursor: pointer; width: 16px; height: 16px;" />
          <div style="flex: 1; cursor: pointer;" on:click={() => searchVulnerability(history.cveId)}>
            <div class="t-head">
              <span class="t-name" style="font-family: monospace;">{history.cveId}</span>
              <span class="t-score {history.severity?.toLowerCase()}">{history.cvssScore?.toFixed(1) ?? 'ไม่ระบุ'}</span>
            </div>
            <div style="font-size:11px; color:var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
              {history.aiSummary?.substring(0, 50)}...
            </div>
          </div>
        </div>
      {:else}
        <div style="font-size:12px; color:var(--text-secondary); text-align: center; padding: 10px;">
          No search history found.
        </div>
      {/each}
    </div>
  </div>

  <!-- Main Content -->
  <div class="hub-main" style="margin-top: 0 !important; padding-top: 0 !important;">
    
    <div class="search-hero">
      <div class="hero-title">รายละเอียดช่องโหว่</div><p class="siem-panel-note">ค้นหาด้วย CVE ID · อ่านข้อมูลจากแหล่งอ้างอิงและเชื่อมกลับ Incident ที่เกี่ยวข้อง</p>
      
      
      <div class="ai-search-bar">
        <i class="ti ti-sparkles"></i>
        <input type="text" bind:value={searchQuery} on:keydown={handleKeydown} placeholder="CVE-2021-44228" />
        <button class="btn-search" on:click={() => searchVulnerability(searchQuery)} disabled={loading}>
          {loading ? 'กำลังค้นหา…' : 'ค้นหา CVE'}
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
        <div style="font-size: 16px; font-weight: 700; letter-spacing: 0.05em;">กำลังอ่านข้อมูลจากแหล่งอ้างอิง CVE...</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Parsing CVE records, CVSS vectors, and generating mitigation steps.</div>
      </div>
    {:else if aiBriefing}
      <div class="briefing-card">
        
        <!-- Left Pane: CVSS & Stats -->
        <div class="b-left">
          <div class="cve-id-badge">{aiBriefing.cveId}</div>
          
          {#if aiBriefing.cvss != null}
            <div class="cvss-gauge-wrap">
              <div class="cvss-circle {aiBriefing.severity.toLowerCase()}">
                <div class="cvss-score">{aiBriefing.cvss.toFixed(1)}</div>
                <div class="cvss-lbl" title="คะแนนจากแหล่งอ้างอิง">CVSS</div>
              </div>
            </div>

            <div class="vector-grid">
              <div class="v-box {String(aiBriefing.attackVector).toUpperCase() === 'NETWORK' ? 'danger' : ''}">
                <div class="v-box-lbl">ช่องทางการโจมตี</div>
                <div class="v-box-val">{thaiValue(aiBriefing.attackVector)}</div>
              </div>
              <div class="v-box">
                <div class="v-box-lbl">ความซับซ้อน</div>
                <div class="v-box-val">{thaiValue(aiBriefing.complexity)}</div>
              </div>
              <div class="v-box">
                <div class="v-box-lbl">สิทธิ์ที่ต้องมี</div>
                <div class="v-box-val">{thaiValue(aiBriefing.privileges)}</div>
              </div>
              <div class="v-box">
                <div class="v-box-lbl">การโต้ตอบของผู้ใช้</div>
                <div class="v-box-val">{thaiValue(aiBriefing.userInteraction)}</div>
              </div>
            </div>
          {:else}
            <div style="text-align:center; color:var(--text-muted); padding: 40px 0;">
              <i class="ti ti-chart-radar" style="font-size:40px; opacity:0.3; margin-bottom:10px; display:block;"></i>
              แหล่งอ้างอิงไม่มีคะแนน CVSS สำหรับรายการนี้
            </div>
          {/if}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--border);">
            <div class="v-box-lbl">วันที่เผยแพร่</div>
            <div style="color:var(--text-primary); font-size:13px;">{aiBriefing.published}</div>
            <div class="v-box-lbl" style="margin-top:10px;">หน่วยงานผู้กำหนด CVE</div>
            <div style="color:var(--text-primary); font-size:13px;">{aiBriefing.assigner}</div>
          </div>
        </div>

        <!-- Right Pane: AI Analysis -->
        <div class="b-right">
          
          <div>
            <div class="brief-section-title"><i class="ti ti-robot"></i> {thaiInfo?.status==='ready'?'คำอธิบายภาษาไทย':'คำอธิบายต้นฉบับ — ยังไม่มีคำแปลไทย'}</div>
            <p class="translation-status" role="status">{translationLoading?'กำลังแปลจากต้นฉบับ…':thaiInfo?.status==='ready'?(thaiInfo.source==='official-th'?'ภาษาไทยจากผู้เผยแพร่ CVE':'คำแปลด้วย AI จากต้นฉบับ ควรตรวจทานคำศัพท์และเงื่อนไข'):(thaiInfo?.issue?.message||'ยังไม่ได้แปล คงข้อความต้นฉบับไว้')}
              {#if canTranslate()&&thaiInfo?.status!=='ready'}<button class="btn-search" on:click={()=>translateThai(aiBriefing.cveId)} disabled={translationLoading}>แปลและอธิบายภาษาไทย</button>{/if}
            </p>
            <div class="ai-text">
              {aiBriefing.aiSummary}
            </div>
          </div>

          <details class="cve-original"><summary>ดูคำอธิบายต้นฉบับและแหล่งอ้างอิง</summary><p>{cveData?.siem?.description}</p>
            {#each (cveData?.containers?.cna?.references||[]) as ref}{#if /^https?:\/\//i.test(ref.url)}<p><a href={ref.url} target="_blank" rel="noopener noreferrer">{ref.url}</a></p>{/if}{/each}
          </details>
          <div><div class="brief-section-title">รุ่นที่ได้รับผลกระทบตามต้นฉบับ</div>
            {#each (cveData?.containers?.cna?.affected||[]) as product}<p>{product.vendor} {product.product}</p><ul>{#each product.versions||[] as version}<li>{version.version}{version.lessThan?' < '+version.lessThan:''}{version.lessThanOrEqual?' ≤ '+version.lessThanOrEqual:''} — {version.status==='affected'?'ได้รับผลกระทบ':version.status==='unaffected'?'ไม่ได้รับผลกระทบ':'ไม่ทราบสถานะ'}{#each version.changes||[] as change}<span> · {change.at}: {change.status}</span>{/each}</li>{/each}</ul>{/each}
          </div>
          {#if aiBriefing.affectedInternal}
            <div class="am-i-affected">
              <i class="ti ti-radar aia-icon"></i>
              <div class="aia-text">
                <h4>มี Incident ที่เชื่อมโยงกับ CVE นี้</h4>
                <p>พบหลักฐานที่มีความสัมพันธ์กับ CVE นี้ ต้องตรวจผลิตภัณฑ์ เวอร์ชัน และผลกระทบของเครื่องเป้าหมายเพิ่มเติม ยังไม่ยืนยันว่ามีช่องโหว่หรือถูกเจาะสำเร็จ</p>
              </div>
            </div>
          {/if}

          <div>
            <div class="brief-section-title" style="color: #10b981;"><i class="ti ti-shield-check"></i> แนวทางแก้ไขและลดความเสี่ยง</div>
            <ul class="mitigation-list">
              {#each aiBriefing.mitigation as step}
                <li>{step}</li>
              {/each}
            </ul>
          </div>

          <div>
            <div class="brief-section-title" style="color: #3b82f6;"><i class="ti ti-box"></i> ผลิตภัณฑ์ที่ได้รับผลกระทบ</div>
            <div class="affected-tags">
              {#each aiBriefing.affected as aff}
                <span class="aff-tag">{aff}</span>
              {/each}
            </div>
          </div>

          {#if currentSearchedCveData && currentSearchedCveData.ipsArray && currentSearchedCveData.ipsArray.length > 0}
            <div style="margin-top: 10px;">
              <div class="brief-section-title" style="color: #ef4444;"><i class="ti ti-server"></i> IP ภายในที่มีหลักฐานสัมพันธ์</div>
              <div style="max-height: 120px; overflow-y: auto; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-wrap: wrap; gap: 8px;">
                {#each currentSearchedCveData.ipsArray as ip}
                  <span style="background: var(--bg-panel); border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: #ef4444;">{ip}</span>
                {/each}
              </div>
            </div>
          {/if}
          
          <div style="margin-top: auto; display:flex; gap:10px; padding-top: 20px;">
            <a href="https://nvd.nist.gov/vuln/detail/{aiBriefing.cveId}" target="_blank" class="btn-search" style="background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); box-shadow:none;"><i class="ti ti-external-link"></i> เปิดข้อมูลต้นฉบับบน NVD</a>
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

<ConfirmModal 
  bind:visible={showDeleteConfirm}
  title="ยืนยันการลบประวัติ"
  message="คุณแน่ใจหรือไม่ที่จะลบประวัติการค้นหาจำนวน {selectedHistoryIds.length} รายการ?"
  icon="ti-trash"
  confirmColor="#ef4444"
  confirmText="ลบข้อมูล"
  cancelText="ยกเลิก"
  on:confirm={confirmDeleteHistory}
  on:cancel={() => showDeleteConfirm = false}
/>
</section>
