<script lang="ts">
  import { onMount } from "svelte";
  import { eventsStore } from "../../../stores/events";
  import ReportWizard from "../../components/ReportWizard.svelte";
  import ReportPreviewDrawer from "./ReportPreviewDrawer.svelte";
  import { downloadPDF, downloadHTML, downloadDOCX } from "../../utils/export";
  import { formatEventTime } from "../../formatTime";

  let showWizard = false;
  let previewReport: any = null;
  let showPreview = false;

  // Load history from localStorage
  function loadHistory() {
    try {
      const stored = localStorage.getItem("kkusiem_report_history");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [
      { id: 1, name: "Weekly Executive Summary", date: "2026-08-01 08:00", format: "PDF", author: "System", previewHtml: null },
      { id: 2, name: "Critical Incident Report (July)", date: "2026-07-31 16:30", format: "DOCX", author: "Admin", previewHtml: null },
      { id: 3, name: "Compliance Audit Log", date: "2026-07-28 09:15", format: "HTML", author: "Security Officer", previewHtml: null }
    ];
  }

  let recentReports: any[] = [];

  onMount(() => {
    recentReports = loadHistory();
  });

  function openPreview(report: any) {
    previewReport = report;
    showPreview = true;
  }

  function handleGenerateReport(e: CustomEvent) {
    const { dateRange, minSeverity, format } = e.detail;
    let filtered = $eventsStore;

    if (minSeverity !== "all") {
      const levels = { low: 1, medium: 2, high: 3, critical: 4 };
      const minLevel = levels[minSeverity as keyof typeof levels] || 1;
      filtered = filtered.filter((ev) => {
        const evLevel = levels[(ev.severity || "low") as keyof typeof levels] || 1;
        return evLevel >= minLevel;
      });
    }

    if (dateRange !== "all") {
      const now = Date.now();
      const limits: Record<string, number> = { "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
      const limit = now - (limits[dateRange] || 0);
      filtered = filtered.filter((ev) => {
        const t = ev.time || ev.createdAt || ev.timestamp;
        return t ? new Date(t).getTime() >= limit : true;
      });
    }

    const exportData = filtered.map((e) => ({
      Time: formatEventTime(e.time || e.createdAt || e.timestamp),
      "Source IP": e.ip,
      Country: e.country || "Unknown",
      "Event Type": e.type,
      Severity: e.severity,
      Status: e.status || "NEW",
    }));
    const exportCols = ["Time", "Source IP", "Country", "Event Type", "Severity", "Status"];
    const title = `Security Report - ${new Date().toLocaleDateString()}`;
    const filename = `kkusiem_report_${Date.now()}`;

    if (format === "pdf") downloadPDF(exportData, exportCols, `${filename}.pdf`, title);
    else if (format === "html") downloadHTML(exportData, exportCols, `${filename}.html`, title);
    else if (format === "docx") downloadDOCX(exportData, exportCols, `${filename}.doc`, title);

    const newReport = {
      id: Date.now(),
      name: `Generated Report (${format.toUpperCase()})`,
      date: new Date().toLocaleString("th-TH"),
      format: format.toUpperCase(),
      author: localStorage.getItem("username") || "You",
      previewHtml: null,
    };
    recentReports = [newReport, ...recentReports];
    saveHistory();
  }

  function saveHistory() {
    try {
      localStorage.setItem("kkusiem_report_history", JSON.stringify(recentReports.slice(0, 50)));
    } catch {}
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
      <button class="btn-primary" on:click={() => (showWizard = true)}>
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
                  <button class="btn-ghost" title="Download Again">
                    <i class="ti ti-download"></i>
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

<ReportWizard bind:show={showWizard} on:generate={handleGenerateReport} />
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