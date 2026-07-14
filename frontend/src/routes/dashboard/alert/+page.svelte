<script>
    import { eventsStore } from '../../../stores/events';
    import ExportPreviewModal from '$lib/components/ExportPreviewModal.svelte';
    let selectedRange = 'all';
    
    $: getTimeLimit = (range) => {
        if (range === 'all') return 0;
        const now = Date.now();
        const Day = 86400000;
        switch(range) {
            case '1h': return now - 3600000;
            case '6h': return now - 21600000;
            case '24h': return now - 86400000;
            case '1m': return now - (30 * Day);
            case '3m': return now - (90 * Day);
            case '6m': return now - (180 * Day);
            case '1y': return now - (365 * Day);
            default: return 0;
        }
    };

    $: timeLimit = getTimeLimit(selectedRange);
    
    $: alerts = $eventsStore.filter(e => {
        if (e.severity !== 'critical' && e.severity !== 'high') return false;
        if (selectedRange !== 'all') {
            const rawTime = e.createdAt || e.timestamp || e.time;
            const eventTime = rawTime ? new Date(rawTime).getTime() : 0;
            return eventTime >= timeLimit;
        }
        return true;
    });

    // Pagination
    let currentPage = 1;
    const itemsPerPage = 30;

    $: totalPages = Math.ceil(alerts.length / itemsPerPage) || 1;
    $: {
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;
    }
    $: paginatedAlerts = alerts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    function prevPage() { if (currentPage > 1) currentPage--; }
    function nextPage() { if (currentPage < totalPages) currentPage++; }

    function formatDate(ms) {
        if (ms === 0) return "";
        const d = new Date(ms);
        return d.toLocaleDateString('en-GB') + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }

    $: displayTime = selectedRange === 'all' ? "ทั้งหมด (All Time)" : formatDate(timeLimit) + " - " + formatDate(Date.now());

    import { downloadCSV, downloadPDF } from '$lib/utils/export';

    let showExportModal = false;
    let showToast = false;
    function handleExport(e) {
      const { format, selectedColumns, filteredData } = e.detail;

      if (format === 'csv') {
        downloadCSV(filteredData, selectedColumns, 'alert_logs.csv');
      } else if (format === 'pdf') {
        downloadPDF(filteredData, selectedColumns, 'alert_logs.pdf', 'KKUSIEM - Critical Alerts Report');
      }
      
      showExportModal = false;
      showToast = true;
      setTimeout(() => showToast = false, 3000);
    }

    $: fullExportData = (alerts || []).map(alert => ({
      "Time": alert.time || alert.timeStr || formatDate(alert.createdAt),
      "Source IP": alert.ip,
      "Country": alert.country || 'Unknown',
      "Alert Rule": alert.type,
      "Severity": alert.severity,
      "Action Taken": 'Blocked/Alerted',
      "Threat Score": alert.threatScore || 80,
      "Target/Destination": alert.path || 'Internal Network'
    }));
  </script>
  <div class="al-page">
    <!-- Header -->
    <div class="ds-card-head" style="margin-bottom:0">
      <div>
        <div class="ds-card-title"><i class="ti ti-bell-ringing"></i> Alert Log</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Showing <strong style="color:var(--text-primary)">{alerts.length}</strong> critical / high severity alerts &bull; {displayTime}</div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="ds-btn" on:click={() => {}}><i class="ti ti-refresh"></i> Refresh</button>
        <button class="ds-btn primary" on:click={() => showExportModal = true}><i class="ti ti-download"></i> Export Report</button>
      </div>
    </div>

    <!-- Time Range Filter -->
    <div class="al-filter">
      <span class="al-filter-label">Time Range:</span>
      <div class="al-range-btns">
        {#each ['1h','6h','24h','1m','3m','6m','1y','all'] as r}
          <button class="al-range-btn {selectedRange === r ? 'active' : ''}" on:click={() => selectedRange = r}>
            {r === 'all' ? 'ทั้งหมด' : r}
          </button>
        {/each}
      </div>
    </div>

    <!-- Table -->
    <div class="ds-card" style="padding:0;overflow:hidden;">
      <div class="ds-table-wrap">
        <table class="ds-table">
          <thead>
            <tr>
              <th style="width: 15%;">Date &amp; Time</th>
              <th style="width: 15%;">Source IP</th>
              <th style="width: 35%;">Alert Rule</th>
              <th style="width: 15%;">Severity</th>
              <th style="width: 20%; text-align:right;">Action</th>
            </tr>
          </thead>
          <tbody>
            {#each paginatedAlerts as alert}
            <tr>
              <td class="ds-mono">{alert.time || alert.timeStr}</td>
              <td><span class="ds-mono" style="font-weight:600">{alert.ip}</span></td>
              <td>{alert.type}</td>
              <td>
                <span class="ds-badge {alert.severity === 'critical' ? 'red' : 'orange'}">
                  <i class="ti ti-alert-triangle"></i> {alert.severity}
                </span>
              </td>
              <td style="text-align:right;">
                <a href="/dashboard/investigate?ip={alert.ip}&time={alert.createdAt || alert.timestamp || alert.time}" class="ds-btn sm">
                  <i class="ti ti-search"></i> Investigate
                </a>
              </td>
            </tr>
            {/each}
            {#if paginatedAlerts.length === 0}
            <tr><td colspan="5"><div class="ds-empty"><i class="ti ti-bell-off"></i>No critical / high alerts found</div></td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      {#if totalPages > 1}
      <div class="ds-pagination">
        <span class="ds-pagination-info">แสดง {(currentPage-1)*itemsPerPage+1}–{Math.min(currentPage*itemsPerPage, alerts.length)} จาก {alerts.length} รายการ</span>
        <div class="ds-pagination-btns">
          <button class="ds-page-btn" on:click={prevPage} disabled={currentPage === 1}>
            <i class="ti ti-chevron-left"></i> Previous
          </button>
          <span class="ds-page-info">Page {currentPage} / {totalPages}</span>
          <button class="ds-page-btn" on:click={nextPage} disabled={currentPage === totalPages}>
            Next <i class="ti ti-chevron-right"></i>
          </button>
        </div>
      </div>
      {/if}
    </div>
  </div>

  <ExportPreviewModal 
    show={showExportModal} 
    title="Critical Alerts" 
    columns={["Time", "Source IP", "Country", "Alert Rule", "Severity", "Action Taken", "Threat Score", "Target/Destination"]}
    data={fullExportData}
    ipColumn="Source IP"
    on:close={() => showExportModal = false}
    on:confirm={handleExport}
  />

  <div class="toast {showToast ? 'show' : ''}">
    <i class="ti ti-check" style="color:var(--green)"></i>
    <span>Export Successful</span>
  </div>

  <style>
.al-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 2rem;
}
.al-filter {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  box-shadow: var(--shadow-sm);
}
.al-filter-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.al-range-btns {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.al-range-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  padding: 5px 13px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.18s;
}
.al-range-btn:hover { background: var(--bg-secondary); border-color: var(--green); color: var(--green); }
.al-range-btn.active { background: var(--green); color: #fff; border-color: var(--green); }
</style>
