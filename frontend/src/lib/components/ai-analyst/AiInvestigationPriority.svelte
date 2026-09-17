<script lang="ts">
  import OrgBadge from '../OrgBadge.svelte';
  import { createEventDispatcher } from 'svelte';
  export let priorities: any[] = [];
  
  const dispatch = createEventDispatcher();
  
  function getBadgeClass(level: number) {
    if (level === 1) return 'text-red';
    if (level === 2) return 'text-orange';
    return 'text-yellow';
  }
</script>

<div class="priority-card">
  <div class="priority-header text-orange">
    <i class="ti ti-target"></i> เป้าหมายสำคัญที่ควรเร่งตรวจสอบ (Investigation Priorities)
  </div>
  <div class="priority-body custom-scrollbar">
    {#if priorities.length === 0}
      <div class="empty">ไม่พบเป้าหมายสำคัญ หรือยังไม่ได้ประมวลผล (No priorities identified)</div>
    {:else}
      <div class="priority-list">
        {#each priorities as p}
          <div class="priority-item">
            <div class="p-level {getBadgeClass(p.priorityLevel)}">
              Priority {p.priorityLevel}
            </div>
            <div class="p-content">
              <div class="p-entity">
                {p.entity}
                {#if p.organization}
                  <OrgBadge organization={p.organization} full={true} />
                {/if}
              </div>
              <div class="p-reason">{p.reason}</div>
              <div class="p-action"><strong>Action:</strong> {p.recommendedAction}</div>
            </div>
            <div class="p-actions">
              <button class="btn-sm" on:click={() => dispatch('investigate', p.entity)}>Investigate</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .priority-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 20px;
    overflow: hidden;
  }
  .priority-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(239, 68, 68, 0.05);
    color: #dc2626;
  }
  .priority-body {
    padding: 20px;
  }
  .empty {
    color: var(--text-muted);
    font-size: 14px;
    font-style: italic;
  }
  .priority-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .priority-item {
    display: flex;
    gap: 16px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  .p-level {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-primary);
    height: fit-content;
    white-space: nowrap;
  }
  .bg-red { background: #ef4444; }
  .bg-orange { background: #f97316; }
  .bg-yellow { background: #eab308; }
  
  .p-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .p-entity {
    font-weight: 700;
    font-size: 15px;
    color: var(--text-primary);
  }
  .org-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(59, 130, 246, 0.1);
    color: #2563eb;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid rgba(59, 130, 246, 0.2);
  }
  .p-reason {
    font-size: 13px;
    color: var(--text-primary);
    line-height: 1.5;
  }
  .p-action {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
  }
  .btn-sm {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .btn-sm:hover {
    background: var(--bg-secondary);
  }
</style>
