<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  export let summary = '';
  export let riskLevel = 'Low';
  export let confidence = 'Low';
  export let generatedAt = '';
  export let dataRange = '';
  export let isGenerating = false;
  
  const dispatch = createEventDispatcher();
  
  function getRiskColor(level: string) {
    if (level === 'Critical') return 'var(--red, #ef4444)';
    if (level === 'High') return 'var(--orange, #f97316)';
    if (level === 'Medium') return 'var(--yellow, #eab308)';
    return 'var(--green, #10b981)';
  }
</script>

<div class="ai-card">
  <div class="ai-card-header">
    <div class="ai-title">
      <i class="ti ti-brain"></i> สรุปสถานการณ์ความปลอดภัยโดย AI (Situation Assessment)
    </div>
    <div class="ai-meta">
      <button class="btn-regen" on:click={() => dispatch('regenerate')} disabled={isGenerating}>
        <i class="ti ti-refresh {isGenerating ? 'ti-spin' : ''}"></i> {isGenerating ? 'กำลังวิเคราะห์...' : 'ประมวลผลใหม่'}
      </button>
    </div>
  </div>
  
  <div class="ai-card-body">
    <div class="ai-summary">
      {#if summary}
        {@html summary}
      {:else}
        <div class="empty-state">ยังไม่มีบทสรุปจาก AI กรุณากด "ประมวลผลใหม่" (Regenerate)</div>
      {/if}
    </div>
    
    <div class="ai-footer-stats">
      <div class="stat-badge">
        <span class="lbl">ระดับความเสี่ยง (Risk):</span>
        <span class="val" style="color: {getRiskColor(riskLevel)}">{riskLevel}</span>
      </div>
      <div class="stat-badge">
        <span class="lbl">ความมั่นใจของ AI:</span>
        <span class="val">{confidence}</span>
      </div>
      <div class="stat-badge">
        <span class="lbl">ช่วงข้อมูล:</span>
        <span class="val">{dataRange || '-'}</span>
      </div>
      <div class="stat-badge">
        <span class="lbl">ประมวลผลเมื่อ:</span>
        <span class="val">{generatedAt || '-'}</span>
      </div>
    </div>
  </div>
</div>

<style>
  .ai-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.02);
  }
  .ai-card-header {
    background: rgba(59, 130, 246, 0.05);
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ai-title {
    font-size: 16px;
    font-weight: 700;
    color: #2563eb;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ai-card-body {
    padding: 20px;
  }
  .ai-summary {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
    margin-bottom: 20px;
  }
  .empty-state {
    color: var(--text-muted);
    font-style: italic;
  }
  .ai-footer-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding-top: 16px;
    border-top: 1px dashed var(--border);
  }
  .stat-badge {
    font-size: 12px;
    display: flex;
    gap: 6px;
    background: var(--bg);
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .stat-badge .lbl {
    color: var(--text-muted);
    font-weight: 500;
  }
  .stat-badge .val {
    font-weight: 700;
  }
  .btn-regen {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .btn-regen:hover:not(:disabled) {
    background: var(--bg-secondary);
  }
  .btn-regen:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
