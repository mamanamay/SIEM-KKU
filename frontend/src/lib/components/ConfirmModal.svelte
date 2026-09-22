<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let visible = false;
  export let title = 'ยืนยันการกระทำ';
  export let message = 'คุณแน่ใจหรือไม่?';
  export let icon = 'ti-question-mark';
  export let confirmText = 'ยืนยัน';
  export let cancelText = 'ยกเลิก';
  export let confirmColor = '#3b82f6'; // Default blue
  export let iconColor = '#3b82f6'; // Default blue

  const dispatch = createEventDispatcher();

  function handleConfirm() {
    dispatch('confirm');
    visible = false;
  }

  function handleCancel() {
    dispatch('cancel');
    visible = false;
  }

  // Allow closing on Escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && visible) {
      handleCancel();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleCancel}>
    <div class="confirm-modal" on:click|stopPropagation>
      <div class="cm-icon" style="color: {iconColor}; background: {iconColor}1a;">
        <i class="{icon.startsWith('ti ') ? icon : 'ti ' + icon}"></i>
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      <div class="cm-actions">
        <button class="btn-cancel" on:click={handleCancel}>{cancelText}</button>
        <button class="btn-confirm" style="background: {confirmColor};" on:click={handleConfirm}>{confirmText}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  }
  .confirm-modal {
    background: var(--bg-panel, #ffffff);
    padding: 32px;
    border-radius: 16px;
    width: 100%;
    max-width: 400px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border, #e2e8f0);
    animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    color: var(--text-primary, #1e293b);
  }
  .cm-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    margin: 0 auto 16px;
  }
  .confirm-modal h3 {
    font-size: 20px;
    margin-bottom: 8px;
    color: var(--text-primary);
  }
  .confirm-modal p {
    font-size: 14px;
    color: var(--text-secondary, #64748b);
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .cm-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .cm-actions button {
    min-width: 120px;
    padding: 10px 16px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
  }
  .btn-cancel {
    background-color: var(--bg-secondary, #f1f5f9);
    color: var(--text-primary, #0f172a);
    border: 1px solid var(--border, #cbd5e1);
  }
  .btn-cancel:hover {
    background-color: var(--border, #e2e8f0);
  }
  .btn-confirm {
    color: #ffffff;
  }
  .btn-confirm:hover {
    opacity: 0.9;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  @keyframes popIn {
    0% { transform: scale(0.9); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }
</style>
