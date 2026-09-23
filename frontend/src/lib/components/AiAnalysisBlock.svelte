<script>
  import { marked } from 'marked';
  export let event;

  $: summary = event?.ai_analysis?.summary || '';
  $: storyline = event?.ai_analysis?.storyline || '';
  $: confidence = event?.ai_analysis?.confidence_percentage || 0;

  $: renderedStoryline = storyline ? marked.parse(storyline) : '';
</script>

{#if summary || storyline}
  <div class="cyber-ai-panel">
    <div class="cyber-ai-header">
      <div class="cyber-ai-badge">
        <i class="ti ti-brain"></i> SOC AI Analyst (ความมั่นใจ {confidence.toFixed(1)}%)
      </div>
      <div class="glow-line"></div>
    </div>
    <div class="cyber-ai-body">
      {#if summary}
        <div class="summary-box">
          <strong>สรุปเหตุการณ์:</strong> {summary}
        </div>
      {/if}
      <div class="storyline">
        {@html renderedStoryline}
      </div>
    </div>
  </div>
{:else}
  <div class="cyber-ai-panel prompt">
    <div class="cyber-ai-header">
      <span class="cyber-ai-badge idle"><i class="ti ti-sparkles"></i> ผู้ช่วย AI</span>
    </div>
    <div class="cyber-ai-action">
      <p>ยังไม่มีผลการวิเคราะห์จาก AI สำหรับเหตุการณ์นี้</p>
    </div>
  </div>
{/if}

<style>
  .cyber-ai-panel {
    font-family: var(--font-body);
    transition: all 0.3s ease;
    margin-bottom: 24px;
  }
  
  .cyber-ai-panel.prompt {
    background: rgba(30, 41, 59, 0.04);
    border: 1px dashed rgba(100, 116, 139, 0.4);
    padding: 16px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
  }
  
  .cyber-ai-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .glow-line { flex: 1; height: 1px; background: linear-gradient(90deg, #8e44ad, transparent); opacity: 0.3; }
  
  .cyber-ai-badge {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #8e44ad;
  }
  .cyber-ai-badge i { font-size: 14px; }
  .cyber-ai-badge.idle { color: var(--text-secondary); }
  
  .cyber-ai-action p { color: var(--text-muted); font-size: 13px; margin: 0; }
  
  .cyber-ai-body { font-size: 14px; line-height: 1.6; color: var(--text-primary); }
  
  .summary-box {
    background: rgba(142, 68, 173, 0.08);
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 16px;
    border-left: 3px solid #8e44ad;
    color: var(--text-primary);
  }
  
  .storyline :global(p) { margin: 0 0 12px 0; }
  .storyline :global(p:last-child) { margin-bottom: 0; }
  .storyline :global(strong) { color: #8e44ad; }
  .storyline :global(ul) { margin: 0 0 12px 0; padding-left: 20px; color: var(--text-secondary); }
  .storyline :global(li) { margin-bottom: 4px; }
</style>
