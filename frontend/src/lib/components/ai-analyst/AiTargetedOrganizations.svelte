<script lang="ts">
  export let organizations: { org: string, count: number, percentage: number }[] = [];
</script>

<div class="org-card h-100">
  <div class="org-header text-purple">
    <i class="ti ti-building-community"></i> องค์กรที่ถูกโจมตีบ่อยที่สุด (Top Targeted Orgs)
  </div>
  <div class="org-body">
    {#if organizations.length === 0}
      <div class="empty">ไม่มีข้อมูลองค์กรที่ถูกระบุเป็นเป้าหมาย (No specific organizations targeted)</div>
    {:else}
      <div class="org-list">
        {#each organizations as o}
          <div class="org-item">
            <div class="org-stats">
              <span class="org-name">{o.org}</span>
              <span class="org-count">โจมตี {o.count} ครั้ง ({Math.round(o.percentage)}%)</span>
            </div>
            <div class="org-bar-bg">
              <div class="org-bar-fill" style="width: {o.percentage}%"></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .org-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .org-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(14, 165, 233, 0.05);
    color: #0ea5e9;
  }
  .org-body { padding: 20px; }
  .empty { color: var(--text-muted); font-size: 14px; font-style: italic; }
  
  .org-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .org-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .org-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
  }
  .org-name {
    font-weight: 600;
    color: var(--text-primary);
  }
  .org-count {
    color: var(--text-muted);
  }
  .org-bar-bg {
    width: 100%;
    height: 6px;
    background: var(--bg-secondary);
    border-radius: 4px;
    overflow: hidden;
  }
  .org-bar-fill {
    height: 100%;
    background: #0ea5e9;
    border-radius: 4px;
  }
</style>
