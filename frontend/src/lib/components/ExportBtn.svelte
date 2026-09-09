<script lang="ts">
  import { openReportWizard } from '../../stores/globalReportStore';
  import type { ReportConfig } from '../ReportEngine/types';
  
  export let filters: any = {};
  export let config: ReportConfig;
  export let data: any[] = [];
  export let columns: string[] = [];
  
  function handleOpen() {
    // Snapshot the data when Export is clicked to freeze incoming logs
    const snapshotData = [...data];
    openReportWizard(config, filters, snapshotData, columns);
  }
</script>

<button class="btn-export" on:click={handleOpen}>
  <i class="ti ti-download"></i> Export  
</button>

<style>
  .btn-export {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--border, #cbd5e1);
    color: var(--text-primary, #334155);
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-export:hover {
    background: var(--bg-app, #f1f5f9);
    border-color: #94a3b8;
  }
  :global(.dark) .btn-export {
    border-color: rgba(255,255,255,0.2);
    color: #e8eaf0;
  }
  :global(.dark) .btn-export:hover {
    background: rgba(255,255,255,0.05);
  }
</style>
