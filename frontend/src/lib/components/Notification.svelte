<script lang="ts">
  import { notificationStore, removeNotification } from '../../stores/notificationStore';
</script>

<div class="notif-container">
  {#each $notificationStore as notif (notif.id)}
    <div class="notif-card {notif.type}">
      <div class="icon">
        {#if notif.type === 'success'}<i class="ti ti-circle-check"></i>
        {:else if notif.type === 'warning'}<i class="ti ti-alert-triangle"></i>
        {:else if notif.type === 'error'}<i class="ti ti-x"></i>
        {:else if notif.type === 'processing'}<i class="ti ti-loader rotate"></i>{/if}
      </div>
      <div class="content">
        <div class="title">{notif.title}</div>
        <div class="msg">{notif.message}</div>
      </div>
      <button class="close" on:click={() => removeNotification(notif.id)}><i class="ti ti-x"></i></button>
    </div>
  {/each}
</div>

<style>
  .notif-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; }
  .notif-card { display: flex; align-items: flex-start; gap: 12px; background: var(--bg-panel, white); padding: 16px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 320px; animation: slideIn 0.3s ease; border-left: 4px solid #cbd5e1; color: var(--text-primary); }
  .notif-card.success { border-left-color: #10b981; }
  .notif-card.warning { border-left-color: #f59e0b; }
  .notif-card.error { border-left-color: #ef4444; }
  .notif-card.processing { border-left-color: #0ea5e9; }
  
  .icon { font-size: 20px; margin-top: 2px; }
  .success .icon { color: #10b981; }
  .warning .icon { color: #f59e0b; }
  .error .icon { color: #ef4444; }
  .processing .icon { color: #0ea5e9; }
  
  .content { flex: 1; }
  .title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .msg { font-size: 13px; color: var(--text-muted); line-height: 1.4; }
  
  .close { background: none; border: none; font-size: 16px; cursor: pointer; color: var(--text-muted); opacity: 0.6; }
  .close:hover { opacity: 1; }
  
  .rotate { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
  @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
</style>
