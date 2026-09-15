<script lang="ts">
  import { onMount } from 'svelte';
  import { globalReportStore, closeReportWizard } from '../../stores/globalReportStore';
  
  let session = $globalReportStore;
  $: session = $globalReportStore;
  
  let currentStep = 1;
  let isGenerating = false;
  let isEditing = false;
  let aiText = '';
  
  // Verification checklist
  let verifyData = false;
  let verifyCorrectness = false;
  
  function nextStep() {
    if (currentStep < 3) currentStep++;
  }
  
  function prevStep() {
    if (currentStep > 1) currentStep--;
  }
  
  function close() {
    closeReportWizard();
    currentStep = 1;
    verifyData = false;
    verifyCorrectness = false;
    aiText = '';
    isEditing = false;
  }
  
  async function generateAI() {
    isGenerating = true;
    await new Promise(r => setTimeout(r, 1500));
    aiText = "Executive Summary:\nBased on the events analyzed today, there is a high risk of repeated inbound scanning attempts. We recommend updating the firewall rules.\n\nRecommendations:\n1. Block IPs immediately.\n2. Monitor traffic.";
    isGenerating = false;
  }
  
  async function regenerateAI() {
    generateAI();
  }
  
  function toggleEdit() {
    isEditing = !isEditing;
  }
  
  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }
</script>

