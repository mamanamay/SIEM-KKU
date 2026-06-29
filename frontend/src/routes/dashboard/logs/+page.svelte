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

  // Track expanded rows
  let expandedRows = new Set();
  function toggleRow(id) {
    if (expandedRows.has(id)) {
      expandedRows.delete(id);
    } else {
      expandedRows.add(id);
    }
    expandedRows = expandedRows; // trigger reactivity
  }

  // Modal State
  let showExportModal = false;
  let selectedExportFormat = 'csv';
  let showToast = false;

  function handleExport() {
    showExportModal = false;
    showToast = true;
    setTimeout(() => showToast = false, 3000);
  }

  function getFlagEmoji(country) {
    if (country === 'Russia') return '🇷🇺';
    if (country === 'China') return '🇨🇳';
    if (country === 'Brazil') return '🇧🇷';
    if (country === 'United States') return '🇺🇸';
    if (country === 'Local Network') return '🏠';
    return '🌍';
  }

  async function updateStatus(id, newStatus) {
    try {
      const res = await fetch(`http://localhost:5000/api/attacks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        console.error('Failed to update status');
      }
    } catch (err) {
      console.error(err);
    }
  }

  function getSessionEvents(sessionId) {
    if (!sessionId) return [];
    return events.filter(e => e.sessionId === sessionId).sort((a, b) => a.id - b.id);
  }
</script>

<div class="logs-page">
  <div class="panel">
    <div class="panel-header">
      <div class="filter-group">
        <select bind:value={activeSev} class="select-box">
          <option value="all">All Severities</option>
          <option value="critical">Critical Only</option>
          <option value="high">High Only</option>
          <option value="medium">Medium Only</option>
          <option value="low">Low Only</option>
        </select>
        <select bind:value={activeStatus} class="select-box">
          <option value="all">All Statuses</option>
          <option value="Opened">Opened</option>
          <option value="In Progress">In Progress</option>
          <option value="Closed">Closed</option>
        </select>
        <div class="search-box">
          <i class="ti ti-search"></i>
          <input type="text" bind:value={searchText} placeholder="Search payloads, IPs..." />
        </div>
      </div>
      {#if $roleStore === 'admin'}
      <button class="btn-primary" on:click={() => showExportModal = true}>
        <i class="ti ti-download"></i> Export Logs
      </button>
      {/if}
    </div>

    <div class="table-container">
      <table class="full-table">
        <thead>
          <tr>
            <th style="width: 30px"></th>
            <th>วันที่ & เวลา</th>
            <th>Source IP</th>
            <th>Attack Type</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Threat Score</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredEvents as event, i}
          <tr class="log-row {expandedRows.has(i) ? 'expanded' : ''}" on:click={() => toggleRow(i)}>
            <td class="expand-icon">
              <i class="ti {expandedRows.has(i) ? 'ti-chevron-down' : 'ti-chevron-right'}"></i>
            </td>
            <td class="font-mono">{event.time || event.timeStr}</td>
            <td>
              <div class="ip-block">
                <span class="flag">{getFlagEmoji(event.country)}</span>
                <span class="font-mono text-bold">{event.ip}</span>
              </div>
            </td>
            <td><span class="type-badge">{event.type}</span></td>
            <td><span class="sev {event.severity}">{event.severity}</span></td>
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
            <td colspan="6">
              <div class="details-container">
                <div class="details-grid">
                  <!-- Context Panel -->
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-fingerprint"></i> ข้อมูลผู้โจมตี (Attacker Context)</div>
                    <div class="dp-content">
                      <div class="kv"><span class="k">ประเทศ:</span> <span class="v">{event.country || 'Unknown'}</span></div>
                      <div class="kv"><span class="k">เครื่องมือ (Tool):</span> <span class="v font-mono">{event.clientVersion || 'Unknown'}</span></div>
                      <div class="kv"><span class="k">MITRE ATT&CK:</span> <span class="v badge-mitre">{event.mitreCode || 'T0000'}</span></div>
                    </div>
                  </div>

                  <!-- Payload Panel -->
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-code"></i> คำสั่งที่ถูกใช้ (Raw Payload)</div>
                    <div class="dp-content">
                      <div class="payload-box">
                        {event.detail}
                      </div>
                    </div>
                  </div>

                  <!-- Mitigation Panel -->
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-shield-check"></i> วิธีรับมือและความเสี่ยง</div>
                    <div class="dp-content">
                      {#if event.severity === 'critical'}
                        <div class="mit-item immediate">
                          <i class="ti ti-alert-triangle"></i> เสี่ยงสูงมาก: อาจทำให้เซิร์ฟเวอร์โดนยึด ควรบล็อก IP นี้ใน Firewall ทันที
                        </div>
                      {:else if event.severity === 'high'}
                        <div class="mit-item immediate" style="background:var(--orange-bg);color:var(--orange);border-color:rgba(133,79,11,0.2)">
                          <i class="ti ti-alert-circle"></i> เสี่ยงสูง: เป็นการพยายามเจาะระบบ ควรเฝ้าระวังพฤติกรรม
                        </div>
                      {:else}
                        <div class="mit-item longterm" style="background:var(--blue-bg);color:var(--blue);border-color:rgba(24,95,165,0.2)">
                          <i class="ti ti-info-circle"></i> เสี่ยงต่ำ: เป็นการสแกนหาช่องโหว่ทั่วไป
                        </div>
                      {/if}
                      <div class="mit-item longterm">
                        <i class="ti ti-shield"></i> คำแนะนำ: ตั้งรหัสผ่านให้ซับซ้อนขึ้น และปิดพอร์ตที่ไม่จำเป็น
                      </div>
                    </div>
                  </div>

                  <!-- IP Reputation Panel -->
                  <div class="detail-panel">
                    <div class="dp-title"><i class="ti ti-world-search"></i> ตรวจสอบไอพี (IP Reputation)</div>
                    <div class="dp-content">
                      <p style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">
                        นำ IP <strong class="font-mono">{event.ip}</strong> ไปตรวจสอบประวัติอาชญากรรมไซเบอร์ในฐานข้อมูลสากล เพื่อดูว่าเป็น Botnet หรือแฮกเกอร์ที่เคยโจมตีที่อื่นหรือไม่
                      </p>
                      <a href="https://www.virustotal.com/gui/search/{event.ip}" target="_blank" class="btn-vt">
                        <i class="ti ti-shield-search" style="font-size: 16px;"></i>
                        ตรวจด้วย VirusTotal
                      </a>
                      {#if $roleStore === 'admin'}
                      <div class="admin-status-box" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                        <div class="dp-title" style="margin-bottom: 8px;"><i class="ti ti-settings"></i> จัดการสถานะ (Admin)</div>
                        <select 
                          class="select-box" 
                          style="width: 100%;" 
                          value={event.status || 'Opened'}
                          on:change={(e) => updateStatus(event.id, e.target.value)}
                        >
                          <option value="Opened">🚨 Opened (รอตรวจสอบ)</option>
                          <option value="In Progress">⏳ In Progress (กำลังวิเคราะห์)</option>
                          <option value="Closed">✅ Closed (บล็อกแล้ว/ปิดงาน)</option>
                        </select>
                      </div>
                      {/if}
                    </div>
                  </div>
                </div>

                <!-- Kill Chain Timeline -->
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
              </div>
            </td>
          </tr>
          {/if}
          {/each}
        </tbody>
      </table>
      {#if filteredEvents.length === 0}
      <div class="empty-state">
        <i class="ti ti-search"></i>
        <p>No logs found matching your criteria.</p>
      </div>
      {/if}
    </div>
  </div>
</div>

<!-- Export Modal (Shared logic) -->
{#if showExportModal}
<div class="modal-backdrop show">
  <div class="modal">
    <div class="modal-header">
      <div class="modal-title"><i class="ti ti-download" style="color:var(--green)"></i> Export Threat Logs</div>
      <button class="modal-close" on:click={() => showExportModal = false}><i class="ti ti-x"></i></button>
    </div>
    <div class="export-filter-note">
      <i class="ti ti-info-circle"></i>
      <span>Exporting <strong>{filteredEvents.length}</strong> filtered events.</span>
    </div>
    <div class="modal-options">
      <button class="export-opt {selectedExportFormat === 'csv' ? 'selected' : ''}" on:click={() => selectedExportFormat = 'csv'}>
        <div class="export-opt-info">
          <div class="export-opt-name">CSV Format</div>
          <div class="export-opt-desc">For Excel/SIEM integration</div>
        </div>
      </button>
      <button class="export-opt {selectedExportFormat === 'json' ? 'selected' : ''}" on:click={() => selectedExportFormat = 'json'}>
        <div class="export-opt-info">
          <div class="export-opt-name">JSON Format</div>
          <div class="export-opt-desc">Raw structured data</div>
        </div>
      </button>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" on:click={() => showExportModal = false}>Cancel</button>
      <button class="btn-primary" on:click={handleExport}><i class="ti ti-download"></i> Download</button>
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
.logs-page { max-width: 1400px; margin: 0 auto; }
.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius-lg); padding: 1.5rem;
  box-shadow: var(--shadow-sm); display: flex; flex-direction: column;
}
.panel-header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 10px;
}
.filter-group { display: flex; gap: 10px; }
.select-box, .search-box input {
  padding: 8px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; outline: none;
}
.select-box:focus, .search-box input:focus { border-color: var(--green); }
.search-box { position: relative; }
.search-box input { padding-left: 32px; width: 250px; }
.search-box i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }

.btn-primary {
  display: flex; align-items: center; gap: 6px; padding: 8px 16px;
  background: var(--green); color: white; border: none; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 500; cursor: pointer; transition: 0.2s;
}
.btn-primary:hover { filter: brightness(1.1); }
.btn-secondary {
  padding: 8px 16px; background: var(--bg-secondary); color: var(--text-secondary);
  border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;
}

.table-container { overflow-x: auto; }
.full-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.full-table th { text-align: left; padding: 12px; border-bottom: 1px solid var(--border); color: var(--text-muted); font-weight: 500; }
.full-table td { padding: 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }

/* Expandable Rows */
.log-row { cursor: pointer; transition: background 0.15s; }
.log-row:hover { background: var(--bg-secondary); }
.log-row.expanded { background: var(--bg-secondary); border-left: 3px solid var(--green); }
.expand-icon i { font-size: 14px; color: var(--text-secondary); transition: transform 0.2s; }
.details-row td { padding: 0; border-bottom: 1px solid var(--border); }
.details-container { padding: 20px 40px 30px 40px; background: var(--bg-panel); box-shadow: inset 0 3px 6px rgba(0,0,0,0.02); }

.details-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
.detail-panel { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; }
.dp-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.dp-content { display: flex; flex-direction: column; gap: 10px; }
.kv { display: flex; justify-content: space-between; font-size: 12px; }
.k { color: var(--text-muted); }
.v { color: var(--text-primary); font-weight: 500; }
.badge-mitre { background: var(--blue-bg); color: var(--blue); padding: 2px 8px; border-radius: 4px; font-size: 11px; }

.mit-item { padding: 8px 12px; border-radius: 6px; font-size: 11.5px; display: flex; align-items: flex-start; gap: 8px; line-height: 1.4; font-weight: 500; }
.mit-item i { font-size: 16px; margin-top: 1px; }
.mit-item.immediate { background: var(--red-bg); color: var(--red); border: 1px solid rgba(163,45,45,0.2); }
.mit-item.longterm { background: var(--green-bg); color: var(--green); border: 1px solid rgba(29,158,117,0.2); }

.btn-vt {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: #1155cb; color: white; border-radius: var(--radius-sm);
  padding: 8px 12px; font-size: 12px; font-weight: 600; text-decoration: none;
  transition: all 0.2s; border: 1px solid #0f46a6;
}
.btn-vt:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 8px rgba(17,85,203,0.3); }

.ip-block { display: flex; align-items: center; gap: 8px; }
.flag { font-size: 16px; }

.score-bar { display: flex; align-items: center; gap: 8px; width: 100px; background: var(--bg-secondary); height: 8px; border-radius: 4px; position: relative; }
.score-fill { height: 100%; border-radius: 4px; }
.score-fill.critical { background: var(--red); }
.score-fill.high { background: var(--orange); }
.score-fill.medium { background: var(--blue); }
.score-text { position: absolute; right: -40px; font-size: 11px; font-weight: 600; color: var(--text-secondary); }

.font-mono { font-family: 'Courier New', monospace; font-size: 12px; color: var(--text-secondary); }
.text-bold { font-weight: 600; color: var(--text-primary); }

.sev { display: inline-block; padding: 2px 9px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.sev.critical { background: var(--red-bg); color: var(--red); }
.sev.high     { background: var(--orange-bg); color: var(--orange); }
.sev.medium   { background: var(--blue-bg); color: var(--blue); }
.sev.low      { background: #eaf3de; color: #3b6d11; }

.status-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 600; text-transform: uppercase; }
.status-badge.opened { background: #ffe9e9; color: #d63031; border: 1px solid #ffcccc; }
.status-badge.progress { background: #fff3cd; color: #856404; border: 1px solid #ffeeba; }
.status-badge.closed { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }

.type-badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; background: var(--bg-secondary); color: var(--text-secondary); }

.payload-box { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 12px; font-family: 'Courier New', monospace; font-size: 11px; color: var(--red); word-break: break-all; white-space: pre-wrap; }

.empty-state { text-align: center; padding: 3rem 1rem; color: var(--text-muted); }
.empty-state i { font-size: 32px; margin-bottom: 10px; }

/* Modals & Toasts (Same as Dashboard) */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); opacity: 0; pointer-events: none; transition: opacity .2s; }
.modal-backdrop.show { opacity: 1; pointer-events: all; }
.modal { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.5rem; width: 90%; max-width: 400px; box-shadow: var(--shadow-md); }
.modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.modal-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
.modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: var(--text-secondary); }
.modal-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 1.5rem; }
.export-opt { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: var(--radius-md); border: 1.5px solid var(--border); cursor: pointer; background: transparent; text-align: left; color: var(--text-primary); }
.export-opt.selected { border-color: var(--green); background: var(--green-bg); }
.export-opt-name { font-size: 13px; font-weight: 600; }
.export-opt-desc { font-size: 11px; color: var(--text-secondary); }
.modal-footer { display: flex; gap: 8px; justify-content: flex-end; }
.export-filter-note { background: var(--bg-secondary); padding: 10px; font-size: 12px; border-radius: var(--radius-sm); margin-bottom: 1rem; color: var(--text-secondary); }

.toast { position: fixed; bottom: 24px; right: 24px; z-index: 2000; background: var(--text-primary); color: var(--bg); padding: 10px 16px; border-radius: 10px; font-size: 12px; display: flex; align-items: center; gap: 8px; transform: translateY(10px); opacity: 0; transition: all .25s; pointer-events: none; }
.toast.show { transform: translateY(0); opacity: 1; }

/* Kill Chain Timeline */
.killchain-panel { margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border); }
.kc-title { font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.kc-timeline { display: flex; flex-direction: column; gap: 0; padding-left: 140px; position: relative; }
.kc-timeline::before { content: ''; position: absolute; left: 146px; top: 10px; bottom: 10px; width: 2px; background: var(--border); }
.kc-item { display: flex; gap: 15px; position: relative; padding: 10px 0; opacity: 0.7; transition: opacity 0.2s; }
.kc-item:hover, .kc-item.active { opacity: 1; }
.kc-item.active .kc-content { background: var(--bg-secondary); border-radius: 6px; padding: 6px 10px; margin: -6px -10px; }
.kc-time { position: absolute; left: -140px; top: 12px; font-size: 11px; font-family: 'Courier New', monospace; color: var(--text-muted); width: 130px; text-align: right; }
.kc-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); margin-top: 13px; z-index: 1; position: relative; border: 2px solid var(--bg-panel); }
.kc-dot.critical { background: var(--red); }
.kc-dot.high { background: var(--orange); }
.kc-dot.medium { background: var(--blue); }
.kc-dot.low { background: var(--green); }
.kc-content { display: flex; flex-direction: column; justify-content: center; }
.kc-type { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.kc-detail { font-size: 11px; font-family: 'Courier New', monospace; color: var(--text-secondary); }

@media (max-width: 1200px) {
  .details-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 800px) {
  .details-grid { grid-template-columns: 1fr; }
}
</style>
