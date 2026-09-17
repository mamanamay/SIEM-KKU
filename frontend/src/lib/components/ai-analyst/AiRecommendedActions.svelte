<script lang="ts">
  export let actions: any = { immediate: [], investigation: [], preventive: [] };
</script>

<div class="actions-card">
  <div class="actions-header">
    <i class="ti ti-shield-check"></i> ข้อเสนอแนะแนวทางป้องกัน (Recommended Actions)
  </div>
  <div class="actions-body">
    {#if !actions.immediate || !actions.investigation || !actions.preventive || (actions.immediate.length === 0 && actions.investigation.length === 0 && actions.preventive.length === 0)}
      <div class="empty">ไม่มีข้อเสนอแนะในขณะนี้ (No recommendations available.)</div>
    {:else}
      <div class="action-grid">
        <div class="action-col">
          <div class="col-head text-red"><i class="ti ti-alert-triangle"></i> ดำเนินการทันที (Immediate)</div>
          <ul class="act-list">
            {#each actions.immediate as act}
              <li>{act}</li>
            {/each}
          </ul>
        </div>
        
        <div class="action-col">
          <div class="col-head text-orange"><i class="ti ti-search"></i> ตรวจสอบเพิ่มเติม (Investigation)</div>
          <ul class="act-list">
            {#each actions.investigation as act}
              <li>{act}</li>
            {/each}
          </ul>
        </div>
        
        <div class="action-col">
          <div class="col-head text-green"><i class="ti ti-shield"></i> การป้องกันล่วงหน้า (Preventive)</div>
          <ul class="act-list">
            {#each actions.preventive as act}
              <li>{act}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .actions-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .actions-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(16, 185, 129, 0.05);
    color: #059669;
  }
  .actions-body { padding: 20px; }
  .empty { color: var(--text-muted); font-size: 14px; font-style: italic; }
  
  .action-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  
  .action-col {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  
  .col-head {
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .text-red { color: #dc2626; }
  .text-orange { color: #ea580c; }
  .text-green { color: #059669; }
  
  .act-list {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  @media (max-width: 768px) {
    .action-grid { grid-template-columns: 1fr; }
  }
</style>
