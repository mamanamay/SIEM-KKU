<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let show = false;
  export let title = "Export Data";
  export let columns: string[] = [];
  export let data: any[] = [];
  export let ipColumn = ""; // E.g., 'Source IP' or 'IP Address'
  
  const dispatch = createEventDispatcher();
  let exportFormat = 'csv';
  
  let selectedColumns: string[] = [];
  let hasInitializedCols = false;

  let selectedIps: string[] = [];
  let showIpDropdown = false;
  let ipSearchQuery = "";
  
  // Available IPs for filtering (unique list from data)
  $: availableIps = ipColumn && data && data.length > 0 
    ? [...new Set(data.map(d => String(d[ipColumn] || '')).filter(ip => ip && ip !== '-' && ip !== 'Unknown'))].sort()
    : [];

  $: filteredAvailableIps = availableIps.filter(ip => ip.toLowerCase().includes(ipSearchQuery.toLowerCase()));

  // Filtered Data based on selected IPs
  $: filteredData = selectedIps.length > 0 && data
    ? data.filter(d => selectedIps.includes(String(d[ipColumn])))
    : (data || []);

  // Compute preview and total rows dynamically
  $: previewData = filteredData.slice(0, 3);
  $: totalRows = filteredData.length;
  
  // Initialize columns only once when opened
  $: if (show && !hasInitializedCols && columns.length > 0) {
    selectedColumns = [...columns];
    hasInitializedCols = true;
  }
  
  function close() {
    show = false;
    hasInitializedCols = false;
    selectedIps = [];
    showIpDropdown = false;
    ipSearchQuery = "";
    dispatch('close');
  }
  
  function confirm() {
    dispatch('confirm', { format: exportFormat, selectedColumns, filteredData });
    show = false;
    hasInitializedCols = false;
    selectedIps = [];
  }
  
  function toggleColumn(col: string) {
    if (selectedColumns.includes(col)) {
      selectedColumns = selectedColumns.filter(c => c !== col);
    } else {
      selectedColumns = [...selectedColumns, col];
    }
  }
  
  function selectAll() {
    selectedColumns = [...columns];
  }
  
  function deselectAll() {
    selectedColumns = [];
  }

  function toggleIp(ip: string) {
    if (selectedIps.includes(ip)) {
      selectedIps = selectedIps.filter(i => i !== ip);
    } else {
      selectedIps = [...selectedIps, ip];
    }
  }

  function toggleAllIps() {
    const allFilteredSelected = filteredAvailableIps.every(ip => selectedIps.includes(ip));
    if (allFilteredSelected) {
      selectedIps = selectedIps.filter(ip => !filteredAvailableIps.includes(ip));
    } else {
      const newIps = filteredAvailableIps.filter(ip => !selectedIps.includes(ip));
      selectedIps = [...selectedIps, ...newIps];
    }
  }
</script>

