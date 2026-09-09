import { globalReportStore, closeReportWizard } from '../../stores/globalReportStore';
import { showNotification } from '../../stores/notificationStore';

$: state = $globalReportStore;

let searchQuery = '';
let currentPage = 1;
let dataSet: any[] = [];
let totalRecords = 0;
let isLoadingData = false;
let isExporting = false;
let previewHtml = '';

async function fetchData() {
  isLoadingData = true;
  try {
    const res = await fetch('/api/attacks/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: currentPage,
        limit: 50,
        filters: state.filters
      })
    });
    const data = await res.json();
    dataSet = data.data;
    totalRecords = data.total;
  } catch (e) {
    console.error('Failed to fetch data', e);
  }
  isLoadingData = false;
}

// Fetch data when opened or page changes
$: if (state.isOpen) {
  fetchData();
}

function toggleRow(id: number) {
  globalReportStore.update(s => {
    if (!s.dataModel) return s;
    const ids = s.dataModel.selectedIds;
    const newIds = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    s.dataModel.selectedIds = newIds;
    return s;
  });
}

function selectAllOnPage() {
  globalReportStore.update(s => {
    if (!s.dataModel) return s;
    const currentIds = set(s.dataModel.selectedIds);
    dataSet.forEach(row => currentIds.add(row.id));
    s.dataModel.selectedIds = Array.from(currentIds);
    return s;
  });
}

async function generatePreview() {
  is(isExporting) return;
  isExporting = true;
  try {
    const res = await fetch('/api/export/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedIds: state.dataModel?.selectedIds || [],
        reportTitle: state.config?.reportTitle || 'Custom Report'
      })
    });
    const returnData = await res.json();
    previewHtml = returnData.html;
  } catch (e) {
    showNotification('error', 'Preview Failed', 'Could not generate preview');
  }
  isExporting = false;
}

function nextStep() {
  if (state.step === 1 && state.dataModel!.selectedIds.length === 0) {
    showNotification("warning", "Data Required", "Please select at least one event to export.");
    return;
  }
  globalReportStore.update(s => ({ ...s, step: s.step + 1 }));
  if (state.step === 2) {
    generatePreview();
  }
}

function prevStep() { globalReportStore.update(s => ({ ...s, step: s.step - 1 })); }

async function exportReport(format: 'pdf' | 'csv') {
  const endpoint = format === 'pdf' ? '/api/export/pdf' : '/api/export/csv';
  const bodyData = {
    selectedIds: state.dataModel?.selectedIds || [],
    reportTitle: state.config?.reportTitle || 'Custom Report'
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });
    if (!res.ok) throw new Error('Export failed');
    
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = _KKU_SIEM_Report.T{format}l;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    showNotification('error', 'Export Failed', 'Unable to download file.');
  }
}
