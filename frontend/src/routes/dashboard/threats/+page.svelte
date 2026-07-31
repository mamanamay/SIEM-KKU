<script lang="ts">
  import { page } from '$app/stores';
  import { eventsStore, roleStore } from '../../../stores/events';

  $: events = $eventsStore;

  let searchText = $page.url.searchParams.get('ip') || '';
  let activeSev = 'all';
  let activeStatus = 'all';

  $: filteredEvents = events.filter(e => {
    const sevOk = activeSev === 'all' || e.severity === activeSev;
    const statusOk = activeStatus === 'all' || e.status === activeStatus;
    const q = searchText.toLowerCase();
    const textOk = !q || (e.ip && e.ip.includes(q)) || (e.type && e.type.toLowerCase().includes(q)) || (e.detail && e.detail.toLowerCase().includes(q));
    return sevOk && statusOk && textOk;
  });

  // Pagination
  let currentPage = 1;
  const itemsPerPage = 30;
  $: totalPages = Math.ceil(filteredEvents.length / itemsPerPage) || 1;
  $: { if (currentPage > totalPages) currentPage = totalPages; if (currentPage < 1) currentPage = 1; }
  $: paginatedEvents = filteredEvents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  function prevPage() { if (currentPage > 1) currentPage--; }
  function nextPage() { if (currentPage < totalPages) currentPage++; }

  // Expanded rows
  let expandedRows = new Set<number>();
  function toggleRow(i: number) {
    if (expandedRows.has(i)) { expandedRows.delete(i); } else { expandedRows.add(i); }
    expandedRows = expandedRows;
  }

  // Status update
  async function updateStatus(id: any, newStatus: string) {
    try {
      await fetch(`/api/attacks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) { console.error(err); }
  }

  function getSessionEvents(sessionId: any) {
    if (!sessionId) return [];
    return events.filter((e: any) => e.sessionId === sessionId).sort((a: any, b: any) => a.id - b.id);
  }

  function getFlagEmoji(country: string) {
    if (country === 'Russia') return '🇷🇺';
    if (country === 'China') return '🇨🇳';
    if (country === 'Brazil') return '🇧🇷';
    if (country === 'United States') return '🇺🇸';
    if (country === 'Local Network') return '🏠';
    return '🌍';
  }

  // ═══════════════════════════════════════════
  // EXPORT MODAL — SELF CONTAINED
  // ═══════════════════════════════════════════
  let showExportModal = false;
  let showToast = false;
  let exportFormat = 'csv';

  const EXPORT_COLUMNS = ["Time", "Source IP", "Country", "Attack Type", "Severity", "Log Source", "Status", "Threat Score", "Tool / Client", "MITRE Tactic", "Payload Details"];
  let selectedColumns: string[] = [...EXPORT_COLUMNS];
  let selectedIps: string[] = [];
  let showIpDropdown = false;
  let ipSearchQuery = '';

  $: exportData = (filteredEvents || []).map((evt: any) => ({
    "Time": evt.time || evt.timeStr,
    "Source IP": evt.ip,
    "Country": evt.country || 'Unknown',
    "Attack Type": evt.type,
    "Severity": evt.severity,
    "Log Source": getLogSource(evt.type),
    "Status": evt.status || 'Opened',
    "Threat Score": evt.threatScore || 50,
    "Tool / Client": evt.clientVersion || '-',
    "MITRE Tactic": evt.mitreCode || '-',
    "Payload Details": evt.detail || '-'
  }));

  function getLogSource(type: string): string {
    if (!type) return 'Firewall Traffic Log';
    const t = type.toLowerCase();
    if (t.startsWith('wazuh:'))                                                return 'Wazuh XDR Agent';
    if (t.includes('sql') || t.includes('xss') || t.includes('web') || t.includes('path')) return 'NGINX Access Log';
    if (t.includes('system compromised') || t.includes('command'))             return 'Server Syslog';
    if (t.includes('ssh') || t.includes('brute') || t.includes('login'))       return 'Cowrie SSH Honeypot';
    return 'Firewall Traffic Log';
  }

  $: availableIps = [...new Set(exportData.map((d: any) => String(d['Source IP'] || '')).filter((ip: string) => ip && ip !== '-' && ip !== 'Unknown'))].sort() as string[];
  $: filteredAvailableIps = availableIps.filter((ip: string) => ip.toLowerCase().includes(ipSearchQuery.toLowerCase()));
  $: filteredExportData = selectedIps.length > 0 ? exportData.filter((d: any) => selectedIps.includes(String(d['Source IP']))) : exportData;
  $: previewData = filteredExportData.slice(0, 3);
  $: totalExportRows = filteredExportData.length;

  function openExportModal() {
    selectedColumns = [...EXPORT_COLUMNS];
    selectedIps = [];
    showIpDropdown = false;
    ipSearchQuery = '';
    exportFormat = 'csv';
    showExportModal = true;
  }

  function closeExportModal() {
    showExportModal = false;
    showIpDropdown = false;
  }

  function toggleColumn(col: string) {
    if (selectedColumns.includes(col)) {
      selectedColumns = selectedColumns.filter(c => c !== col);
    } else {
      selectedColumns = [...selectedColumns, col];
    }
  }

  function toggleIp(ip: string) {
    if (selectedIps.includes(ip)) { selectedIps = selectedIps.filter(i => i !== ip); }
    else { selectedIps = [...selectedIps, ip]; }
  }

  function toggleAllIps() {
    const allSelected = filteredAvailableIps.every(ip => selectedIps.includes(ip));
    if (allSelected) { selectedIps = selectedIps.filter(ip => !filteredAvailableIps.includes(ip)); }
    else { selectedIps = [...new Set([...selectedIps, ...filteredAvailableIps])]; }
  }

  function doCSV(data: any[], cols: string[], filename: string) {
    if (!data.length || !cols.length) return;
    const header = cols.join(',');
    const rows = data.map(row => cols.map(col => {
      let val = String(row[col] ?? '');
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = '"' + val.replace(/"/g, '""') + '"';
      return val;
    }).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }

  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(); s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function doPDF(data: any[], cols: string[], filename: string, title: string) {
    if (!data.length || !cols.length) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF('landscape');
    doc.setFontSize(16); doc.text(title, 14, 20);
    doc.setFontSize(10); doc.setTextColor(100,100,100);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, 14, 28);
    doc.autoTable({
      head: [cols],
      body: data.map(row => cols.map(col => String(row[col] || '—'))),
      startY: 35, theme: 'striped',
      headStyles: { fillColor: [29, 158, 117], textColor: [255,255,255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: [245,248,250] }
    });
    doc.save(filename);
  }

  async function confirmExport() {
    try {
      if (exportFormat === 'csv') {
        doCSV(filteredExportData, selectedColumns, 'security_logs.csv');
      } else {
        await doPDF(filteredExportData, selectedColumns, 'security_logs.pdf', 'KKUSIEM – Security Logs Report');
      }
      closeExportModal();
      showToast = true;
      setTimeout(() => showToast = false, 3000);
    } catch (err: any) {
      alert('Export failed: ' + err.message);
    }
  }
</script>

<div class="logs-page">
  <div class="ds-card">
    <div class="ds-card-head">
      <div class="ds-filters">
        <select bind:value={activeSev} class="ds-select">
          <option value="all">All Severities</option>
          <option value="critical">Critical Only</option>
          <option value="high">High Only</option>
          <option value="medium">Medium Only</option>
          <option value="low">Low Only</option>
        </select>
        <select bind:value={activeStatus} class="ds-select">
          <option value="all">All Statuses</option>
          <option value="Opened">Opened</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed">Closed</option>
        </select>
        <div class="ds-search">
          <i class="ti ti-search"></i>
          <input type="text" bind:value={searchText} placeholder="Search IPs, payloads…" />
        </div>
      </div>
      <button class="ds-btn primary" on:click={openExportModal}>
        <i class="ti ti-download"></i> Export Logs
      </button>
    </div>

    <div class="ds-table-wrap">
      <table class="ds-table">
        <thead>
          <tr>
            <th style="width:36px"></th>
            <th>วันที่ & เวลา</th>
            <th>Source IP</th>
            <th>Attack Type</th>
            <th>Severity</th>
            <th>Log Source</th>
            <th>Status</th>
            <th>Threat Score</th>
          </tr>
        </thead>
        <tbody>
          {#each paginatedEvents as event, i}
          <tr class="log-row {expandedRows.has(i) ? 'expanded' : ''}" on:click={() => toggleRow(i)}>
            <td class="expand-icon"><i class="ti {expandedRows.has(i) ? 'ti-chevron-down' : 'ti-chevron-right'}"></i></td>
            <td class="ds-mono">{event.time || event.timeStr}</td>
            <td>
              <div class="ip-block">
                <span class="flag">{getFlagEmoji(event.country)}</span>
                <span class="ds-mono text-bold">{event.ip}</span>
              </div>
            </td>
            <td><span class="type-badge">{event.type}</span></td>
            <td><span class="sev {event.severity}">{event.severity}</span></td>
            <td>
              {#if event.type?.toLowerCase().startsWith('wazuh:')}
                <span class="ds-badge orange"><i class="ti ti-eye"></i> Wazuh XDR</span>
              {:else if event.type?.includes('SQL') || event.type?.includes('XSS') || event.type?.includes('Web') || event.type?.includes('Path')}
                <span class="ds-badge blue"><i class="ti ti-world"></i> NGINX Access Log</span>
              {:else if event.type?.includes('System Compromised') || event.type?.includes('Command')}
                <span class="ds-badge green"><i class="ti ti-server"></i> Server Syslog</span>
              {:else if event.type?.includes('SSH') || event.type?.includes('Brute') || event.type?.includes('Login')}
                <span class="ds-badge red"><i class="ti ti-terminal-2"></i> Cowrie SSH</span>
              {:else}
                <span class="ds-badge gray"><i class="ti ti-shield"></i> Firewall Log</span>
              {/if}
            </td>
            <td>
              <span class="status-badge {event.status === 'Closed' ? 'closed' : event.status === 'In Progress' ? 'progress' : 'opened'}">
                {event.status || 'Opened'}
              </span>
            </td>
            <td>
              <div class="score-bar">
                <div class="score-fill {event.threatScore > 80 ? 'critical' : event.threatScore > 50 ? 'high' : 'medium'}" style="width: {event.threatScore || 50}%"></div>
                <span class="score-text">{event.threatScore || 50}/100</span>
              </div>
            </td>
          </tr>
          {#if expandedRows.has(i)}
          <tr class="details-row">
            <td colspan="8">
              <div class="details-container">
                <div class="details-grid">
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-fingerprint"></i> Attacker Context</div>
                    <div class="dp-content">
                      <div class="kv"><span class="k">ประเทศ:</span> <span class="v">{event.country || 'Unknown'}</span></div>
                      <div class="kv"><span class="k">Tool:</span> <span class="v ds-mono">{event.clientVersion || 'Unknown'}</span></div>
                      <div class="kv"><span class="k">MITRE:</span> <span class="v badge-mitre">{event.mitreCode || 'T0000'}</span></div>
                    </div>
                  </div>
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-code"></i> Raw Payload</div>
                    <div class="dp-content"><div class="payload-box">{event.detail}</div></div>
                  </div>
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-shield-check"></i> วิธีรับมือ</div>
                    <div class="dp-content">
                      {#if event.severity === 'critical'}
                        <div class="mit-item immediate"><i class="ti ti-alert-triangle"></i> เสี่ยงสูงมาก: บล็อก IP ใน Firewall ทันที</div>
                      {:else if event.severity === 'high'}
                        <div class="mit-item immediate" style="background:var(--orange-bg);color:var(--orange);border-color:rgba(133,79,11,0.2)"><i class="ti ti-alert-circle"></i> เสี่ยงสูง: เฝ้าระวังพฤติกรรม</div>
                      {:else}
                        <div class="mit-item longterm" style="background:var(--blue-bg);color:var(--blue);border-color:rgba(24,95,165,0.2)"><i class="ti ti-info-circle"></i> เสี่ยงต่ำ: สแกนหาช่องโหว่ทั่วไป</div>
                      {/if}
                      <div class="mit-item longterm"><i class="ti ti-shield"></i> ตั้งรหัสผ่านซับซ้อนขึ้น และปิดพอร์ตที่ไม่จำเป็น</div>
                    </div>
                  </div>
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-world-search"></i> IP Reputation</div>
                    <div class="dp-content">
                      <p style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">ตรวจสอบ <strong class="ds-mono">{event.ip}</strong> ในฐานข้อมูลสากล</p>
                      <a href="https://www.virustotal.com/gui/search/{event.ip}" target="_blank" class="btn-vt">
                        <i class="ti ti-shield-search"></i> VirusTotal
                      </a>
                      {#if $roleStore === 'admin'}
                      <div class="admin-status-box">
                        <div class="dp-title" style="margin-bottom:8px;"><i class="ti ti-settings"></i> จัดการสถานะ</div>
                        <select class="ds-select" style="width:100%;" value={event.status || 'Opened'} on:change={(e) => updateStatus(event.id, e.target.value)}>
                          <option value="Opened">🚨 Opened</option>
                          <option value="In Progress">⏳ In Progress</option>
                          <option value="Closed">✅ Closed</option>
                        </select>
                      </div>
                      {/if}
                    </div>
                  </div>
                </div>
                {#if event.sessionId}
                <div class="killchain-panel">
                  <div class="kc-title"><i class="ti ti-route"></i> Session Kill Chain (Timeline)</div>
                  <div class="kc-timeline">
                    {#each getSessionEvents(event.sessionId) as se}
                      <div class="kc-item {se.id === event.id ? 'active' : ''}">
                        <div class="kc-time">{se.time || se.timeStr}</div>
                        <div class="kc-dot {se.severity}"></div>
                        <div class="kc-content">
                          <div class="kc-type">{se.type}</div>
                          <div class="kc-detail">{se.detail}</div>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
                {/if}

                {#if event.aiAnalysis}
                <div class="ai-panel">
                  <div class="ai-panel-title">
                    <span class="ai-badge">🤖 AI</span>
                    <span>การวิเคราะห์ภัยคุกคามโดย AI</span>
                  </div>
                  <div class="ai-panel-body">{event.aiAnalysis}</div>
                </div>
                {:else if event.severity === 'high' || event.severity === 'critical'}
                <div class="ai-panel ai-panel-pending">
                  <div class="ai-panel-title">
                    <span class="ai-badge pending">🤖 AI</span>
                    <span>กำลังวิเคราะห์...</span>
                  </div>
                  <div class="ai-panel-body" style="color:var(--text-muted);font-style:italic;">AI กำลังประมวลผลเหตุการณ์นี้อยู่ กรุณารอสักครู่</div>
                </div>
                {/if}
              </div>
            </td>
          </tr>
          {/if}
          {/each}
        </tbody>
      </table>
      {#if filteredEvents.length === 0}
      <div class="ds-empty">
        <i class="ti ti-database-search"></i>
        ไม่พบข้อมูล Log ที่ตรงกับเงื่อนไข
      </div>
      {/if}
    </div>

    {#if totalPages > 1}
    <div class="ds-pagination">
      <span class="ds-pagination-info">แสดง {(currentPage-1)*itemsPerPage+1}–{Math.min(currentPage*itemsPerPage, filteredEvents.length)} จาก {filteredEvents.length} รายการ</span>
      <div class="ds-pagination-btns">
        <button class="ds-page-btn" on:click={prevPage} disabled={currentPage === 1}><i class="ti ti-chevron-left"></i> Previous</button>
        <span class="ds-page-info">Page {currentPage} / {totalPages}</span>
        <button class="ds-page-btn" on:click={nextPage} disabled={currentPage === totalPages}>Next <i class="ti ti-chevron-right"></i></button>
      </div>
    </div>
    {/if}
  </div>
</div>

<!-- ═══════════════════════════════════════════ -->
<!-- EXPORT MODAL — INLINE / SELF CONTAINED     -->
<!-- ═══════════════════════════════════════════ -->
{#if showExportModal}
<div class="modal-backdrop" on:click={closeExportModal} role="button" tabindex="-1">
  <div class="modal-content" on:click|stopPropagation>
    <!-- Header -->
    <div class="modal-header">
      <h3 style="margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;">
        <i class="ti ti-file-export" style="color:var(--green)"></i>
        Export Preview: Security Logs
      </h3>
      <button class="btn-close" on:click={closeExportModal}><i class="ti ti-x"></i></button>
    </div>

    <div class="modal-body">
      <!-- Row count + IP filter -->
      <div class="preview-info" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div><i class="ti ti-info-circle"></i> จะทำการดาวน์โหลดข้อมูล <strong>{totalExportRows.toLocaleString()}</strong> รายการ</div>
        {#if availableIps.length > 0}
        <div class="ip-filter-container" style="position:relative;">
          <button class="ip-filter-btn" on:click|stopPropagation={() => showIpDropdown = !showIpDropdown}>
            <i class="ti ti-filter"></i>
            กรอง IP ({selectedIps.length === 0 ? 'ทั้งหมด' : selectedIps.length + ' รายการ'})
            <i class="ti {showIpDropdown ? 'ti-chevron-up' : 'ti-chevron-down'}"></i>
          </button>
          {#if showIpDropdown}
          <div class="ip-dropdown-menu">
            <div class="ip-dropdown-header">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:11px;font-weight:700;">เลือก IP ที่ต้องการ:</span>
                <button class="col-action-btn" on:click={toggleAllIps}>
                  {filteredAvailableIps.length > 0 && filteredAvailableIps.every(ip => selectedIps.includes(ip)) ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                </button>
              </div>
              <input type="text" class="ip-search-input" placeholder="ค้นหา IP..." bind:value={ipSearchQuery} on:click|stopPropagation />
            </div>
            <div class="ip-dropdown-list">
              {#each filteredAvailableIps as ip}
                <label class="col-checkbox {selectedIps.includes(ip) ? 'active' : ''}" style="margin:0;width:100%;justify-content:flex-start;">
                  <input type="checkbox" checked={selectedIps.includes(ip)} on:change={() => toggleIp(ip)}>
                  <div class="chk-box"><i class="ti ti-check"></i></div>
                  <span class="chk-label ds-mono">{ip}</span>
                </label>
              {/each}
              {#if filteredAvailableIps.length === 0}
                <div style="font-size:11px;color:var(--text-muted);padding:10px 0;text-align:center;">ไม่พบ IP ที่ค้นหา</div>
              {/if}
            </div>
          </div>
          {/if}
        </div>
        {/if}
      </div>

      <!-- Column Selection -->
      <div class="column-selection">
        <div class="col-header">
          <span class="col-title">เลือกคอลัมน์ข้อมูล (Column Selection):</span>
          <div class="col-actions">
            <button class="col-action-btn" on:click={() => selectedColumns = [...EXPORT_COLUMNS]}>เลือกทั้งหมด</button>
            <button class="col-action-btn" on:click={() => selectedColumns = []}>ยกเลิกทั้งหมด</button>
          </div>
        </div>
        <div class="col-grid">
          {#each EXPORT_COLUMNS as col}
            <label class="col-checkbox {selectedColumns.includes(col) ? 'active' : ''}">
              <input type="checkbox" checked={selectedColumns.includes(col)} on:change={() => toggleColumn(col)}>
              <div class="chk-box"><i class="ti ti-check"></i></div>
              <span class="chk-label">{col}</span>
            </label>
          {/each}
        </div>
      </div>

      <!-- Preview Table -->
      <div class="preview-info" style="margin-top:20px;">
        <i class="ti ti-table"></i> ตัวอย่างข้อมูลที่จะ Export (ตามคอลัมน์และ IP ที่เลือก):
      </div>
      <div class="table-wrap">
        <table class="ds-table preview-table">
          <thead>
            <tr>
              {#each EXPORT_COLUMNS as col}
                {#if selectedColumns.includes(col)}<th>{col}</th>{/if}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each previewData as row}
              <tr>
                {#each EXPORT_COLUMNS as col}
                  {#if selectedColumns.includes(col)}<td>{row[col] || '—'}</td>{/if}
                {/each}
              </tr>
            {/each}
            {#if previewData.length === 0}
              <tr><td colspan="99" style="text-align:center;color:var(--text-muted);">ไม่มีข้อมูลที่จะ Export</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      <!-- Format Selection -->
      <div class="export-options">
        <label class="radio-label">
          <input type="radio" name="exp-fmt" value="csv" bind:group={exportFormat}>
          <div class="radio-box"><i class="ti ti-file-spreadsheet"></i> CSV (เปิดด้วย Excel)</div>
        </label>
        <label class="radio-label">
          <input type="radio" name="exp-fmt" value="pdf" bind:group={exportFormat}>
          <div class="radio-box"><i class="ti ti-file-text"></i> PDF Report</div>
        </label>
      </div>
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="ds-btn" on:click={closeExportModal}>ยกเลิก</button>
      <button class="ds-btn primary" on:click={confirmExport} disabled={totalExportRows === 0 || selectedColumns.length === 0}>
        <i class="ti ti-download"></i> ยืนยันการดาวน์โหลด
      </button>
    </div>
  </div>
</div>
{/if}

<!-- Toast -->
<div class="toast {showToast ? 'show' : ''}">
  <i class="ti ti-check" style="color:var(--green)"></i>
  <span>Export Successful</span>
</div>

<style>
.logs-page { display: flex; flex-direction: column; gap: 0; }

/* Expandable rows */
.log-row { cursor: pointer; transition: background 0.15s; }
.log-row:hover { background: var(--bg-secondary); }
.log-row.expanded { background: var(--bg-secondary); border-left: 3px solid var(--green); }
.expand-icon i { font-size: 14px; color: var(--text-secondary); transition: transform 0.2s; }
.details-row td { padding: 0 !important; border-bottom: 1px solid var(--border); }
.details-container { padding: 20px 32px 28px; background: var(--bg-panel); box-shadow: inset 0 3px 6px rgba(0,0,0,0.02); }
.details-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.detail-panel { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
.dp-title { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.dp-content { display: flex; flex-direction: column; gap: 8px; word-break: break-word; overflow-wrap: anywhere; }
.kv { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.k { color: var(--text-muted); white-space: nowrap; flex-shrink: 0; }
.v { color: var(--text-primary); font-weight: 500; text-align: right; word-break: break-all; }
.badge-mitre { background: var(--blue-bg); color: var(--blue); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.mit-item { padding: 8px 12px; border-radius: 6px; font-size: 11.5px; display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; font-weight: 500; word-break: break-word; }
.mit-item i { font-size: 16px; margin-top: 1px; flex-shrink: 0; }
.mit-item.immediate { background: var(--red-bg); color: var(--red); border: 1px solid rgba(163,45,45,0.2); }
.mit-item.longterm { background: var(--green-bg); color: var(--green); border: 1px solid rgba(29,158,117,0.2); }
.btn-vt { display: flex; align-items: center; justify-content: center; gap: 8px; background: #1155cb; color: white; border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; font-weight: 600; text-decoration: none; transition: all 0.2s; border: 1px solid #0f46a6; }
.btn-vt:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 8px rgba(17,85,203,0.3); }
.ip-block { display: flex; align-items: center; gap: 8px; }
.flag { font-size: 16px; }
.text-bold { font-weight: 700; color: var(--text-primary); }
.score-bar { display: flex; align-items: center; gap: 8px; width: 100px; background: var(--bg-secondary); height: 8px; border-radius: 4px; position: relative; }
.score-fill { height: 100%; border-radius: 4px; }
.score-fill.critical { background: var(--red); }
.score-fill.high { background: var(--orange); }
.score-fill.medium { background: var(--blue); }
.score-text { position: absolute; right: -42px; font-size: 11px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
.sev { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.sev.critical { background: var(--red-bg); color: var(--red); }
.sev.high     { background: var(--orange-bg); color: var(--orange); }
.sev.medium   { background: var(--blue-bg); color: var(--blue); }
.sev.low      { background: #eaf3de; color: #3b6d11; }
.status-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; }
.status-badge.opened   { background: var(--red-bg); color: var(--red); }
.status-badge.progress { background: var(--orange-bg); color: var(--orange); }
.status-badge.closed   { background: var(--green-bg); color: var(--green); }
.type-badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 500; }
.payload-box { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: 'Courier New', monospace; font-size: 11px; color: var(--red); word-break: break-all; white-space: pre-wrap; }
.admin-status-box { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.killchain-panel { margin-top: 14px; padding-top: 14px; border-top: 1px dashed var(--border); }
.kc-title { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.kc-timeline { display: flex; flex-direction: column; padding-left: 140px; position: relative; }
.kc-timeline::before { content: ''; position: absolute; left: 146px; top: 10px; bottom: 10px; width: 2px; background: var(--border); }
.kc-item { display: flex; gap: 15px; position: relative; padding: 10px 0; opacity: 0.7; transition: opacity 0.2s; }
.kc-item:hover, .kc-item.active { opacity: 1; }
.kc-time { position: absolute; left: -140px; top: 12px; font-size: 11px; font-family: 'Courier New', monospace; color: var(--text-muted); width: 130px; text-align: right; }
.kc-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); margin-top: 13px; z-index: 1; position: relative; border: 2px solid var(--bg-panel); }
.kc-dot.critical { background: var(--red); }
.kc-dot.high { background: var(--orange); }
.kc-dot.medium { background: var(--blue); }
.kc-dot.low { background: var(--green); }
.kc-content { display: flex; flex-direction: column; justify-content: center; }
.kc-type { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.kc-detail { font-size: 11px; font-family: 'Courier New', monospace; color: var(--text-secondary); }

/* AI Analysis Panel */
.ai-panel { margin-top: 14px; background: rgba(142, 68, 173, 0.05); border: 1px solid rgba(142, 68, 173, 0.2); border-radius: var(--radius-md); overflow: hidden; }
.ai-panel-pending { background: rgba(100, 116, 139, 0.05); border: 1px dashed rgba(100, 116, 139, 0.3); }
.ai-panel-title { padding: 10px 14px; background: rgba(142, 68, 173, 0.1); font-size: 12px; font-weight: 700; color: #8e44ad; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(142, 68, 173, 0.1); }
.ai-panel-pending .ai-panel-title { background: rgba(100, 116, 139, 0.1); color: var(--text-muted); border-bottom: 1px dashed rgba(100, 116, 139, 0.2); }
.ai-badge { background: #8e44ad; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 800; }
.ai-badge.pending { background: var(--text-muted); }
.ai-panel-body { padding: 14px; font-size: 12px; line-height: 1.6; color: var(--text-primary); white-space: pre-wrap; font-family: var(--font-body); }

/* ── EXPORT MODAL ── */
.modal-backdrop { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; width: 90%; max-width: 680px; box-shadow: var(--shadow-md); overflow: hidden; animation: modalSlide 0.2s ease-out; display: flex; flex-direction: column; max-height: 90vh; }
@keyframes modalSlide { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.btn-close { background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s; }
.btn-close:hover { background: rgba(255,51,51,0.1); color: #ff3333; }
.modal-body { padding: 20px; overflow-y: auto; flex-grow: 1; }
.preview-info { font-size: 13px; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.column-selection { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 15px; }
.col-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.col-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
.col-actions { display: flex; gap: 8px; }
.col-action-btn { background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-secondary); font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
.col-action-btn:hover { background: var(--border); color: var(--text-primary); }
.col-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.col-checkbox { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 20px; cursor: pointer; user-select: none; transition: all 0.2s; }
.col-checkbox input { display: none; }
.chk-box { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; background: var(--bg-panel); transition: all 0.2s; }
.chk-box i { font-size: 11px; color: transparent; transition: 0.2s; }
.col-checkbox.active { border-color: var(--green); background: rgba(29,158,117,0.08); }
.col-checkbox.active .chk-box { background: var(--green); border-color: var(--green); }
.col-checkbox.active .chk-box i { color: #fff; }
.chk-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); transition: all 0.2s; }
.col-checkbox.active .chk-label { color: var(--green); font-weight: 700; }
.ip-filter-container { position: relative; }
.ip-filter-btn { background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
.ip-filter-btn:hover { border-color: var(--green); color: var(--green); }
.ip-dropdown-menu { position: absolute; right: 0; top: 100%; margin-top: 6px; width: 300px; max-height: 320px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow-md); z-index: 200; display: flex; flex-direction: column; overflow: hidden; }
.ip-dropdown-header { padding: 10px 12px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
.ip-search-input { width: 100%; background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-primary); padding: 6px 10px; border-radius: 4px; font-size: 12px; outline: none; transition: border-color 0.2s; box-sizing: border-box; }
.ip-search-input:focus { border-color: var(--green); }
.ip-dropdown-list { padding: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; max-height: 230px; }
.table-wrap { border: 1px solid var(--border); border-radius: 8px; overflow-x: auto; margin-bottom: 20px; max-height: 250px; overflow-y: auto; }
.preview-table { margin: 0; width: 100%; border-collapse: collapse; }
.preview-table th { position: sticky; top: 0; background: var(--bg-secondary); z-index: 10; box-shadow: 0 1px 0 var(--border); }
.preview-table th, .preview-table td { padding: 8px 12px; font-size: 12px; white-space: nowrap; }
.export-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; }
.radio-label { cursor: pointer; }
.radio-label input { display: none; }
.radio-box { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 13px; font-weight: 600; transition: all 0.2s; }
.radio-label input:checked + .radio-box { border-color: var(--green); background: rgba(29,158,117,0.1); color: var(--green); }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; border-top: 1px solid var(--border); background: var(--bg-secondary); flex-shrink: 0; }

/* Toast */
.toast { position: fixed; bottom: 24px; right: 24px; z-index: 2000; background: var(--text-primary); color: var(--bg); padding: 10px 16px; border-radius: 10px; font-size: 12px; display: flex; align-items: center; gap: 8px; transform: translateY(10px); opacity: 0; transition: all .25s; pointer-events: none; }
.toast.show { transform: translateY(0); opacity: 1; }

@media (max-width: 1200px) { .details-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 800px) { .details-grid { grid-template-columns: 1fr; } }
</style>