<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { usernameStore } from '../../stores/events';
  export let show = false;
  export let reportTitle = 'KKUSIEM Security Report';
  export let availableFields: string[] = ['Time', 'Source IP', 'Event Type', 'Severity', 'Country'];
  export let previewData: any[] = [];
  
  let selectedFields = [...availableFields];
  let exportFormat = 'pdf';
  
  const dispatch = createEventDispatcher();
  
  function toggleField(field: string) {
    if (selectedFields.includes(field)) {
      selectedFields = selectedFields.filter(f => f !== field);
    } else {
      selectedFields = [...selectedFields, field];
    }
  }
  
  let reportDesc = 'Automated security report generated from KKUSIEM dashboard.';
  let department = 'Digital Technology Office, Khon Kaen University';
  
  function handleExport() {
    dispatch('export', { format: exportFormat, fields: selectedFields, desc: reportDesc, dept: department });
    show = false;
  }
</script>

{#if show}
  <div class="modal-overlay">
    <div class="modal-content" style="width: 900px; max-width:95vw; display:flex; flex-direction:row; gap:0; padding:0; overflow:hidden;">
      
      <!-- LEFT CONFIG PANEL -->
      <div style="width: 320px; background: var(--bg-panel); padding: 24px; border-right: 1px solid var(--border); display:flex; flex-direction:column;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 16px;">
          <h2 style="margin: 0; font-size: 18px; color: var(--text-primary);"><i class="ti ti-file-export"></i> Report Setup</h2>
        </div>
        
        <h4 style="margin: 0 0 12px; color: var(--text-primary); font-size:13px;">Data Columns</h4>
        <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border); margin-bottom: 24px; max-height:180px; overflow-y:auto;">
          {#each availableFields as field}
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-primary); cursor: pointer;">
              <input type="checkbox" checked={selectedFields.includes(field)} on:change={() => toggleField(field)} />
              {field}
            </label>
          {/each}
        </div>
        
        <h4 style="margin: 0 0 12px; color: var(--text-primary); font-size:13px;">Export Format</h4>
        <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
          <label class="format-option" class:selected={exportFormat === 'pdf'}>
            <input type="radio" name="format" value="pdf" bind:group={exportFormat} style="display:none;" />
            <div class="icon-box"><i class="ti ti-file-type-pdf" style="color: #ef4444;"></i></div>
            <div>
              <div style="font-weight: 600; color: var(--text-primary); font-size:13px;">PDF Document</div>
            </div>
          </label>
          <label class="format-option" class:selected={exportFormat === 'html'}>
            <input type="radio" name="format" value="html" bind:group={exportFormat} style="display:none;" />
            <div class="icon-box"><i class="ti ti-file-type-html" style="color: #eab308;"></i></div>
            <div>
              <div style="font-weight: 600; color: var(--text-primary); font-size:13px;">HTML Web Page</div>
            </div>
          </label>
          <label class="format-option" class:selected={exportFormat === 'csv'}>
            <input type="radio" name="format" value="csv" bind:group={exportFormat} style="display:none;" />
            <div class="icon-box"><i class="ti ti-file-type-csv" style="color: #10b981;"></i></div>
            <div>
              <div style="font-weight: 600; color: var(--text-primary); font-size:13px;">CSV Spreadsheet</div>
            </div>
          </label>
        </div>

        <div style="margin-top:24px; border-top: 1px solid var(--border); padding-top:16px; display:flex; gap:12px;">
          <button style="flex:1; padding: 10px; background: transparent; border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); cursor: pointer;" on:click={() => show = false}>Cancel</button>
          <button style="flex:1; padding: 10px; background: #3b82f6; border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer;" on:click={handleExport}>Export</button>
        </div>
      </div>

      <!-- RIGHT PREVIEW PANEL (A4 Style) -->
      <div style="flex:1; background: #0f172a; padding: 24px; display:flex; flex-direction:column; align-items:center; overflow-y:auto;">
        <div style="width: 100%; display:flex; justify-content:space-between; margin-bottom:12px;">
          <span style="color:var(--text-muted); font-size:12px;">Live Preview ({exportFormat.toUpperCase()})</span>
        </div>
        
        <div class="a4-preview">
          <div class="a4-header">
            <h1>KKUSIEM {reportTitle}</h1>
            <div class="a4-badge">INTERNAL USE ONLY</div>
          </div>
          <div class="a4-meta">
            <div><strong>Exported By:</strong> {$usernameStore || 'System Administrator'}</div>
            <div><strong>Date:</strong> {new Date().toLocaleDateString('en-GB')}</div>
          </div>
          <table class="a4-table">
            <thead>
              <tr>
                {#each selectedFields as field}
                  <th>{field}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each previewData.slice(0, 8) as row}
                <tr>
                  {#each selectedFields as field}
                    <td>{row[field.toLowerCase()] || row[field] || '-'}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
          {#if previewData.length > 8}
            <div style="text-align:center; padding:12px; color:#64748b; font-size:11px;">... and {previewData.length - 8} more rows</div>
          {/if}
        </div>
      </div>

    </div>
  </div>
{/if}

<style>
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; font-family: 'Inter', sans-serif; }
  .modal-content { background: var(--bg-panel); border-radius: 12px; border: 1px solid var(--border); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
  
  .format-option { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: 0.2s; background: rgba(0,0,0,0.1); }
  .format-option:hover { background: rgba(255,255,255,0.05); }
  .format-option.selected { border-color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
  .icon-box { font-size: 20px; }
  
  /* A4 Preview Style */
  .a4-preview { width: 100%; aspect-ratio: 1 / 1.414; background: white; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); overflow: hidden; display: flex; flex-direction: column; font-family: 'Times New Roman', serif; color: #000; transform-origin: top center; transform: scale(0.85); }
    .a4-header { padding: 24px; background: #1e293b; color: white; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #10b981; }
    .a4-header h1 { font-size: 16px; margin: 0; font-family: 'Arial', sans-serif; }
    .a4-badge { font-size: 8px; padding: 4px 8px; background: #ef4444; color: white; font-weight: bold; border-radius: 2px; }
    .a4-meta { padding: 16px 24px; display: flex; justify-content: space-between; font-size: 10px; color: #334155; border-bottom: 1px solid #cbd5e1; font-family: 'Arial', sans-serif; }
    .a4-table { width: 100%; border-collapse: collapse; font-size: 9px; font-family: 'Arial', sans-serif; }
    .a4-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; border-bottom: 2px solid #cbd5e1; color: #334155; }
    .a4-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; color: #0f172a; }
  
  .a4-table tr:nth-child(even) { background: #f8fafc; }
</style>


