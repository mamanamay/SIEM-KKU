<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { globalReportStore, closeReportWizard } from '../../stores/globalReportStore';
  import { getPageSchema, getDefaultSelectedFields } from './exportSchemas';
  import {
    generateExecutiveSummaryHtml,
    generateTechnicalDetailsHtml,
    generateCsvContent
  } from './ReportTemplates';
  import { callKKUAI } from '../utils/kkuai';
  import { getKKUAIModel } from '../utils/kkuai';
  import { showNotification } from '../../stores/notificationStore';

  // Subscription to store
  $: session = $globalReportStore;
  $: schema = getPageSchema(session.sourcePage);

  // Users for dropdown
  let activeUsers: { username: string; role: string }[] = [];

  // Local UI State
  let isLoading = false;
  let validationLoading = false;
  let aiChatLoading = false;
  let aiChatInput = '';
  let showValidationModal = false;
  let showChatModal = false;

  // Search in Step 2
  let ipSearch = '';

  // Filtered IPs based on search
  $: filteredIps = session.allIpSummaries.filter(s =>
    s.ip.toLowerCase().includes(ipSearch.toLowerCase()) ||
    s.primaryType.toLowerCase().includes(ipSearch.toLowerCase())
  );

  onMount(async () => {
    try {
      const res = await fetch('/api/export/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        activeUsers = await res.json();
      }
    } catch (e) {
      console.error('Failed to load users', e);
    }
  });

  function nextStep() {
    if (session.currentStep === 1) {
      if (!session.reportTitle.trim()) {
        showNotification('Error', 'กรุณาระบุชื่อรายงาน', 'error');
        return;
      }
    }
    if (session.currentStep === 2) {
      if (session.selectedIPs.length === 0) {
        showNotification('Warning', 'คุณยังไม่ได้เลือก IP ใดๆ (ข้อมูลอาจว่างเปล่า)', 'warning');
      }
      generatePreview();
    }
    if (session.currentStep < 4) {
      globalReportStore.update(s => ({ ...s, currentStep: s.currentStep + 1 }));
    }
  }

  function prevStep() {
    if (session.currentStep > 1) {
      globalReportStore.update(s => ({ ...s, currentStep: s.currentStep - 1 }));
    }
  }

  // --- Step 2 Actions ---
  function toggleField(key: string) {
    const set = new Set(session.selectedFields);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    globalReportStore.update(s => ({ ...s, selectedFields: Array.from(set) }));
  }

  function toggleIp(ip: string) {
    const set = new Set(session.selectedIPs);
    if (set.has(ip)) set.delete(ip);
    else set.add(ip);
    globalReportStore.update(s => ({ ...s, selectedIPs: Array.from(set) }));
  }

  function selectAllIps() {
    const all = filteredIps.map(s => s.ip);
    const set = new Set([...session.selectedIPs, ...all]);
    globalReportStore.update(s => ({ ...s, selectedIPs: Array.from(set) }));
  }

  function clearAllIps() {
    const currentList = new Set(filteredIps.map(s => s.ip));
    const newSelected = session.selectedIPs.filter(ip => !currentList.has(ip));
    globalReportStore.update(s => ({ ...s, selectedIPs: newSelected }));
  }

  // --- Step 3 Actions (Preview & AI) ---
  function generatePreview() {
    let html = '';
    if (session.reportType === 'executive') {
      html = generateExecutiveSummaryHtml(session);
    } else {
      html = generateTechnicalDetailsHtml(session);
    }
    globalReportStore.update(s => ({ ...s, previewHtml: html }));
  }

  function updatePreviewManual() {
     generatePreview();
  }

  async function runAiValidation() {
    validationLoading = true;
    showValidationModal = true;
    try {
      const res = await fetch('/api/export/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          content: session.previewHtml,
          reportData: {
            statedEventCount: session.dataset.length,
            actualEventCount: session.dataset.length,
            events: session.dataset.filter(e => session.selectedIPs.includes(e.ip || e['IP Address']))
          }
        })
      });
      
      const result = await res.json();
      globalReportStore.update(s => ({ ...s, validationResult: result }));
      
    } catch (e) {
      console.error(e);
      showNotification('Error', 'AI Validation Failed', 'error');
    } finally {
      validationLoading = false;
    }
  }
  
  async function overrideValidation() {
    showValidationModal = false;
  }

  async function askAiAssistant() {
    if (!aiChatInput.trim()) return;
    aiChatLoading = true;
    
    const messages = [
      { role: 'system', content: 'You are an AI Security Analyst assisting with an Executive Summary. Read the current context and follow the user request.' },
      { role: 'user', content: `Current Summary:\n${session.manualEdits.executiveSummary || session.aiContent?.executiveSummary || 'None'}\n\nUser Request: ${aiChatInput}` }
    ];
    
    try {
      const apiKey = localStorage.getItem('kkuai_api_key') || '';
      const model = getKKUAIModel();
      const response = await callKKUAI(apiKey, model, messages);
      
      if (response && response.choices && response.choices[0]) {
        const newText = response.choices[0].message.content;
        globalReportStore.update(s => ({
          ...s,
          manualEdits: { ...s.manualEdits, executiveSummary: newText }
        }));
        generatePreview();
        showNotification('Success', 'AI Updated the summary', 'success');
        showChatModal = false;
        aiChatInput = '';
      }
    } catch (e) {
      console.error(e);
      showNotification('Error', 'AI Chat Failed', 'error');
    } finally {
      aiChatLoading = false;
    }
  }

  // --- Step 4 Actions (Export) ---
  async function finalizeExport() {
    if (session.validationResult?.hasCritical) {
      const proceed = confirm("There are Critical Errors in the validation. Do you really want to export?");
      if (!proceed) return;
    }

    isLoading = true;
    try {
      if (session.fileFormat === 'pdf') {
        const res = await fetch('/api/export/pdf', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            htmlContent: session.previewHtml,
            reportTitle: session.reportTitle,
            reportId: session.reportId,
            reportVersion: session.reportVersion,
            reportType: session.reportType,
            language: session.language,
            preparedBy: session.preparedBy,
            reviewedBy: session.reviewedBy,
            exportedBy: session.exportedBy,
            sourcePage: session.sourcePage,
            selectedIpCount: session.selectedIPs.length,
            selectedFieldCount: session.selectedFields.length
          })
        });
        
        if (!res.ok) throw new Error('PDF generation failed');
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disp = res.headers.get('Content-Disposition');
        let filename = `${session.reportId}.pdf`;
        if (disp) {
          const match = disp.match(/filename="?([^"]+)"?/);
          if (match) filename = match[1];
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
      } else if (session.fileFormat === 'html') {
        const blob = new Blob([session.previewHtml], { type: 'text/html;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.reportId}.html`;
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        await fetch('/api/export/save-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ ...session, format: 'html', content: session.previewHtml })
        });
        
      } else if (session.fileFormat === 'csv') {
        const csv = generateCsvContent(session);
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${session.reportId}.csv`;
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
        await fetch('/api/export/save-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ ...session, format: 'csv', content: csv })
        });
      }

      showNotification('Success', 'Report exported successfully', 'success');
      closeReportWizard();
    } catch (e) {
      console.error(e);
      showNotification('Error', 'Export failed', 'error');
    } finally {
      isLoading = false;
    }
  }
</script>

{#if session.isOpen}
<div class="wizard-overlay">
  <div class="wizard-container">
    
    <!-- Header -->
    <div class="wizard-header">
      <h2>Export Report <span class="badge">v2</span></h2>
      <button class="btn-close" on:click={closeReportWizard}>&times;</button>
    </div>

    <!-- Stepper -->
    <div class="wizard-steps">
      <div class="step {session.currentStep >= 1 ? 'active' : ''}">1. Metadata</div>
      <div class="step {session.currentStep >= 2 ? 'active' : ''}">2. Select Data</div>
      <div class="step {session.currentStep >= 3 ? 'active' : ''}">3. Preview & AI</div>
      <div class="step {session.currentStep >= 4 ? 'active' : ''}">4. Export</div>
    </div>

    <div class="wizard-body">
      
      <!-- STEP 1: Metadata -->
      {#if session.currentStep === 1}
        <div class="step-content">
          <h3>Report Metadata</h3>
          
          <div class="form-grid">
            <div class="form-group">
              <label>Report Type</label>
              <select bind:value={session.reportType} disabled={schema.allowExecOnly} on:change={() => {
                if (session.reportType === 'executive') session.fileFormat = 'pdf';
              }}>
                <option value="executive">Executive Summary</option>
                <option value="technical" disabled={schema.allowExecOnly}>Technical Details</option>
              </select>
              {#if schema.allowExecOnly}
                <small class="hint" style="color:#64748b;font-size:0.8rem">This page supports Executive Summary only.</small>
              {/if}
            </div>

            <div class="form-group">
              <label>Report Title</label>
              <input type="text" bind:value={session.reportTitle} placeholder="Enter report title..." />
            </div>

            <div class="form-group">
              <label>Language</label>
              <select bind:value={session.language}>
                <option value="th">ภาษาไทย (TH)</option>
                <option value="en">English (EN)</option>
              </select>
            </div>
            
            <div class="form-group">
              <label>Report ID (Auto)</label>
              <input type="text" value={session.reportId} disabled />
            </div>



            <div class="form-group">
              <label>Exported By</label>
              <input type="text" value={session.exportedBy} disabled />
            </div>
          </div>
        </div>
      {/if}

      <!-- STEP 2: Select Data -->
      {#if session.currentStep === 2}
        <div class="step-content">
          <div class="split-layout">
            <div class="fields-section">
              <h3>Select Fields</h3>
              {#each schema.fieldGroups as group}
                <div class="field-group">
                  <h4>{session.language === 'en' ? group.groupEn : group.group}</h4>
                  <div class="checkbox-grid">
                    {#each group.fields as field}
                      <label class="cb-label" title={field.readOnly ? 'Evidence Field (Read Only)' : ''}>
                        <input type="checkbox" 
                          checked={session.selectedFields.includes(field.key)} 
                          on:change={() => toggleField(field.key)} 
                        />
                        {session.language === 'en' ? field.labelEn : field.label}
                        {#if field.readOnly}<span class="ro-badge">RO</span>{/if}
                      </label>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>

            <div class="ips-section">
              <h3>Select IPs / Targets</h3>
              <div class="search-bar">
                <input type="text" bind:value={ipSearch} placeholder="Search IP or Type..." />
                <button on:click={selectAllIps} class="btn-sm">Select All</button>
                <button on:click={clearAllIps} class="btn-sm btn-outline">Clear</button>
              </div>
              <div class="ip-list">
                {#each filteredIps as s}
                  <label class="ip-item">
                    <input type="checkbox" 
                      checked={session.selectedIPs.includes(s.ip)}
                      on:change={() => toggleIp(s.ip)}
                    />
                    <div class="ip-info">
                      <span class="ip-addr">{s.ip}</span>
                      <span class="ip-count">{s.eventCount} events</span>
                      <span class="ip-type">{s.primaryType}</span>
                    </div>
                    <span class="sev-dot sev-{s.severity}"></span>
                  </label>
                {/each}
                {#if filteredIps.length === 0}
                  <p class="no-data" style="padding:16px;text-align:center;color:#64748b">No IPs found.</p>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <!-- STEP 3: Preview & AI -->
      {#if session.currentStep === 3}
        <div class="step-content" style="display:flex;flex-direction:column;">
          <div class="preview-header">
            <h3>Preview & Validation</h3>
            <div class="preview-actions">
              <button class="btn btn-warning" on:click={runAiValidation} disabled={validationLoading}>
                {validationLoading ? 'Checking...' : 'AI Check Report'}
              </button>
              {#if session.reportType === 'executive'}
                <button class="btn btn-ai" on:click={() => showChatModal = true}>
                  ✨ AI Assistant
                </button>
              {/if}
              <button class="btn btn-primary" on:click={updatePreviewManual}>Refresh Preview</button>
            </div>
          </div>
          
          {#if session.validationResult}
            <div class="validation-banner {session.validationResult.hasCritical ? 'critical' : session.validationResult.passed ? 'passed' : 'warning'}">
              <strong>Validation Status:</strong> 
              {session.validationResult.hasCritical ? 'CRITICAL ERRORS FOUND' : session.validationResult.passed ? 'PASSED' : 'WARNINGS FOUND'}
              <button class="btn-sm" on:click={() => showValidationModal = true} style="margin-left:12px">View Details</button>
            </div>
          {/if}

          <div class="preview-split">
            {#if session.reportType === 'executive'}
              <div class="manual-edit-panel">
                <h4>Manual Edits</h4>
                <div class="form-group">
                  <label>Executive Summary</label>
                  <textarea bind:value={session.manualEdits.executiveSummary} rows="10" placeholder="AI content or manual text..."></textarea>
                </div>
                <div class="form-group">
                  <label>Recommendations</label>
                  <textarea bind:value={session.manualEdits.recommendations} rows="8" placeholder="Recommendations (one per line)..."></textarea>
                </div>
                <div class="form-group">
                  <label>Analyst Assessment</label>
                  <select bind:value={session.analystAssessment}>
                    <option value="">-- Select --</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Likely">Likely</option>
                    <option value="Suspicious">Suspicious</option>
                    <option value="FalsePositive">False Positive</option>
                    <option value="NeedsInvestigation">Needs Investigation</option>
                  </select>
                </div>
              </div>
            {/if}
            <div class="preview-frame-container">
              <iframe title="Preview" srcdoc={session.previewHtml} class="preview-frame"></iframe>
            </div>
          </div>
        </div>
      {/if}

      <!-- STEP 4: Export -->
      {#if session.currentStep === 4}
        <div class="step-content center-content">
          <h3>Final Confirmation</h3>
          
          <div class="confirmation-card">
            <div class="conf-row"><span>Report ID:</span> <strong>{session.reportId}</strong></div>
            <div class="conf-row"><span>Type:</span> <strong>{session.reportType === 'executive' ? 'Executive Summary' : 'Technical Details'}</strong></div>
            <div class="conf-row"><span>Selected IPs:</span> <strong>{session.selectedIPs.length}</strong></div>
            <div class="conf-row"><span>Language:</span> <strong>{session.language.toUpperCase()}</strong></div>
            
            {#if session.validationResult?.hasCritical}
              <div class="conf-alert">
                ⚠️ Critical Validation Errors exist! Export is not recommended.
              </div>
            {/if}
          </div>

          <div class="format-selection">
            <h4>Select Format</h4>
            <label class="format-option">
              <input type="radio" bind:group={session.fileFormat} value="pdf" />
              <span>PDF Document</span>
            </label>
            <label class="format-option">
              <input type="radio" bind:group={session.fileFormat} value="html" />
              <span>HTML File</span>
            </label>
            <label class="format-option {session.reportType === 'executive' ? 'disabled' : ''}">
              <input type="radio" bind:group={session.fileFormat} value="csv" disabled={session.reportType === 'executive'} />
              <span>CSV Data</span>
              {#if session.reportType === 'executive'}<small>(Technical only)</small>{/if}
            </label>
          </div>
        </div>
      {/if}
      
    </div>

    <!-- Footer -->
    <div class="wizard-footer">
      <div>
        {#if session.currentStep > 1}
          <button class="btn btn-outline" on:click={prevStep}>Back</button>
        {/if}
      </div>
      <div>
        <button class="btn btn-outline" on:click={closeReportWizard} style="margin-right: 12px;">Cancel</button>
        {#if session.currentStep < 4}
          <button class="btn btn-primary" on:click={nextStep}>Next</button>
        {:else}
          <button class="btn btn-success" on:click={finalizeExport} disabled={isLoading}>
            {isLoading ? 'Exporting...' : 'Confirm & Export'}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- Modals -->
{#if showValidationModal}
  <div class="modal-overlay">
    <div class="modal-content">
      <h3 style="margin-top:0">AI Validation Results</h3>
      <div class="issues-list">
        {#each session.validationResult?.issues || [] as issue}
          <div class="issue-item issue-{issue.level}">
            <strong>[{issue.level.toUpperCase()}] {issue.category.replace('_', ' ')}</strong>
            <p style="margin:4px 0">{issue.message}</p>
            {#if issue.detail}<small style="opacity:0.8">{issue.detail}</small>{/if}
          </div>
        {/each}
        {#if !session.validationResult?.issues?.length}
          <p>No issues found. Report is clean.</p>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" on:click={overrideValidation}>Acknowledge</button>
      </div>
    </div>
  </div>
{/if}

{#if showChatModal}
  <div class="modal-overlay">
    <div class="modal-content">
      <h3 style="margin-top:0">AI Assistant</h3>
      <p>Ask AI to rewrite or adjust the Executive Summary.</p>
      <textarea bind:value={aiChatInput} rows="4" placeholder="E.g., Make it sound more urgent, translate to formal Thai..." style="width:100%;padding:8px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:4px;margin-bottom:12px;"></textarea>
      <div class="modal-footer">
        <button class="btn btn-outline" on:click={() => showChatModal = false}>Cancel</button>
        <button class="btn btn-ai" on:click={askAiAssistant} disabled={aiChatLoading}>
          {aiChatLoading ? 'Thinking...' : 'Send to AI'}
        </button>
      </div>
    </div>
  </div>
{/if}
{/if}

<style>
  .wizard-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; }
  .wizard-container { background: #fff; width: 90vw; max-width: 1200px; height: 90vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
  .wizard-header { padding: 16px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
  .wizard-header h2 { margin: 0; font-size: 1.25rem; display: flex; align-items: center; gap: 8px; color: #0f172a; }
  .badge { background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; }
  .btn-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #64748b; }
  
  .wizard-steps { display: flex; background: #f1f5f9; padding: 12px 24px; gap: 8px; }
  .step { flex: 1; padding: 8px; text-align: center; border-radius: 6px; font-size: 0.9rem; color: #64748b; background: #e2e8f0; }
  .step.active { background: #3b82f6; color: white; font-weight: 600; }
  
  .wizard-body { flex: 1; overflow-y: auto; padding: 24px; background: #f8fafc; display: flex; flex-direction: column; }
  .step-content { background: white; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0; flex: 1; display: flex; flex-direction: column; }
  .step-content h3 { margin-top: 0; margin-bottom: 20px; color: #1e293b; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
  
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
  .form-group label { font-weight: 600; font-size: 0.9rem; color: #475569; }
  .form-group input, .form-group select, .form-group textarea { padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }
  .form-group input:disabled, .form-group select:disabled { background: #f1f5f9; color: #94a3b8; }
  
  .split-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex: 1; min-height: 0; }
  .fields-section { overflow-y: auto; padding-right: 16px; border-right: 1px solid #e2e8f0; }
  .ips-section { display: flex; flex-direction: column; }
  .field-group { margin-bottom: 20px; }
  .field-group h4 { margin: 0 0 10px 0; font-size: 0.95rem; color: #334155; }
  .checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cb-label { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; cursor: pointer; color: #1e293b; }
  .ro-badge { font-size: 0.65rem; background: #e2e8f0; padding: 1px 4px; border-radius: 4px; color: #64748b; font-weight: 600; }
  
  .search-bar { display: flex; gap: 8px; margin-bottom: 12px; }
  .search-bar input { flex: 1; padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 4px; }
  .btn-sm { padding: 6px 12px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: #475569; }
  .btn-sm:hover { background: #e2e8f0; }
  .ip-list { border: 1px solid #e2e8f0; border-radius: 6px; flex: 1; overflow-y: auto; }
  .ip-item { display: flex; align-items: center; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
  .ip-item:hover { background: #f8fafc; }
  .ip-info { flex: 1; display: flex; flex-direction: column; margin-left: 12px; }
  .ip-addr { font-weight: 600; font-family: monospace; color: #0f172a; }
  .ip-count, .ip-type { font-size: 0.75rem; color: #64748b; }
  .sev-dot { width: 10px; height: 10px; border-radius: 50%; }
  .sev-critical { background: #dc2626; } .sev-high { background: #ea580c; } .sev-medium { background: #ca8a04; } .sev-low { background: #16a34a; }
  
  .preview-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .preview-actions { display: flex; gap: 8px; }
  .preview-split { display: flex; gap: 20px; flex: 1; min-height: 0; }
  .manual-edit-panel { width: 350px; border-right: 1px solid #e2e8f0; padding-right: 20px; overflow-y: auto; display: flex; flex-direction: column; }
  .preview-frame-container { flex: 1; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; display: flex; }
  .preview-frame { width: 100%; height: 100%; border: none; flex: 1; }
  
  .validation-banner { padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem; }
  .validation-banner.passed { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
  .validation-banner.warning { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
  .validation-banner.critical { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  
  .center-content { align-items: center; padding-top: 40px; }
  .confirmation-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px; width: 100%; max-width: 500px; }
  .conf-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; color: #334155; }
  .conf-alert { margin-top: 16px; padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 6px; text-align: center; font-weight: 600; font-size: 0.95rem; }
  .format-selection { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 500px; }
  .format-option { display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; color: #1e293b; font-weight: 500; }
  .format-option:hover { background: #f8fafc; }
  .format-option.disabled { opacity: 0.5; cursor: not-allowed; background: #f1f5f9; }
  
  .wizard-footer { padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; background: #fff; }
  
  .btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; border: none; font-size: 0.95rem; }
  .btn-primary { background: #3b82f6; color: white; }
  .btn-primary:hover { background: #2563eb; }
  .btn-success { background: #10b981; color: white; }
  .btn-success:hover { background: #059669; }
  .btn-outline { background: white; border: 1px solid #cbd5e1; color: #475569; }
  .btn-outline:hover { background: #f8fafc; }
  .btn-warning { background: #f59e0b; color: white; }
  .btn-warning:hover { background: #d97706; }
  .btn-ai { background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%); color: white; }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  
  .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000; }
  .modal-content { background: white; padding: 24px; border-radius: 8px; width: 500px; max-width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
  .modal-footer { margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px; }
  .issues-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
  .issue-item { padding: 12px; border-radius: 6px; font-size: 0.9rem; border: 1px solid transparent; }
  .issue-error { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
  .issue-warning { background: #fef9c3; color: #854d0e; border-color: #fef08a; }
  .issue-info { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }
</style>