{#if session.isOpen}
<div class="modal-overlay" on:click={handleOverlayClick} role="dialog" aria-modal="true">
  <div class="modal-content">
    <div class="modal-header">
      <h2>AI Daily Security Report Export</h2>
      <button class="close-btn" on:click={close}><i class="ti ti-x"></i></button>
    </div>
    
    <div class="wizard-steps">
      <div class="step {currentStep >= 1 ? 'active' : ''}">1. Select Data</div>
      <div class="step-connector"></div>
      <div class="step {currentStep >= 2 ? 'active' : ''}">2. AI Analysis</div>
      <div class="step-connector"></div>
      <div class="step {currentStep >= 3 ? 'active' : ''}">3. Preview & Verify</div>
    </div>
    
    <div class="modal-body">
      <!-- STEP 1 -->
      {#if currentStep === 1}
        <div class="step-container">
          <p>Please confirm the data scope before proceeding to AI analysis.</p>
          
          <div class="data-summary">
            <div><strong>Report Type:</strong> {session.reportType}</div>
            <div><strong>Total Events Selected:</strong> {session.dataset?.length || 0} items</div>
            <div><strong>Time Range:</strong> Last 24 hours</div>
          </div>
        </div>
      {/if}
      
      <!-- STEP 2 -->
      {#if currentStep === 2}
        <div class="step-container">
          <div class="ai-controls">
            <div class="btn-group">
              <button class="btn btn-primary" on:click={generateAI} disabled={isGenerating || aiText !== ''}>
                {#if isGenerating}<i class="ti ti-loader ti-spin"></i>{/if} Generate AI Analysis
              </button>
              <button class="btn btn-secondary" on:click={regenerateAI} disabled={isGenerating || aiText === ''}>
                Regenerate AI Analysis
              </button>
              <button class="btn btn-secondary" on:click={toggleEdit} disabled={aiText === ''}>
                Edit AI Analysis
              </button>
            </div>
            
            <div class="lang-toggle">
              <span class="lang-label">Language:</span>
              <select class="ds-select" style="width: auto;">
                <option value="th">TH</option>
                <option value="en">EN</option>
              </select>
            </div>
          </div>
          
          <div class="ai-result">
            {#if !aiText && !isGenerating}
              <div class="empty-state">Click "Generate AI Analysis" to start.</div>
            {:else if isGenerating}
              <div class="empty-state"><i class="ti ti-loader ti-spin"></i> Generating analysis...</div>
            {:else}
              {#if isEditing}
                <textarea bind:value={aiText} class="edit-textarea"></textarea>
              {:else}
                <div class="text-display">
                  {@html aiText.replace(/\n/g, '<br/>')}
                </div>
              {/if}
            {/if}
          </div>
        </div>
      {/if}
      
      <!-- STEP 3 -->
      {#if currentStep === 3}
        <div class="step-container">
          <p>Please review your report content and verify before finalizing the export.</p>
          
          <div class="preview-box">
            <h4>Report Preview</h4>
            <div class="preview-content">
              <strong>AI Analysis:</strong><br/>
              {@html aiText ? aiText.replace(/\n/g, '<br/>') : 'No AI Analysis provided.'}
              <br/><br/>
              <strong>Data Scope:</strong> {session.dataset?.length || 0} events
            </div>
          </div>
          
          <div class="verification-box">
            <h4>Verification Checklist</h4>
            <label class="check-row">
              <input type="checkbox" bind:checked={verifyData} />
              <span>ตรวจสอบข้อมูลก่อนส่งออก</span>
            </label>
            <label class="check-row">
              <input type="checkbox" bind:checked={verifyCorrectness} />
              <span>ยืนยันความถูกต้อง</span>
            </label>
          </div>
        </div>
      {/if}
    </div>
    
    <div class="modal-footer">
      {#if currentStep > 1}
        <button class="btn btn-secondary" on:click={prevStep}>Back</button>
      {:else}
        <div></div>
      {/if}
      
      {#if currentStep < 3}
        <button class="btn btn-primary" on:click={nextStep}>Next</button>
      {:else}
        <button class="btn btn-success" disabled={!verifyData || !verifyCorrectness} on:click={close}>
          Confirm & Export
        </button>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(2px);
  }
  
  .modal-content {
    background: var(--bg-primary);
    width: 900px;
    max-width: 95vw;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }
  
  .modal-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .modal-header h2 {
    margin: 0;
    font-size: 20px;
    color: var(--text-primary);
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: var(--text-muted);
  }
  
  .wizard-steps {
    display: flex;
    align-items: center;
    padding: 16px 40px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }
  
  .step {
    font-weight: 600;
    color: var(--text-muted);
    font-size: 14px;
    padding: 8px 16px;
    border-radius: 20px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
  }
  
  .step.active {
    background: var(--green-bg);
    color: var(--green);
    border-color: var(--green);
  }
  
  .step-connector {
    flex: 1;
    height: 2px;
    background: var(--border);
    margin: 0 12px;
  }
  
  .modal-body {
    padding: 24px;
    flex: 1;
    overflow-y: auto;
  }
  
  .step-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .data-summary {
    background: var(--bg-secondary);
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .ai-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .btn-group {
    display: flex;
    gap: 12px;
  }
  
  .lang-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: #fff;
  }
  
  .btn-secondary {
    background: var(--bg-secondary);
    border-color: var(--border);
    color: var(--text-primary);
  }
  
  .btn-success {
    background: #10b981;
    color: var(--text-primary);
  }
  
  .ai-result {
    border: 1px solid var(--border);
    border-radius: 8px;
    min-height: 250px;
    background: var(--bg-secondary);
    padding: 16px;
  }
  
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--text-muted);
    font-style: italic;
  }
  
  .edit-textarea {
    width: 100%;
    height: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 12px;
    color: var(--text-primary);
    font-family: inherit;
    resize: vertical;
  }
  
  .text-display {
    line-height: 1.6;
  }
  
  .preview-box {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  
  .preview-box h4 {
    margin-top: 0;
    margin-bottom: 12px;
  }
  
  .preview-content {
    background: var(--bg-secondary);
    padding: 16px;
    border-radius: 4px;
    font-size: 14px;
  }
  
  .verification-box {
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    padding: 16px;
    border-radius: 8px;
  }
  
  .verification-box h4 {
    margin-top: 0;
    margin-bottom: 12px;
    color: #d97706;
  }
  
  .check-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    cursor: pointer;
    font-weight: 600;
  }
  
  .modal-footer {
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
  }
</style>
