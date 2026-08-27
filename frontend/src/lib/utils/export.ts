import { get } from 'svelte/store';
import { usernameStore } from '../../stores/events';

function getDatedFilename(baseFilename: string) {
  const dateStr = new Date().toISOString().split('T')[0];
  const parts = baseFilename.split('.');
  const ext = parts.pop();
  return `${parts.join('_')}_${dateStr}.${ext}`;
}

export function downloadCSV(data: any[], selectedColumns: string[], filename = 'export.csv') {
  filename = getDatedFilename(filename);
  if (!data || data.length === 0 || !selectedColumns || selectedColumns.length === 0) return;

  try {
    const header = selectedColumns.join(',');
    const rows = data.map(row => {
      return selectedColumns.map(col => {
        let val = row[col] || row[col.toLowerCase()];
        if (val === null || val === undefined) val = '';
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
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('CSV Export Error:', err);
  }
}

async function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export async function downloadPDF(data: any[], selectedColumns: string[], filename = 'export.pdf', title = 'Report', desc = '', dept = 'Digital Technology Office, KKU') {
  filename = getDatedFilename(filename);
  if (!data || data.length === 0 || !selectedColumns || selectedColumns.length === 0) return;

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    
    const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
    const exporter = get(usernameStore) || 'System Administrator';
    const dateStr = new Date().toLocaleString('en-GB');

    const addLetterhead = (dataConfig: any) => {
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, pageWidth, 24, 'F');
      
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text(`KKUSIEM ${title}`, 14, 15);
      
      doc.setFillColor(220, 38, 38);
      doc.rect(pageWidth - 54, 8, 40, 8, 'F');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('INTERNAL USE ONLY', pageWidth - 52, 13.5);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Exported By: ${exporter} | Date: ${dateStr}`, 14, 32);
      
      const str = `Page ${dataConfig.pageNumber}`;
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`KKUSIEM Enterprise SOC Platform - Generated Report`, 14, pageHeight - 10);
      doc.text(str, pageWidth - 20, pageHeight - 10);
    };

    const head = [selectedColumns];
    const body = data.map(row => selectedColumns.map(col => String(row[col] || row[col.toLowerCase()] || '-')));

    doc.autoTable({
      head: head,
      body: body,
      startY: desc ? 45 : 40,
      theme: 'grid',
      headStyles: { fillColor: [29, 158, 117], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { fontSize: 9, cellPadding: 4, textColor: [30, 41, 59] },
      didDrawPage: addLetterhead
    });

    doc.save(filename);
  } catch (err) {
    console.error('PDF Export Error:', err);
    alert('Failed to generate PDF report.');
  }
}

export function downloadHTML(data: any[], selectedColumns: string[], filename = 'export.html', title = 'Report') {
  filename = getDatedFilename(filename);
  if (!data || data.length === 0 || !selectedColumns || selectedColumns.length === 0) return;

  const exporter = get(usernameStore) || 'System Administrator';
  const dateStr = new Date().toLocaleString('en-GB');

  const headers = selectedColumns.map(col => `<th>${col}</th>`).join('');
  const rows = data.map(row => {
    const tds = selectedColumns.map(col => `<td>${row[col] || row[col.toLowerCase()] || '-'}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
        .report-header { background: #0f172a; color: white; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; }
        .report-header h1 { margin: 0; font-size: 24px; }
        .badge { background: #ef4444; color: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; letter-spacing: 1px; }
        .meta-info { padding: 16px 32px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; gap: 32px; font-size: 14px; color: #64748b; }
        .meta-info strong { color: #334155; }
        .table-container { padding: 32px; overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #1d9e75; color: white; font-weight: 600; }
        tr:hover { background: #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="report-header">
        <h1>KKUSIEM: ${title}</h1>
        <div class="badge">INTERNAL USE ONLY</div>
      </div>
      <div class="meta-info">
        <div><strong>Exported By:</strong> ${exporter}</div>
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Total Records:</strong> ${data.length}</div>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>${headers}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </body>
    </html>
  `;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
export function downloadDOCX(data: any[], selectedColumns: string[], filename = 'export.docx', title = 'Report') {
  alert('DOCX export requires a backend service in this version. Generating PDF instead.');
  downloadPDF(data, selectedColumns, filename.replace('.docx', '.pdf'), title);
}



