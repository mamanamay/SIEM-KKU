<script lang="ts">
  export let show = false;
  export let report: any = null;

  function close() {
    show = false;
    report = null;
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window on:keydown={handleKey} />

{#if show && report}
<div class="drawer-backdrop" on:click={close} role="dialog" aria-modal="true">
  <div class="drawer" on:click|stopPropagation>
    <div class="drawer-header">
      <div class="drawer-title">
        <i class="ti ti-file-report"></i>
        <span>{report.name}</span>
        <span class="badge" style="background: {report.format === 'PDF' ? 'rgba(239,68,68,0.1)' : report.format === 'HTML' ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)'}; color: {report.format === 'PDF' ? '#ef4444' : report.format === 'HTML' ? '#3b82f6' : '#10b981'}; border-radius:4px; font-size:11px; padding: 2px 8px; font-weight: 700;">{report.format}</span>
      </div>
      <div class="drawer-meta">
        <span><i class="ti ti-user"></i> {report.author}</span>
        <span><i class="ti ti-calendar"></i> {report.date}</span>
      </div>
      <div class="drawer-actions">
        <button class="btn-ghost" title="Close" on:click={close}><i class="ti ti-x"></i></button>
      </div>
    </div>
    
    <div class="drawer-body">
      {#if report.previewHtml}
        <iframe
          title="Report Preview"
          srcdoc={report.previewHtml}
          class="preview-iframe"
          sandbox="allow-same-origin"
        ></iframe>
      {:else if report.format === 'CSV'}
        <div class="no-preview">
          <i class="ti ti-table"></i>
          <p>CSV files cannot be previewed in browser.</p>
          <small>Please download the file to view it.</small>
        </div>
      {:else}
        <div class="no-preview">
          <i class="ti ti-photo-off"></i>
          <p>Preview not available for this report.</p>
          <small>Preview is only available for reports generated in this session.</small>
        </div>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 9998;
    backdrop-filter: blur(2px);
    display: flex;
    justify-content: flex-end;
  }

  .drawer {
    width: 800px;
    max-width: 92vw;
    height: 100%;
    background: var(--bg-primary, #fff);
    display: flex;
    flex-direction: column;
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.18);
    animation: slideIn 0.25s ease;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }

  .drawer-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border, #e2e8f0);
    background: var(--bg-secondary, #f8fafc);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .drawer-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary, #0f172a);
  }

  .drawer-meta {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: var(--text-muted, #64748b);
  }

  .drawer-meta span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .drawer-actions {
    position: absolute;
    top: 12px;
    right: 16px;
  }

  .drawer-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .preview-iframe {
    width: 100%;
    flex: 1;
    border: none;
    background: #fff;
  }

  .no-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-muted, #64748b);
  }

  .no-preview i {
    font-size: 48px;
    opacity: 0.4;
  }

  .no-preview p {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .no-preview small {
    font-size: 13px;
    opacity: 0.7;
  }

  .btn-ghost {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #64748b);
    font-size: 18px;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .btn-ghost:hover {
    background: var(--bg-app, #f1f5f9);
    color: var(--text-primary, #0f172a);
  }
</style>
