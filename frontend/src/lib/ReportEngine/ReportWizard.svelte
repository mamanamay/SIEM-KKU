<script lang="ts">
  import { globalReportStore, closeReportWizard } from '../../stores/globalReportStore';
  import { aiConfigStore } from '../../stores/aiConfigStore';
  import { showNotification } from '../../stores/notificationStore';
  
  $: state = $globalReportStore;
  $: isAiReady = $aiConfigStore.isAiReady;
  
  let step = 1;
  let selectedTemplate = 'executive';
  
  // Data selection
  let bundledIncidents: any[] = [];
  let bundleSearch = '';
  let selectedBundleIds: string[] = [];
  let isAnonymous = false;
  
  // Preview
  let previewHtml = '';
  let isLoadingPreview = false;
  
  // Proofread
  let isProofreading = false;
  let proofreadErrors: any[] = [];
  let showProofreadModal = false;
  let isProofreadSuccess = false;
  
  // Export
  let selectedFormat = 'pdf';
  let isExporting = false;
  
  const TEMPLATES = [
    { id: 'executive', name: 'Executive Summary', icon: 'ti-briefcase', desc: 'High-level overview suitable for management.' },
    { id: 'technical', name: 'Technical Details', icon: 'ti-code', desc: 'Detailed technical report including raw logs and evidence.' }
  ];

  function bundleLogs(rawLogs: any[]) {
    const isCVE = state.config?.pageType === 'cve';
    
    // Grouping
    const groups: Record<string, any[]> = {};
    rawLogs.forEach(log => {
      let key = 'Unknown';
      if (isCVE) {
        key = log.cve_id || 'Unknown CVE';
      } else {
        key = log.ip || log.source_ips?.[0] || 'Unknown IP';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    });
    
    let bundles = [];
    let bId = 0;
    for (const [key, logs] of Object.entries(groups)) {
      const earliest = logs.reduce((min, p) => p.createdAt < min ? p.createdAt : min, logs[0]?.createdAt || new Date().toISOString());
      const latest = logs.reduce((max, p) => p.createdAt > max ? p.createdAt : max, logs[0]?.createdAt || new Date().toISOString());
      
      const typeCounts: Record<string, number> = {};
      logs.forEach(l => {
        const t = isCVE ? (l.severity || 'Unknown') : (l.type || l.attack_type || 'Unknown');
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      
      const primaryType = Object.keys(typeCounts).sort((a,b) => typeCounts[b] - typeCounts[a])[0];
      
      bundles.push({
        id: `bundle_${++bId}`,
        key, // Either IP or CVE ID
        label: isCVE ? 'CVE' : 'IP',
        count: logs.length,
        primaryType,
        earliest,
        latest,
        logs
      });
    }
    return bundles;
  }

  function getOrganizationHeader(isAnonymous: boolean) {
    const author = isAnonymous ? 'ไม่ประสงค์ออกนาม' : (typeof localStorage !== 'undefined' ? localStorage.getItem('username') || 'Analyst' : 'Analyst');
    const dateStr = new Date().toLocaleString('th-TH');
    const orgTitle = state.config?.reportTitle || 'Security Report';
    return `
      <div class="report-header" style="display:flex; justify-content:space-between; align-items:flex-start; padding: 16px 24px; border-bottom: 2px solid #e5e7eb; margin-bottom: 20px; font-family: 'Sarabun', sans-serif;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="/kku-odt-logo.png" alt="KKU Logo" style="height:56px; width:56px; object-fit:cover; border-radius:4px;" />
        </div>
        <div style="text-align:right; font-size:11px; color:#475569; line-height:1.6;">
          <strong>สำนักเทคโนโลยีดิจิทัล มหาวิทยาลัยขอนแก่น</strong><br/>
          123 ถนนมิตรภาพ ตำบลในเมือง อำเภอเมือง จังหวัดขอนแก่น 40002<br/>
          043-009700, 043-002539 ต่อ 42001
        </div>
      </div>
      <div style="text-align:center; margin-bottom:20px; font-family: 'Sarabun', sans-serif;">
        <h1 style="font-size:20px; font-weight:700; margin:0; color:#1e293b;">${orgTitle}</h1>
        <p style="color:#64748b; font-size:12px; margin: 4px 0 0 0;">ผู้จัดทำรายงาน: ${author} | วันที่ออกรายงาน: ${dateStr}</p>
      </div>
    `;
  }

  function generateRawHtml(selectedBundles: any[]) {
    let html = `<h3>1. สรุปเหตุการณ์ที่เลือก (Selected Incidents)</h3>
    <p>รายงานฉบับนี้รวบรวมเหตุการณ์ความปลอดภัยที่ถูกเลือกจำนวน ${selectedBundles.length} รายการ</p>
    <hr/>`;

    selectedBundles.forEach((b, idx) => {
      html += `<h4>เหตุการณ์ที่ ${idx + 1}: ${b.label} ${b.key}</h4>
      <ul>
        <li><strong>เป้าหมาย/แหล่งที่มา:</strong> ${b.key}</li>
        <li><strong>รูปแบบหลัก:</strong> ${b.primaryType}</li>
        <li><strong>เมื่อไหร่ (When):</strong> ${new Date(b.earliest).toLocaleString('th-TH')} ถึง ${new Date(b.latest).toLocaleString('th-TH')} (จำนวน ${b.count} ครั้ง)</li>
      </ul>
      <table border="1" style="width:100%; border-collapse:collapse; font-size:11px; margin-top:10px;">
        <thead><tr style="background:#f1f5f9;"><th>เวลา</th><th>ประเภท/ความรุนแรง</th><th>รายละเอียดเพิ่มเติม</th></tr></thead>
        <tbody>
      `;
      b.logs.slice(0, 50).forEach((l: any) => {
        html += `<tr><td>${new Date(l.createdAt || l.publishedDate).toLocaleString('th-TH')}</td><td>${l.type || l.severity || l.attack_type}</td><td>${l.description || l.country || '-'}</td></tr>`;
      });
      if (b.logs.length > 50) html += `<tr><td colspan="3" style="text-align:center;">... และอีก ${b.logs.length - 50} รายการที่ซ้ำกัน</td></tr>`;
      html += `</tbody></table><br/>`;
    });
    return html;
  }

  async function generatePreview() {
    if (state.config?.pageType === 'ai-briefing' && !isAiReady) {
      showNotification('warning', 'AI Offline', 'ระบบจะสลับไปใช้ Technical Report แทนเนื่องจากไม่มี API Key');
      state.config.pageType = 'standard';
    }

    isLoadingPreview = true;
    step = 3;
    
    const selectedBundles = bundledIncidents.filter(b => selectedBundleIds.includes(b.id));
    let contentHtml = '';

    if (state.config?.pageType === 'ai-briefing') {
      try {
        const eventsToAnalyze = selectedBundles.flatMap(b => b.logs.slice(0, 10));
        const res = await fetch('/api/export/ai-generate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ events: eventsToAnalyze })
        });
        const data = await res.json();
        contentHtml = data.html || '<p>AI Analysis generated.</p>';
      } catch (e) {
        contentHtml = '<p style="color:red;">Failed to generate AI narrative.</p>';
      }
    } else {
      contentHtml = generateRawHtml(selectedBundles);
    }
    
    previewHtml = getOrganizationHeader(isAnonymous) + '<div style="font-family: Sarabun, sans-serif; font-size: 14px; line-height: 1.6; padding: 0 20px;">' + contentHtml + '</div>';
    isLoadingPreview = false;
  }

  async function doProofread() {
    isProofreading = true;
    try {
      const res = await fetch('/api/export/proofread', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ text: previewHtml })
      });
      const data = await res.json();
      
      if (data.passed) {
        proofreadErrors = [];
        isProofreadSuccess = true;
        showProofreadModal = true;
      } else {
        proofreadErrors = data.errors || [];
        isProofreadSuccess = false;
        showProofreadModal = true;
      }
    } catch (e) {
      console.error(e);
      // Fail open
      proofreadErrors = [];
      isProofreadSuccess = true;
      showProofreadModal = true;
    }
    isProofreading = false;
  }

  async function handleExport() {
      isExporting = true;
      
      let finalCsvStr = '';
      if (selectedFormat === 'csv') {
        const cols = $globalReportStore.dataModel?.columns || [];
        finalCsvStr = cols.join(',') + "\n";
        
        const selected = bundledIncidents.filter(b => b.selected);
        const flatItems = selected.flatMap(b => b.items);
        
        flatItems.forEach(item => {
          const row = cols.map(col => {
             let val = item[col.toLowerCase()] || item[col] || '';
             if (typeof val === 'object') val = JSON.stringify(val);
             return `"${String(val).replace(/"/g, '""')}"`;
          });
          finalCsvStr += row.join(',') + "\n";
        });
      }

      try {
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${previewHtml}</body></html>`;
        
        // Save to backend history
        const token = localStorage.getItem('token');
        if (selectedFormat !== 'pdf') {
            await fetch('/api/export/save-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                reportTitle: state.config.reportTitle,
                pageType: state.config.pageType,
                format: selectedFormat,
                content: selectedFormat === 'csv' ? finalCsvStr : fullHtml,
                authorName: state.isAnonymous ? 'ไม่ประสงค์ออกนาม' : (state.authorName || 'admin')
              })
            });
        }

        // Trigger local download
        const fn = `Report_${state.config?.pageType || 'Export'}_${new Date().toISOString().slice(0, 10)}.${selectedFormat}`;
        
        if (selectedFormat === 'pdf') {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = '/api/export/pdf';
          form.target = '_blank';
          const inputHtml = document.createElement('input');
          inputHtml.type = 'hidden';
          inputHtml.name = 'htmlContent';
          inputHtml.value = fullHtml;
          const inputTitle = document.createElement('input');
          inputTitle.type = 'hidden';
          inputTitle.name = 'reportTitle';
          inputTitle.value = state.config.reportTitle;
          const inputAuthor = document.createElement('input');
          inputAuthor.type = 'hidden';
          inputAuthor.name = 'authorName';
          inputAuthor.value = state.isAnonymous ? 'ไม่ประสงค์ออกนาม' : (state.authorName || 'admin');
          
          form.appendChild(inputHtml);
          form.appendChild(inputTitle);
          form.appendChild(inputAuthor);
          document.body.appendChild(form);
          form.submit();
          document.body.removeChild(form);
        } else {
          const blob = new Blob([selectedFormat === 'csv' ? finalCsvStr : fullHtml], { type: selectedFormat === 'csv' ? 'text/csv' : 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fn;
          a.click();
          URL.revokeObjectURL(url);
        }
        
        showNotification('success', 'Export Started', `Downloading ${selectedFormat.toUpperCase()} report...`);
      } catch (e) {
        showNotification('error', 'Export Failed', 'Failed to generate report');
      }
      
      isExporting = false;
    }

  function prepareStep2() {
    step = 2;
    bundledIncidents = bundleLogs(state.dataModel?.dataset || []);
    selectedBundleIds = bundledIncidents.map(b => b.id);
  }

  function handleClose() {
    step = 1;
    previewHtml = '';
    showProofreadModal = false;
    closeReportWizard();
  }
</script>

{#if state.isOpen}
<div class="rw-overlay" on:click={handleClose} role="dialog" aria-modal="true" tabindex="-1" on:keydown={(e) => e.key === 'Escape' && handleClose()}>
  <div class="rw-modal" on:click|stopPropagation role="document" tabindex="0" on:keydown={() => {}}>
    <div class="rw-header">
      <div class="rw-title">
        <i class="ti ti-report"></i>
        <h2>{state.config?.pageType === 'ai-briefing' ? 'Generate AI Security Report' : 'Generate Technical Report'}</h2>
      </div>
      <button class="rw-close" on:click={handleClose}><i class="ti ti-x"></i></button>
    </div>
    
    <div class="rw-progress">
      <div class="step {step >= 1 ? 'active' : ''}">1. Format</div>
      <div class="step-line {step >= 2 ? 'active' : ''}"></div>
      <div class="step {step >= 2 ? 'active' : ''}">2. Select Data</div>
      <div class="step-line {step >= 3 ? 'active' : ''}"></div>
      <div class="step {step >= 3 ? 'active' : ''}">3. Review</div>
      <div class="step-line {step >= 4 ? 'active' : ''}"></div>
      <div class="step {step >= 4 ? 'active' : ''}">4. Export</div>
    </div>

    <div class="rw-body">
      {#if step === 1}
        <h3 class="step-title">Select Report Template</h3>
        <div class="template-list">
          {#each TEMPLATES as tpl}
            <div class="tpl-card {selectedTemplate === tpl.id ? 'selected' : ''}" on:click={() => selectedTemplate = tpl.id} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && (selectedTemplate = tpl.id)}>
              <div class="tpl-icon"><i class="{tpl.icon}"></i></div>
              <div class="tpl-info">
                <h4>{tpl.name}</h4>
                <p>{tpl.desc}</p>
              </div>
              <div class="tpl-check"><i class="ti ti-circle-check-filled"></i></div>
            </div>
          {/each}
        </div>
        <div class="rw-footer">
          <button class="btn-cancel" on:click={handleClose}>Cancel</button>
          <button class="btn-next" on:click={prepareStep2}>Next <i class="ti ti-arrow-right"></i></button>
        </div>
      
      {:else if step === 2}
        <h3 class="step-title">Select Target Incidents ({state.config?.pageType === 'cve' ? 'Vulnerabilities' : 'IP & Time'})</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
          ระบบได้ดึงข้อมูลจริงจากหน้าต่างปัจจุบัน (Snapshot) มาให้คุณเลือก โปรดเลือกข้อมูลที่ต้องการรวมในรายงาน
        </p>
        
        <div class="bundle-list" style="max-height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;">
          {#each bundledIncidents as bundle}
            <label class="bundle-item" style="display: flex; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; align-items: flex-start; background: var(--bg-panel);">
              <input type="checkbox" bind:group={selectedBundleIds} value={bundle.id} style="margin-top: 4px;" />
              <div>
                <strong style="display: block; font-size: 14px;">{bundle.label}: {bundle.key} <span class="badge" style="background: rgba(220,38,38,0.1); color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 8px;">{bundle.primaryType}</span></strong>
                <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                  พบ {bundle.count} รายการ | เวลา: {new Date(bundle.earliest).toLocaleString('th-TH')}
                </div>
              </div>
            </label>
          {/each}
          {#if bundledIncidents.length === 0}
            <div style="text-align:center; padding: 20px; color: var(--text-muted);">ไม่พบข้อมูลที่ส่งออกได้ (No mapped data available)</div>
          {/if}
        </div>
        
        <div style="margin-top: 20px; padding: 16px; background: var(--bg-secondary); border-radius: 8px;">
          <label style="display: flex; gap: 8px; align-items: center; cursor: pointer;">
            <input type="checkbox" bind:checked={isAnonymous} />
            <span style="font-weight: 600;">ไม่ประสงค์ออกนาม (Generate Anonymously)</span>
          </label>
        </div>

        <div class="rw-footer">
          <button class="btn-cancel" on:click={() => step = 1}>Back</button>
          <button class="btn-next" on:click={generatePreview} disabled={selectedBundleIds.length === 0}>
            {state.config?.pageType === 'ai-briefing' ? 'Generate AI Report' : 'Generate Preview'} <i class="ti ti-wand"></i>
          </button>
        </div>

      {:else if step === 3}
        <h3 class="step-title">Review & Edit Report</h3>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">คุณสามารถคลิกที่ข้อความด้านล่างเพื่อแก้ไขเนื้อหารายงานก่อนพิมพ์ได้โดยตรง (Content Editable)</p>
        
        {#if isLoadingPreview}
          <div class="rw-loading">
            <i class="ti ti-loader ti-spin"></i>
            <span>{state.config?.pageType === 'ai-briefing' ? 'AI is writing the report...' : 'Generating preview...'}</span>
          </div>
        {:else}
          <div class="rw-preview-box" contenteditable="true" bind:innerHTML={previewHtml} style="background: white; color: black; padding: 20px; border-radius: 8px; border: 1px solid #ccc; max-height: 400px; overflow-y: auto; outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
          </div>
        {/if}
        
        <div class="rw-footer">
          <button class="btn-cancel" on:click={() => step = 2} disabled={isLoadingPreview}>Back</button>
          <button class="btn-next" on:click={doProofread} disabled={isLoadingPreview}>
            {#if isProofreading}<i class="ti ti-loader ti-spin"></i> Checking...{:else}Next (AI Proofread) <i class="ti ti-check"></i>{/if}
          </button>
        </div>

      {:else if step === 4}
        <h3 class="step-title">Finalize Export</h3>
        
        <div class="export-options" style="margin-top: 20px;">
          <label class="radio-label">
            <input type="radio" bind:group={selectedFormat} value="pdf">
            <i class="ti ti-file-type-pdf" style="color: #ef4444; font-size: 24px;"></i>
            <span>PDF Document (A4 format)</span>
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={selectedFormat} value="csv">
            <i class="ti ti-file-type-csv" style="color: #10b981; font-size: 24px;"></i>
            <span>CSV Spreadsheet</span>
          </label>
          <label class="radio-label">
            <input type="radio" bind:group={selectedFormat} value="html">
            <i class="ti ti-html" style="color: #3b82f6; font-size: 24px;"></i>
            <span>HTML Webpage</span>
          </label>
        </div>

        <div class="rw-footer">
          <button class="btn-cancel" on:click={() => step = 3}>Back</button>
          <button class="btn-next btn-export-final" on:click={handleExport} disabled={isExporting}>
            {#if isExporting}
              <i class="ti ti-loader ti-spin"></i> Exporting...
            {:else}
              <i class="ti ti-download"></i> Download {selectedFormat.toUpperCase()}
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showProofreadModal}
<div class="rw-overlay" style="z-index: 10001;" role="dialog" aria-modal="true">
  <div class="rw-modal" style="max-width: 500px;">
    {#if isProofreadSuccess}
      <div class="rw-header" style="border-bottom-color: #10b981;">
        <div class="rw-title">
          <i class="ti ti-circle-check-filled" style="color: #10b981;"></i>
          <h2>ตรวจสอบผ่านเรียบร้อยแล้ว</h2>
        </div>
      </div>
      <div class="rw-body">
        <p style="color: #334155; font-size: 15px;">ไม่พบคำสะกดผิดหรือข้อผิดพลาดทางไวยากรณ์ในรายงานฉบับนี้</p>
        <div class="rw-footer" style="margin-top: 24px;">
          <button class="btn-cancel" on:click={() => { showProofreadModal = false; }}>ปิด (Close)</button>
          <button class="btn-next btn-export-final" on:click={() => { showProofreadModal = false; step = 4; }}>ยืนยันส่งออกจริง (Proceed)</button>
        </div>
      </div>
    {:else}
      <div class="rw-header" style="border-bottom-color: #f59e0b;">
        <div class="rw-title">
          <i class="ti ti-alert-triangle" style="color: #f59e0b;"></i>
          <h2>AI Proofreading Alerts</h2>
        </div>
      </div>
      <div class="rw-body">
        <p style="margin-bottom: 16px;">พบจุดที่อาจจะสะกดผิดหรือใช้ไวยากรณ์ไม่เหมาะสม โปรดตรวจสอบก่อนส่งออก:</p>
        <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;">
          {#each proofreadErrors as err}
            <div style="background: rgba(245,158,11,0.1); border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;">
              <div style="text-decoration: line-through; color: #ef4444;">{err.text}</div>
              <div style="color: #10b981; font-weight: bold; margin-top: 4px;">แนะนำ: {err.suggestion}</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">เหตุผล: {err.reason}</div>
            </div>
          {/each}
        </div>
        <div class="rw-footer" style="margin-top: 24px;">
          <button class="btn-cancel" on:click={() => { showProofreadModal = false; step = 3; }}>กลับไปแก้ไข (Edit)</button>
          <button class="btn-next" on:click={() => { showProofreadModal = false; step = 4; }}>ยืนยันส่งออกต่อไป (Proceed Risk)</button>
        </div>
      </div>
    {/if}
  </div>
</div>
{/if}
{/if}

<style>
  * { box-sizing: border-box; }
  .rw-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000; backdrop-filter: blur(4px); }
  .rw-modal { background: var(--bg-panel, #fff); width: 100%; max-width: 800px; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); border: 1px solid var(--border, #e2e8f0); max-height: 90vh; }
  .rw-header { padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border, #e2e8f0); }
  .rw-title { display: flex; align-items: center; gap: 12px; color: var(--text-primary, #1e293b); }
  .rw-title i { font-size: 24px; color: var(--blue, #3b82f6); }
  .rw-title h2 { margin: 0; font-size: 18px; font-weight: 700; }
  .rw-close { background: none; border: none; font-size: 20px; color: var(--text-muted, #64748b); cursor: pointer; transition: 0.2s; }
  .rw-close:hover { color: var(--red, #ef4444); }
  
  .rw-progress { display: flex; align-items: center; padding: 20px 24px; background: var(--bg-app, #f8fafc); border-bottom: 1px solid var(--border, #e2e8f0); }
  .step { font-size: 13px; font-weight: 600; color: var(--text-muted, #94a3b8); display: flex; align-items: center; gap: 8px; }
  .step.active { color: var(--blue, #3b82f6); }
  .step-line { flex: 1; height: 2px; background: var(--border, #e2e8f0); margin: 0 16px; }
  .step-line.active { background: var(--blue, #3b82f6); }
  
  .rw-body { padding: 24px; flex: 1; overflow-y: auto; }
  .step-title { font-size: 16px; font-weight: 600; color: var(--text-primary, #1e293b); margin: 0 0 20px 0; }
  
  .template-list { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .tpl-card { border: 2px solid var(--border, #e2e8f0); border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; position: relative; display: flex; align-items: flex-start; gap: 16px; }
  .tpl-card:hover { border-color: var(--blue, #3b82f6); background: rgba(59,130,246,0.02); }
  .tpl-card.selected { border-color: var(--blue, #3b82f6); background: rgba(59,130,246,0.05); }
  .tpl-icon { font-size: 32px; color: var(--blue, #3b82f6); }
  .tpl-info h4 { margin: 0 0 4px 0; font-size: 15px; color: var(--text-primary, #1e293b); }
  .tpl-info p { margin: 0; font-size: 12px; color: var(--text-muted, #64748b); line-height: 1.5; }
  .tpl-check { position: absolute; top: 16px; right: 16px; color: var(--blue, #3b82f6); font-size: 20px; opacity: 0; transition: 0.2s; }
  .tpl-card.selected .tpl-check { opacity: 1; }
  
  .rw-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border, #e2e8f0); }
  .btn-cancel { padding: 10px 20px; background: transparent; border: 1px solid var(--border, #e2e8f0); color: var(--text-primary, #334155); border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px; }
  .btn-cancel:hover { background: var(--border, #e2e8f0); }
  .btn-next { padding: 10px 20px; background: var(--blue, #3b82f6); border: none; color: white; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; font-size: 14px; }
  .btn-next:hover { background: #2563eb; }
  .btn-next:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-export-final { background: var(--green, #10b981); }
  .btn-export-final:hover { background: #059669; }
  
  .rw-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--text-muted, #64748b); gap: 16px; }
  .rw-loading i { font-size: 40px; color: var(--blue, #3b82f6); }
  
  .export-options { display: flex; gap: 16px; }
  .radio-label { display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; flex: 1; transition: 0.2s; }
  .radio-label:hover { border-color: var(--blue); }
  .radio-label input[type="radio"] { width: 18px; height: 18px; cursor: pointer; }
  .radio-label span { font-weight: 600; font-size: 14px; color: var(--text-primary); }
  
  .ti-spin { animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }

  :global(.dark) .rw-preview-box {
    background: #e2e8f0 !important;
  }
</style>
