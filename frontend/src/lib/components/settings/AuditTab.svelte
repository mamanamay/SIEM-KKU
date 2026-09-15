<script lang="ts">
  import { eventsStore, roleStore, usernameStore } from '../../../stores/events';

  $: currentUser = $usernameStore || 'admin';
  $: currentRole = $roleStore || 'admin';

  // Static audit log (immutable system record)
  let auditLogs = [
    { time: '2026-08-20 10:15:22', user: 'admin', role: 'admin', action: 'Sent password reset link to analyst1', category: 'Account' },
    { time: '2026-08-20 09:42:10', user: 'analyst1', role: 'analyst', action: 'Blocked IP 45.33.32.156 via SOAR manual response', category: 'SOAR' },
    { time: '2026-08-20 09:15:03', user: 'system', role: 'system', action: 'Auto-blocked IP 103.90.23.1 (threshold exceeded: 50+ SSH attempts)', category: 'Auto' },
    { time: '2026-08-19 16:30:05', user: 'admin', role: 'admin', action: 'Updated KKU AI API Key for GPT-4o Integration', category: 'Settings' },
    { time: '2026-08-19 14:22:11', user: 'system', role: 'system', action: 'Auto-archived 500 alerts older than 90 days (retention policy)', category: 'Auto' },
    { time: '2026-08-19 11:05:50', user: 'analyst2', role: 'analyst', action: 'Changed event status to Resolved for incident #1442', category: 'SOAR' },
    { time: '2026-08-19 09:05:00', user: 'admin', role: 'admin', action: 'Logged in successfully from 192.168.1.100 (Chrome/Windows)', category: 'Account' },
    { time: '2026-08-18 17:44:30', user: 'admin', role: 'admin', action: 'Exported PDF report for Critical Alerts (24h)', category: 'Export' },
    { time: '2026-08-18 14:12:00', user: 'analyst1', role: 'analyst', action: 'Ran Threat Hunt query: severity="critical" | top 20 ip', category: 'Hunting' },
    { time: '2026-08-17 08:30:00', user: 'system', role: 'system', action: 'KKUSIEM v3.0 system startup — all services healthy', category: 'System' },
  ];

  let search = '';
  let filterCategory = 'all';

  $: categories = ['all', ...new Set(auditLogs.map(l => l.category))];
  $: filtered = auditLogs.filter(l => {
    if (filterCategory !== 'all' && l.category !== filterCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return l.user.includes(q) || l.action.toLowerCase().includes(q) || l.category.toLowerCase().includes(q);
    }
    return true;
  });

  function catColor(cat: string) {
    const map: Record<string, string> = {
      SOAR: '#dc2626', Auto: '#ea580c', Account: '#3b82f6', Settings: '#8b5cf6',
      Export: '#06b6d4', Hunting: '#10b981', System: '#64748b'
    };
    return map[cat] || '#94a3b8';
  }
  function catBg(cat: string) {
    const map: Record<string, string> = {
      SOAR: 'rgba(220,38,38,0.08)', Auto: 'rgba(234,88,12,0.08)', Account: 'rgba(59,130,246,0.08)',
      Settings: 'rgba(139,92,246,0.08)', Export: 'rgba(6,182,212,0.08)', Hunting: 'rgba(16,185,129,0.08)', System: 'rgba(100,116,139,0.08)'
    };
    return map[cat] || 'rgba(148,163,184,0.08)';
  }
  function roleColor(role: string) {
    if (role === 'admin') return '#3b82f6';
    if (role === 'analyst') return '#10b981';
    return '#8b5cf6';
  }
</script>


