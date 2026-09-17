<script>
  import { onMount } from 'svelte';
  import { showNotification } from '../../../../stores/notificationStore';
  import { roleStore, usernameStore } from '../../../../stores/events';
  
  let reports = [];
  let loading = true;
  let previewHtml = null;
  let previewId = null;
  
  async function loadReports() {
    loading = true;
    try {
      const res = await fetch('/api/export/history', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        reports = await res.json();
      }
    } catch {
      showNotification('error', 'Error', 'Failed to load Report History');
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadReports();
  });

  let selectedFilter = 'All';
  $: filteredReports = reports.filter(r => selectedFilter === 'All' || (r.title && r.title.includes(selectedFilter)));

  
  let reportToDelete = null;

  function promptDelete(report) {
    if ($roleStore !== 'admin' && report.exportedBy !== $usernameStore) {
      showNotification('warning', 'Permission Denied', 'คุณสามารถลบได้เฉพาะรายงานของคุณเองเท่านั้น');
      return;
    }
    reportToDelete = report;
  }

  async function confirmDelete() {
    if (!reportToDelete) return;
    const id = reportToDelete.id;
    
    try {
      const res = await fetch(`/api/export/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        showNotification('success', 'Success', 'Report deleted successfully');
        loadReports();
      } else if (res.status === 403) {
        showNotification('error', 'Error', 'คุณสามารถลบได้เฉพาะรายงานของคุณเองเท่านั้น (ยกเว้นแอดมิน)');
      } else {
        showNotification('error', 'Error', 'Failed to delete report');
      }
    } catch {
      showNotification('error', 'Error', 'Error deleting report');
    } finally {
      reportToDelete = null;
    }
  }

  async function viewPreview(id) {
    try {
      const res = await fetch(`/api/export/download/${id}?inline=true`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
      if (res.ok) {
        const text = await res.text();
        previewHtml = text;
        previewId = id;
      }
    } catch {
      showNotification('error', 'Error', 'Failed to load preview');
    }
  }

  function downloadReport() {
    if (previewId) {
      window.open(`/api/export/download/${previewId}?token=${localStorage.getItem('token')}`, '_blank');
    }
  }

</script>

<div class="report-page">
  <div class="page-header-rh">
    <div class="rh-icon"><i class="ti ti-file-report"></i></div>
    <div class="rh-title-text">
        <h2>Report History</h2>
        <p>ประวัติรายงานที่ส่งออกจากระบบ</p>
    </div>
  </div>

  <div class="rh-card">
      <div class="rh-toolbar">
          <div class="rh-count"><i class="ti ti-history"></i> ประวัติรายการ ({filteredReports.length})</div>
          <div class="rh-filter">
              <select class="rh-select" bind:value={selectedFilter}>
                  <option value="All">ทุกประเภท (All)</option>
                  {#each Array.from(new Set(reports.map(r => r.title || 'Unknown Report'))) as type}
                    <option value={type}>{type}</option>
                  {/each}
              </select>
          </div>
      </div>


  
    {#if loading}
      <div class="loading">Loading...</div>
    {:else if filteredReports.length === 0}
      <div class="empty">No reports found matching your filter.</div>
    {:else}
      <table class="siem-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Type</th>
            <th>Format</th>
            <th>Exported By</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredReports as report}
            <tr>
              <td>{new Date(report.generatedAt).toLocaleString()}</td>
              <td><strong><i class="ti ti-report"></i> {report.title}</strong></td>
              <td><span class="type-badge"><i class="ti ti-layout-dashboard"></i> {report.type}</span></td>
              <td><span class="format-badge"><i class="ti ti-file-text"></i> {report.format.toUpperCase()}</span></td>
              <td>{report.exportedBy}</td>
              <td>
  <div style="display: flex; gap: 8px;">
    <button class="btn-sm" on:click={() => viewPreview(report.id)}><i class="ti ti-eye"></i> Preview</button>
    <button class="btn-sm" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); {($roleStore !== 'admin' && report.exportedBy !== $usernameStore) ? 'opacity: 0.5; cursor: not-allowed;' : ''}" on:click={() => promptDelete(report)}><i class="ti ti-trash"></i> Delete</button>
  </div>
</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

{#if reportToDelete}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={() => reportToDelete = null}>
    <div class="modal-content" style="max-width: 400px; height: auto;" on:click|stopPropagation>
      <div class="modal-header" style="border-bottom: none; padding-bottom: 0;">
        <h3 style="color: var(--text-primary);"><i class="ti ti-alert-triangle" style="color: #ef4444; font-size: 24px;"></i> Delete Report</h3>
      </div>
      <div class="modal-body" style="padding: 16px 24px; font-size: 15px; color: var(--text-secondary);">
        Are you sure you want to delete the report <strong>{reportToDelete.title}</strong>? This action cannot be undone.
      </div>
      <div class="modal-header" style="justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--border); border-bottom: none; background: var(--bg-primary);">
        <button class="btn-sm" on:click={() => reportToDelete = null}>Cancel</button>
        <button class="btn-primary" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;" on:click={confirmDelete}>Yes, Delete</button>
      </div>
    </div>
  </div>
{/if}

{#if previewHtml}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={() => previewHtml = null}>
    <div class="modal-content" on:click|stopPropagation>
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 18px;">Report Preview</h3>
        <div style="display: flex; gap: 12px;">
            <button class="btn-primary" on:click={downloadReport} style="display: flex; align-items: center; gap: 6px;"><i class="ti ti-download"></i> Download</button>
            <button class="close-btn" on:click={() => previewHtml = null} style="font-size: 24px; background: none; border: none; cursor: pointer; color: var(--text-secondary);">&times;</button>
        </div>
      </div>
      <div class="modal-body">
        {@html previewHtml}
      </div>
    </div>
  </div>
{/if}



<style>
    .report-page { display: flex; flex-direction: column; gap: 24px; padding: 24px; background: var(--bg-primary); border-radius: 12px; }
    .page-header-rh { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
    .rh-icon { width: 56px; height: 56px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; }
    .rh-title-text h2 { margin: 0; font-size: 24px; color: var(--text-primary); }
    .rh-title-text p { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; }
    
    .rh-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .rh-toolbar { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); }
    .rh-count { font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .rh-select { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary); font-size: 13px; outline: none; }
    
    .siem-table { width: 100%; border-collapse: collapse; }
    .siem-table th { padding: 16px 20px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); border-bottom: 2px solid var(--border); background: var(--bg-primary); }
    .siem-table td { padding: 16px 20px; border-bottom: 1px solid var(--border); color: var(--text-primary); vertical-align: middle; font-size: 14px; transition: background 0.2s; }
    .siem-table tr:hover td { background: rgba(0,0,0,0.02); }
    :global([data-theme="dark"]) .siem-table tr:hover td { background: rgba(255,255,255,0.02); }
    
    .type-badge { background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
    .format-badge { background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
    
    .btn-sm { padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; transition: 0.2s; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
    .btn-sm:hover { background: var(--border); }
    
    .loading, .empty { text-align: center; padding: 48px; color: var(--text-secondary); font-size: 15px; }
    
    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
    .modal-content { background: var(--bg-primary); width: 85%; max-width: 1000px; height: 85vh; border-radius: 16px; padding: 0; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden; border: 1px solid var(--border); }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
    .modal-header h3 { margin: 0; font-size: 18px; color: var(--text-primary); display: flex; align-items: center; gap: 10px; }
    .modal-header-actions { display: flex; gap: 12px; align-items: center; }
    .btn-primary { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
    .btn-primary:hover { background: #2563eb; }
    .close-btn { font-size: 24px; background: none; border: none; cursor: pointer; color: var(--text-secondary); padding: 4px; line-height: 1; border-radius: 4px; transition: 0.2s; }
    .close-btn:hover { background: rgba(0,0,0,0.05); color: var(--text-primary); }
    .modal-body { flex: 1; overflow: auto; padding: 24px; background: #ffffff; color: #000000; }
</style>

