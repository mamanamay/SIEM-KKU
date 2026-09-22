<script lang="ts">
  import { aiCopilotStore } from '../../../stores/aiCopilotStore';
  import ConfirmModal from '../ConfirmModal.svelte';
  
  export let onCloseMobile: () => void = () => {};

  $: sessions = $aiCopilotStore.sessions;
  $: activeId = $aiCopilotStore.activeSessionId;

  
  let showConfirmModal = false;
  let sessionToDelete = null;

  function confirmDelete(e, id) {
    e.stopPropagation();
    sessionToDelete = id;
    showConfirmModal = true;
  }

  function executeDelete() {
    if (sessionToDelete) {
      aiCopilotStore.deleteSession(sessionToDelete);
    }
    showConfirmModal = false;
    sessionToDelete = null;
  }

  function deleteSession(e, id: string) {
    e.stopPropagation();
    aiCopilotStore.deleteSession(id);
  }

  function selectSession(id: string) {
    aiCopilotStore.setActiveSession(id);
    onCloseMobile();
  }
</script>

<ConfirmModal bind:visible={showConfirmModal} title='ลบประวัติการสืบสวน?' message='การกระทำนี้ไม่สามารถกู้คืนได้ คุณต้องการลบประวัตินี้ใช่หรือไม่?' icon='ti-alert-triangle' confirmColor='#ef4444' iconColor='#ef4444' confirmText='ลบข้อมูล' on:confirm={executeDelete} on:cancel={() => showConfirmModal = false} />

<style>
  .history-panel {
    width: 250px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .history-header {
    padding: 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  .history-item {
    padding: 10px;
    border-radius: 6px;
    cursor: pointer;
    margin-bottom: 4px;
    transition: background 0.2s;
  }
  .history-item:hover {
    background: var(--bg-secondary);
  }
  .history-item.active {
    background: #e0f2fe;
    color: #0369a1;
  }
  .item-title {
    font-size: 0.85rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
  }
  .item-meta {
    font-size: 0.7rem;
    color: var(--text-secondary);
    display: flex;
    justify-content: space-between;
  }
  .item-mode {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--border);
  }


</style>

<div class="history-panel">
  <div class="history-header">
    Investigation History
  </div>
  <div class="history-list custom-scrollbar">
    {#if sessions.length === 0}
      <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        No history found
      </div>
    {/if}
    
    {#each sessions as session (session.id)}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div 
        class="history-item {session.id === activeId ? 'active' : ''}"
        on:click={() => selectSession(session.id)}
      >
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div class="item-title">{session.title}</div>
          <button style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 2px;" on:click={(e) => confirmDelete(e, session.id)}>
            <i class="ti ti-trash"></i>
          </button>
        </div>
        <div class="item-meta">
          <span>{new Date(session.lastActivity).toLocaleDateString()}</span>
          <span class="item-mode">{session.currentMode === 'api' ? 'API' : 'Local'}</span>
        </div>
      </div>
    {/each}
  </div>
</div>