<div class="audit-page">
  <!-- Header -->
  <div class="page-hdr">
    <div class="page-hdr-left">
      <div class="page-icon"><i class="ti ti-clipboard-list"></i></div>
      <div>
        <h1 class="page-title">System Audit Trail</h1>
        <p class="page-desc">Immutable log ของกิจกรรมทีม SOC และการเปลี่ยนแปลงระบบทั้งหมด</p>
      </div>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-row">
    <div class="stat-card">
      <i class="ti ti-list stat-icon" style="color:#64748b;"></i>
      <div class="stat-val">{auditLogs.length}</div>
      <div class="stat-lbl">รายการทั้งหมด</div>
    </div>
    {#each categories.filter(c => c !== 'all') as cat}
      <div class="stat-card">
        <i class="ti ti-tag stat-icon" style="color:{catColor(cat)};"></i>
        <div class="stat-val" style="color:{catColor(cat)};">{auditLogs.filter(l => l.category === cat).length}</div>
        <div class="stat-lbl">{cat}</div>
      </div>
    {/each}
  </div>

  <!-- Filter Bar -->
  <div class="filter-bar">
    <div class="filter-search">
      <i class="ti ti-search"></i>
      <input type="text" bind:value={search} placeholder="ค้นหา User, Action, Category..." />
    </div>
    <div class="cat-filters">
      {#each categories as cat}
        <button class="cat-btn" class:active={filterCategory === cat}
          style={filterCategory === cat && cat !== 'all' ? `background:${catBg(cat)};color:${catColor(cat)};border-color:${catColor(cat)};` : ''}
          on:click={() => filterCategory = cat}>
          {cat === 'all' ? 'ทั้งหมด' : cat}
        </button>
      {/each}
    </div>
    <span class="result-count">{filtered.length} รายการ</span>
  </div>

  <!-- Audit Table -->
  <div class="card">
    <div class="table-wrap">
      <table class="audit-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Role</th>
            <th>Category</th>
            <th>Action Performed</th>
          </tr>
        </thead>
        <tbody>
          {#each filtered as log}
            <tr>
              <td class="td-time">{log.time}</td>
              <td class="td-user">{log.user}</td>
              <td><span class="role-badge" style="background:rgba({roleColor(log.role) === '#3b82f6' ? '59,130,246' : roleColor(log.role) === '#10b981' ? '16,185,129' : '139,92,246'},0.1);color:{roleColor(log.role)};">{log.role}</span></td>
              <td><span class="cat-badge" style="background:{catBg(log.category)};color:{catColor(log.category)};">{log.category}</span></td>
              <td class="td-action">{log.action}</td>
            </tr>
          {:else}
            <tr><td colspan="5" class="empty-td"><i class="ti ti-inbox"></i> ไม่พบรายการที่ตรงกัน</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .audit-page { padding: 24px 32px; max-width: 1300px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
  .page-hdr { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
  .page-hdr-left { display: flex; align-items: center; gap: 14px; }
  .page-icon { width: 44px; height: 44px; background: rgba(139,92,246,0.12); color: #8b5cf6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .page-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
  .page-desc { font-size: 13px; color: var(--text-muted); margin: 0; }
  .stats-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .stat-icon { font-size: 18px; }
  .stat-val { font-size: 22px; font-weight: 900; color: var(--text-primary); }
  .stat-lbl { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
  .filter-bar { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .filter-search { display: flex; align-items: center; gap: 7px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; width: 260px; }
  .filter-search input { border: none; background: transparent; outline: none; font-size: 13px; color: var(--text-primary); width: 100%; }
  .filter-search i { color: #94a3b8; }
  .cat-filters { display: flex; gap: 6px; flex-wrap: wrap; }
  .cat-btn { padding: 5px 12px; border: 1px solid var(--border); border-radius: 20px; background: var(--bg-panel); font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; transition: 0.15s; }
  .cat-btn.active { background: var(--bg-secondary); color: var(--text-primary); }
  .result-count { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-left: auto; }
  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .table-wrap { overflow-x: auto; }
  .audit-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .audit-table thead tr { background: var(--bg-secondary); }
  .audit-table th { padding: 10px 14px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
  .audit-table td { padding: 11px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .audit-table tr:hover td { background: var(--bg-secondary); }
  .td-time { font-family: monospace; font-size: 11.5px; color: var(--text-muted); white-space: nowrap; }
  .td-user { font-weight: 700; color: var(--text-primary); }
  .td-action { color: var(--text-primary); max-width: 500px; }
  .role-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .cat-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
  .empty-td { text-align: center; padding: 40px; color: #94a3b8; font-size: 13px; }
</style>
