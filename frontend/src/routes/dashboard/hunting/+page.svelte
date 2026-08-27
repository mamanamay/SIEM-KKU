<svelte:head><title>Threat Hunting - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import { formatEventTime } from '../../../lib/formatTime';
  import { downloadCSV, downloadHTML } from '../../../lib/utils/export';
  import AttackTimeline from '../../../lib/components/AttackTimeline.svelte';

  $: events = $eventsStore;

  // Search state
  let searchIp = '';
  let searchType = '';
  let searchCountry = '';
  let searchSeverity = 'all';
  let dateFrom = '';
  let dateTo = '';
  let queryMode: 'simple' | 'kql' = 'simple';
  let kqlQuery = 'severity="high" AND type="SSH Brute Force" | stats count by ip';
  let hasSearched = false;
  let isRunning = false;
  let searchTime = 0;
  let showExportMenu = false;

  // Saved hunts
  let savedHunts = [
    { name: 'SSH Brute Force Surge', query: 'type="SSH Brute Force" | top 10 ip' },
    { name: 'Critical Alerts Today', query: 'severity="critical" AND time>today' },
    { name: 'Top Countries (7d)', query: 'time>7d | stats count by country' },
    { name: 'SQL Injection Hunt', query: 'type="SQL Inject" | stats count by ip, country' },
  ];

  $: results = (() => {
    if (!hasSearched) return [];
    return events.filter(e => {
      if (searchIp && !(e.ip || '').toLowerCase().includes(searchIp.toLowerCase())) return false;
      if (searchType && !(e.type || '').toLowerCase().includes(searchType.toLowerCase())) return false;
      if (searchCountry && !(e.country || '').toLowerCase().includes(searchCountry.toLowerCase())) return false;
      if (searchSeverity !== 'all' && e.severity !== searchSeverity) return false;
      if (dateFrom) {
        const t = new Date(e.createdAt || e.time || 0).getTime();
        if (t < new Date(dateFrom).getTime()) return false;
      }
      if (dateTo) {
        const t = new Date(e.createdAt || e.time || 0).getTime();
        if (t > new Date(dateTo + 'T23:59:59').getTime()) return false;
      }
      return true;
    });
  })();

  function runHunt() {
    isRunning = true;
    hasSearched = false;
    const start = Date.now();
    setTimeout(() => {
      hasSearched = true;
      searchTime = ((Date.now() - start) / 1000).toFixed(2) as any;
      isRunning = false;
    }, 400);
  }

  function clearSearch() {
    searchIp = ''; searchType = ''; searchCountry = '';
    searchSeverity = 'all'; dateFrom = ''; dateTo = '';
    hasSearched = false;
  }

  function loadSavedHunt(h: typeof savedHunts[0]) {
    queryMode = 'kql';
    kqlQuery = h.query;
  }

  function handleExportCSV() {
    const cols = ['Time', 'IP', 'Country', 'Type', 'Severity'];
    const data = results.map(e => ({ Time: formatEventTime(e.time || e.createdAt), IP: e.ip, Country: e.country || 'Unknown', Type: e.type, Severity: e.severity }));
    downloadCSV(data, cols, 'threat-hunt-results.csv');
    showExportMenu = false;
  }
  function handleExportHTML() {
    const cols = ['Time', 'IP', 'Country', 'Type', 'Severity'];
    const data = results.map(e => ({ Time: formatEventTime(e.time || e.createdAt), IP: e.ip, Country: e.country || 'Unknown', Type: e.type, Severity: e.severity }));
    downloadHTML(data, cols, 'threat-hunt-results.html', 'Threat Hunting Results');
    showExportMenu = false;
  }

  // Pagination
  let page = 1;
  const perPage = 25;
  $: totalPages = Math.ceil(results.length / perPage) || 1;
  $: { if (page > totalPages) page = 1; }
  $: paged = results.slice((page - 1) * perPage, page * perPage);
</script>

