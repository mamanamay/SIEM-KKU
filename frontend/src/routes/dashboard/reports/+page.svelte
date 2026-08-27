<svelte:head>
  <title>Reports - KKUSIEM</title>
</svelte:head>

<script lang="ts">
  import { eventsStore } from '../../../stores/events';
  import ReportWizard from '../../../lib/components/ReportWizard.svelte';
  import { downloadPDF, downloadHTML, downloadDOCX } from '../../../lib/utils/export';
  import { formatEventTime } from '../../../lib/formatTime';

  let showWizard = false;
  
  let recentReports = [
    { id: 1, name: 'Weekly Executive Summary', date: '2026-08-01 08:00', format: 'PDF', author: 'System' },
    { id: 2, name: 'Critical Incident Report (July)', date: '2026-07-31 16:30', format: 'DOCX', author: 'Admin' },
    { id: 3, name: 'Compliance Audit Log', date: '2026-07-28 09:15', format: 'HTML', author: 'Security Officer' }
  ];
  
  function handleGenerateReport(e: CustomEvent) {
    const { dateRange, minSeverity, format } = e.detail;
    
    // Filter events
    let filtered = $eventsStore;
    
    if (minSeverity !== 'all') {
      const levels = { low: 1, medium: 2, high: 3, critical: 4 };
      const minLevel = levels[minSeverity as keyof typeof levels] || 1;
      filtered = filtered.filter(ev => {
        const evLevel = levels[(ev.severity || 'low') as keyof typeof levels] || 1;
        return evLevel >= minLevel;
      });
    }
    
    if (dateRange !== 'all') {
      const now = Date.now();
      const limits: Record<string, number> = { '24h': 86400000, '7d': 604800000, '30d': 2592000000 };
      const limit = now - (limits[dateRange] || 0);
      filtered = filtered.filter(ev => {
        const t = ev.time || ev.createdAt || ev.timestamp;
        return t ? new Date(t).getTime() >= limit : true;
      });
    }
    
    const exportData = filtered.map(e => ({
      'Time': formatEventTime(e.time || e.createdAt || e.timestamp),
      'Source IP': e.ip,
      'Country': e.country || 'Unknown',
      'Event Type': e.type,
      'Severity': e.severity,
      'Status': e.status || 'NEW',
    }));
    const exportCols = ['Time', 'Source IP', 'Country', 'Event Type', 'Severity', 'Status'];
    
    const title = `Security Report - ${new Date().toLocaleDateString()}`;
    const filename = `kkusiem_report_${Date.now()}`;
    
    if (format === 'pdf') downloadPDF(exportData, exportCols, `${filename}.pdf`, title);
    else if (format === 'html') downloadHTML(exportData, exportCols, `${filename}.html`, title);
    else if (format === 'docx') downloadDOCX(exportData, exportCols, `${filename}.doc`, title);
    
    // Add to recent
    recentReports = [
      { id: Date.now(), name: `Generated Report (${format.toUpperCase()})`, date: new Date().toLocaleString(), format: format.toUpperCase(), author: 'You' },
      ...recentReports
    ];
  }
</script>

<div class="reports-page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-icon" style="background: rgba(0, 212, 255, 0.1); color: var(--cyan);"><i class="ti ti-file-report"></i></div>
      <div>
        <h1 class="page-title">Reports & Export</h1>
        <p class="page-desc">Generate compliance reports and export security logs</p>
      </div>
    </div>
    <div class="page-header-right">
      <button class="btn-primary" on:click={() => showWizard = true}>
        <i class="ti ti-plus"></i> New Report
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><i class="ti ti-history"></i> Recent Reports</div>
    </div>
    <div class="card-body" style="padding: 0;">
      <table class="ds-table">
        <thead>
          <tr>
            <th>Report Name</th>
            <th>Date Generated</th>
            <th>Format</th>
            <th>Author</th>
            <th style="text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody>
          {#each recentReports as report}
            <tr>
              <td style="font-weight: 600; color: var(--cyan);">{report.name}</td>
              <td style="color: var(--text-muted);">{report.date}</td>
              <td>
                <span class="badge" style="background: {report.format==='PDF' ? 'rgba(239,68,68,0.1)' : report.format==='HTML' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)'}; color: {report.format==='PDF' ? '#ef4444' : report.format==='HTML' ? '#3b82f6' : '#10b981'};">
                  {report.format}
                </span>
              </td>
              <td>{report.author}</td>
              <td style="text-align:right;">
                <button class="btn-ghost" title="Download Again"><i class="ti ti-download"></i></button>
              </td>
            </tr>
          {/each}
          {#if recentReports.length === 0}
            <tr>
              <td colspan="5" style="text-align:center; padding: 30px; color: var(--text-muted);">
                No reports generated yet.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>

<ReportWizard bind:show={showWizard} on:generate={handleGenerateReport} />

<style>
  .reports-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; display: inline-block; }
  .btn-primary { 
    background: var(--cyan); color: var(--text-primary); border: none; padding: 10px 16px; 
    border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;
  }
  .btn-primary:hover { filter: brightness(1.1); box-shadow: 0 0 10px rgba(0,212,255,0.3); }
</style>
