<script lang="ts">
  import { notificationStore, removeNotification } from '../../stores/notificationStore';
  export let modern = false;
  const types = ['success', 'warning', 'error', 'processing', 'info'];
  const names: Record<string, string> = { success: 'สำเร็จ', warning: 'โปรดตรวจสอบ', error: 'เกิดข้อผิดพลาด', processing: 'กำลังดำเนินการ', info: 'แจ้งข้อมูล' };
  function display(notif: { type: string; title: string; message: string }) {
    if (!modern) return notif;
    if (types.includes(notif.type)) return { ...notif, title: notif.message ? notif.title : names[notif.type], message: notif.message || notif.title };
    const type = types.includes(notif.message) ? notif.message : types.includes(notif.title) ? notif.title : 'info';
    return { ...notif, type, title: types.includes(notif.title) ? names[type] : notif.type, message: types.includes(notif.title) ? notif.type : notif.title };
  }
</script>

<div class="notif-container" class:siem-modern-notification={modern}>
  {#each $notificationStore as notif (notif.id)}
    {@const shown = display(notif)}
    <div class="notif-card {shown.type}" role={modern ? (shown.type === 'error' ? 'alert' : 'status') : undefined}>
      <div class="icon">
        {#if shown.type === 'success'}<i class="ti ti-circle-check"></i>
        {:else if shown.type === 'warning'}<i class="ti ti-alert-triangle"></i>
        {:else if shown.type === 'error'}<i class="ti ti-x"></i>
        {:else if shown.type === 'processing'}<i class="ti ti-loader rotate"></i>{:else if modern}<i class="ti ti-info-circle"></i>{/if}
      </div>
      <div class="content">
        <div class="title">{shown.title}</div>
        <div class="msg">{shown.message}</div>
      </div>
      <button aria-label="ปิดการแจ้งเตือน" class="close" on:click={() => removeNotification(notif.id)}><i class="ti ti-x"></i></button>
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

  .siem-modern-notification { top: 18px; right: 18px; max-width: calc(100vw - 36px); }
  .siem-modern-notification { --bg-panel: #fff; --border: #dfe8eb; --text-primary: #18303e; --text-muted: #748794; --green: #13866d; --orange: #a16815; --red: #c23d4a; --blue: #376fa5; --shadow-md: 0 12px 36px #1933440d; }
  :global([data-theme="dark"]) .siem-modern-notification { --bg-panel: #152633; --border: #2b404f; --text-primary: #e1eef2; --text-muted: #8aa2b2; --green: #45d7ab; --orange: #efbc6b; --red: #fc8b98; --blue: #8abdec; --shadow-md: 0 12px 36px #0003; }
  .siem-modern-notification .notif-card { width: 355px; max-width: 100%; border: 1px solid var(--border); border-left-width: 4px; border-radius: 14px; padding: 17px; box-shadow: var(--shadow-md); }
  .siem-modern-notification .notif-card.success { border-left-color: var(--green); }.siem-modern-notification .success .icon { color: var(--green); }
  .siem-modern-notification .notif-card.warning { border-left-color: var(--orange); }.siem-modern-notification .warning .icon { color: var(--orange); }
  .siem-modern-notification .notif-card.error { border-left-color: var(--red); }.siem-modern-notification .error .icon { color: var(--red); }
  .siem-modern-notification .notif-card.processing { border-left-color: var(--blue); }.siem-modern-notification .processing .icon { color: var(--blue); }
  </style>
