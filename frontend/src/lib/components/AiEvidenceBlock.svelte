<script lang="ts">
  export let event: any; // The IncidentObject

  $: recommendations = event?.recommended_actions || [];
  $: evidence = event?.detection_evidence || {};
</script>

{#if recommendations.length > 0 || Object.keys(evidence).length > 0}
<div class="evidence-wrapper">
  <!-- Evidence Section -->
  <div class="section-block">
    <h4 class="section-title">หลักฐานการตรวจจับ (AI Models)</h4>
    <div class="evidence-grid">
      {#if evidence.isolation_forest}
        <div class="ev-box">
          <span class="ev-label">Isolation Forest</span>
          <span class="ev-val {(evidence.isolation_forest.is_anomaly) ? 'text-red' : 'text-green'}">
            {(evidence.isolation_forest.anomaly_score * 100).toFixed(1)}%
          </span>
        </div>
      {/if}
      
      {#if evidence.xgboost}
        <div class="ev-box">
          <span class="ev-label">XGBoost Class</span>
          <span class="ev-val text-orange">
            {evidence.xgboost.predicted_class} ({(evidence.xgboost.probability * 100).toFixed(1)}%)
          </span>
        </div>
      {/if}

      {#if evidence.logllm_semantic}
        <div class="ev-box">
          <span class="ev-label">LogLLM Semantic</span>
          <span class="ev-val text-purple" style="font-size: 11px; white-space: normal;">
            {evidence.logllm_semantic.pattern_matched}
          </span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Recommendations Section -->
  {#if recommendations.length > 0}
    <div class="section-block mt-4">
      <h4 class="section-title">คำแนะนำในการรับมือ (Advisory)</h4>
      <div class="rec-list">
        {#each recommendations as rec}
          <div class="rec-item">
            <i class="ti ti-bulb text-yellow"></i>
            <div class="rec-content">
              <strong>{rec.action_type.replace(/_/g, ' ').toUpperCase()}</strong>
              <p>{rec.description}</p>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
{/if}

<style>
  .evidence-wrapper {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .section-block { margin-bottom: 8px; }
  .section-title {
    font-size: 11px; font-weight: 700; color: var(--text-muted);
    text-transform: uppercase; margin: 0 0 10px 0; letter-spacing: 0.05em;
  }

  .evidence-grid {
    display: flex; flex-direction: column; gap: 8px;
  }
  .ev-box {
    background: rgba(0,0,0,0.03);
    border: 1px solid var(--border);
    padding: 10px 12px;
    border-radius: 6px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .ev-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; }
  .ev-val { font-size: 13px; font-weight: 600; }
  
  .rec-list { display: flex; flex-direction: column; gap: 8px; }
  .rec-item {
    display: flex; gap: 12px;
    background: rgba(245,158,11,0.05);
    border: 1px dashed rgba(245,158,11,0.3);
    padding: 12px; border-radius: 8px;
  }
  .rec-item i { font-size: 18px; margin-top: 2px; }
  .rec-content { display: flex; flex-direction: column; gap: 4px; }
  .rec-content strong { font-size: 12px; color: var(--text-primary); }
  .rec-content p { font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.4; }

  .text-red { color: #ef4444; }
  .text-green { color: #10b981; }
  .text-orange { color: #f59e0b; }
  .text-purple { color: #8b5cf6; }
  .text-yellow { color: #eab308; }
  
  .mt-4 { margin-top: 16px; }
</style>
