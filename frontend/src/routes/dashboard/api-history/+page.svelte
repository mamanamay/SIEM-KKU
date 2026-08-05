<script lang="ts">
  import { onMount } from 'svelte';
  import ExportPreviewModal from '../../../lib/components/ExportPreviewModal.svelte';

  // ── State ────────────────────────────────────────────────────────────────────
  let logs: any[] = [];
  let stats: any = null;
  let loading = true;
  let statsLoading = true;
  let error = '';

  // Filters
  let filterMethod = '';
  let filterStatus = '';
  let filterPath = '';
  let filterFrom = '';
  let filterTo = '';
  let currentPage = 1;
  const PAGE_LIMIT = 50;
  let totalPages = 1;
  let totalCount = 0;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // ── Fetch Stats ──────────────────────────────────────────────────────────────
  async function fetchStats() {
    statsLoading = true;
    try {
      const res = await fetch('/api/admin/api-logs/stats', { headers });
      if (res.ok) stats = await res.json();
    } catch (e) { console.error(e); }
    finally { statsLoading = false; }
  }

  // ── Fetch Logs ───────────────────────────────────────────────────────────────
  async function fetchLogs(page = 1) {
    loading = true;
    error = '';
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
      });
      if (filterMethod) params.set('method', filterMethod);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPath)   params.set('path', filterPath);
      if (filterFrom)   params.set('from', filterFrom);
      if (filterTo)     params.set('to', filterTo);

      const res = await fetch(`/api/admin/api-logs?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        logs = data.data || [];
        totalPages = data.meta?.totalPages || 1;
        totalCount = data.meta?.total || 0;
        currentPage = page;
      } else {
        error = 'ไม่สามารถดึงข้อมูลได้ กรุณาลองใหม่อีกครั้ง';
      }
    } catch (e) {
      error = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
    } finally {
      loading = false;
    }
  }

  function applyFilter() { fetchLogs(1); }
  function resetFilter() {
    filterMethod = filterStatus = filterPath = filterFrom = filterTo = '';
    fetchLogs(1);
  }
  
  import { downloadCSV, downloadPDF } from '../../../lib/utils/export';
  let showExportModal = false;
  let showToast = false;
  function handleExport(e: CustomEvent) {
    const { format, selectedColumns, filteredData } = e.detail;

    if (format === 'csv') {
      downloadCSV(filteredData, selectedColumns, 'api_history.csv');
    } else if (format === 'pdf') {
      downloadPDF(filteredData, selectedColumns, 'api_history.pdf', 'KKUSIEM - API History Report');
    } else {
      window.open('/api/admin/api-logs/export', '_blank');
    }
    showExportModal = false;
    showToast = true;
    setTimeout(() => showToast = false, 3000);
  }

  $: fullExportData = (logs || []).map(log => ({
    "Timestamp": formatTime(log.timestamp),
    "Method": log.method,
    "Path": log.path,
    "Status": log.status || log.statusCode,
    "Duration": formatMs(log.duration_ms || log.duration),
    "Client IP": log.ip || log.clientIp || '-',
    "Response Size (Bytes)": log.responseSize || log.contentLength || '-',
    "User Agent": log.userAgent || '-'
  }));

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function methodClass(m: string) {
    return { GET: 'method-get', POST: 'method-post', PATCH: 'method-patch', DELETE: 'method-delete', PUT: 'method-put' }[m] || 'method-other';
  }
  function statusClass(code: number) {
    if (code < 300) return 'status-2xx';
    if (code < 400) return 'status-3xx';
    if (code < 500) return 'status-4xx';
    return 'status-5xx';
  }
  function formatTime(ts: string) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });
  }
  function formatMs(ms: number) {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
  }
  function durClass(ms: number) {
    if (ms == null) return '';
    if (ms < 200) return 'dur-fast';
    if (ms < 1000) return 'dur-ok';
    return 'dur-slow';
  }

  onMount(() => {
    fetchStats();
    fetchLogs(1);
  });
</script>

<div class="ds-page">
  <!-- ── Page Header ─────────────────────────────────────────────────────── -->
  <div class="ds-page-header">
    <div>
      <div class="ds-page-title">
        <i class="ti ti-api"></i>
        ประวัติการเรียก API (API History)
      </div>
      <div class="ds-page-subtitle">ประวัติการเรียก API ทั้งขาเข้าและขาออกของระบบ SIEM</div>
    </div>
    <button class="ds-btn primary" on:click={() => showExportModal = true}>
      <i class="ti ti-download"></i> Export Report
    </button>
  </div>

  <!-- ── KPI Stats ───────────────────────────────────────────────────────── -->
  {#if statsLoading}
    <div class="ds-kpi-row">
      {#each [1,2,3,4] as _}
        <div class="ds-kpi"><div class="ds-kpi-icon blue skeleton-icon"></div><div><div class="skeleton-line" style="width:60px;height:22px;"></div><div class="skeleton-line" style="width:80px;height:12px;margin-top:4px;"></div></div></div>
      {/each}
    </div>
  {:else if stats}
    <div class="ds-kpi-row">
      <div class="ds-kpi border-blue">
        <div class="ds-kpi-icon blue"><i class="ti ti-activity"></i></div>
        <div>
          <div class="ds-kpi-val">{stats.total24h.toLocaleString()}</div>
          <div class="ds-kpi-lbl">คำขอ (24h)</div>
        </div>
      </div>
      <div class="ds-kpi border-green">
        <div class="ds-kpi-icon green"><i class="ti ti-circle-check"></i></div>
        <div>
          <div class="ds-kpi-val">{stats.successRate}%</div>
          <div class="ds-kpi-lbl">อัตราความสำเร็จ</div>
        </div>
      </div>
      <div class="ds-kpi border-orange">
        <div class="ds-kpi-icon orange"><i class="ti ti-clock-bolt"></i></div>
        <div>
          <div class="ds-kpi-val">{stats.avgResponseMs} <span style="font-size:14px;font-weight:500">ms</span></div>
          <div class="ds-kpi-lbl">เวลาตอบสนองเฉลี่ย</div>
        </div>
      </div>
      <div class="ds-kpi border-red">
        <div class="ds-kpi-icon red"><i class="ti ti-alert-hexagon"></i></div>
        <div>
          <div class="ds-kpi-val">{stats.errors24h.toLocaleString()}</div>
          <div class="ds-kpi-lbl">ข้อผิดพลาด (4xx/5xx)</div>
        </div>
      </div>
    </div>

    <!-- Top Endpoints -->
    {#if stats.topEndpoints?.length > 0}
    <div class="ds-card">
      <div class="ds-card-head">
        <div class="ds-card-title"><i class="ti ti-chart-bar"></i> Top Endpoints ที่ถูกเรียกมากสุด (24h)</div>
      </div>
      <div class="top-endpoints">
        {#each stats.topEndpoints as ep}
          <div class="top-ep-row">
            <span class="method-badge {methodClass(ep.method)}">{ep.method}</span>
            <span class="ep-path ds-mono">{ep.path}</span>
            <span class="ep-count">{parseInt(ep.count).toLocaleString()} ครั้ง</span>
            <div class="ep-bar-wrap">
              <div class="ep-bar" style="width: {Math.round((parseInt(ep.count) / parseInt(stats.topEndpoints[0]?.count || 1)) * 100)}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
    {/if}
  {/if}

  <!-- ── Filters ─────────────────────────────────────────────────────────── -->
  <div class="ds-card">
    <div class="ds-card-head">
      <div class="ds-card-title"><i class="ti ti-filter"></i> กรองข้อมูล</div>
      <div style="display:flex;gap:8px">
        <button class="ds-btn sm" on:click={resetFilter}><i class="ti ti-refresh"></i> รีเซ็ต</button>
        <button class="ds-btn sm primary" on:click={applyFilter}><i class="ti ti-search"></i> ค้นหา</button>
      </div>
    </div>
    <div class="filter-grid">
      <div class="filter-field">
        <label>Method</label>
        <select class="ds-select" bind:value={filterMethod}>
          <option value="">ทั้งหมด</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
          <option value="PUT">PUT</option>
        </select>
      </div>
      <div class="filter-field">
        <label>Status Code</label>
        <select class="ds-select" bind:value={filterStatus}>
          <option value="">ทั้งหมด</option>
          <option value="2xx">2xx — สำเร็จ</option>
          <option value="4xx">4xx — Client Error</option>
          <option value="5xx">5xx — Server Error</option>
          <option value="401">401 — Unauthorized</option>
          <option value="404">404 — Not Found</option>
          <option value="500">500 — Internal Error</option>
        </select>
      </div>
      <div class="filter-field">
        <label>Path (ค้นหา)</label>
        <div class="ds-search" style="max-width:100%">
          <i class="ti ti-search"></i>
          <input type="text" bind:value={filterPath} placeholder="/api/attacks/..." class="ds-search-input" on:keydown={(e) => e.key === 'Enter' && applyFilter()} />
        </div>
      </div>
      <div class="filter-field">
        <label>ตั้งแต่วันที่</label>
        <input type="datetime-local" class="ds-select" bind:value={filterFrom} />
      </div>
      <div class="filter-field">
        <label>ถึงวันที่</label>
        <input type="datetime-local" class="ds-select" bind:value={filterTo} />
      </div>
    </div>
  </div>

  <!-- ── Log Table ───────────────────────────────────────────────────────── -->
  <div class="ds-card" style="padding:0;overflow:hidden">
    <div class="table-header-bar" style="display: flex; justify-content: space-between; align-items: center; padding-right: 20px;">
      <div class="ds-card-title" style="margin:0;padding:16px 20px">
        <i class="ti ti-list-details"></i> รายการ API Requests
        {#if !loading}<span style="font-size:11px;font-weight:400;color:var(--text-muted);margin-left:8px">พบ {totalCount.toLocaleString()} รายการ</span>{/if}
      </div>
      <button class="ds-btn primary" on:click={() => showExportModal = true}>
        <i class="ti ti-download"></i> Export Report
      </button>
    </div>

    {#if error}
      <div class="ds-empty"><i class="ti ti-wifi-off"></i>{error}</div>
    {:else if loading}
      <div class="ds-empty"><div class="load-spinner"></div><span>กำลังโหลดข้อมูล...</span></div>
    {:else if logs.length === 0}
      <div class="ds-empty"><i class="ti ti-inbox"></i>ยังไม่มีประวัติ API ในช่วงเวลานี้</div>
    {:else}
      <div class="ds-table-wrap" style="border:none;border-radius:0">
        <table class="ds-table">
          <thead>
            <tr>
              <th>#</th>
              <th>เวลา</th>
              <th>Method</th>
              <th>Path / Endpoint</th>
              <th>Status</th>
              <th>Client IP</th>
              <th>Role</th>
              <th>เวลาตอบสนอง</th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log}
              <tr>
                <td style="color:var(--text-muted);font-size:12px" class="ds-mono">{log.id}</td>
                <td class="ds-mono" style="white-space:nowrap;font-size:13px">{formatTime(log.timestamp)}</td>
                <td>
                  <span class="method-badge {methodClass(log.method)}">{log.method}</span>
                </td>
                <td>
                  <span class="ds-mono path-cell" title={log.path}>{log.path}</span>
                </td>
                <td>
                  <span class="status-badge {statusClass(log.statusCode)}">{log.statusCode}</span>
                </td>
                <td class="ds-mono" style="font-size:12.5px">{log.clientIp || '—'}</td>
                <td>
                  {#if log.authRole}
                    <span class="ds-badge {log.authRole === 'admin' ? 'green' : 'blue'}">{log.authRole}</span>
                  {:else}
                    <span style="color:var(--text-muted);font-size:12px">—</span>
                  {/if}
                </td>
                <td class="{durClass(log.durationMs)}" style="font-size:13px">{formatMs(log.durationMs)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="ds-pagination">
        <button class="ds-page-btn" on:click={() => fetchLogs(currentPage - 1)} disabled={currentPage === 1}>
          <i class="ti ti-chevron-left"></i> ก่อนหน้า
        </button>
        <div class="ds-pagination-info">หน้า {currentPage} จาก {totalPages}</div>
        <button class="ds-page-btn" on:click={() => fetchLogs(currentPage + 1)} disabled={currentPage === totalPages}>
          ถัดไป <i class="ti ti-chevron-right"></i>
        </button>
      </div>
    {/if}
  </div>
</div>

<ExportPreviewModal 
  show={showExportModal} 
  title="ส่งออกประวัติ API" 
  columns={["Timestamp", "Method", "Path", "Status", "Duration", "Client IP", "Response Size (Bytes)", "User Agent"]}
  data={fullExportData}
  ipColumn="Client IP"
  on:close={() => showExportModal = false}
  on:confirm={handleExport}
/>

<div class="toast {showToast ? 'show' : ''}">
  <i class="ti ti-check" style="color:var(--green)"></i>
  <span>ส่งออกข้อมูลสำเร็จ</span>
</div>

<style>
  /* ── Filter Grid ─────────────────────────────── */
  .filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
  }
  .filter-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .filter-field label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .ds-select { width: 100%; }
  .ds-search-input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.18s;
    /* font-family inherited */
  }
  .ds-search-input:focus { border-color: var(--green); }

  /* ── Method Badges ───────────────────────────── */
  .method-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    /* font-family inherited */
    letter-spacing: 0.04em;
    min-width: 52px;
    text-align: center;
  }
  .method-get    { background: rgba(24,95,165,0.12);  color: #185fa5; }
  .method-post   { background: rgba(29,158,117,0.12); color: #1d9e75; }
  .method-patch  { background: rgba(133,79,11,0.12);  color: #854f0b; }
  .method-delete { background: rgba(163,45,45,0.12);  color: #a32d2d; }
  .method-put    { background: rgba(139,92,246,0.12); color: #8b5cf6; }
  .method-other  { background: var(--bg-secondary);   color: var(--text-muted); }

  /* ── Status Badges ───────────────────────────── */
  .status-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 9px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
  }
  .status-2xx { background: rgba(29,158,117,0.12);  color: #1d9e75; }
  .status-3xx { background: rgba(24,95,165,0.12);   color: #185fa5; }
  .status-4xx { background: rgba(133,79,11,0.12);   color: #854f0b; }
  .status-5xx { background: rgba(163,45,45,0.12);   color: #a32d2d; }

  /* ── Duration Color ──────────────────────────── */
  :global(.dur-fast) { color: #1d9e75 !important; font-weight: 600; }
  :global(.dur-ok)   { color: var(--text-primary) !important; }
  :global(.dur-slow) { color: #a32d2d !important; font-weight: 600; }

  /* ── Path Cell ───────────────────────────────── */
  .path-cell {
    max-width: 280px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    font-size: 12.5px;
  }

  /* ── Top Endpoints ───────────────────────────── */
  .top-endpoints { display: flex; flex-direction: column; gap: 8px; }
  .top-ep-row {
    display: grid;
    grid-template-columns: 60px 1fr 80px 120px;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .top-ep-row:last-child { border-bottom: none; }
  .ep-path { color: var(--text-primary); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ep-count { color: var(--text-secondary); font-size: 12px; text-align: right; font-weight: 600; }
  .ep-bar-wrap { height: 6px; background: var(--bg-secondary); border-radius: 99px; overflow: hidden; }
  .ep-bar { height: 100%; background: var(--green); border-radius: 99px; transition: width 0.5s ease; }

  /* ── Table Header Bar ────────────────────────── */
  .table-header-bar { border-bottom: 1px solid var(--border); }

  /* ── Skeleton ────────────────────────────────── */
  .skeleton-icon { animation: pulse-skeleton 1.5s ease-in-out infinite; }
  .skeleton-line {
    background: var(--bg-secondary);
    border-radius: 4px;
    animation: pulse-skeleton 1.5s ease-in-out infinite;
  }
  @keyframes pulse-skeleton {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  /* ── Loader ──────────────────────────────────── */
  .load-spinner {
    width: 28px; height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--green);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
