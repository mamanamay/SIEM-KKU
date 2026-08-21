<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let show = false;
  export let stats: any = {};
  export let events: any[] = [];

  const dispatch = createEventDispatcher();

  let language: 'th' | 'en' = 'th';
  let targetIp = '';
  let customPrompt = '';
  
  let sections = {
    execSummary: true,
    incidentDetails: true,
    threatAnalysis: true,
    impactAssessment: true,
    remediation: true
  };

  let generatedReport = '';
  let isGenerating = false;

  function close() {
    show = false;
    dispatch('close');
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      close();
    }
  }

  async function generateReport() {
    isGenerating = true;
    generatedReport = '';
    
    try {
      const geminiKey = localStorage.getItem('cfg_gemini_key') || '';
      const payload = {
        language,
        targetIp,
        customPrompt,
        sections,
        stats
      };

      const res = await fetch('/api/attacks/ai-full-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'x-gemini-key': geminiKey
        },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      generatedReport = data.reportHtml || '<p>ไม่พบข้อมูลรายงานจาก AI</p>';
    } catch (e: any) {
      generatedReport = `<div style="color: red; text-align: center; padding: 20px;">
        <h3>เกิดข้อผิดพลาดในการสร้างรายงาน</h3>
        <p>${e.message}</p>
        <p style="font-size: 12px; color: #666;">*กรุณาตรวจสอบว่าฝั่ง Backend มี API /api/attacks/ai-full-report รองรับแล้วหรือไม่</p>
      </div>`;
    } finally {
      isGenerating = false;
    }
  }

  function printReport() {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Please allow popups to print the report');
      return;
    }
    
    // Get actual content to preserve user edits
    const reportElement = document.querySelector('.report-paper');
    const htmlContent = reportElement ? reportElement.innerHTML : generatedReport;

    printWindow.document.write(`
      <html>
        <head>
          <title>AI Security Report</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');
            body { font-family: 'Inter', 'Noto Sans Thai', sans-serif; padding: 40px; color: black; background: white; line-height: 1.6; }
            h1 { font-size: 22px; font-weight: bold; margin-bottom: 20px; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
            h2 { font-size: 16px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 4px;}
            p { margin-bottom: 12px; font-size: 14px;}
            ul, ol { margin-bottom: 12px; padding-left: 20px; font-size: 14px;}
            li { margin-bottom: 6px; }
            hr { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }
</script>

{#if show}
<div class="modal-backdrop" role="presentation" on:click={handleBackdropClick}>
  <div class="modal-content">
    <div class="modal-header hide-print">
      <h2><i class="ti ti-file-analytics"></i> AI Full Report Generator</h2>
      <button class="close-btn" on:click={close}><i class="ti ti-x"></i></button>
    </div>
    
    <div class="modal-body">
      <!-- Sidebar Settings (Hide on Print) -->
      <div class="settings-sidebar hide-print">
        <div class="setting-group">
          <label>Language / ภาษา</label>
          <div class="toggle-group">
            <button class:active={language === 'th'} on:click={() => language = 'th'}>ไทย</button>
            <button class:active={language === 'en'} on:click={() => language = 'en'}>Eng</button>
          </div>
        </div>

        <div class="setting-group">
          <label>Target IP (Optional)</label>
          <input type="text" bind:value={targetIp} placeholder="e.g. 192.168.1.10" class="input-field" />
        </div>

        <div class="setting-group">
          <label>Standard Sections (สากล)</label>
          <label class="checkbox-label"><input type="checkbox" bind:checked={sections.execSummary} /> Executive Summary</label>
          <label class="checkbox-label"><input type="checkbox" bind:checked={sections.incidentDetails} /> Incident Details</label>
          <label class="checkbox-label"><input type="checkbox" bind:checked={sections.threatAnalysis} /> Threat Analysis (TTPs)</label>
          <label class="checkbox-label"><input type="checkbox" bind:checked={sections.impactAssessment} /> Impact Assessment</label>
          <label class="checkbox-label"><input type="checkbox" bind:checked={sections.remediation} /> Recommendations</label>
        </div>

        <div class="setting-group">
          <label>Custom Prompt (คำสั่งพิเศษ)</label>
          <textarea bind:value={customPrompt} rows="3" class="input-field" placeholder="เช่น เน้นวิเคราะห์ความเสี่ยงของ Database..."></textarea>
        </div>

        <button class="ds-btn primary" style="width: 100%; justify-content: center; margin-top:auto;" on:click={generateReport} disabled={isGenerating}>
          <i class="ti ti-{isGenerating ? 'loader-2' : 'sparkles'}" class:spin={isGenerating}></i>
          {isGenerating ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      <!-- Main Preview Area -->
      <div class="preview-area">
        {#if !generatedReport && !isGenerating}
          <div class="empty-state hide-print">
            <i class="ti ti-file-description"></i>
            <p>ปรับการตั้งค่าด้านซ้ายแล้วกด Generate Report</p>
          </div>
        {:else if isGenerating}
           <div class="empty-state hide-print">
             <i class="ti ti-loader-2 spin" style="font-size: 32px; color: var(--green);"></i>
             <p>AI is generating the report...</p>
           </div>
        {:else}
          <div class="preview-header hide-print">
            <div class="hint"><i class="ti ti-edit"></i> คุณสามารถคลิกในกระดาษเพื่อแก้ไขข้อความได้โดยตรงก่อนพิมพ์</div>
            <div style="display:flex; gap:8px;">
              <button class="ds-btn success" on:click={printReport}><i class="ti ti-printer"></i> Print / Save PDF</button>
            </div>
          </div>
          <!-- Editable Report -->
          <div class="report-paper-container printable">
            <div class="report-paper" contenteditable="true" bind:innerHTML={generatedReport}></div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 20px;
  }
  .modal-content {
    background: var(--bg-primary, #111827); border: 1px solid var(--border, #374151);
    border-radius: 12px; width: 100%; max-width: 1200px; height: 90vh;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }
  .modal-header {
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    display: flex; justify-content: space-between; align-items: center;
    background: var(--bg-panel);
  }
  .modal-header h2 { font-size: 18px; margin: 0; display: flex; align-items: center; gap: 8px; color: var(--text-primary); }
  .badge { background: #3b82f6; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold;}
  .close-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px; }
  
  .modal-body {
    display: flex; flex: 1; overflow: hidden;
  }
  
  .settings-sidebar {
    width: 300px; padding: 20px; border-right: 1px solid var(--border);
    background: var(--bg-panel); overflow-y: auto; display: flex; flex-direction: column; gap: 20px;
  }
  .setting-group label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
  .toggle-group { display: flex; background: var(--bg-primary); border-radius: 6px; padding: 4px; border: 1px solid var(--border);}
  .toggle-group button { 
    flex: 1; padding: 6px; border: none; background: none; color: var(--text-secondary); 
    font-size: 13px; border-radius: 4px; cursor: pointer; transition: all 0.2s;
  }
  .toggle-group button.active { background: var(--bg-secondary); color: var(--text-primary); font-weight: bold; }
  
  .input-field {
    width: 100%; background: var(--bg-primary); border: 1px solid var(--border);
    color: var(--text-primary); padding: 10px; border-radius: 6px; font-size: 13px; outline: none;
  }
  .input-field:focus { border-color: var(--green); }
  
  .checkbox-label { display: flex !important; align-items: center; gap: 8px; cursor: pointer; font-weight: normal !important; color: var(--text-secondary) !important; font-size: 13px !important;}
  .w-full { width: 100%; }
  
  .preview-area {
    flex: 1; background: #9ca3af; padding: 20px; overflow-y: auto; display: flex; flex-direction: column;
  }
  .empty-state {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #4b5563;
  }
  .empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.8; }
  
  .preview-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
  }
  .hint { font-size: 13px; color: #1f2937; display: flex; align-items: center; gap: 6px; font-weight: 500;}
  
  .report-paper-container {
    display: flex; justify-content: center; padding-bottom: 40px;
  }
  
  .report-paper {
    background: white; color: black; padding: 40px 50px; border-radius: 4px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); outline: none;
    font-family: 'Inter', 'Noto Sans Thai', sans-serif; line-height: 1.6;
    width: 210mm; min-height: 297mm; /* A4 size roughly */
  }
  
  .report-paper :global(h1) { font-size: 22px; font-weight: bold; margin-bottom: 20px; text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
  .report-paper :global(h2) { font-size: 16px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 4px;}
  .report-paper :global(p) { margin-bottom: 12px; font-size: 14px;}
  .report-paper :global(ul), .report-paper :global(ol) { margin-bottom: 12px; padding-left: 20px; font-size: 14px;}
  .report-paper :global(li) { margin-bottom: 6px; }
  .report-paper :global(hr) { border: 0; border-top: 1px solid #ccc; margin: 20px 0; }

  .spin { animation: spin 1s linear infinite; display: inline-block;}
  @keyframes spin { 100% { transform: rotate(360deg); } }

  /* Removed buggy print styles, printing is handled via a new window */
</style>
