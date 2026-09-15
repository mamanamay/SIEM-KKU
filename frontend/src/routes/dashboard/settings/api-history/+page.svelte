<script>
  import { onMount } from 'svelte';
  import { showNotification } from '../../../../stores/notificationStore';
  
  let logs = [];
  let stats = null;
  let loading = true;
  let page = 1;
  let totalPages = 1;
  
  onMount(async () => {
    try {
      const token = localStorage.getItem('token');
      // Fetch stats
      const statsRes = await fetch('/api/admin/api-logs/stats', { headers: { 'Authorization': `Bearer ${token}` } });
      if (statsRes.ok) stats = await statsRes.json();
      
      // Fetch logs
      await fetchLogs();
    } catch {
      showNotification('error', 'Failed to load API history');
    } finally {
      loading = false;
    }
  });

  async function fetchLogs() {
    loading = true;
    try {
      const res = await fetch(`/api/admin/api-logs?page=${page}&limit=50`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        const data = await res.json();
        logs = data.data || [];
        totalPages = data.meta?.totalPages || 1;
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  function getStatusColor(code) {
    if (code >= 200 && code < 300) return 'success';
    if (code >= 400 && code < 500) return 'warning';
    if (code >= 500) return 'error';
    return 'info';
  }
</script>

<div class="settings-page">
  <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
      <div style="width: 56px; height: 56px; background: rgba(16, 185, 129, 0.1); color: #10b981; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
          <i class="ti ti-api"></i>
      </div>
      <div>
          <h2 style="margin: 0; font-size: 24px; color: var(--text-primary);">API History & Diagnostics</h2>
          <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 14px;">Monitor real-time system API requests, metrics, and outbound logs.</p>
      </div>
  </div>

  {#if stats}
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-title">Total Requests (24h)</div>
      <div class="stat-value">{stats.total24h}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Success Rate</div>
      <div class="stat-value" style="color: {stats.successRate < 95 ? '#ef4444' : '#10b981'}">{stats.successRate}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Avg Response Time</div>
      <div class="stat-value">{stats.avgResponseMs} <span style="font-size:14px;color:var(--text-muted)">ms</span></div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Errors (24h)</div>
      <div class="stat-value" style="color: #ef4444">{stats.errors24h}</div>
    </div>
  </div>
  {/if}

  <div class="card">
    {#if loading && logs.length === 0}
      <div class="loading">Loading API logs...</div>
    {:else if logs.length === 0}
      <div class="empty">No API history found.</div>
    {:else}
      <div class="table-responsive">
        <table class="siem-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Method</th>
              <th>Endpoint / Path</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Client IP</th>
            </tr>
          </thead>
          <tbody>
            {#each logs as log}
              <tr>
                <td style="color:var(--text-muted)">{new Date(log.timestamp).toLocaleString()}</td>
                <td><span class="badge {log.method === 'GET' ? 'method-get' : log.method === 'POST' ? 'method-post' : log.method === 'DELETE' ? 'method-del' : 'method-put'}">{log.method}</span></td>
                <td style="font-family:monospace">{log.path}</td>
                <td>
                  <span class="badge {getStatusColor(log.statusCode)}">
                    {log.statusCode}
                  </span>
                </td>
                <td>{log.durationMs}ms</td>
                <td style="font-family:monospace; color:var(--text-muted)">{log.clientIp || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="pagination">
        <button disabled={page === 1} on:click={() => { page--; fetchLogs(); }}>Prev</button>
        <span>Page {page} of {totalPages}</span>
        <button disabled={page === totalPages} on:click={() => { page++; fetchLogs(); }}>Next</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .settings-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
  .stat-title { color: var(--text-muted); font-size: 12px; text-transform: uppercase; margin-bottom: 8px; font-weight: 600; }
  .stat-value { color: var(--text-primary); font-size: 28px; font-weight: 700; }
  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .table-responsive { overflow-x: auto; }
  .siem-table { width: 100%; border-collapse: collapse; }
  .siem-table th { text-align: left; padding: 16px; background: rgba(0,0,0,0.02); border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; text-transform: uppercase; font-weight: 600; }
  .siem-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); color: var(--text-primary); font-size: 13px; }
  .siem-table tbody tr:hover { background: rgba(0,0,0,0.01); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; text-align: center; min-width: 50px; }
  .badge.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .badge.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .badge.warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  .badge.info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .method-get { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
  .method-post { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .method-del { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .method-put { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
  .loading, .empty { text-align: center; padding: 40px; color: var(--text-muted); }
  .pagination { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-top: 1px solid var(--border); }
  .pagination button { background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
  .pagination span { color: var(--text-muted); font-size: 13px; }
</style>
