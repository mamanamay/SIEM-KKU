<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { globalReportStore, closeReportWizard, AI_BRIEFING_SECTIONS } from '../../stores/globalReportStore';
  import { getPageSchema, getDefaultSelectedFields, UNIFIED_FIELD_GROUPS, ALL_GROUP_KEYS, deriveFieldsFromGroups } from './exportSchemas';
  import {
    generateExecutiveSummaryHtml,
    generateTechnicalDetailsHtml,
    generateAiBriefingHtml,
    generateCsvContent,
    generateIncidentDeepDiveHtml
  } from './ReportTemplates';
  import { callKKUAI } from '../utils/kkuai';
  
  import { showNotification } from '../../stores/notificationStore';
  import { analyzeCveSimilarity, getSimilarityColor, getSimilarityBg } from './CveSimilarityEngine';

  // Subscription to store
  $: session = $globalReportStore;
  $: schema = getPageSchema(session.sourcePage);
  $: isAiBriefing = session.sourcePage === 'ai-briefing';

  // Users for dropdown
  let activeUsers: { username: string; role: string }[] = [];

  // Local UI State
  let isLoading = false;
  let validationLoading = false;
  let aiChatLoading = false;
  let cveAnalysisLoading = false;
  let aiChatInput = '';
  let showValidationModal = false;
  let showChatModal = false;
  let isLiveEditMode = false;
  let previewIframe: HTMLIFrameElement;

  // Search in Step 2
  let ipSearch = '';

  // Filtered IPs based on search
  $: filteredIps = session.allIpSummaries.filter(s =>
    s.ip.toLowerCase().includes(ipSearch.toLowerCase()) ||
    s.primaryType.toLowerCase().includes(ipSearch.toLowerCase())
  );

  // --- Live Edit Handlers ---
  function toggleLiveEdit() {
    isLiveEditMode = !isLiveEditMode;
    if (previewIframe && previewIframe.contentDocument) {
      previewIframe.contentDocument.body.contentEditable = isLiveEditMode ? 'true' : 'false';
      if (isLiveEditMode) {
        previewIframe.contentDocument.body.style.border = '2px dashed #3b82f6';
        previewIframe.contentDocument.body.style.padding = '8px';
        showNotification('Edit Mode Enabled', 'สามารถคลิกและพิมพ์แก้ไขข้อความในรายงานได้โดยตรง', 'info');
      } else {
        previewIframe.contentDocument.body.style.border = 'none';
        previewIframe.contentDocument.body.style.padding = '0';
        syncLiveEditToSession();
        showNotification('Edit Mode Disabled', 'บันทึกการแก้ไขเรียบร้อยแล้ว', 'success');
      }
    }
  }

  function syncLiveEditToSession() {
    if (previewIframe && previewIframe.contentDocument) {
       const newHtml = '<!DOCTYPE html>\n' + previewIframe.contentDocument.documentElement.outerHTML;
       globalReportStore.update(s => ({ ...s, previewHtml: newHtml }));
    }
  }

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
      if (!isAiBriefing && session.selectedIPs.length === 0) {
        showNotification('Warning', 'คุณยังไม่ได้เลือก IP ใดๆ (ข้อมูลอาจว่างเปล่า)', 'warning');
      }
      generatePreview();
    }
    if (session.currentStep === 3) {
      if (isLiveEditMode) {
        syncLiveEditToSession(); // save edits before leaving step 3
      }
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

  // --- Group Toggle (Step 2 v3) ---
  function toggleGroup(groupKey: string) {
    const groups = new Set(session.selectedGroups || ALL_GROUP_KEYS);
    if (groups.has(groupKey)) groups.delete(groupKey);
    else groups.add(groupKey);
    const newGroups = Array.from(groups);
    const newFields = deriveFieldsFromGroups(newGroups);
    globalReportStore.update(s => ({ ...s, selectedGroups: newGroups, selectedFields: newFields }));
  }

  function isGroupSelected(groupKey: string, currentSession: typeof session): boolean {
    return (currentSession.selectedGroups || ALL_GROUP_KEYS).includes(groupKey);
  }

  // --- AI Briefing Section Toggles (Step 2) ---
  function toggleSection(sectionName: string) {
    const sections = new Set(session.selectedSections ?? AI_BRIEFING_SECTIONS);
    if (sections.has(sectionName)) sections.delete(sectionName);
    else sections.add(sectionName);
    globalReportStore.update(s => ({ ...s, selectedSections: Array.from(sections) }));
  }

  function isSectionSelected(sectionName: string, currentSession: typeof session): boolean {
    return (currentSession.selectedSections ?? AI_BRIEFING_SECTIONS).includes(sectionName);
  }

  function selectAllSections() {
    globalReportStore.update(s => ({ ...s, selectedSections: [...AI_BRIEFING_SECTIONS] }));
  }

  function clearAllSections() {
    globalReportStore.update(s => ({ ...s, selectedSections: [] }));
  }

  // --- CVE Similarity Analysis ---
  async function runCveSimilarity() {
    if (session.selectedIPs.length === 0) {
      showNotification('Warning', 'กรุณาเลือก IP อย่างน้อย 1 รายการก่อน', 'warning');
      return;
    }
    cveAnalysisLoading = true;
    globalReportStore.update(s => ({ ...s, cveSimilarityLoading: true, cveSimilarityResults: [] }));
    try {
      const results = await analyzeCveSimilarity(session.dataset, session.selectedIPs);
      globalReportStore.update(s => ({ ...s, cveSimilarityResults: results, cveSimilarityLoading: false }));
      generatePreview(); // Re-render preview with CVE data
      showNotification('Success', `พบ CVE ที่มีลักษณะคล้าย ${results.length} รายการ`, 'success');
    } catch (e: any) {
      console.error(e);
      showNotification('Error', e.message || 'CVE Similarity Analysis ล้มเหลว', 'error');
      globalReportStore.update(s => ({ ...s, cveSimilarityLoading: false }));
    } finally {
      cveAnalysisLoading = false;
    }
  }

  function viewInCveDatabase(cveId: string) {
    // Navigate to CVE page with query
    window.open(`/dashboard/cve?search=${encodeURIComponent(cveId)}`, '_blank');
  }

  // --- Step 3 Actions (Preview & AI) ---
  function generatePreview() {
    let html = '';
    if (isAiBriefing) {
      html = generateAiBriefingHtml(session);
    } else if (session.reportType === 'incident') {
      html = generateIncidentDeepDiveHtml(session);
    } else if (session.reportType === 'executive') {
      html = generateExecutiveSummaryHtml(session);
    } else {
      html = generateTechnicalDetailsHtml(session);
    }
    globalReportStore.update(s => ({ ...s, previewHtml: html }));
    // Note: Live edit state should be reset on fresh preview generation
    isLiveEditMode = false;
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
          schemaType: session.sourcePage
        })
      });
      if (res.ok) {
        const data = await res.json();
        globalReportStore.update(s => ({ ...s, validationResult: data }));
      }
    } catch (e) {
      console.error('Validation failed', e);
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
      { role: 'system', content: 'You are an AI Security Analyst assisting with an Executive Summary. Read the current context and follow the user request. Respond in the same language as the user request.' },
      { role: 'user', content: `Current Summary:\n${session.manualEdits.executiveSummary || session.aiContent?.executiveSummary || 'None'}\n\nUser Request: ${aiChatInput}` }
    ];
    
    try {
      
      
      // callKKUAI returns a string (content already extracted)
      const newText = await callKKUAI('', messages);
      if (newText) {
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

  // Helper: download HTML as file
  function downloadHtmlBlob(htmlContent: string, filename: string) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  // --- Step 4 Actions (Export) ---
  async function finalizeExport() {
    if (session.validationResult?.hasCritical) {
      const proceed = confirm("There are Critical Errors in the validation. Do you really want to export?");
      if (!proceed) return;
    }

    // Require preview to be generated
    if (!session.previewHtml) {
      showNotification('Warning', 'กรุณารอให้ Preview โหลดเสร็จก่อน', 'warning');
      generatePreview();
      return;
    }

    isLoading = true;
    try {
      if (session.fileFormat === 'pdf') {
        // Try backend PDF generation; fallback to HTML download if unavailable
        try {
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
          
          if (!res.ok) throw new Error('PDF API unavailable');
          
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
        } catch (pdfErr) {
          // Fallback: download as HTML with .html extension
          showNotification('Info', 'PDF server ไม่พร้อม — บันทึกเป็น HTML แทน', 'info');
          downloadHtmlBlob(session.previewHtml, `${session.reportId}.html`);
        }
        
      } else if (session.fileFormat === 'html') {
        downloadHtmlBlob(session.previewHtml, `${session.reportId}.html`);
        
        try {
          await fetch('/api/export/save-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...session, format: 'html', content: session.previewHtml })
          });
        } catch {}
        
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
        
        try {
          await fetch('/api/export/save-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
              body: JSON.stringify({ ...session, format: 'csv', content: csv })
          });
        } catch {}
      }

      showNotification('Success', `Report exported as ${session.fileFormat.toUpperCase()} successfully`, 'success');

      // Save to localStorage history for Report History tab
      try {
        const historyRaw = localStorage.getItem('kkusiem_report_history');
        const history = historyRaw ? JSON.parse(historyRaw) : [];
        const entry = {
          id: Date.now(),
          name: session.reportTitle || `Report ${session.reportId}`,
          date: new Date().toLocaleString('th-TH'),
          format: session.fileFormat.toUpperCase(),
          author: session.exportedBy || localStorage.getItem('username') || 'Unknown',
          previewHtml: session.fileFormat !== 'csv' ? session.previewHtml : null,
          reportId: session.reportId,
        };
        localStorage.setItem('kkusiem_report_history', JSON.stringify([entry, ...history].slice(0, 50)));
      } catch (storageErr) {
        console.warn('Could not save report to history:', storageErr);
      }

      closeReportWizard();
    } catch (e) {
      console.error(e);
      showNotification('Error', 'Export failed: ' + (e as any)?.message, 'error');
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
                if (session.reportType === 'executive' || session.reportType === 'incident') globalReportStore.update(s => ({ ...s, fileFormat: 'pdf' }));
              }}>
                <option value="executive">Executive Summary</option>
                <option value="incident">Incident Deep Dive (Single Target)</option>
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
              <label>Organization</label>
              <input type="text" value="Digital Technology Office, Khon Kaen University" disabled />
            </div>

            <div class="form-group">
              <label>Time Zone</label>
              <input type="text" value="UTC+7 (Asia/Bangkok)" disabled />
            </div>

            <div class="form-group">
              <label>Reviewed By</label>
              <input type="text" bind:value={session.reviewedBy} placeholder="Reviewer name (optional)..." />
            </div>

            <div class="form-group">
              <label>Exported By</label>
              <input type="text" value={session.exportedBy} disabled />
            </div>

            <div class="form-group">
              <label>Reporting Period — From</label>
              <input type="datetime-local" value={session.dateRange.from ? session.dateRange.from.slice(0,16) : ''} on:change={(e) => globalReportStore.update(s => ({ ...s, dateRange: { ...s.dateRange, from: e.currentTarget.value } }))} />
            </div>

            <div class="form-group">
              <label>Reporting Period — To</label>
              <input type="datetime-local" value={session.dateRange.to ? session.dateRange.to.slice(0,16) : ''} on:change={(e) => globalReportStore.update(s => ({ ...s, dateRange: { ...s.dateRange, to: e.currentTarget.value } }))} />
            </div>
          </div>
        </div>
      {/if}


      <!-- STEP 2: Select Data -->
      {#if session.currentStep === 2}
        <div class="step-content">
          <div class="split-layout">
            <div class="fields-section">
              {#if isAiBriefing}
                <!-- ── AI BRIEFING: Section Toggles ── -->
                <div class="step-header-note">
                  <i class="ti ti-brain"></i>
                  <div>
                    <strong>AI Daily Briefing Report</strong> — รายงานนี้ใช้ข้อมูลจาก AI โดยตรง เลือกส่วนที่ต้องการรวมในรายงาน
                  </div>
                </div>
                <div class="ai-sections-grid">
                  {#each AI_BRIEFING_SECTIONS as sectionName}
                    <label class="section-toggle-row" class:active={isSectionSelected(sectionName, session)}>
                      <input
                        type="checkbox"
                        checked={isSectionSelected(sectionName, session)}
                        on:change={() => toggleSection(sectionName)}
                      />
                      <div class="section-toggle-info">
                        <span class="section-name">{sectionName}</span>
                        <span class="section-badge ai-badge">AI Data</span>
                      </div>
                    </label>
                  {/each}
                </div>
                <div class="section-actions">
                  <button class="btn-sm" on:click={selectAllSections}>Select All</button>
                  <button class="btn-sm btn-outline" on:click={clearAllSections}>Clear All</button>
                  <span style="font-size:0.8rem;color:#64748b;margin-left:auto">
                    {(session.selectedSections ?? AI_BRIEFING_SECTIONS).length} / {AI_BRIEFING_SECTIONS.length} sections selected
                  </span>
                </div>
                <div style="margin-top:12px;padding:10px 12px;background:#f0f9ff;border-radius:6px;font-size:0.8rem;color:#1e40af;border:1px solid #bfdbfe;">
                  <strong>ℹ️</strong> AI Briefing Report จะออกได้เฉพาะ Executive Summary เท่านั้น — ข้อมูลมาจาก Gemini AI ที่ประมวลผลล่าสุด
                </div>

              {:else}
                <!-- ── HUNTING / OTHER: Original Field Selection ── -->
                <h3>Select Data Groups</h3>
                <p style="font-size:0.85rem;color:#64748b;margin-bottom:16px;">
                  เลือกชุดข้อมูลที่จะนำออกในรายงาน - เปิด/ปิดตามความต้องการ
                </p>
                {#each schema.fieldGroups as group}
                  {@const groupKey = group.groupEn}
                  <div class="group-toggle-row" class:active={isGroupSelected(groupKey, session)}>
                    <label class="group-toggle-label">
                      <input
                        type="checkbox"
                        checked={isGroupSelected(groupKey, session)}
                        on:change={() => toggleGroup(groupKey)}
                      />
                      <div class="group-info">
                        <span class="group-name">{session.language === 'en' ? group.groupEn : group.group}</span>
                        <span class="group-fields">{group.fields.map(f => session.language === 'en' ? f.labelEn : f.label).join(' • ')}</span>
                      </div>
                    </label>
                  </div>
                {/each}
    
                {#if session.reportType === 'technical'}
                  <div class="group-toggle-row" class:active={session.includeRawLogs}>
                    <label class="group-toggle-label">
                      <input
                        type="checkbox"
                        bind:checked={session.includeRawLogs}
                      />
                      <div class="group-info">
                        <span class="group-name">Raw Log Snippets</span>
                        <span class="group-fields">Payload · Event Detail · (Technical Details only)</span>
                      </div>
                    </label>
                  </div>
                {/if}

                <div style="margin-top:12px;padding:10px 12px;background:#f0f9ff;border-radius:6px;font-size:0.8rem;color:#1e40af;border:1px solid #bfdbfe;">
                  <strong>ℹ️</strong> ข้อมูล Evidence (IP, Timestamp, Event ID) จะถูกแสดงเสมอ — AI ไม่สามารถแก้ไขได้
                </div>
              {/if}
            </div>

            <!-- ── IP SELECTION (Visible for both AI Briefing and Hunting) ── -->
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
                      <span class="ip-count">{s.eventCount} events · {s.country || 'Unknown'}</span>
                      <span class="ip-type">{s.primaryType}</span>
                    </div>
                    <span class="sev-dot sev-{s.severity}"></span>
                  </label>
                {/each}
                {#if filteredIps.length === 0}
                  <p class="no-data" style="padding:16px;text-align:center;color:#64748b">No IPs found.</p>
                {/if}
              </div>
              <div style="margin-top:8px;font-size:0.8rem;color:#64748b;text-align:right;">
                {session.selectedIPs.length} / {session.allIpSummaries.length} IPs selected
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
              <button class="btn {isLiveEditMode ? 'btn-success' : 'btn-outline'}" on:click={toggleLiveEdit}>
                📝 {isLiveEditMode ? 'Save Edits & Exit Mode' : 'Live Edit Mode'}
              </button>
              <button class="btn btn-warning" on:click={runAiValidation} disabled={validationLoading}>
                {validationLoading ? 'Checking...' : '🤖 AI Check Report'}
              </button>
              <button class="btn btn-ai" on:click={() => showChatModal = true}>
                ✨ AI Assistant
              </button>
              <button class="btn btn-cve" on:click={runCveSimilarity} disabled={cveAnalysisLoading}>
                {cveAnalysisLoading ? 'Analyzing...' : '🔍 CVE Similarity'}
              </button>
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
              <iframe bind:this={previewIframe} title="Preview" srcdoc={session.previewHtml} class="preview-frame"></iframe>
            </div>
          </div>

          <!-- CVE Similarity Results -->
          {#if session.cveSimilarityResults && session.cveSimilarityResults.length > 0}
            <div style="margin-top:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <div style="padding:12px 16px;background:#faf5ff;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
                <strong style="color:#7c3aed;font-size:0.9rem;">🔍 AI CVE Similarity Analysis</strong>
                <span style="font-size:0.75rem;color:#94a3b8;font-style:italic;">AI Similarity Assessment — ไม่ใช่การยืนยันการโจมตี</span>
              </div>
              <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead>
                  <tr style="background:#f8fafc;">
                    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0;">CVE ID</th>
                    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0;">Similarity</th>
                    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0;">Severity</th>
                    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0;">Affected Product</th>
                    <th style="padding:8px 12px;text-align:left;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0;">Reason</th>
                    <th style="padding:8px 12px;text-align:center;color:#475569;font-weight:600;border-bottom:1px solid #e2e8f0;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {#each session.cveSimilarityResults as cve}
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:8px 12px;font-family:monospace;color:#1e3a8a;font-weight:700;">{cve.cveId}</td>
                      <td style="padding:8px 12px;">
                        <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:{getSimilarityBg(cve.similarityLevel)};color:{getSimilarityColor(cve.similarityLevel)};">
                          {cve.similarityLevel.toUpperCase()} ({cve.similarityScore}%)
                        </span>
                      </td>
                      <td style="padding:8px 12px;">
                        <span style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;text-transform:uppercase;background:{cve.severity === 'critical' ? 'rgba(220,38,38,0.1)' : cve.severity === 'high' ? 'rgba(234,88,12,0.1)' : 'rgba(202,138,4,0.1)'};color:{cve.severity === 'critical' ? '#dc2626' : cve.severity === 'high' ? '#ea580c' : '#ca8a04'};">
                          {cve.severity}
                        </span>
                      </td>
                      <td style="padding:8px 12px;color:#475569;">{cve.affectedProduct}</td>
                      <td style="padding:8px 12px;color:#64748b;font-size:0.8rem;">{cve.reason}</td>
                      <td style="padding:8px 12px;text-align:center;">
                        <button class="btn btn-outline" style="padding:4px 10px;font-size:0.75rem;" on:click={() => viewInCveDatabase(cve.cveId)}>
                          View in CVE DB
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              <div style="padding:10px 16px;background:#faf5ff;border-top:1px solid #e2e8f0;font-size:0.75rem;color:#7c3aed;">
                ⚠️ <strong>คำเตือน:</strong> ผลลัพธ์นี้เป็น AI Similarity Assessment เท่านั้น ไม่ใช่การยืนยันว่า CVE ดังกล่าวถูก Exploit สำเร็จ
              </div>
            </div>
          {:else if cveAnalysisLoading}
            <div style="margin-top:16px;padding:24px;text-align:center;color:#7c3aed;border:1px dashed #d8b4fe;border-radius:8px;">
              🔍 กำลังวิเคราะห์ CVE ที่มีลักษณะคล้ายกัน...
            </div>
          {/if}
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
            <div class="conf-row"><span>CVE Similar Found:</span> <strong>{session.cveSimilarityResults?.length || 0} items</strong></div>
            
            {#if session.validationResult?.hasCritical}
              <div class="conf-alert">
                ⚠️ Critical Validation Errors exist! Export is not recommended.
              </div>
            {/if}
          </div>

          <!-- Final Review Checklist -->
          <div class="checklist-card">
            <h4>☑ Final Review Checklist</h4>
            <label class="checklist-row">
              <input type="checkbox" bind:checked={session.finalReviewChecklist.dataVerified} />
              <span>ตรวจสอบข้อมูลในรายงานเรียบร้อยแล้ว</span>
            </label>
            <label class="checklist-row">
              <input type="checkbox" bind:checked={session.finalReviewChecklist.aiVerified} />
              <span>ตรวจสอบ AI Analysis แล้ว และเนื้อหามีความถูกต้อง</span>
            </label>
            <label class="checklist-row">
              <input type="checkbox" bind:checked={session.finalReviewChecklist.cveDisclaimer} />
              <span>รับทราบว่า CVE Similarity เป็นเพียงการเปรียบเทียบรูปแบบ ไม่ใช่การยืนยันการโจมตี</span>
            </label>
            {#if !(session.finalReviewChecklist.dataVerified && session.finalReviewChecklist.aiVerified && session.finalReviewChecklist.cveDisclaimer)}
              <p style="font-size:0.8rem;color:#94a3b8;margin-top:8px;font-style:italic;">กรุณาติ๊กยืนยันทุกข้อก่อนส่งออกรายงาน</p>
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
          <button class="btn btn-success" on:click={finalizeExport}
            disabled={isLoading || !(session.finalReviewChecklist?.dataVerified && session.finalReviewChecklist?.aiVerified && session.finalReviewChecklist?.cveDisclaimer)}>
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
      <h3 style="margin-top:0">🤖 AI Report Assistant</h3>
      <p style="font-size:0.85rem;color:#64748b;margin-bottom:12px;">
        AI สามารถช่วยปรับแก้ Narrative, Summary และ Recommendations เท่านั้น<br/>
        <strong style="color:#dc2626;">ห้าม AI แก้ไข:</strong> IP Address, Timestamp, Event ID, Detection Count, Raw Evidence
      </p>
      <textarea bind:value={aiChatInput} rows="4" placeholder="เช่น: สรุปให้กระชับขึ้น, เขียนสำหรับผู้บริหาร, อธิบายความเสี่ยงเพิ่มเติม, ปรับภาษาให้เป็นทางการ..." style="width:100%;padding:8px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:4px;margin-bottom:12px;"></textarea>
      <div class="modal-footer">
        <button class="btn btn-outline" on:click={() => showChatModal = false}>Cancel</button>
        <button class="btn btn-ai" on:click={askAiAssistant} disabled={aiChatLoading}>
          {aiChatLoading ? 'Thinking...' : '✨ Send to AI'}
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
  
  /* Group Toggle (Step 2 v3) */
  .group-toggle-row { padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; transition: all 0.15s; }
  .group-toggle-row.active { border-color: #3b82f6; background: #eff6ff; }
  .group-toggle-label { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
  .group-info { display: flex; flex-direction: column; gap: 2px; }
  .group-name { font-weight: 600; font-size: 0.9rem; color: #1e293b; }
  .group-fields { font-size: 0.75rem; color: #94a3b8; }

  /* AI Briefing Step 2 Toggles */
  .step-header-note { display: flex; gap: 12px; align-items: center; padding: 12px 16px; background: linear-gradient(to right, #f3e8ff, #f8fafc); border: 1px solid #e9d5ff; border-radius: 8px; margin-bottom: 20px; color: #6b21a8; font-size: 0.9rem; }
  .step-header-note i { font-size: 1.5rem; color: #9333ea; }
  .ai-sections-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .section-toggle-row { padding: 12px 16px; border: 1px solid #e2e8f0; border-radius: 8px; transition: all 0.2s; display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .section-toggle-row:hover { border-color: #cbd5e1; background: #f8fafc; }
  .section-toggle-row.active { border-color: #8b5cf6; background: #f5f3ff; }
  .section-toggle-row input { accent-color: #7c3aed; width: 16px; height: 16px; cursor: pointer; }
  .section-toggle-info { display: flex; justify-content: space-between; align-items: center; flex: 1; }
  .section-name { font-weight: 600; font-size: 0.95rem; color: #1e293b; }
  .section-badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; }
  .ai-badge { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
  .section-actions { display: flex; gap: 8px; align-items: center; padding: 12px 0; border-top: 1px dashed #e2e8f0; border-bottom: 1px dashed #e2e8f0; margin-bottom: 16px; }

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
  .preview-actions { display: flex; gap: 8px; flex-wrap: wrap; }
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

  /* Final Review Checklist */
  .checklist-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; width: 100%; max-width: 500px; }
  .checklist-card h4 { margin: 0 0 14px 0; color: #1e293b; font-size: 0.95rem; }
  .checklist-row { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-size: 0.9rem; color: #334155; }
  .checklist-row:last-of-type { border-bottom: none; }
  .checklist-row input[type="checkbox"] { margin-top: 2px; width: 16px; height: 16px; cursor: pointer; accent-color: #10b981; }

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
  .btn-cve { background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%); color: white; }
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

