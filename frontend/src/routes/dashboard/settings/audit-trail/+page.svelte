<script>
  import { onMount } from 'svelte';
  import { showNotification } from '../../../../stores/notificationStore';
  
  let logs = [];
  $: filteredLogs = logs.filter(l => (activeFilter === 'All' || (l.category || 'System') === activeFilter) && (!searchQuery || l.action.toLowerCase().includes(searchQuery.toLowerCase()) || (l.user || '').toLowerCase().includes(searchQuery.toLowerCase()) || (l.category || '').toLowerCase().includes(searchQuery.toLowerCase())));
  let loading = true;
  let activeFilter = 'All';
  let searchQuery = '';
  
  onMount(async () => {
    try {
      const res = await fetch('/api/admin/audit-logs', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        const result = await res.json();
        logs = result.data || [];
      }
    } catch {
      showNotification('error', 'Failed to load Audit Trail');
    } finally {
      loading = false;
    }
  });
</script>

<div class="audit-page">
  <div class="page-header-at">
    <div class="at-icon"><i class="ti ti-clipboard-list"></i></div>
    <div class="at-title-text">
        <h2>System Audit Trail</h2>
        <p>Immutable log ของกิจกรรมกับ SOC และการเปลี่ยนแปลงระบบทั้งหมด</p>
    </div>
  </div>

  <div class="kpi-badges">
      <div class="k-badge c-hunting" class:active={activeFilter === "Hunting"} on:click={() => activeFilter = "Hunting"} style="cursor:pointer;"><i class="ti ti-tag"></i> {logs.filter(l => l.resource === 'Hunting').length} <span class="kb-lbl">HUNTING</span></div>
      <div class="k-badge c-system" class:active={activeFilter === "System"} on:click={() => activeFilter = "System"} style="cursor:pointer;"><i class="ti ti-tag"></i> {logs.filter(l => l.resource === 'System').length} <span class="kb-lbl">SYSTEM</span></div>
  </div>

  <div class="filter-bar">
      <div class="search-box">
          <i class="ti ti-search"></i>
          <input type="text" bind:value={searchQuery} placeholder="ค้นหา User, Action, Category..." />
      </div>
      <div class="filter-chips">
          <button class="f-chip" class:active={activeFilter === 'All'} on:click={() => activeFilter = 'All'}>ทั้งหมด</button>
          <button class="f-chip" class:active={activeFilter === 'Account'} on:click={() => activeFilter = 'Account'}>Account</button>
          <button class="f-chip" class:active={activeFilter === 'SOAR'} on:click={() => activeFilter = 'SOAR'}>SOAR</button>
          <button class="f-chip" class:active={activeFilter === 'Auto'} on:click={() => activeFilter = 'Auto'}>Auto</button>
          <button class="f-chip" class:active={activeFilter === 'Settings'} on:click={() => activeFilter = 'Settings'}>Settings</button>
          <button class="f-chip" class:active={activeFilter === 'Export'} on:click={() => activeFilter = 'Export'}>Export</button>
          <button class="f-chip" class:active={activeFilter === 'Hunting'} on:click={() => activeFilter = 'Hunting'}>Hunting</button>
          <button class="f-chip" class:active={activeFilter === 'System'} on:click={() => activeFilter = 'System'}>System</button>
      </div>
      <div class="total-right">{logs.length} รายการ</div>
  </div>


  <div class="card-at">
    {#if loading}
      <div class="loading">Loading...</div>
    {:else if filteredLogs.length === 0}
      <div class="empty">No audit logs found.</div>
    {:else}
      <table class="audit-table">
        <thead>
          <tr>
            <th>TIMESTAMP</th>
            <th>USER</th>
            <th>ROLE</th>
            <th>CATEGORY</th>
            <th>ACTION PERFORMED</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredLogs as log}
            <tr>
              <td class="td-time">{new Date((log.time || '').replace(' ', 'T')).toLocaleString('en-GB').replace(',', '')}</td>
              <td class="td-user">{log.user || 'system'}</td>
              <td><span class="role-badge {(log.role || 'unknown').toLowerCase()}">{(log.role || 'UNKNOWN').toUpperCase()}</span></td>
              <td><span class="cat-text c-{(log.category || 'System').toLowerCase()}">{log.category || 'System'}</span></td>
              <td class="td-action">{log.action}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .settings-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .page-header { margin-bottom: 24px; }
  .page-header h2 { font-size: 24px; color: var(--text-primary); margin: 0 0 8px 0; }
  .page-header p { color: var(--text-secondary); margin: 0; font-size: 14px; }
  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 20px; overflow-x: auto; }
  .siem-table { width: 100%; border-collapse: collapse; min-width: 800px; }
  .siem-table th { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-size: 12px; text-transform: uppercase; }
  .siem-table td { padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-primary); font-size: 13px; }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
  .badge.error { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
  .loading, .empty { text-align: center; padding: 40px; color: var(--text-muted); }

        .audit-page {
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: var(--bg-panel);
        color: var(--text-primary);
        padding: 24px;
        border-radius: 12px;
        border: 1px solid var(--border);
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }

    .page-header-at {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .at-icon {
        width: 48px;
        height: 48px;
        background: rgba(139, 92, 246, 0.1);
        color: #8b5cf6;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
    }

    .at-title-text h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--text-primary);
    }

    .at-title-text p {
        margin: 4px 0 0 0;
        font-size: 13px;
        color: var(--text-secondary);
    }

    .kpi-badges {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
    }

    .k-badge {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        padding: 10px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 20px;
        font-weight: 800;
    }

    .kb-lbl {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--text-secondary);
        margin-left: 4px;
    }

    .k-badge.total { color: var(--text-primary); }
    .k-badge.total i { color: var(--text-secondary); }

    .k-badge.c-account i { color: #3b82f6; }
    .k-badge.c-soar i { color: #ef4444; }
    .k-badge.c-auto i { color: #f59e0b; }
    .k-badge.c-settings i { color: #8b5cf6; }
    .k-badge.c-export i { color: #06b6d4; }
    .k-badge.c-hunting i { color: #10b981; }
    .k-badge.c-system i { color: #64748b; }

    .filter-bar {
        display: flex;
        align-items: center;
        gap: 16px;
        background: var(--bg-panel);
        border: 1px solid var(--border);
        padding: 12px 16px;
        border-radius: 8px;
    }

    .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg-primary);
        border: 1px solid var(--border);
        padding: 8px 12px;
        border-radius: 20px;
        width: 250px;
    }

    .search-box input {
        background: transparent;
        border: none;
        color: var(--text-primary);
        outline: none;
        font-size: 13px;
        width: 100%;
    }

    .filter-chips {
        display: flex;
        gap: 8px;
        flex: 1;
    }

    .f-chip {
        background: transparent;
        border: 1px solid var(--border);
        color: var(--text-secondary);
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 13px;
        cursor: pointer;
        transition: 0.2s;
    }

    .f-chip.active, .f-chip:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
    }

    .total-right {
        font-size: 13px;
        color: var(--text-secondary);
    }

    .card-at {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
    }

    .audit-table {
        width: 100%;
        border-collapse: collapse;
    }

    .audit-table th {
        text-align: left;
        padding: 14px 16px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--text-secondary);
        border-bottom: 2px solid var(--border);
        background: var(--bg-secondary);
    }

    .audit-table td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
        font-size: 13px;
        color: var(--text-primary);
    }

    .audit-table tr:hover td {
        background: rgba(0,0,0,0.02);
    }
    :global([data-theme="dark"]) .audit-table tr:hover td {
        background: rgba(255,255,255,0.02);
    }

    .td-time { color: var(--text-secondary); }
    .td-user { font-weight: 600; color: var(--text-primary); }
    .td-action { color: var(--text-primary); }

    .role-badge {
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.5px;
    }

    .role-badge.admin { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .role-badge.analyst { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .role-badge.system { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .role-badge.guest { background: rgba(100, 116, 139, 0.15); color: #cbd5e1; }
    .role-badge.unknown { background: rgba(100, 116, 139, 0.15); color: #cbd5e1; }

    
    .cat-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 700;
        background: rgba(255, 255, 255, 0.05);
    }
    .act-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        background: rgba(148, 163, 184, 0.1);
    }

    .cat-text {
        font-size: 12px;
        font-weight: 700;
    }

    
    .c-account { color: #3b82f6; }
    .c-soar { color: #ef4444; }
    .c-auto { color: #f59e0b; }
    .c-settings { color: #8b5cf6; }
    .c-export { color: #06b6d4; }
    .c-hunting { color: #10b981; }
    .c-system { color: #64748b; }
    .c-user { color: #3b82f6; }

    .k-badge.c-account { background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.2); }
    .k-badge.c-soar { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); }
    .k-badge.c-auto { background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.2); }
    .k-badge.c-settings { background: rgba(139, 92, 246, 0.1); border-color: rgba(139, 92, 246, 0.2); }
    .k-badge.c-export { background: rgba(6, 182, 212, 0.1); border-color: rgba(6, 182, 212, 0.2); }
    .k-badge.c-hunting { background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2); }
    .k-badge.c-system { background: rgba(100, 116, 139, 0.1); border-color: rgba(100, 116, 139, 0.2); }
    .k-badge.total { background: rgba(255, 255, 255, 0.05); color: #fff; }


</style>