<div class="hunt-page">
  <!-- Header -->
  <div class="page-hdr">
    <div class="page-hdr-left">
      <div class="page-icon"><i class="ti ti-binoculars"></i></div>
      <div>
        <h1 class="page-title">Threat Hunting</h1>
        <p class="page-desc">ค้นหา Indicator of Compromise (IoC) เชิงรุก — Simple Search หรือ KQL Query</p>
      </div>
    </div>
    <div class="page-hdr-right">
      {#if hasSearched && results.length > 0}
        <div style="position:relative;">
          <button class="btn-outline" on:click={() => showExportMenu = !showExportMenu}>
            <i class="ti ti-upload"></i> Export <i class="ti ti-chevron-down" style="font-size:11px;"></i>
          </button>
          {#if showExportMenu}
            <div style="position:fixed;inset:0;z-index:49;" on:click={() => showExportMenu=false}></div>
            <div class="exp-drop">
              <button class="exp-item" on:click={handleExportCSV}><i class="ti ti-table"></i> Export CSV</button>
              <button class="exp-item" on:click={handleExportHTML}><i class="ti ti-file-type-html"></i> Export HTML</button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="hunt-body">
    <!-- Left: Query Panel -->
    <div class="hunt-left">
      <!-- Mode Toggle -->
      <div class="card">
        <div class="card-head">
          <div class="mode-toggle">
            <button class="mode-btn" class:active={queryMode === 'simple'} on:click={() => queryMode = 'simple'}>
              <i class="ti ti-search"></i> Simple Search
            </button>
            <button class="mode-btn" class:active={queryMode === 'kql'} on:click={() => queryMode = 'kql'}>
              <i class="ti ti-terminal-2"></i> KQL Query
            </button>
          </div>
        </div>
        <div style="padding:16px;">
          {#if queryMode === 'simple'}
            <div class="form-grid">
              <div class="form-field">
                <label>Source IP</label>
                <input type="text" bind:value={searchIp} placeholder="เช่น 192.168.1.1 หรือ 45.33" />
              </div>
              <div class="form-field">
                <label>ประเภทการโจมตี</label>
                <input type="text" bind:value={searchType} placeholder="เช่น SSH, SQL, Scan" />
              </div>
              <div class="form-field">
                <label>ประเทศต้นทาง</label>
                <input type="text" bind:value={searchCountry} placeholder="เช่น China, Russia" />
              </div>
              <div class="form-field">
                <label>Severity</label>
                <select bind:value={searchSeverity}>
                  <option value="all">ทุกระดับ</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div class="form-field">
                <label>วันที่เริ่มต้น</label>
                <input type="date" bind:value={dateFrom} />
              </div>
              <div class="form-field">
                <label>วันที่สิ้นสุด</label>
                <input type="date" bind:value={dateTo} />
              </div>
            </div>
          {:else}
            <div class="kql-wrap">
              <div class="kql-toolbar">
                <span class="kql-hint">KQL Query</span>
                <span class="kql-hint">Ctrl+Enter to run</span>
              </div>
              <textarea class="kql-input" bind:value={kqlQuery} spellcheck="false"
                on:keydown={(e) => { if (e.ctrlKey && e.key === 'Enter') runHunt(); }}></textarea>
              <div style="margin-top:8px;font-size:11px;color:#94a3b8;">
                ตัวอย่าง: <code>severity="critical" | top 10 ip</code> &nbsp;|&nbsp;
                <code>type="SSH Brute Force" AND country="China"</code>
              </div>
            </div>
          {/if}
          <div class="hunt-actions">
            <button class="btn-primary" on:click={runHunt} disabled={isRunning}>
              {#if isRunning}
                <span class="mini-spin"></span> กำลังค้นหา...
              {:else}
                <i class="ti ti-search"></i> เริ่มค้นหา (Hunt)
              {/if}
            </button>
            <button class="btn-outline" on:click={clearSearch}>
              <i class="ti ti-x"></i> ล้าง
            </button>
          </div>
        </div>
      </div>

      <!-- Saved Hunts -->
      <div class="card" style="margin-top:14px;">
        <div class="card-head"><div class="card-title"><i class="ti ti-bookmark"></i> Saved Hunt Queries</div></div>
        <div style="padding:8px;">
          {#each savedHunts as h}
            <button class="saved-hunt-btn" on:click={() => loadSavedHunt(h)}>
              <i class="ti ti-player-play" style="color:#1d9e75;font-size:12px;"></i>
              <span>{h.name}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Right: Results -->
    <div class="hunt-right">
      {#if !hasSearched}
        <div class="card result-empty">
          <i class="ti ti-binoculars" style="font-size:52px;opacity:0.15;"></i>
          <p>กำหนดเงื่อนไขการค้นหาและกด <strong>เริ่มค้นหา</strong></p>
        </div>
      {:else}
        <div class="card">
          <div class="card-head">
            <div class="card-title">
              <i class="ti ti-list-search"></i>
              ผลลัพธ์: <strong style="color:#1d9e75;">{results.length.toLocaleString()}</strong> รายการ
              <span style="font-size:11px;color:#94a3b8;font-weight:400;">(ใช้เวลา {searchTime}s)</span>
            </div>
          </div>
          <div class="table-wrap">
            <table class="ev-table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>Source IP</th>
                  <th>ประเทศ</th>
                  <th>ประเภท</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {#each paged as e}
                  <tr>
                    <td class="td-time">{formatEventTime(e.time || e.createdAt)}</td>
                    <td class="td-ip">{e.ip}</td>
                    <td>{e.country || '—'}</td>
                    <td>{e.type}</td>
                    <td><span class="sev-badge sev-{e.severity}">{e.severity?.toUpperCase()}</span></td>
                  </tr>
                {:else}
                  <tr><td colspan="5" class="empty-td">ไม่พบข้อมูลที่ตรงกัน</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if totalPages > 1}
            <div class="pagination">
              <button class="pg-btn" on:click={() => page--} disabled={page <= 1}><i class="ti ti-chevron-left"></i></button>
              <span class="pg-info">หน้า {page} / {totalPages}</span>
              <button class="pg-btn" on:click={() => page++} disabled={page >= totalPages}><i class="ti ti-chevron-right"></i></button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .hunt-page { padding: 24px 32px; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
  .page-hdr { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .page-hdr-left { display: flex; align-items: center; gap: 14px; }
  .page-icon { width: 44px; height: 44px; background: rgba(139,92,246,0.12); color: #8b5cf6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .page-title { font-size: 22px; font-weight: 800; color: var(--text-primary, #0f1117); margin: 0 0 4px; }
  .page-desc { font-size: 13px; color: var(--text-secondary, #64748b); margin: 0; }
  .page-hdr-right { display: flex; gap: 8px; }
  .hunt-body { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: start; }
  .card { background: #fff; border: 1px solid #e5e9f0; border-radius: 12px; overflow: hidden; }
  .card-head { padding: 12px 16px; border-bottom: 1px solid #e5e9f0; background: #fafbfc; }
  .card-title { font-size: 13px; font-weight: 700; color: #0f1117; display: flex; align-items: center; gap: 6px; }
  .mode-toggle { display: flex; background: #f1f4f8; border-radius: 8px; padding: 3px; gap: 2px; }
  .mode-btn { padding: 6px 12px; font-size: 12px; font-weight: 600; border: none; background: transparent; border-radius: 6px; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: 0.15s; }
  .mode-btn.active { background: #fff; color: #0f1117; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
  .form-field { display: flex; flex-direction: column; gap: 5px; }
  .form-field label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .form-field input, .form-field select { background: #f8fafc; border: 1px solid #e5e9f0; border-radius: 7px; padding: 8px 10px; font-size: 12.5px; color: #0f1117; outline: none; }
  .form-field input:focus, .form-field select:focus { border-color: #8b5cf6; }
  .kql-wrap { margin-bottom: 14px; }
  .kql-toolbar { display: flex; justify-content: space-between; background: #1e2937; border-radius: 8px 8px 0 0; padding: 8px 12px; }
  .kql-hint { font-size: 11px; font-weight: 600; color: #64748b; }
  .kql-input { width: 100%; min-height: 80px; background: #111827; border: 1px solid #374151; border-top: none; border-radius: 0 0 8px 8px; padding: 12px; font-family: monospace; font-size: 13px; color: #a3e635; resize: vertical; outline: none; box-sizing: border-box; }
  .kql-input code { color: #60a5fa; }
  .hunt-actions { display: flex; gap: 8px; }
  .btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 9px 18px; background: #1d9e75; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; color: #fff; cursor: pointer; }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-outline { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: #fff; border: 1px solid #e5e9f0; border-radius: 8px; font-size: 13px; font-weight: 600; color: #0f1117; cursor: pointer; }
  .btn-outline:hover { border-color: #1d9e75; color: #1d9e75; }
  .saved-hunt-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; background: transparent; border: none; border-radius: 7px; font-size: 12.5px; color: #0f1117; cursor: pointer; text-align: left; transition: 0.12s; }
  .saved-hunt-btn:hover { background: #f1f4f8; }
  .result-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #94a3b8; padding: 60px 20px; text-align: center; }
  .table-wrap { overflow-x: auto; }
  .ev-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .ev-table thead tr { background: #f8fafc; }
  .ev-table th { padding: 9px 14px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.05em; border-bottom: 1px solid #e5e9f0; text-align: left; }
  .ev-table td { padding: 9px 14px; border-bottom: 1px solid #f1f4f8; color: #0f1117; }
  .td-time { font-size: 11.5px; color: #64748b; white-space: nowrap; }
  .td-ip { font-family: monospace; font-weight: 600; }
  .sev-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .sev-critical { background: rgba(220,38,38,0.1); color: #dc2626; }
  .sev-high { background: rgba(234,88,12,0.1); color: #ea580c; }
  .sev-medium { background: rgba(202,138,4,0.1); color: #ca8a04; }
  .sev-low { background: rgba(22,163,74,0.1); color: #16a34a; }
  .empty-td { text-align: center; padding: 32px; color: #94a3b8; }
  .pagination { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-top: 1px solid #e5e9f0; }
  .pg-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid #e5e9f0; border-radius: 6px; background: #fff; cursor: pointer; color: #64748b; }
  .pg-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .pg-info { font-size: 12px; color: #64748b; padding: 0 6px; }
  .exp-drop { position: absolute; top: calc(100% + 6px); right: 0; background: #fff; border: 1px solid #e5e9f0; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); z-index: 50; overflow: hidden; min-width: 170px; }
  .exp-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; font-size: 13px; font-weight: 600; color: #0f1117; background: transparent; border: none; cursor: pointer; }
  .exp-item:hover { background: #f1f4f8; }
  .mini-spin { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 900px) { .hunt-body { grid-template-columns: 1fr; } }
</style>
