<svelte:head><title>Threat Monitor - KKUSIEM</title></svelte:head>
<script lang="ts">
  import { goto } from '$app/navigation';
  import { eventsStore } from '../../../stores/events';
  import ExportReportBtn from '../../../lib/components/ExportReportBtn.svelte';
  import AiAnalysisBlock from '../../../lib/components/AiAnalysisBlock.svelte';

  // Toggle mode
  let mode: 'logs' | 'alerts' = 'alerts'; // 'logs' = All logs, 'alerts' = High/Critical

  let selectedRange = 'all';
  let searchText = '';
  let activeStatus = 'all';

  $: getTimeLimit = (range: string) => {
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
  
  $: filteredEvents = $eventsStore.filter(e => {
      // 1. Mode filter
      if (mode === 'alerts' && e.severity !== 'critical' && e.severity !== 'high') return false;
      
      // 2. Time filter
      if (selectedRange !== 'all') {
          const rawTime = e.createdAt || e.timestamp || e.time;
          const eventTime = rawTime ? new Date(rawTime).getTime() : 0;
          if (eventTime < timeLimit) return false;
      }

      // 3. Search text
      const q = searchText.toLowerCase();
      const textOk = !q || (e.ip && e.ip.includes(q)) || (e.type && e.type.toLowerCase().includes(q)) || (e.detail && e.detail.toLowerCase().includes(q));
      if (!textOk) return false;

      // 4. Status (for all logs)
      if (mode === 'logs' && activeStatus !== 'all' && e.status !== activeStatus) return false;

      return true;
  });

  // Pagination
  let currentPage = 1;
  const itemsPerPage = 30;

  $: totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
  $: {
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
  }
  $: paginatedEvents = filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  function prevPage() { if (currentPage > 1) currentPage--; }
  function nextPage() { if (currentPage < totalPages) currentPage++; }

  let expandedRows = new Set<number>();
  function toggleRow(i: number) {
    if (expandedRows.has(i)) { expandedRows.delete(i); } else { expandedRows.add(i); }
    expandedRows = expandedRows;
  }

  let isRefreshing = false;
  function refreshLogs() {
    isRefreshing = true;
    const prev = selectedRange;
    selectedRange = '';
    setTimeout(() => { selectedRange = prev; currentPage = 1; isRefreshing = false; }, 400);
  }

  function formatDate(ms: number) {
      if (ms === 0) return "";
      const d = new Date(ms);
      return d.toLocaleDateString('en-GB') + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  $: displayTime = selectedRange === 'all' ? "ทั้งหมด (All Time)" : formatDate(timeLimit) + " - " + formatDate(Date.now());

  // Export data (for ExportReportBtn - same format as other pages)
  $: exportData = filteredEvents.map(event => ({
    "Time": event.time || event.timeStr || formatDate(event.createdAt),
    "Source IP": event.ip,
    "Country": event.country || 'Unknown',
    "Event Type": event.type,
    "Severity": event.severity,
    "Status": event.status || 'NEW',
    "Target/Destination": event.path || 'Internal Network'
  }));

  const exportColumns = ["Time", "Source IP", "Country", "Event Type", "Severity", "Status", "Target/Destination"];
</script>




<div class="monitor-page">
  <!-- Header & Mode Toggle -->
  <div class="ds-card-head" style="margin-bottom:0">
    <div style="display: flex; align-items: center; gap: 16px;">
      <div class="ds-card-title">
        <i class="ti {mode === 'alerts' ? 'ti-bell-ringing' : 'ti-list-search'}"></i> 
        Threat Monitor
      </div>
      
      <!-- Mode Toggle -->
      <div class="mode-toggle">
        <button class="toggle-btn {mode === 'alerts' ? 'active alert-mode' : ''}" on:click={() => { mode = 'alerts'; currentPage = 1; expandedRows.clear(); }}>
          <i class="ti ti-alert-triangle"></i> Critical Alerts
        </button>
        <button class="toggle-btn {mode === 'logs' ? 'active' : ''}" on:click={() => { mode = 'logs'; currentPage = 1; expandedRows.clear(); }}>
          <i class="ti ti-list"></i> All Logs
        </button>
      </div>
    </div>
    
    <div style="display: flex; gap: 8px; align-items: center;">
      <button class="ds-btn" on:click={refreshLogs} disabled={isRefreshing}>
        <i class="ti ti-refresh" style={isRefreshing ? 'animation: spin 0.6s linear infinite;' : ''}></i>
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
      <ExportReportBtn
        data={exportData}
        columns={exportColumns}
        title={mode === 'alerts' ? 'Critical Alerts Report' : 'Security Logs Report'}
        filename={mode === 'alerts' ? 'alert-logs' : 'security-logs'}
      />
    </div>

  </div>
  
  <div style="font-size:12px;color:var(--text-muted); padding: 0 16px;">
    Showing <strong style="color:var(--text-primary)">{filteredEvents.length}</strong> {mode === 'alerts' ? 'critical/high alerts' : 'security events'} &bull; {displayTime}
  </div>

  <!-- Filters -->
  <div class="monitor-filter">
    <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; flex: 1;">
      <span class="filter-label">Time:</span>
      <div class="range-btns">
        {#each ['1h','6h','24h','1m','3m','6m','1y','all'] as r}
          <button class="range-btn {selectedRange === r ? 'active' : ''}" on:click={() => { selectedRange = r; currentPage = 1; }}>
            {r === 'all' ? 'ทั้งหมด' : r}
          </button>
        {/each}
      </div>
      
      {#if mode === 'logs'}
        <div style="width: 1px; height: 24px; background: var(--border); margin: 0 8px;"></div>
        <span class="filter-label">Status:</span>
        <select class="ds-select" bind:value={activeStatus} style="width: 120px;">
          <option value="all">All Status</option>
          <option value="NEW">New</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="BLOCKED">Blocked</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      {/if}
    </div>
    
    <div class="search-box">
      <i class="ti ti-search search-icon"></i>
      <input type="text" class="search-input" bind:value={searchText} placeholder="ค้นหา IP, ประเภท, รายละเอียด...">
    </div>
  </div>

  <!-- Table -->
  <div class="ds-card" style="padding:0;overflow:hidden;">
    <div class="ds-table-wrap">
      <table class="ds-table">
        <thead>
          <tr>
            <th style="width: 36px"></th>
            <th style="width: 15%;">Date &amp; Time</th>
            <th style="width: 15%;">Source IP</th>
            <th style="width: 30%;">Event Type</th>
            <th style="width: 15%;">Severity</th>
            {#if mode === 'logs'}
              <th style="width: 15%;">Status</th>
            {/if}
            <th style="width: {mode === 'logs' ? '10%' : '25%'}; text-align:right;">Action</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedEvents as event, i}
          <tr class="log-row {expandedRows.has(i) ? 'expanded' : ''}" on:click={() => toggleRow(i)} style="cursor:pointer; transition: background 0.15s;">
            <td class="expand-icon"><i class="ti {expandedRows.has(i) ? 'ti-chevron-down' : 'ti-chevron-right'}" style="color:var(--text-secondary)"></i></td>
            <td class="ds-mono">{event.time || event.timeStr}</td>
            <td><span class="ds-mono" style="font-weight:600">{event.ip}</span></td>
            <td>{event.type}</td>
            <td>
              <span class="ds-badge {event.severity === 'critical' ? 'red' : event.severity === 'high' ? 'orange' : event.severity === 'medium' ? 'yellow' : 'green'}">
                {#if event.severity === 'critical' || event.severity === 'high'}<i class="ti ti-alert-triangle"></i>{/if} {event.severity}
              </span>
            </td>
            
            {#if mode === 'logs'}
              <td>
                <span class="ds-badge outline {event.status === 'BLOCKED' ? 'red' : event.status === 'RESOLVED' ? 'green' : 'gray'}">{event.status || 'NEW'}</span>
              </td>
            {/if}

            <td style="text-align:right;">
              <button class="ds-btn sm" on:click|stopPropagation={() => goto(`/dashboard/soar?ip=${event.ip}&time=${event.createdAt || event.timestamp || event.time}`)}>
                <i class="ti ti-zoom-in"></i> Investigate
              </button>
            </td>
          </tr>
          {#if expandedRows.has(i)}
          <tr class="details-row">
            <td colspan={mode === 'logs' ? 7 : 6} style="padding: 0 !important; border-bottom: 1px solid var(--border);">
              <div style="padding: 14px 20px 20px; background: var(--bg-panel); box-shadow: inset 0 3px 6px rgba(0,0,0,0.02);">
                <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">
                  <strong>Detail:</strong> {event.detail || '-'} <br>
                  <strong>Country:</strong> {event.country || 'Unknown'} <br>
                  <strong>Payload:</strong> <span class="ds-mono" style="font-size: 12px;">{event.payload || event.detail || '-'}</span>
                </div>
                {#if event.severity === 'high' || event.severity === 'critical'}
                  <AiAnalysisBlock {event} />
                {/if}
              </div>
            </td>
          </tr>
          {/if}
          {/each}
          
          {#if paginatedEvents.length === 0}
          <tr><td colspan={mode === 'logs' ? 7 : 6}><div class="ds-empty"><i class="ti ti-inbox"></i> No events found</div></td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    {#if totalPages > 1}
    <div class="ds-pagination">
      <span class="ds-pagination-info">แสดง {(currentPage-1)*itemsPerPage+1}–{Math.min(currentPage*itemsPerPage, filteredEvents.length)} จาก {filteredEvents.length} รายการ</span>
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



<style>
.monitor-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

/* Mode Toggle */
.mode-toggle {
  display: flex;
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 3px;
  border: 1px solid var(--border);
}
.toggle-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px 14px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.toggle-btn:hover { color: var(--text-primary); }
.toggle-btn.active {
  background: var(--bg-panel);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border);
}
.toggle-btn.active.alert-mode {
  color: var(--orange);
}

/* Filters */
.monitor-filter {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  box-shadow: var(--shadow-sm);
}
.filter-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  flex-shrink: 0;
}
.range-btns {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.range-btn {
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
.range-btn:hover { background: var(--bg-secondary); border-color: var(--green); color: var(--green); }
.range-btn.active { background: var(--green); color: #fff; border-color: var(--green); }

.search-box {
  position: relative;
  width: 280px;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}
.search-input {
  width: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  padding: 8px 12px 8px 36px;
  border-radius: 8px;
  font-size: 13px;
  transition: all 0.2s;
}
.search-input:focus { outline: none; border-color: var(--green); box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1); }

.log-row:hover { background: var(--bg-secondary) !important; }
.log-row.expanded { background: var(--bg-secondary) !important; border-left: 3px solid var(--green); }
</style>
