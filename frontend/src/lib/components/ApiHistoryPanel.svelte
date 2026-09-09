<script lang="ts">
  import { onMount } from 'svelte';
  import { formatEventTime } from '../formatTime';

  let logs: any[] = [];
  let stats: any = null;
  let loading = true;
  let statsLoading = true;
  let error = '';

  let filterMethod = '';
  let filterStatus = '';
  let filterPath = '';
  let filterFrom = '';
  let filterTo = '';
  let currentPage = 1;
  const PAGE_LIMIT = 50;
  let totalPages = 1;
  let totalCount = 0;

  function getHeaders(): Record<string, string> {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : '';
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function fetchStats() {
    statsLoading = true;
    try {
      const res = await fetch('/api/admin/api-logs/stats', { headers: getHeaders() });
      if (res.ok) stats = await res.json();
    } catch (e) { console.error(e); }
    finally { statsLoading = false; }
  }

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

      const res = await fetch(`/api/admin/api-logs?${params}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        logs = data.data || [];
        totalPages = data.meta?.totalPages || 1;
        totalCount = data.meta?.total || 0;
        currentPage = page;
      } else {
        error = 'ไม่สามารถโหลดข้อมูลได้ โปรดลองอีกครั้ง';
      }
    } catch (e) {
      error = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
    } finally {
      loading = false;
    }
  }

  function applyFilter() { fetchLogs(1); }
  function resetFilter() {
    filterMethod = filterStatus = filterPath = filterFrom = filterTo = '';
    fetchLogs(1);
  }

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
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });
  }
  function formatMs(ms: number) {
    if (ms == null) return '-';
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

<div class="api-history-container">
  {#if statsLoading}
    <div class="api-kpi-grid skeleton">
      <div class="kpi-box"><div class="skel" style="width:40px;height:24px;"></div><div class="skel" style="width:70%;height:12px;margin-top:6px;"></div></div>
      <div class="kpi-box"><div class="skel" style="width:40px;height:24px;"></div><div class="skel" style="width:70%;height:12px;margin-top:6px;"></div></div>
      <div class="kpi-box"><div class="skel" style="width:40px;height:24px;"></div><div class="skel" style="width:70%;height:12px;margin-top:6px;"></div></div>
      <div class="kpi-box"><div class="skel" style="width:40px;height:24px;"></div><div class="skel" style="width:70%;height:12px;margin-top:6px;"></div></div>
    </div>
  {:else if stats}
    <div class="api-kpi-grid">
      <div class="kpi-box">
        <div class="kpi-icon" style="color: var(--blue);"><i class="ti ti-activity"></i></div>
        <div class="kpi-data">
          <div class="kpi-val">{stats.total24h.toLocaleString()}</div>
          <div class="kpi-lbl">TOTAL REQUESTS (24H)</div>
        </div>
      </div>
      <div class="kpi-box">
        <div class="kpi-icon" style="color: var(--green);"><i class="ti ti-circle-check"></i></div>
        <div class="kpi-data">
          <div class="kpi-val">{stats.successRate}%</div>
          <div class="kpi-lbl">SUCCESS RATE</div>
        </div>
      </div>
      <div class="kpi-box">
        <div class="kpi-icon" style="color: var(--orange);"><i class="ti ti-clock-bolt"></i></div>
        <div class="kpi-data">
          <div class="kpi-val">{stats.avgResponseMs} <span style="font-size:12px">ms</span></div>
          <div class="kpi-lbl">AVG RESPONSE TIME</div>
        </div>
      </div>
      <div class="kpi-box">
        <div class="kpi-icon" style="color: var(--red);"><i class="ti ti-alert-hexagon"></i></div>
        <div class="kpi-data">
          <div class="kpi-val">{stats.errors24h.toLocaleString()}</div>
          <div class="kpi-lbl">ERRORS (4XX/5XX)</div>
        </div>
      </div>
    </div>
  {/if}

  <div class="panel-head" style="flex-wrap: wrap; gap: 12px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--bg-panel); border-radius: 0;">
    <span class="panel-label"><i class="ti ti-history"></i> ประวัติการเรียก API ({totalCount.toLocaleString()})</span>
    
    <div class="api-filters" style="display: flex; gap: 8px; margin-left: auto; align-items: center;">
      <select class="st-input" bind:value={filterMethod} on:change={applyFilter}>
        <option value="">ทุก Method</option>
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PATCH">PATCH</option>
        <option value="DELETE">DELETE</option>
        <option value="PUT">PUT</option>
      </select>
      
      <select class="st-input" bind:value={filterStatus} on:change={applyFilter}>
        <option value="">ทุก Status</option>
        <option value="2xx">2xx (สำเร็จ)</option>
        <option value="4xx">4xx (Client Error)</option>
        <option value="5xx">5xx (Server Error)</option>
      </select>
      
      <div class="search-box">
        <i class="ti ti-search"></i>
        <input type="text" class="st-input" bind:value={filterPath} placeholder="ค้นหา Endpoint..." on:keydown={(e) => e.key === 'Enter' && applyFilter()} />
      </div>
      
      <button class="btn-sm" on:click={resetFilter} title="รีเซ็ตตัวกรอง"><i class="ti ti-refresh"></i></button>
    </div>
  </div>

  <div class="panel-body" style="padding: 0;">
    {#if error}
      <div class="api-empty"><i class="ti ti-wifi-off"></i> {error}</div>
    {:else if loading}
      <div class="api-empty"><i class="ti ti-loader load-spin"></i> กำลังโหลดข้อมูล...</div>
    {:else if logs.length === 0}
      <div class="api-empty">
        <i class="ti ti-history" style="font-size: 32px; display: block; margin-bottom: 12px; color: var(--text-muted);"></i>
        ยังไม่มีประวัติการเรียกใช้ API ในระบบ
      </div>
    {:else}
      <table class="data-table">
        <thead>
          <tr>
            <th>วันที่/เวลา</th>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Status</th>
            <th>Client IP</th>
            <th>Role</th>
            <th style="text-align: right;">Response Time</th>
          </tr>
        </thead>
        <tbody>
          {#each logs as log}
            <tr>
              <td style="color: var(--text-muted); font-size: 12.5px;">{formatTime(log.timestamp)}</td>
              <td><span class="api-method {methodClass(log.method)}">{log.method}</span></td>
              <td style="font-family: monospace; font-size: 13px;">{log.path}</td>
              <td><span class="api-status {statusClass(log.statusCode)}">{log.statusCode}</span></td>
              <td style="font-family: monospace; font-size: 12.5px; color: var(--text-muted);">{log.clientIp || '-'}</td>
              <td>
                {#if log.authRole}
                  <span class="sev-badge {log.authRole === 'admin' ? 'info' : 'medium'}">{log.authRole}</span>
                {:else}
                  <span style="color: var(--text-muted);">-</span>
                {/if}
              </td>
              <td style="text-align: right; font-family: monospace; font-size: 13px;" class="{durClass(log.durationMs)}">{formatMs(log.durationMs)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      
      <div class="api-pagination">
        <button class="btn-sm" on:click={() => fetchLogs(currentPage - 1)} disabled={currentPage === 1}>
          <i class="ti ti-chevron-left"></i> ก่อนหน้า
        </button>
        <span class="page-info">หน้า {currentPage} จาก {totalPages}</span>
        <button class="btn-sm" on:click={() => fetchLogs(currentPage + 1)} disabled={currentPage === totalPages}>
          ถัดไป <i class="ti ti-chevron-right"></i>
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  * { box-sizing: border-box; }
  .api-history-container {
    display: flex;
    flex-direction: column;
    width: 100%;
  }
  
  .api-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    padding: 20px;
    background: var(--bg-secondary);
  }
  
  .kpi-box {
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--bg-panel);
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  
  .kpi-icon {
    font-size: 24px;
    background: var(--bg-secondary);
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
  }
  
  .kpi-data {
    display: flex;
    flex-direction: column;
  }
  
  .kpi-val {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }
  
  .kpi-lbl {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }
  
  .api-filters {
    display: flex;
    gap: 8px;
    margin-left: auto;
    flex-wrap: wrap;
    align-items: center;
  }
  
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }
  .search-box i {
    position: absolute;
    left: 10px;
    color: var(--text-muted);
    font-size: 14px;
  }
  .search-box .st-input {
    padding-left: 32px;
    width: 220px;
  }
  
  .api-empty {
    padding: 60px 20px;
    text-align: center;
    color: var(--text-muted);
    font-size: 14px;
  }
  
  .load-spin {
    display: inline-block;
    animation: spin 1s linear infinite;
    margin-right: 8px;
  }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  
  .api-method {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 4px;
    font-family: monospace;
    display: inline-block;
    min-width: 50px;
    text-align: center;
  }
  .method-get { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .method-post { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .method-patch { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  .method-delete { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .method-put { background: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
  .method-other { background: var(--bg-secondary); color: var(--text-primary); }
  
  .api-status {
    font-size: 12px;
    font-weight: 700;
    font-family: monospace;
  }
  .status-2xx { color: #10b981; }
  .status-3xx { color: #3b82f6; }
  .status-4xx { color: #f59e0b; }
  .status-5xx { color: #ef4444; }
  
  :global(.dur-fast) { color: #10b981 !important; }
  :global(.dur-ok) { color: var(--text-primary) !important; }
  :global(.dur-slow) { color: #ef4444 !important; font-weight: bold; }
  
  .api-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    padding: 16px;
    border-top: 1px solid var(--border);
  }
  .page-info {
    font-size: 13px;
    color: var(--text-muted);
  }
  
  .skel {
    background: var(--border);
    border-radius: 4px;
    animation: pulse 1.5s infinite ease-in-out;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .data-table { width: 100%; border-collapse: collapse; text-align: left; }
  .data-table th {
    padding: 11px 20px;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
    background: rgba(0,0,0,0.15);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .data-table td {
    padding: 12px 20px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: rgba(255,255,255,0.02); }
  
  .btn-sm {
    padding: 6px 12px; font-size: 12px; font-weight: 600;
    background: var(--bg-secondary); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text-primary); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    transition: all 0.15s;
  }
  .btn-sm:hover { background: var(--border); }
  
  .st-input {
    padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border);
    background: var(--bg-panel); color: var(--text-primary); font-size: 13px;
    height: 32px; outline: none; transition: border-color 0.15s;
  }
  .st-input:focus { border-color: var(--blue); }
  
  .sev-badge {
    padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;
  }
  .sev-badge.info { background: rgba(59,130,246,0.1); color: #3b82f6; }
  .sev-badge.medium { background: rgba(245,158,11,0.1); color: #f59e0b; }

  .panel-head {
    display: flex; align-items: center; padding: 16px 20px;
  }
  .panel-label {
    font-size: 14px; font-weight: 700; color: var(--text-primary);
    display: flex; align-items: center; gap: 8px;
  }
</style>
