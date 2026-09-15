<script>
  import { onMount } from 'svelte';
  import { showNotification } from '../../../../stores/notificationStore';
  
  let logs = [];
  let loading = true;
  
  onMount(async () => {
    try {
      const res = await fetch('/api/admin/audit-logs', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        const data = await res.json();
        // Show API-related activities
        logs = (data.data || []).filter(l => 
          l.action.includes('INTEGRATION') || 
          l.category === 'AI' || 
          l.category === 'API' ||
          l.action === 'AI_ANALYSIS' ||
          l.action === 'CVE_LOOKUP'
        );
      }
    } catch {
      showNotification('error', 'Failed to load API history');
    } finally {
      loading = false;
    }
  });
</script>

<div class="settings-page">
  <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
      <div style="width: 56px; height: 56px; background: rgba(16, 185, 129, 0.1); color: #10b981; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
          <i class="ti ti-api"></i>
      </div>
      <div>
          <h2 style="margin: 0; font-size: 24px; color: var(--text-primary);">API History</h2>
          <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 14px;">Monitor outbound integration requests and connectivity tests.</p>
      </div>
  </div>

  <div class="card">
    {#if loading}
      <div class="loading">Loading...</div>
    {:else if logs.length === 0}
      <div class="empty">No API history found.</div>
    {:else}
      <table class="siem-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Integration</th>
            <th>Status</th>
            <th>User</th>
            <th>IP Address</th>
          </tr>
        </thead>
        <tbody>
          {#each logs as log}
            <tr>
              <td>{new Date((log.time || '').replace(' ', 'T')).toLocaleString()}</td>
              <td>{log.category || 'Unknown'}</td>
              <td>
                <span class="badge" class:success={log.status === 'SUCCESS'} class:error={log.status === 'FAILED'}>
                  {log.status}
                </span>
              </td>
              <td>{log.user || 'System'}</td>
              <td>{log.ip || '-'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .settings-page { padding: 24px; max-width: 1000px; margin: 0 auto; }
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 24px; color: var(--text-primary); margin: 0 0 8px 0; }
  .page-header p { color: var(--text-secondary); margin: 0; font-size: 14px; }
  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
  .siem-table { width: 100%; border-collapse: collapse; }
  .siem-table th { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; text-transform: uppercase; }
  .siem-table td { padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-primary); font-size: 13px; }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .badge.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .loading, .empty { text-align: center; padding: 40px; color: var(--text-muted); }
</style>
