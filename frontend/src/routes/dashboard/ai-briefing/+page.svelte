<script lang="ts">
  import { onMount } from 'svelte';
  import { eventsStore } from '../../../stores/events';

  $: events = $eventsStore;

  let briefingText = '';
  let isLoading = false;
  let error = '';
  let mode: 'idle' | 'gemini' | 'rule-based' | 'error' = 'idle';
  let lastGenerated = '';
  let typingText = '';
  let typingInterval: any;

  // ── Computed stats ────────────────────────────────────────────────────────
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
  $: riskColor = stats.critical > 10 ? '#ef4444' : stats.critical > 5 ? '#f97316' : stats.high > 10 ? '#f59e0b' : '#10b981';

  async function generateBriefing() {
    if (events.length === 0) {
      error = 'ยังไม่มีข้อมูล events ในระบบ — รอข้อมูลจาก SIEM';
      return;
    }
    isLoading = true;
    error = '';
    briefingText = '';
    typingText = '';
    clearInterval(typingInterval);

    const date = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    try {
      const res = await fetch('/api/attacks/ai-briefing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ ...stats, date }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      briefingText = data.briefing;
      mode = data.mode;
      lastGenerated = new Date().toLocaleTimeString('th-TH');

      // Typing animation
      let i = 0;
      typingInterval = setInterval(() => {
        if (i < briefingText.length) {
          typingText = briefingText.slice(0, ++i);
        } else {
          clearInterval(typingInterval);
        }
      }, 12);
    } catch (e: any) {
      error = e.message || 'เกิดข้อผิดพลาดในการสร้างสรุป';
      mode = 'error';
    } finally {
      isLoading = false;
    }
  }

  function sevColor(sev: string) {
    if (sev === 'critical') return '#ef4444';
    if (sev === 'high') return '#f97316';
    if (sev === 'medium') return '#f59e0b';
    return '#6b7280';
  }

  onMount(() => {
    // Auto-generate if events exist
    if ($eventsStore.length > 0) generateBriefing();
  });
</script>

<svelte:head>
  <title>AI Daily Briefing | KKUSIEM</title>
</svelte:head>

<div class="brief-wrap">

  <!-- ── Header ──────────────────────────────────────────────────────────── -->
  <div class="brief-header">
    <div class="brief-title">
      <div class="brief-icon"><i class="ti ti-brain"></i></div>
      <div>
        <div class="brief-name">AI Daily Briefing</div>
        <div class="brief-sub">สรุปสถานการณ์ภัยคุกคาม ประจำวันนี้ โดย AI</div>
      </div>
    </div>
    <div class="brief-actions">
      {#if lastGenerated}
        <span class="gen-time"><i class="ti ti-clock"></i> สร้างล่าสุด {lastGenerated}</span>
      {/if}
      <button class="ds-btn primary" on:click={generateBriefing} disabled={isLoading}>
        <i class="ti ti-{isLoading ? 'loader-2' : 'sparkles'}" class:spin={isLoading}></i>
        {isLoading ? 'กำลังสรุป...' : 'สร้างสรุปใหม่'}
      </button>
    </div>
  </div>

  <!-- ── Snapshot KPI Row ───────────────────────────────────────────────── -->
  <div class="kpi-row">
    <div class="kpi-card" style="border-top: 2px solid #6b7280;">
      <div class="kpi-num" style="color:#e8eaf0">{stats.total.toLocaleString()}</div>
      <div class="kpi-lbl">Total Events</div>
    </div>
    <div class="kpi-card" style="border-top: 2px solid #ef4444;">
      <div class="kpi-num" style="color:#ef4444">{stats.critical.toLocaleString()}</div>
      <div class="kpi-lbl">Critical</div>
    </div>
    <div class="kpi-card" style="border-top: 2px solid #f97316;">
      <div class="kpi-num" style="color:#f97316">{stats.high.toLocaleString()}</div>
      <div class="kpi-lbl">High</div>
    </div>
    <div class="kpi-card" style="border-top: 2px solid #3b82f6;">
      <div class="kpi-num" style="color:#3b82f6">{stats.uniqueIPs.toLocaleString()}</div>
      <div class="kpi-lbl">Unique IPs</div>
    </div>
    <div class="kpi-card" style="border-top: 2px solid #8b5cf6;">
      <div class="kpi-num" style="color:#8b5cf6">{stats.uniqueCountries}</div>
      <div class="kpi-lbl">Countries</div>
    </div>
    <div class="kpi-card" style="border-top: 2px solid {riskColor};">
      <div class="kpi-num" style="color:{riskColor};font-size:18px;">{riskLevel}</div>
      <div class="kpi-lbl">Risk Level</div>
    </div>
  </div>

  <!-- ── Main Content ───────────────────────────────────────────────────── -->
  <div class="brief-main">

    <!-- LEFT: AI Briefing Output -->
    <div class="brief-output-wrap">
      <div class="brief-output-head">
        <div class="output-title">
          <i class="ti ti-robot" style="color:var(--green)"></i>
          AI Analysis Report
          {#if mode === 'gemini'}
            <span class="mode-badge gemini"><i class="ti ti-sparkles"></i> Gemini 2.0</span>
          {:else if mode === 'rule-based'}
            <span class="mode-badge rule"><i class="ti ti-code"></i> Rule-based</span>
          {/if}
        </div>
      </div>

      <div class="brief-output">
        {#if isLoading}
          <div class="loading-state">
            <div class="ai-spinner"></div>
            <div class="loading-text">
              <div class="loading-main">กำลังวิเคราะห์ข้อมูล SIEM...</div>
              <div class="loading-sub">ประมวลผล {stats.total} events จาก {stats.uniqueCountries} ประเทศ</div>
            </div>
          </div>
        {:else if error}
          <div class="error-state">
            <i class="ti ti-alert-circle" style="font-size:32px;color:var(--red);"></i>
            <div>{error}</div>
          </div>
        {:else if typingText}
          <div class="brief-text">
            {#each typingText.split('\n') as line}
              {#if line.trim()}
                <p>{line}</p>
              {:else}
                <br>
              {/if}
            {/each}
            {#if typingText.length < briefingText.length}
              <span class="cursor">▌</span>
            {/if}
          </div>
        {:else}
          <div class="idle-state">
            <i class="ti ti-brain" style="font-size:48px;color:var(--green);opacity:0.3;"></i>
            <div class="idle-text">กดปุ่ม "สร้างสรุปใหม่" เพื่อให้ AI วิเคราะห์ข้อมูลภัยคุกคาม</div>
            <div class="idle-sub">รองรับทั้ง Gemini API และ Rule-based engine</div>
          </div>
        {/if}
      </div>
    </div>

    <!-- RIGHT: Stats panels -->
    <div class="brief-right">

      <!-- Top Threat Types -->
      <div class="stat-card">
        <div class="stat-title"><i class="ti ti-target"></i> Top Threat Types</div>
        {#each stats.topTypes as item}
        <div class="stat-row">
          <div class="stat-row-info">
            <div class="stat-row-name">{item.type}</div>
            <div class="stat-bar-wrap"><div class="stat-bar red" style="width:{Math.round(item.count/stats.topTypes[0].count*100)}%"></div></div>
          </div>
          <div class="stat-row-cnt">{item.count}</div>
        </div>
        {/each}
        {#if !stats.topTypes.length}<div class="no-data">ไม่มีข้อมูล</div>{/if}
      </div>

      <!-- Top Countries -->
      <div class="stat-card">
        <div class="stat-title"><i class="ti ti-map-pin"></i> Top Source Countries</div>
        {#each stats.topCountries as item}
        <div class="stat-row">
          <div class="stat-row-info">
            <div class="stat-row-name">{item.country}</div>
            <div class="stat-bar-wrap"><div class="stat-bar orange" style="width:{Math.round(item.count/stats.topCountries[0].count*100)}%"></div></div>
          </div>
          <div class="stat-row-cnt">{item.count}</div>
        </div>
        {/each}
        {#if !stats.topCountries.length}<div class="no-data">ไม่มีข้อมูล</div>{/if}
      </div>

      <!-- Top IPs -->
      <div class="stat-card">
        <div class="stat-title"><i class="ti ti-skull"></i> Top Attacker IPs</div>
        {#each stats.topIPs.slice(0,5) as item, i}
        <div class="stat-row">
          <div class="stat-row-rank">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
          <div class="stat-row-info" style="flex:1;">
            <div class="stat-row-name mono">{item.ip}</div>
            <div class="stat-bar-wrap"><div class="stat-bar blue" style="width:{Math.round(item.count/stats.topIPs[0].count*100)}%"></div></div>
          </div>
          <div class="stat-row-cnt">{item.count}</div>
        </div>
        {/each}
        {#if !stats.topIPs.length}<div class="no-data">ไม่มีข้อมูล</div>{/if}
      </div>

    </div>
  </div>
</div>

<style>
  .brief-wrap {
    display: flex; flex-direction: column; gap: 14px;
    padding-bottom: 2rem;
  }

  /* ── Header ── */
  .brief-header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px;
  }
  .brief-title { display: flex; align-items: center; gap: 14px; }
  .brief-icon {
    width: 48px; height: 48px; border-radius: 12px;
    background: rgba(29,158,117,0.12);
    border: 1px solid rgba(29,158,117,0.3);
    display: flex; align-items: center; justify-content: center;
    font-size: 24px; color: var(--green);
    box-shadow: 0 0 16px rgba(29,158,117,0.15);
  }
  .brief-name { font-size: 20px; font-weight: 800; color: var(--text-primary); }
  .brief-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .brief-actions { display: flex; align-items: center; gap: 10px; }
  .gen-time { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }

  /* ── KPI Row ── */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .kpi-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
    text-align: center;
  }
  .kpi-num { font-size: 26px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
  .kpi-lbl { font-size: 10px; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.08em; }

  /* ── Main Layout ── */
  .brief-main {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 12px;
    min-height: 0;
  }

  /* ── Output ── */
  .brief-output-wrap {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .brief-output-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
  }
  .output-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 700; color: var(--text-primary);
  }
  .mode-badge {
    display: flex; align-items: center; gap: 4px;
    font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
  }
  .mode-badge.gemini { background: rgba(139,92,246,0.1); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.3); }
  .mode-badge.rule { background: rgba(29,158,117,0.1); color: var(--green); border: 1px solid rgba(29,158,117,0.3); }

  .brief-output {
    flex: 1; padding: 24px;
    min-height: 260px;
    display: flex; align-items: flex-start;
  }
  .brief-text {
    font-size: 14px; line-height: 1.9;
    color: var(--text-primary);
    white-space: pre-wrap;
    width: 100%;
  }
  .brief-text p { margin: 0 0 8px; }
  .cursor {
    display: inline-block;
    animation: blink 0.7s step-end infinite;
    color: var(--green);
  }
  @keyframes blink { 0%,100%{opacity:1}50%{opacity:0} }

  .loading-state {
    display: flex; align-items: center; gap: 20px;
    width: 100%;
  }
  .ai-spinner {
    width: 48px; height: 48px; border-radius: 50%;
    border: 3px solid rgba(29,158,117,0.2);
    border-top-color: var(--green);
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to{transform:rotate(360deg)} }
  .loading-main { font-size: 15px; font-weight: 600; color: var(--text-primary); }
  .loading-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

  .error-state, .idle-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; width: 100%; text-align: center;
    color: var(--text-muted); font-size: 14px;
    padding: 32px 0;
  }
  .idle-text { font-size: 15px; color: var(--text-secondary); }
  .idle-sub { font-size: 12px; color: var(--text-muted); }
  .spin { animation: spin 0.8s linear infinite; display: inline-block; }

  /* ── Right Panel ── */
  .brief-right {
    display: flex; flex-direction: column; gap: 10px;
    overflow-y: auto;
  }
  .stat-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 14px;
  }
  .stat-title {
    display: flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--text-muted);
    margin-bottom: 10px;
  }
  .stat-title i { color: var(--green); }
  .stat-row {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 8px;
  }
  .stat-row-rank { font-size: 14px; flex-shrink: 0; }
  .stat-row-info { flex: 1; min-width: 0; }
  .stat-row-name { font-size: 11px; color: var(--text-primary); margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stat-row-name.mono { font-family: 'JetBrains Mono', monospace; }
  .stat-bar-wrap { height: 3px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }
  .stat-bar { height: 100%; border-radius: 2px; transition: width 0.5s; }
  .stat-bar.red    { background: #ef4444; }
  .stat-bar.orange { background: #f97316; }
  .stat-bar.blue   { background: #3b82f6; }
  .stat-row-cnt { font-size: 12px; font-weight: 700; color: var(--text-primary); flex-shrink: 0; }
  .no-data { text-align: center; color: var(--text-muted); font-size: 12px; padding: 8px 0; }

  @media (max-width: 900px) {
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
    .brief-main { grid-template-columns: 1fr; }
  }
</style>
