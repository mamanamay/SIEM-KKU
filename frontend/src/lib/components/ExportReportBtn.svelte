<script lang="ts">
  import ReportModal from './ReportModal.svelte';
  import { downloadCSV, downloadPDF, downloadHTML } from '../utils/export';

  export let data: any[] = [];
  export let columns: string[] = [];
  export let title: string = 'Report';
  export let filename: string = 'export';
  
  let showModal = false;

  function handleExport(e: CustomEvent) {
    const { format, fields } = e.detail;
    if (format === 'csv') {
      downloadCSV(data, fields, filename + '.csv');
    } else if (format === 'pdf') {
      downloadPDF(data, fields, filename + '.pdf', title, e.detail.desc, e.detail.dept);
    } else if (format === 'html') {
      downloadHTML(data, fields, filename + '.html', title);
    }
  }
</script>

<div class="export-dropdown-container">
  <button class="btn btn-outline" on:click={() => showModal = true}>
    <i class="ti ti-download"></i> Export
  </button>
  
  <ReportModal 
    bind:show={showModal}
    reportTitle={title}
    availableFields={columns}
    previewData={data}
    on:export={handleExport}
  />
</div>

<style>
  .export-dropdown-container {
    position: relative;
    display: inline-block;
  }
  .btn-outline {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    background: transparent;
    border: 1px solid var(--border, rgba(255,255,255,0.2));
    color: var(--text-primary, #e8eaf0);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-outline:hover {
    background: var(--bg-secondary, rgba(255,255,255,0.05));
    border-color: var(--text-muted, rgba(255,255,255,0.4));
  }
</style>

