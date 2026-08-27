<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let show = false;
  
  let step = 1;
  let dateRange = '7d';
  let minSeverity = 'all';
  let format = 'pdf';
  
  function handleNext() {
    if (step < 3) step++;
  }
  
  function handleBack() {
    if (step > 1) step--;
  }
  
  function handleGenerate() {
    dispatch('generate', { dateRange, minSeverity, format });
    close();
  }
  
  function close() {
    show = false;
    step = 1;
    dispatch('close');
  }
</script>

{#if show}
  <div class="modal-backdrop" on:click|self={close}>
    <div class="wizard-modal">
      <div class="wizard-header">
        <div class="wizard-title"><i class="ti ti-report"></i> Report Wizard</div>
        <button class="close-btn" on:click={close}><i class="ti ti-x"></i></button>
      </div>
      
      <div class="wizard-progress">
        <div class="step {step >= 1 ? 'active' : ''}">1. Date Range</div>
        <div class="step {step >= 2 ? 'active' : ''}">2. Filters</div>
        <div class="step {step >= 3 ? 'active' : ''}">3. Export Format</div>
      </div>
      
      <div class="wizard-body">
        {#if step === 1}
          <h3 style="margin-top:0;">Select Data Range</h3>
          <p style="color:var(--text-muted);font-size:13px;">Choose the time period for the report.</p>
          <div class="radio-group">
            <label><input type="radio" bind:group={dateRange} value="24h"> Last 24 Hours</label>
            <label><input type="radio" bind:group={dateRange} value="7d"> Last 7 Days</label>
            <label><input type="radio" bind:group={dateRange} value="30d"> Last 30 Days</label>
            <label><input type="radio" bind:group={dateRange} value="all"> All Time</label>
          </div>
        {:else if step === 2}
          <h3 style="margin-top:0;">Apply Filters</h3>
          <p style="color:var(--text-muted);font-size:13px;">Filter events by minimum severity.</p>
          <div class="radio-group">
            <label><input type="radio" bind:group={minSeverity} value="all"> All Severities</label>
            <label><input type="radio" bind:group={minSeverity} value="medium"> Medium & Above</label>
            <label><input type="radio" bind:group={minSeverity} value="high"> High & Above</label>
            <label><input type="radio" bind:group={minSeverity} value="critical"> Critical Only</label>
          </div>
        {:else if step === 3}
          <h3 style="margin-top:0;">Select Format</h3>
          <p style="color:var(--text-muted);font-size:13px;">Choose the output format for the report.</p>
          <div class="format-cards">
            <div class="format-card {format === 'pdf' ? 'selected' : ''}" on:click={() => format = 'pdf'}>
              <i class="ti ti-file-type-pdf" style="color:#ef4444;font-size:32px;"></i>
              <div>PDF Report</div>
            </div>
            <div class="format-card {format === 'html' ? 'selected' : ''}" on:click={() => format = 'html'}>
              <i class="ti ti-file-type-html" style="color:#3b82f6;font-size:32px;"></i>
              <div>HTML Report</div>
            </div>
            <div class="format-card {format === 'docx' ? 'selected' : ''}" on:click={() => format = 'docx'}>
              <i class="ti ti-file-type-doc" style="color:#10b981;font-size:32px;"></i>
              <div>Word Document</div>
            </div>
          </div>
        {/if}
      </div>
      
      <div class="wizard-footer">
        {#if step > 1}
          <button class="ds-btn" on:click={handleBack}>Back</button>
        {:else}
          <div></div>
        {/if}
        
        {#if step < 3}
          <button class="ds-btn primary" on:click={handleNext}>Next <i class="ti ti-arrow-right"></i></button>
        {:else}
          <button class="ds-btn primary" on:click={handleGenerate}><i class="ti ti-download"></i> Generate Report</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
  }
  .wizard-modal {
    background: var(--bg-surface, #1e293b);
    border: 1px solid var(--border, #334155);
    border-radius: 12px;
    width: 100%; max-width: 500px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    display: flex; flex-direction: column;
    color: var(--text-primary, #f8fafc);
  }
  .wizard-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid var(--border, #334155);
  }
  .wizard-title { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 18px; }
  .close-btn:hover { color: var(--text-primary); }
  
  .wizard-progress {
    display: flex;
    background: rgba(0,0,0,0.1);
    border-bottom: 1px solid var(--border, #334155);
  }
  .step {
    flex: 1; text-align: center; padding: 12px; font-size: 12px; font-weight: 600;
    color: var(--text-muted); position: relative;
  }
  .step.active { color: var(--cyan, #00d4ff); }
  .step.active::after {
    content: ''; position: absolute; bottom: -1px; left: 0; width: 100%; height: 2px;
    background: var(--cyan, #00d4ff);
  }
  
  .wizard-body { padding: 24px 20px; min-height: 200px; }
  .radio-group { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
  .radio-group label {
    display: flex; align-items: center; gap: 10px; cursor: pointer;
    background: var(--bg-panel, #0f172a); padding: 12px 16px; border-radius: 8px;
    border: 1px solid var(--border, #334155); transition: 0.2s;
  }
  .radio-group label:hover { border-color: var(--cyan, #00d4ff); }
  
  .format-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 20px; }
  .format-card {
    background: var(--bg-panel, #0f172a); border: 2px solid var(--border, #334155);
    border-radius: 12px; padding: 20px 10px; text-align: center; cursor: pointer;
    transition: 0.2s; display: flex; flex-direction: column; align-items: center; gap: 10px;
    font-size: 13px; font-weight: 600;
  }
  .format-card:hover { border-color: rgba(255,255,255,0.2); }
  .format-card.selected { border-color: var(--cyan, #00d4ff); background: rgba(0,212,255,0.05); }
  
  .wizard-footer {
    display: flex; justify-content: space-between; padding: 16px 20px;
    border-top: 1px solid var(--border, #334155); background: var(--bg-secondary);
  }
  .ds-btn {
    padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 13px;
    cursor: pointer; transition: 0.2s; border: 1px solid var(--border, #334155);
    background: var(--bg-panel, #0f172a); color: var(--text-primary);
  }
  .ds-btn:hover { filter: brightness(1.2); }
  .ds-btn.primary { background: var(--cyan, #00d4ff); color: var(--text-primary); border: none; }
</style>
