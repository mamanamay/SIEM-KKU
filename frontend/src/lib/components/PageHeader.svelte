<script lang="ts">
  export let title = '';
  export let description = '';
  export let icon = 'ti-layout-dashboard';
  export let exportData: any[] = [];
  export let exportColumns: string[] = [];
  export let exportFilename = 'kkusiem-export';
  export let exportTitle = 'KKUSIEM Report';
  export let showAI = false;

  import { downloadCSV, downloadPDF, downloadHTML } from '../utils/export';

  let showExportMenu = false;

  function handleCSV() {
    showExportMenu = false;
    downloadCSV(exportData, exportColumns, exportFilename + '.csv');
  }

  function handlePDF() {
    showExportMenu = false;
    downloadPDF(exportData, exportColumns, exportFilename + '.pdf', exportTitle);
  }

  function handleHTML() {
    showExportMenu = false;
    downloadHTML(exportData, exportColumns, exportFilename + '.html', exportTitle);
  }

  function handleOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.export-wrapper')) {
      showExportMenu = false;
    }
  }
</script>

<svelte:window on:click={handleOutsideClick} />

<header class="page-header">
  <!-- Left side -->
  <div class="header-left">
    <span class="header-icon">
      <i class="ti {icon}"></i>
    </span>
    <div class="header-text">
      <h1 class="header-title">{title}</h1>
      {#if description}
        <p class="header-desc">{description}</p>
      {/if}
    </div>
  </div>

  <!-- Right side -->
  <div class="header-actions">
    {#if showAI}
      <button class="btn btn-ai" on:click>
        <i class="ti ti-brain"></i>
        AI Summary
      </button>
    {/if}

    {#if exportData.length > 0 && exportColumns.length > 0}
      <div class="export-wrapper">
        <button
          class="btn btn-export"
          on:click|stopPropagation={() => (showExportMenu = !showExportMenu)}
        >
          <i class="ti ti-upload"></i>
          Export
          <i class="ti ti-chevron-down caret" class:rotated={showExportMenu}></i>
        </button>

        {#if showExportMenu}
          <div class="export-menu" role="menu">
            <button class="export-item" on:click={handleCSV} role="menuitem">
              <i class="ti ti-file-spreadsheet"></i>
              Export CSV
            </button>
            <button class="export-item" on:click={handlePDF} role="menuitem">
              <i class="ti ti-file-type-pdf"></i>
              Export PDF
            </button>
            <button class="export-item" on:click={handleHTML} role="menuitem">
              <i class="ti ti-file-code"></i>
              Export HTML
            </button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</header>

<style>
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 0 0 20px 0;
  }

  .header-left {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: var(--accent, #1d9e75);
    margin-top: 2px;
    flex-shrink: 0;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-title {
    font-size: 22px;
    font-weight: 800;
    color: var(--text-primary, #0f1117);
    margin: 0;
    line-height: 1.2;
  }

  .header-desc {
    font-size: 13px;
    color: var(--text-muted, #64748b);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    white-space: nowrap;
    font-family: inherit;
  }

  .btn-export {
    background: var(--bg-card, #ffffff);
    border-color: var(--border, #e5e9f0);
    color: var(--text-primary, #0f1117);
  }

  .btn-export:hover {
    background: var(--bg-app, #f1f4f8);
    border-color: #c8d0dc;
  }

  .btn-ai {
    background: var(--accent, #1d9e75);
    color: #ffffff;
    border-color: transparent;
  }

  .btn-ai:hover {
    background: #17896a;
  }

  .caret {
    font-size: 12px;
    transition: transform 0.15s;
  }

  .caret.rotated {
    transform: rotate(180deg);
  }

  .export-wrapper {
    position: relative;
  }

  .export-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 160px;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border, #e5e9f0);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    z-index: 200;
    overflow: hidden;
    padding: 4px 0;
  }

  .export-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary, #0f1117);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: background 0.1s;
  }

  .export-item:hover {
    background: var(--bg-app, #f1f4f8);
  }

  .export-item i {
    font-size: 15px;
    color: var(--text-muted, #64748b);
  }
</style>
