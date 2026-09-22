<script>
  export let event; // The alert or threat event object

  let isAnalyzing = false;
  let analysisResult = event.aiAnalysis || '';
  let errorMsg = '';

  async function startAnalysis() {
    isAnalyzing = true;
    errorMsg = '';
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/attacks/analyze-event', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(event)
      });
      const data = await res.json();
      if (data.analysis) {
        analysisResult = data.analysis;
        event.aiAnalysis = analysisResult; // Cache it on the event object
      } else {
        errorMsg = 'ไม่สามารถวิเคราะห์ได้';
      }
    } catch (e) {
      errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI';
    } finally {
      isAnalyzing = false;
    }
  }

  import { marked } from 'marked';
  $: renderedHtml = analysisResult ? marked.parse(analysisResult) : '';
</script>

{#if analysisResult}
  <div class="cyber-ai-panel result">
    <div class="cyber-ai-header">
      <div class="cyber-ai-badge">
        <i class="ti ti-brain"></i> SOC AI Analyst
      </div>
      <div class="glow-line"></div>
    </div>
    <div class="cyber-ai-body">
      {@html renderedHtml}
    </div>
  </div>
{:else if isAnalyzing}
  <div class="cyber-ai-panel loading">
    <div class="scanner-line"></div>
    <div class="cyber-ai-header">
      <div class="cyber-ai-badge processing">
        <i class="ti ti-loader-2 spin"></i> AI is Analyzing...
      </div>
    </div>
    <div class="cyber-ai-body typing-effect">
      <span>กำลังวิเคราะห์เส้นทางการโจมตี...</span><br>
      <span>กำลังตรวจสอบ Payload และพฤติกรรม...</span><br>
      <span>กำลังเชื่อมโยงฐานข้อมูล Threat Intelligence...</span>
    </div>
  </div>
{:else}
  <div class="cyber-ai-panel prompt">
    <div class="cyber-ai-header">
      <span class="cyber-ai-badge idle"><i class="ti ti-sparkles"></i> AI Assistance</span>
    </div>
    <div class="cyber-ai-action">
      <p>ให้ AI ช่วยวิเคราะห์เหตุการณ์นี้แบบเจาะลึก เพื่อค้นหาเป้าหมายและวิธีป้องกัน</p>
      <button class="btn-cyber-ai" on:click|stopPropagation={startAnalysis}>
        <i class="ti ti-bolt"></i> เริ่มการวิเคราะห์
      </button>
      {#if errorMsg}<div class="error-text">{errorMsg}</div>{/if}
    </div>
  </div>
{/if}

<style>
  .cyber-ai-panel {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    margin-top: 10px;
    font-family: var(--font-body);
    transition: all 0.3s ease;
  }
  
  /* Prompt State */
  .cyber-ai-panel.prompt {
    background: rgba(30, 41, 59, 0.04);
    border: 1px dashed rgba(100, 116, 139, 0.4);
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
  }
  
  /* Loading State */
  .cyber-ai-panel.loading {
    background: rgba(14, 165, 233, 0.05);
    border: 1px solid rgba(14, 165, 233, 0.3);
    box-shadow: 0 0 20px rgba(14, 165, 233, 0.1) inset;
    padding: 0;
  }
  .scanner-line {
    position: absolute;
    top: 0; left: 0; right: 0; height: 2px;
    background: var(--cyan);
    box-shadow: 0 0 10px var(--cyan);
    animation: scan 2s linear infinite;
    z-index: 2;
  }
  @keyframes scan {
    0% { top: 0; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }
  
  /* Result State */
  .cyber-ai-panel.result {
    background: rgba(142, 68, 173, 0.05);
    border: 1px solid rgba(142, 68, 173, 0.3);
    border-left: 3px solid #8e44ad;
  }
  
  .cyber-ai-header {
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .cyber-ai-panel.result .cyber-ai-header { background: rgba(142, 68, 173, 0.1); border-bottom: 1px solid rgba(142, 68, 173, 0.1); }
  .cyber-ai-panel.loading .cyber-ai-header { background: rgba(14, 165, 233, 0.1); border-bottom: 1px dashed rgba(14, 165, 233, 0.2); }
  
  .glow-line { flex: 1; height: 1px; background: linear-gradient(90deg, #8e44ad, transparent); }
  
  .cyber-ai-badge {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cyber-ai-badge i { font-size: 14px; }
  .cyber-ai-badge.idle { background: var(--bg-secondary); color: var(--text-secondary); border: 1px solid var(--border); }
  .cyber-ai-badge.processing { background: var(--cyan); color: var(--text-primary); box-shadow: 0 0 10px rgba(14, 165, 233, 0.5); }
  .cyber-ai-panel.result .cyber-ai-badge { background: #8e44ad; color: var(--text-primary); box-shadow: 0 0 10px rgba(142, 68, 173, 0.5); }
  
  .cyber-ai-action p { color: var(--text-muted); font-size: 13px; margin: 0; }
  .btn-cyber-ai {
    margin-top: 10px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: var(--text-primary);
    border: none;
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn-cyber-ai:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4); }
  .btn-cyber-ai:active { transform: translateY(0); }
  
  .cyber-ai-body { padding: 16px; font-size: 13px; line-height: 1.6; color: var(--text-primary); }
  .cyber-ai-body :global(h1), .cyber-ai-body :global(h2), .cyber-ai-body :global(h3) { color: #8e44ad; font-size: 14px; margin-top: 10px; margin-bottom: 6px; }
  .cyber-ai-body :global(p) { margin-bottom: 8px; }
  .cyber-ai-body :global(ol), .cyber-ai-body :global(ul) { margin-bottom: 12px; padding-left: 20px; }
  
  .typing-effect { font-family: var(--font-mono); color: var(--cyan); font-size: 12px; opacity: 0.8; }
  .error-text { color: var(--red); font-size: 12px; margin-top: 8px; }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
</style>
