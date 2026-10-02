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
    background: var(--card-bg, var(--bg));
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }
  
  .cyber-ai-panel.prompt {
    background: var(--bg-secondary, rgba(128, 128, 128, 0.05));
    border: 1px dashed var(--border);
    padding: 24px;
    align-items: center;
    text-align: center;
    box-shadow: none;
  }
  
  .cyber-ai-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--bg-secondary, rgba(59, 130, 246, 0.1));
    border-bottom: 1px solid var(--border);
  }
  
  .cyber-ai-badge {
    font-size: 13px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--primary, #60a5fa);
  }
  .cyber-ai-badge i { font-size: 16px; }
  
  .cyber-ai-body { 
    padding: 20px;
    font-size: 14.5px; 
    line-height: 1.7; 
    color: var(--text-primary); 
  }
  
  /* Markdown Styling */
  .storyline :global(p) { margin: 0 0 16px 0; }
  .storyline :global(p:last-child) { margin-bottom: 0; }
  
  .storyline :global(strong) { 
    color: var(--text-primary);
    font-weight: 700;
  }
  
  /* Executive Summary Box (Blockquote) */
  .storyline :global(blockquote) {
    background: rgba(239, 68, 68, 0.1);
    border-left: 4px solid #ef4444;
    padding: 16px;
    margin: 0 0 20px 0;
    border-radius: 0 8px 8px 0;
    color: var(--text-primary);
    font-size: 15px;
    font-weight: 600;
  }
  .storyline :global(blockquote p) { margin-bottom: 0; }
  
  /* Lists */
  .storyline :global(ul) { 
    margin: 0 0 20px 0; 
    padding-left: 24px; 
    color: var(--text-secondary); 
  }
  .storyline :global(li) { 
    margin-bottom: 8px; 
  }
  
  /* Code blocks / Inline code */
  .storyline :global(code) {
    background: var(--bg-secondary, rgba(128,128,128,0.1));
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    color: #ef4444;
  }
</style>