{#if show}
<div class="modal-backdrop" on:click={close}>
  <div class="modal-content" on:click|stopPropagation>
    <div class="modal-header">
      <h3 style="margin:0;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;">
        <i class="ti ti-file-export" style="color:var(--green)"></i>
        Export Preview: {title}
      </h3>
      <button class="btn-close" on:click={close}><i class="ti ti-x"></i></button>
    </div>
    
    <div class="modal-body">
      <div class="preview-info" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
        <div>
          <i class="ti ti-info-circle"></i> จะทำการดาวน์โหลดข้อมูล <strong>{totalRows.toLocaleString()}</strong> รายการ
        </div>
        
        {#if availableIps.length > 0}
        <div class="ip-filter-container" style="position: relative;">
          <button class="ip-filter-btn" on:click={() => showIpDropdown = !showIpDropdown}>
            <i class="ti ti-filter"></i> 
            กรอง IP ({selectedIps.length === 0 ? 'ทั้งหมด' : selectedIps.length + ' รายการ'})
            <i class="ti {showIpDropdown ? 'ti-chevron-up' : 'ti-chevron-down'}"></i>
          </button>
          
          {#if showIpDropdown}
          <div class="ip-dropdown-menu">
            <div class="ip-dropdown-header" style="flex-direction: column; gap: 8px; align-items: stretch;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="col-title" style="font-size: 11px;">เลือก IP ที่ต้องการ (Select IPs):</span>
                <button class="col-action-btn" on:click={toggleAllIps}>
                  {filteredAvailableIps.length > 0 && filteredAvailableIps.every(ip => selectedIps.includes(ip)) ? 'ยกเลิกที่ค้นหา' : 'เลือกทั้งหมดที่ค้นหา'}
                </button>
              </div>
              <input type="text" class="ip-search-input" placeholder="ค้นหา IP..." bind:value={ipSearchQuery} on:click|stopPropagation />
            </div>
            <div class="ip-dropdown-list">
              {#each filteredAvailableIps as ip}
                <label class="col-checkbox {selectedIps.includes(ip) ? 'active' : ''}" style="margin:0; width:100%; justify-content:flex-start;">
                  <input type="checkbox" checked={selectedIps.includes(ip)} on:change={() => toggleIp(ip)}>
                  <div class="chk-box"><i class="ti ti-check"></i></div>
                  <span class="chk-label ds-mono">{ip}</span>
                </label>
              {/each}
              {#if filteredAvailableIps.length === 0}
                <div class="text-center" style="font-size: 11px; color: var(--text-muted); padding: 10px 0;">ไม่พบ IP ที่ค้นหา</div>
              {/if}
            </div>
          </div>
          {/if}
        </div>
        {/if}
      </div>
      
      <!-- Column Selection Section -->
      <div class="column-selection">
        <div class="col-header">
          <span class="col-title">เลือกคอลัมน์ข้อมูล (Column Selection):</span>
          <div class="col-actions">
            <button class="col-action-btn" on:click={selectAll}>เลือกทั้งหมด</button>
            <button class="col-action-btn" on:click={deselectAll}>ยกเลิกทั้งหมด</button>
          </div>
        </div>
        <div class="col-grid">
          {#each columns as col}
            <label class="col-checkbox {selectedColumns.includes(col) ? 'active' : ''}">
              <input type="checkbox" checked={selectedColumns.includes(col)} on:change={() => toggleColumn(col)}>
              <div class="chk-box"><i class="ti ti-check"></i></div>
              <span class="chk-label">{col}</span>
            </label>
          {/each}
        </div>
      </div>
      
      <div class="preview-info" style="margin-top: 20px;">
        <i class="ti ti-table"></i> ตัวอย่างข้อมูลที่จะ Export (ตามคอลัมน์และ IP ที่เลือก):
      </div>
      
      <div class="table-wrap">
        <table class="ds-table preview-table">
          <thead>
            <tr>
              {#each columns as col}
                {#if selectedColumns.includes(col)}
                  <th>{col}</th>
                {/if}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each previewData as row}
              <tr>
                {#each columns as col}
                  {#if selectedColumns.includes(col)}
                    <td>{row[col] || '—'}</td>
                  {/if}
                {/each}
              </tr>
            {/each}
            {#if previewData.length === 0}
              <tr>
                <td colspan={selectedColumns.length > 0 ? selectedColumns.length : 1} class="text-center">No data available for export</td>
              </tr>
            {/if}
            {#if selectedColumns.length === 0 && previewData.length > 0}
              <tr>
                <td class="text-center" style="color:var(--text-muted);font-style:italic;">กรุณาเลือกอย่างน้อย 1 คอลัมน์</td>
              </tr>
            {/if}
          </tbody>
        </table>
      </div>
      
      <div class="export-options">
        <label class="radio-label">
          <input type="radio" name="format" value="csv" bind:group={exportFormat}>
          <div class="radio-box">
            <i class="ti ti-file-spreadsheet"></i>
            CSV (เปิดด้วย Excel)
          </div>
        </label>
        <label class="radio-label">
          <input type="radio" name="format" value="pdf" bind:group={exportFormat}>
          <div class="radio-box">
            <i class="ti ti-file-text"></i>
            PDF Report
          </div>
        </label>
      </div>
    </div>
    
    <div class="modal-footer">
      <button class="ds-btn" on:click={close}>ยกเลิก</button>
      <button class="ds-btn primary" on:click={confirm} disabled={totalRows === 0 || selectedColumns.length === 0}>
        <i class="ti ti-download"></i> ยืนยันการดาวน์โหลด
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }
  .modal-content {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; width: 90%; max-width: 680px;
    box-shadow: var(--shadow-md); overflow: hidden;
    animation: modalSlide 0.2s ease-out;
    display: flex; flex-direction: column;
    max-height: 90vh;
  }
  @keyframes modalSlide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .btn-close {
    background: none; border: none; color: var(--text-muted); font-size: 18px;
    cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s;
  }
  .btn-close:hover { background: rgba(255,51,51,0.1); color: #ff3333; }
  .modal-body { padding: 20px; overflow-y: auto; flex-grow: 1; }
  .preview-info {
    font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;
    display: flex; align-items: center; gap: 6px;
  }
  
  /* Column Selection CSS */
  .column-selection {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 15px;
  }
  .col-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;
  }
  .col-title { font-size: 12px; font-weight: 700; color: var(--text-primary); }
  .col-actions { display: flex; gap: 8px; }
  .col-action-btn {
    background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-secondary);
    font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; cursor: pointer;
    transition: all 0.2s;
  }
  .col-action-btn:hover { background: var(--border); color: var(--text-primary); }
  
  .col-grid {
    display: flex; flex-wrap: wrap; gap: 8px;
  }
  .col-checkbox {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 12px; background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 20px; cursor: pointer; user-select: none; transition: all 0.2s;
  }
  .col-checkbox input { display: none; }
  .chk-box {
    width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center; background: var(--bg-panel);
    transition: all 0.2s;
  }
  .chk-box i { font-size: 11px; color: transparent; transition: 0.2s; }
  .col-checkbox.active { border-color: var(--green); background: rgba(29, 158, 117, 0.08); }
  .col-checkbox.active .chk-box { background: var(--green); border-color: var(--green); }
  .col-checkbox.active .chk-box i { color: #fff; }
  .chk-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); transition: all 0.2s; }
  .col-checkbox.active .chk-label { color: var(--green); font-weight: 700; }

  /* IP Filter Dropdown */
  .ip-filter-btn {
    background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);
    padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; gap: 6px; transition: all 0.2s;
  }
  .ip-filter-btn:hover { border-color: var(--green); color: var(--green); }
  .ip-dropdown-menu {
    position: absolute; right: 0; top: 100%; margin-top: 6px; width: 300px; max-height: 320px;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px;
    box-shadow: var(--shadow-md); z-index: 100; display: flex; flex-direction: column; overflow: hidden;
  }
  .ip-dropdown-header {
    padding: 10px 12px; border-bottom: 1px solid var(--border); display: flex;
    background: var(--bg-secondary);
  }
  .ip-search-input {
    width: 100%; background: var(--bg-panel); border: 1px solid var(--border);
    color: var(--text-primary); padding: 6px 10px; border-radius: 4px; font-size: 12px;
    outline: none; transition: border-color 0.2s;
  }
  .ip-search-input:focus { border-color: var(--green); }
  .ip-dropdown-list {
    padding: 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
    max-height: 250px;
  }

  .table-wrap {
    border: 1px solid var(--border); border-radius: 8px; overflow-x: auto;
    margin-bottom: 20px; max-height: 250px; overflow-y: auto;
  }
  .preview-table { margin: 0; width: 100%; border-collapse: collapse; }
  .preview-table th { position: sticky; top: 0; background: var(--bg-secondary); z-index: 10; box-shadow: 0 1px 0 var(--border); }
  .preview-table th, .preview-table td { padding: 8px 12px; font-size: 12px; white-space: nowrap; }
  
  .export-options {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  .radio-label { cursor: pointer; }
  .radio-label input { display: none; }
  .radio-box {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-secondary); color: var(--text-secondary);
    font-size: 13px; font-weight: 600; transition: all 0.2s;
  }
  .radio-label input:checked + .radio-box {
    border-color: var(--green); background: rgba(29,158,117,0.1); color: var(--green);
  }
  
  .modal-footer {
    display: flex; justify-content: flex-end; gap: 10px;
    padding: 16px 20px; border-top: 1px solid var(--border);
    background: var(--bg-secondary); flex-shrink: 0;
  }
</style>
