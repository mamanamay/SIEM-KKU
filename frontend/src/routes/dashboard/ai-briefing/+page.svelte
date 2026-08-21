<svelte:head><title>AI Daily Briefing - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';
  import { downloadCSV, downloadPDF, downloadHTML } from '../../../lib/utils/export';
  import { formatEventTime } from '../../../lib/formatTime';
  import { callKKUAI, KKU_AI_MODELS, getKKUAIKey, getKKUAIModel, setKKUAIModel } from '../../../lib/utils/kkuai';
  import AiKeyModal from '../../../lib/components/AiKeyModal.svelte';


  $: events = $eventsStore;

  let briefingText = '';
  let streamingText = '';
  let isLoading = false;
  let error = '';
  let mode: 'idle' | 'kku-ai' | 'rule-based' | 'error' = 'idle';
  let lastGenerated = '';
  let selectedModel = 'typhoon-v2-70b-instruct';
  let analystNote = '';
  let showExportMenu = false;
  let showAiKeyModal = false;  // shows AiKeyModal when API key is missing


  onMount(() => {
    selectedModel = getKKUAIModel();
  });

  function handleModelChange() {
    setKKUAIModel(selectedModel);
  }

  $: stats = (() => {
    const total = events.length;
    const critical = events.filter(e => e.severity === 'critical').length;
    const high = events.filter(e => e.severity === 'high').length;
    const medium = events.filter(e => e.severity === 'medium').length;
    const uniqueIPs = [...new Set(events.map(e => e.ip))].length;
    const uniqueCountries = [...new Set(events.map(e => e.country).filter(Boolean))].length;
    const typeCounts: Record<string, number> = {};
    events.forEach(e => { typeCounts[e.type] = (typeCounts[e.type] || 0) + 1; });
    const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => ({ type, count }));
    const countryCounts: Record<string, number> = {};
    events.forEach(e => { if (e.country) countryCounts[e.country] = (countryCounts[e.country] || 0) + 1; });
    const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([country, count]) => ({ country, count }));
    const ipCounts: Record<string, number> = {};
    events.forEach(e => { ipCounts[e.ip] = (ipCounts[e.ip] || 0) + 1; });
    const topIPs = Object.entries(ipCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([ip, count]) => ({ ip, count }));
    return { total, critical, high, medium, uniqueIPs, uniqueCountries, topTypes, topCountries, topIPs };
  })();

  $: riskLevel = stats.critical > 10 ? 'วิกฤต' : stats.critical > 5 ? 'สูง' : stats.high > 10 ? 'ปานกลาง' : 'ต่ำ';
  $: riskColor = stats.critical > 10 ? '#dc2626' : stats.critical > 5 ? '#ea580c' : stats.high > 10 ? '#ca8a04' : '#16a34a';

  function buildPrompt(): string {
    const date = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    return `คุณคือนักวิเคราะห์ความปลอดภัยไซเบอร์ (SOC Analyst) อาวุโส สรุปสถานการณ์ภัยคุกคามประจำวันสำหรับทีม SOC ของมหาวิทยาลัยขอนแก่น (KKU) เป็นภาษาไทย

ข้อมูลสถิติวันที่ ${date}:
- เหตุการณ์ทั้งหมด: ${stats.total} รายการ
- วิกฤต: ${stats.critical} | สูง: ${stats.high} | ปานกลาง: ${stats.medium}
- IPs ไม่ซ้ำ: ${stats.uniqueIPs} | ประเทศ: ${stats.uniqueCountries}
- Top Attack Types: ${stats.topTypes.map(t => `${t.type}(${t.count})`).join(', ')}
- Top Countries: ${stats.topCountries.map(c => `${c.country}(${c.count})`).join(', ')}
- Top Source IPs: ${stats.topIPs.map(i => `${i.ip}(${i.count})`).join(', ')}

สรุปในรูปแบบ:
## 📊 สรุปผู้บริหาร
[2-3 ประโยค]

## 🎯 ภัยคุกคามหลักที่พบ
1. [ชื่อภัยคุกคาม]: [คำอธิบาย + สถิติ]
2. ...

## ⚡ การดำเนินการที่แนะนำ
1. [Priority: HIGH/MED] [การดำเนินการ]
2. ...

## 📈 ระดับความเสี่ยงโดยรวม
[สรุประดับ: วิกฤต/สูง/ปานกลาง/ต่ำ และเหตุผล]`;
  }

  async function generateWithKKUAI() {
    const apiKey = getKKUAIKey();
    if (!apiKey) {
      // Show the API key setup modal instead of plain error text
      showAiKeyModal = true;
      return;
    }
    isLoading = true; error = ''; briefingText = ''; streamingText = ''; mode = 'kku-ai';
    try {
      await callKKUAI(apiKey, selectedModel,
        [{ role: 'user', content: buildPrompt() }],
        (chunk) => { streamingText += chunk; }
      );
      briefingText = streamingText;
      lastGenerated = new Date().toLocaleTimeString('th-TH');
    } catch (e: any) {
      error = e.message || 'เกิดข้อผิดพลาดในการเรียก KKU AI API';
      mode = 'error';
    } finally { isLoading = false; }
  }

  // Called by AiKeyModal after the key is saved — retry AI generation automatically
  function onAiKeySaved() {
    generateWithKKUAI();
  }


  function generateRuleBased() {
    isLoading = true; error = ''; mode = 'rule-based';
    setTimeout(() => {
      const date = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      briefingText = `## 📊 สรุปผู้บริหาร\nวันที่ ${date} ระบบ KKUSIEM ตรวจพบเหตุการณ์ทั้งสิ้น **${stats.total} รายการ** ประกอบด้วยระดับวิกฤต ${stats.critical} รายการ และระดับสูง ${stats.high} รายการ มีการโจมตีจาก ${stats.uniqueIPs} IP address ที่ไม่ซ้ำกัน กระจายใน ${stats.uniqueCountries} ประเทศ\n\n## 🎯 ภัยคุกคามหลักที่พบ\n${stats.topTypes.slice(0,3).map((t, i) => `${i+1}. **${t.type}**: พบ ${t.count} ครั้ง`).join('\n')}\n\n## ⚡ การดำเนินการที่แนะนำ\n1. [Priority: HIGH] ตรวจสอบและ Block IP ที่มีการโจมตีสูงสุด\n2. [Priority: HIGH] ทบทวน Alert ระดับ Critical ทั้งหมด ${stats.critical} รายการ\n3. [Priority: MED] อัปเดต Firewall Rules สำหรับประเทศต้นทางหลัก\n\n## 📈 ระดับความเสี่ยงโดยรวม\nระดับความเสี่ยง: **${riskLevel}** — ${stats.critical > 5 ? 'ต้องดำเนินการทันที' : 'อยู่ในระดับที่จัดการได้'}`;
      lastGenerated = new Date().toLocaleTimeString('th-TH');
      isLoading = false;
    }, 600);
  }

  function handleExportHTML() {
    const cols = ['Time', 'Source IP', 'Country', 'Event Type', 'Severity'];
    const data = events.map(e => ({
      'Time': formatEventTime(e.time || e.createdAt),
      'Source IP': e.ip, 'Country': e.country || 'Unknown',
      'Event Type': e.type, 'Severity': e.severity
    }));
    downloadHTML(data, cols, 'ai-daily-briefing.html', 'AI Daily Briefing Report',
      briefingText ? briefingText.substring(0, 300) + '...' : 'ยังไม่ได้สร้างรายงาน');
  }
  function handleExportCSV() {
    const cols = ['Time', 'Source IP', 'Country', 'Event Type', 'Severity'];
    const data = events.map(e => ({ 'Time': formatEventTime(e.time || e.createdAt), 'Source IP': e.ip, 'Country': e.country || 'Unknown', 'Event Type': e.type, 'Severity': e.severity }));
    downloadCSV(data, cols, 'ai-briefing-events.csv');
  }
  function handleExportPDF() {
    const cols = ['Time', 'Source IP', 'Country', 'Event Type', 'Severity'];
    const data = events.map(e => ({ 'Time': formatEventTime(e.time || e.createdAt), 'Source IP': e.ip, 'Country': e.country || 'Unknown', 'Event Type': e.type, 'Severity': e.severity }));
    downloadPDF(data, cols, 'ai-briefing-events.pdf', 'AI Daily Briefing — Source Events');
  }

  function renderMarkdown(text: string): string {
    return text
      .replace(/## (.+)/g, '<h3 class="brief-h3">$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p class="brief-p">')
      .replace(/\n([0-9]+\. )/g, '<br/>$1')
      .replace(/\n/g, '<br/>');
  }

  onMount(() => { if ($eventsStore.length > 0) generateRuleBased(); });
</script>

<!-- KKU AI Key setup modal — shown when API key is missing -->
<AiKeyModal
  show={showAiKeyModal}
  onClose={() => showAiKeyModal = false}
  onSaved={onAiKeySaved}
/>

<div class="brief-page">
  <!-- Header -->
  <div class="brief-header">
    <div class="brief-header-left">
      <div class="brief-icon"><i class="ti ti-brain"></i></div>
      <div>
        <h1 class="brief-title">AI Daily Briefing</h1>
        <p class="brief-desc">รายงานสรุปสถานการณ์ภัยคุกคามประจำวัน สร้างโดย KKU AI Platform</p>
      </div>
    </div>
    <div class="brief-header-right">
      <div class="model-wrap">
        <label class="model-label"><i class="ti ti-cpu"></i> โมเดล AI</label>
        <select class="model-select" bind:value={selectedModel} on:change={handleModelChange}>
          {#each KKU_AI_MODELS as m}
            <option value={m.id}>{m.name} — {m.provider}</option>
          {/each}
        </select>
      </div>
      <div style="position:relative;">
        <button class="btn-outline" on:click={() => showExportMenu = !showExportMenu}>
          <i class="ti ti-upload"></i> Export <i class="ti ti-chevron-down" style="font-size:11px;"></i>
        </button>
        {#if showExportMenu}
          <div style="position:fixed;inset:0;z-index:49;" on:click={() => showExportMenu=false}></div>
          <div class="export-dropdown">
            <button class="export-item" on:click={() => { handleExportCSV(); showExportMenu=false; }}><i class="ti ti-table"></i> Export CSV</button>
            <button class="export-item" on:click={() => { handleExportPDF(); showExportMenu=false; }}><i class="ti ti-file-type-pdf"></i> Export PDF</button>
            <button class="export-item" on:click={() => { handleExportHTML(); showExportMenu=false; }}><i class="ti ti-file-type-html"></i> Export HTML Report</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- KPI Stats Row -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-icon" style="color:var(--text-muted);background:#f1f5f9;"><i class="ti ti-list"></i></div>
      <div class="stat-value">{stats.total.toLocaleString()}</div>
      <div class="stat-label">เหตุการณ์ทั้งหมด</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="color:#dc2626;background:#fef2f2;"><i class="ti ti-alert-octagon"></i></div>
      <div class="stat-value sev-critical">{stats.critical}</div>
      <div class="stat-label">วิกฤต (Critical)</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="color:#ea580c;background:var(--bg-panel)7ed;"><i class="ti ti-alert-triangle"></i></div>
      <div class="stat-value sev-high">{stats.high}</div>
      <div class="stat-label">สูง (High)</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style="color:#3b82f6;background:#eff6ff;"><i class="ti ti-world"></i></div>
      <div class="stat-value">{stats.uniqueIPs}</div>
      <div class="stat-label">IP ไม่ซ้ำ</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon" style:background="rgba(0,0,0,0.05)" style:color={riskColor}><i class="ti ti-shield"></i></div>
      <div class="stat-value" style:color={riskColor}>{riskLevel}</div>
      <div class="stat-label">ระดับความเสี่ยง</div>
    </div>
  </div>

  <!-- 2-Col Body -->
  <div class="brief-body">
    <!-- Main Report Column -->
    <div class="brief-main-col">
      <div class="brief-card">
        <div class="brief-card-head">
          <div class="brief-card-title"><i class="ti ti-report"></i> รายงาน AI ประจำวัน</div>
          {#if lastGenerated}
            <span class="brief-timestamp"><i class="ti ti-clock"></i> สร้างล่าสุด {lastGenerated}</span>
          {/if}
        </div>
        <div class="brief-card-body">
          {#if isLoading}
            <div class="brief-loading">
              <div class="brief-spinner"></div>
              <p>กำลังวิเคราะห์ข้อมูลด้วย {mode === 'kku-ai' ? 'KKU AI Platform' : 'กฎวิเคราะห์อัตโนมัติ'}...</p>
              {#if streamingText}
                <div class="brief-stream">{@html renderMarkdown(streamingText)}</div>
              {/if}
            </div>
          {:else if error}
            <div class="brief-error">
              <i class="ti ti-alert-circle" style="font-size:32px;color:#dc2626;"></i>
              <p>{error}</p>
              {#if error.includes('API Key')}
                <a href="/dashboard/account" class="btn-primary" style="margin-top:8px;text-decoration:none;">
                  <i class="ti ti-key"></i> ตั้งค่า KKU AI API Key
                </a>
              {/if}
            </div>
          {:else if briefingText}
            <div>
              {#if mode === 'kku-ai'}
                <div class="ai-badge kku"><i class="ti ti-sparkles"></i> สร้างโดย KKU AI Platform ({KKU_AI_MODELS.find(m => m.id === selectedModel)?.name})</div>
              {:else}
                <div class="ai-badge rule"><i class="ti ti-robot"></i> สร้างโดยกฎวิเคราะห์อัตโนมัติ</div>
              {/if}
              <div class="brief-text">{@html renderMarkdown(briefingText)}</div>
              {#if analystNote}
                <div class="analyst-note"><strong><i class="ti ti-pencil"></i> บันทึก Analyst:</strong><br>{analystNote}</div>
              {/if}
            </div>
          {:else}
            <div class="brief-empty">
              <i class="ti ti-brain" style="font-size:52px;opacity:0.15;"></i>
              <p>กดปุ่มด้านล่างเพื่อสร้างรายงาน</p>
            </div>
          {/if}
        </div>
        <div class="brief-card-foot">
          <button class="btn-primary" on:click={generateWithKKUAI} disabled={isLoading}>
            {#if isLoading && mode === 'kku-ai'}
              <span class="mini-spin"></span> กำลังวิเคราะห์...
            {:else}
              <i class="ti ti-sparkles"></i> สร้างด้วย KKU AI
            {/if}
          </button>
          <button class="btn-outline" on:click={generateRuleBased} disabled={isLoading}>
            <i class="ti ti-robot"></i> ใช้กฎอัตโนมัติ
          </button>
        </div>
      </div>

      <!-- Analyst Note -->
      <div class="brief-card" style="margin-top:16px;">
        <div class="brief-card-head"><div class="brief-card-title"><i class="ti ti-pencil"></i> บันทึกของ Analyst</div></div>
        <div style="padding:16px;">
          <textarea class="analyst-textarea" bind:value={analystNote}
            placeholder="เพิ่มบันทึก ความเห็น หรือข้อสังเกตส่วนตัวที่นี่..."></textarea>
        </div>
      </div>
    </div>

    <!-- Sidebar: Context Data -->
    <div class="brief-sidebar-col">
      <div class="brief-card">
        <div class="brief-card-head"><div class="brief-card-title"><i class="ti ti-chart-bar"></i> Top Attack Types</div></div>
        <div style="padding:12px 16px;">
          {#each stats.topTypes.slice(0,5) as item}
            <div class="side-row">
              <span class="side-label">{item.type}</span>
              <span class="side-count">{item.count}</span>
            </div>
            <div class="side-bar"><div class="side-fill accent" style="width:{Math.round((item.count / (stats.topTypes[0]?.count||1))*100)}%;"></div></div>
          {:else}
            <p class="no-data">ยังไม่มีข้อมูล</p>
          {/each}
        </div>
      </div>

      <div class="brief-card" style="margin-top:14px;">
        <div class="brief-card-head"><div class="brief-card-title"><i class="ti ti-world"></i> Top Countries</div></div>
        <div style="padding:12px 16px;">
          {#each stats.topCountries.slice(0,5) as item}
            <div class="side-row">
              <span class="side-label">{item.country}</span>
              <span class="side-count">{item.count}</span>
            </div>
            <div class="side-bar"><div class="side-fill red" style="width:{Math.round((item.count / (stats.topCountries[0]?.count||1))*100)}%;"></div></div>
          {:else}
            <p class="no-data">ยังไม่มีข้อมูล</p>
          {/each}
        </div>
      </div>

      <div class="brief-card" style="margin-top:14px;">
        <div class="brief-card-head"><div class="brief-card-title"><i class="ti ti-map-pin"></i> Top Source IPs</div></div>
        <div style="padding:12px 16px;">
          {#each stats.topIPs.slice(0,5) as item}
            <div class="side-row">
              <span class="side-label mono">{item.ip}</span>
              <span class="side-count">{item.count}</span>
            </div>
          {:else}
            <p class="no-data">ยังไม่มีข้อมูล</p>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .brief-page { padding: 24px 32px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  /* Header */
  .brief-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .brief-header-left { display: flex; align-items: center; gap: 14px; }
  .brief-icon { width: 44px; height: 44px; background: rgba(29,158,117,0.12); color: #1d9e75; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .brief-title { font-size: 22px; font-weight: 800; color: var(--text-primary, var(--text-primary)); margin: 0 0 4px; }
  .brief-desc { font-size: 13px; color: var(--text-secondary, var(--text-muted)); margin: 0; }
  .brief-header-right { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
  .model-wrap { display: flex; flex-direction: column; gap: 4px; }
  .model-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, var(--text-muted)); display: flex; align-items: center; gap: 4px; }
  .model-select { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-size: 12px; color: var(--text-primary); cursor: pointer; outline: none; min-width: 230px; }
  .model-select:focus { border-color: #1d9e75; }
  /* Buttons */
  .btn-outline { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; transition: 0.18s; }
  .btn-outline:hover { border-color: #1d9e75; color: #1d9e75; }
  .btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; background: #1d9e75; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; color: var(--bg-panel); cursor: pointer; transition: 0.18s; }
  .btn-primary:hover { background: #15826a; }
  .btn-primary:disabled, .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }
  /* Export dropdown */
  .export-dropdown { position: absolute; top: calc(100% + 6px); right: 0; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); z-index: 50; overflow: hidden; min-width: 190px; }
  .export-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; font-size: 13px; font-weight: 600; color: var(--text-primary); background: transparent; border: none; cursor: pointer; transition: 0.12s; }
  .export-item:hover { background: var(--bg-secondary); }
  /* Stats */
  .stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
  .stat-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 18px 16px; display: flex; flex-direction: column; gap: 8px; }
  .stat-icon { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .stat-value { font-size: 28px; font-weight: 900; color: var(--text-primary, var(--text-primary)); line-height: 1; }
  .sev-critical { color: #dc2626 !important; }
  .sev-high { color: #ea580c !important; }
  .stat-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  /* Body */
  .brief-body { display: grid; grid-template-columns: 1fr 280px; gap: 16px; }
  .brief-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .brief-card-head { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .brief-card-title { font-size: 13px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 7px; }
  .brief-timestamp { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
  .brief-card-body { padding: 20px; min-height: 220px; }
  .brief-card-foot { padding: 14px 18px; border-top: 1px solid var(--border); display: flex; gap: 10px; background: var(--bg-secondary); }
  /* Content states */
  .brief-loading { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-muted); font-size: 13px; padding: 20px; }
  .brief-spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: #1d9e75; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .brief-stream { width: 100%; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 14px; font-size: 13px; line-height: 1.8; color: var(--text-primary); white-space: pre-wrap; text-align: left; }
  .brief-error { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #dc2626; font-size: 13px; padding: 24px; text-align: center; }
  .brief-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-muted); padding: 40px 20px; text-align: center; }
  .brief-text { font-size: 14px; line-height: 1.85; color: var(--text-primary); margin-top: 12px; }
  :global(.brief-h3) { font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 18px 0 8px; padding-left: 10px; border-left: 3px solid #1d9e75; }
  :global(.brief-p) { margin: 0; }
  .ai-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; width: fit-content; }
  .ai-badge.kku { background: rgba(29,158,117,0.1); color: #1d9e75; }
  .ai-badge.rule { background: rgba(100,116,139,0.1); color: var(--text-muted); }
  .analyst-note { background: var(--bg-panel)beb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400e; margin-top: 12px; }
  .analyst-textarea { width: 100%; min-height: 90px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 13px; color: var(--text-primary); resize: vertical; outline: none; font-family: inherit; }
  .analyst-textarea:focus { border-color: #1d9e75; }
  /* Sidebar */
  .side-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
  .side-label { font-size: 12px; color: var(--text-primary); font-weight: 500; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .side-label.mono { font-family: monospace; font-size: 11px; }
  .side-count { font-size: 12px; font-weight: 700; color: var(--text-muted); }
  .side-bar { height: 4px; background: var(--bg-secondary); border-radius: 2px; margin-bottom: 10px; }
  .side-fill { height: 100%; border-radius: 2px; }
  .side-fill.accent { background: #1d9e75; }
  .side-fill.red { background: #dc2626; }
  .no-data { color: var(--text-muted); font-size: 12px; text-align: center; padding: 12px 0; margin: 0; }
  .mini-spin { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: var(--bg-panel); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @media (max-width: 1024px) { .brief-body { grid-template-columns: 1fr; } .stats-row { grid-template-columns: repeat(3, 1fr); } }
</style>
