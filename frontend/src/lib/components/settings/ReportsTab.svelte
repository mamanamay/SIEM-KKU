<script lang="ts">
      import { onMount } from "svelte";
  import { eventsStore } from "../../../stores/events";
  import ReportPreviewDrawer from "./ReportPreviewDrawer.svelte";
  import { showNotification } from "../../../stores/notificationStore";
  import { openReportWizard } from "../../../stores/globalReportStore";

  let previewReport: any = null;
  let showPreview = false;
  let recentReports: any[] = [];
  let loadingHistory = true;

  onMount(async () => {
    await fetchHistory();
  });

  async function fetchHistory() {
    try {
      loadingHistory = true;
      const token = localStorage.getItem('token');
      const res = await fetch('/api/export/history', {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      if (res.ok) {
        const data = await res.json();
        recentReports = data.map((r: any) => ({
          id: r.id,
          name: r.title,
          date: new Date(r.generatedAt).toLocaleString("th-TH"),
          format: (r.format || "").toUpperCase(),
          author: r.author || r.exportedBy,
          previewHtml: r.summary,
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      loadingHistory = false;
    }
  }

  function openPreview(report: any) {
    previewReport = report;
    showPreview = true;
  }

  function handleNewReport() {
    openReportWizard(
      { pageType: 'general', reportTitle: 'Security Summary Report', allowExecOnly: true },
      {},
      $eventsStore,
      ['Time', 'Source IP', 'Country', 'Event Type', 'Severity', 'Status']
    );
  }

  function formatBadgeColor(fmt: string) {
    if (fmt === "PDF") return { bg: "rgba(239,68,68,0.1)", color: "#ef4444" };
    if (fmt === "HTML") return { bg: "rgba(59,130,246,0.1)", color: "#3b82f6" };
    if (fmt === "CSV") return { bg: "rgba(16,185,129,0.1)", color: "#10b981" };
    return { bg: "rgba(100,116,139,0.1)", color: "#64748b" };
  }
</script>

<div class="reports-page">
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-icon" style="background: rgba(0, 212, 255, 0.1); color: var(--cyan);">
        <i class="ti ti-file-report"></i>
      </div>
      <div>
        <h1 class="page-title">Reports &amp; Export</h1>
        <p class="page-desc">Generate compliance reports and export security logs</p>
      </div>
    </div>
    <div class="page-header-right">
      <button class="btn-primary" on:click={handleNewReport}>
        <i class="ti ti-plus"></i> New Report
      </button>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="card-title"><i class="ti ti-history"></i> Report History</div>
      <div class="card-meta">{recentReports.length} reports</div>
    </div>
    <div class="card-body" style="padding: 0;">
      <table class="ds-table">
        <thead>
          <tr>
            <th>Report Name</th>
            <th>Date Generated</th>
            <th>Format</th>
            <th>Author</th>
            <th style="text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each recentReports as report (report.id)}
            <tr>
              <td style="font-weight: 600; color: var(--cyan);">{report.name}</td>
              <td style="color: var(--text-muted);">{report.date}</td>
              <td>
                {#if report.format}
                  {@const badge = formatBadgeColor(report.format)}
                  <span class="badge" style="background: {badge.bg}; color: {badge.color};">
                    {report.format}
                  </span>
                {/if}
              </td>
              <td>{report.author}</td>
              <td style="text-align:right;">
                <div class="action-btns">
                  <button
                    class="btn-ghost"
                    title="Preview Report"
                    on:click={() => openPreview(report)}
                  >
                    <i class="ti ti-eye"></i>
                  </button>
                </div>
              </td>
            </tr>
          {/each}
          {#if recentReports.length === 0}
            <tr>
              <td colspan="5" style="text-align:center; padding: 40px; color: var(--text-muted);">
                <i class="ti ti-file-off" style="font-size:32px; display:block; margin-bottom:8px; opacity:0.4;"></i>
                No reports generated yet.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
</div>


<ReportPreviewDrawer bind:show={showPreview} report={previewReport} />

<style>
  .reports-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .page-header-left { display: flex; align-items: center; gap: 12px; }
  .page-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
  .page-title { margin: 0; font-size: 22px; font-weight: 700; color: var(--text-primary); }
  .page-desc { margin: 0; font-size: 13px; color: var(--text-muted); }
  .card { background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .card-head { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  .card-title { font-weight: 700; font-size: 15px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
  .card-meta { font-size: 12px; color: var(--text-muted); }
  .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; display: inline-block; }
  .action-btns { display: flex; justify-content: flex-end; gap: 4px; }
  .btn-ghost { background: none; border: none; cursor: pointer; padding: 6px 8px; border-radius: 6px; color: var(--text-muted); font-size: 16px; transition: all 0.15s; }
  .btn-ghost:hover { background: var(--bg-secondary); color: var(--text-primary); }
  .btn-primary {
    background: var(--cyan); color: #fff; border: none; padding: 10px 16px;
    border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;
    display: flex; align-items: center; gap: 6px; font-size: 14px;
  }
  .btn-primary:hover { filter: brightness(1.1); box-shadow: 0 0 10px rgba(0,212,255,0.3); }
</style>


