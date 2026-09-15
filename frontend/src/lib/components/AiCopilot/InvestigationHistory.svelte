<script lang="ts">
  import { aiCopilotStore } from '../../../stores/aiCopilotStore';
  
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

  {#if showConfirmModal}
      <div class="modal-backdrop" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); display:flex; justify-content:center; align-items:center; z-index:9999;">
        <div style="background:var(--bg-panel, #ffffff); color:var(--text-primary, #1e293b); padding:24px; border-radius:12px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); border: 1px solid var(--border, #e2e8f0); max-width: 320px; width: 100%;" on:click|stopPropagation>
          <div style="font-size: 32px; color: #ef4444; margin-bottom: 12px;"><i class="ti ti-alert-triangle"></i></div>
          <h3 style="margin:0 0 8px 0; font-size: 18px;">Delete Investigation?</h3>
          <p style="margin:0; font-size: 14px; color:var(--text-secondary, #64748b);">This action cannot be undone.</p>
          <div style="display:flex; justify-content:center; gap:12px; margin-top:24px;">
            <button on:click={(e) => { e.stopPropagation(); showConfirmModal = false; }} style="padding:8px 16px; background:var(--bg-secondary, #f1f5f9); color:var(--text-primary, #000); border:1px solid var(--border, #cbd5e1); border-radius:6px; cursor:pointer; font-weight: 600;">Cancel</button>
            <button on:click={(e) => { e.stopPropagation(); executeDelete(); }} style="padding:8px 16px; background:#ef4444; color:white; border:none; border-radius:6px; cursor:pointer; font-weight: 600;">Delete</button>
          </div>
        </div>
      </div>
{/if}

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