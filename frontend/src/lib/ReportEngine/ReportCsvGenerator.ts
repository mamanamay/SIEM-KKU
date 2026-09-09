import type { ReportConfig, ReportDataModel } from './types';

export function generateCsv(config: ReportConfig, dataModel: ReportDataModel, dataToExport: any[]) {
  if (dataToExport.length === 0) return;
  const columns = dataModel.columns;
  
  const header = columns.join(',');
  const rows = dataToExport.map(row => {
    return columns.map(col => {
      let val = row[col] || row[col.toLowerCase()] || '';
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(',');
  });

  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${config.pageType}_data.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
