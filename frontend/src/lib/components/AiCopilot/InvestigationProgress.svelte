<script lang="ts">
  export let progress: { label: string; status: 'done' | 'active' | 'pending' }[] = [];
</script>

<style>
  .progress-panel {
    background: #f8fafc;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    border: 1px solid #e2e8f0;
  }
  .progress-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #475569;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .step-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
  }
  .icon-done { color: #10b981; }
  .icon-active { color: #3b82f6; animation: pulse 2s infinite; }
  .icon-pending { color: #cbd5e1; }
  .label-active { font-weight: 500; color: #0f172a; }
  .label-done { color: #475569; }
  .label-pending { color: #94a3b8; }
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
</style>

{#if progress.length > 0}
  <div class="progress-panel">
    <div class="progress-title">Investigation Progress</div>
    <div class="step-list">
      {#each progress as step}
        <div class="step">
          {#if step.status === 'done'}
            <i class="ti ti-check icon-done"></i>
            <span class="label-done">{step.label}</span>
          {:else if step.status === 'active'}
            <i class="ti ti-circle-filled icon-active"></i>
            <span class="label-active">{step.label}</span>
          {:else}
            <i class="ti ti-circle icon-pending"></i>
            <span class="label-pending">{step.label}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}