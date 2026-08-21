export function downloadCSV(data, selectedColumns, filename = 'export.csv') {
  if (!data || data.length === 0 || !selectedColumns || selectedColumns.length === 0) return;

  try {
    // Header row
    const header = selectedColumns.join(',');
    
    // Data rows
    const rows = data.map(row => {
      return selectedColumns.map(col => {
        let val = row[col];
        if (val === null || val === undefined) val = '';
        val = String(val); // Convert everything to string safely
        
        // Escape commas and quotes for CSV
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    
    // Create Blob and trigger download
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for UTF-8 Excel support
    
    // Fallback for older browsers
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      window.navigator.msSaveOrOpenBlob(blob, filename);
      return;
    }
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (err) {
    console.error("CSV Download Error:", err);
    alert("เกิดข้อผิดพลาดในการดาวน์โหลด CSV: " + err.message);
  }
}


export function downloadDOCX(data: any[], selectedColumns: string[], filename = 'export.doc', title = 'Report') {
  if (!data || data.length === 0 || !selectedColumns || selectedColumns.length === 0) return;

  const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${title}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; font-weight: bold; }
      h2 { color: #1d9e75; }
    </style>
    </head><body>
    <h2>${title}</h2>
    <p>Generated at: ${new Date().toLocaleString('en-GB')}</p>
    <table>
      <thead><tr>${selectedColumns.map(col => `<th>${col}</th>`).join('')}</tr></thead>
      <tbody>
        ${data.map(row => `<tr>${selectedColumns.map(col => `<td>${row[col] || '—'}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
    </body></html>`;

  const blob = new Blob(['\ufeff', header], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace('.docx', '.doc');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export async function downloadPDF(data, selectedColumns, filename = 'export.pdf', title = 'Report') {
  if (!data || data.length === 0 || !selectedColumns || selectedColumns.length === 0) return;

  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    
    // Header
    doc.setFontSize(16);
    doc.setTextColor(40, 40, 40);
    doc.text(title, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const dateStr = new Date().toLocaleString('en-GB');
    doc.text(`Generated at: ${dateStr}`, 14, 28);

    // Extract table data
    const head = [selectedColumns];
    const body = data.map(row => selectedColumns.map(col => String(row[col] || '—')));

    // AutoTable
    doc.autoTable({
      head: head,
      body: body,
      startY: 35,
      theme: 'striped',
      headStyles: { fillColor: [29, 158, 117], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3, textColor: [50, 50, 50], overflow: 'linebreak' },
      alternateRowStyles: { fillColor: [245, 248, 250] },
    });

    doc.save(filename);
  } catch (err) {
    console.error("Failed to load PDF libraries", err);
    alert("ไม่สามารถสร้าง PDF ได้\n\nโปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต (จำเป็นต้องโหลดไลบรารีจากภายนอก) หรือลอง Export เป็น CSV แทน");
  }
}

export function downloadHTML(data: any[], columns: string[], filename = 'report.html', title = 'KKUSIEM Report', subtitle = '') {
  if (!data || data.length === 0) return;
  const dateStr = new Date().toLocaleString('th-TH');
  const rows = data.map(row => `<tr>${columns.map(c => `<td>${row[c] ?? ''}</td>`).join('')}</tr>`).join('');
  const thead = `<tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr>`;
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; background: #f1f4f8; color: #0f1117; padding: 32px; }
  .report-header { background: #ffffff; border: 1px solid #e5e9f0; border-radius: 12px; padding: 24px 32px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { display: flex; align-items: center; gap: 12px; }
  .logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg, #1d9e75, #059669); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-size: 22px; font-weight: 900; }
  .logo-name { font-size: 20px; font-weight: 800; color: #0f1117; }
  .logo-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.8; }
  h1 { font-size: 22px; font-weight: 800; color: #0f1117; margin-bottom: 4px; }
  p { font-size: 13px; color: #64748b; }
  .card { background: #ffffff; border: 1px solid #e5e9f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
  .card-header { padding: 16px 20px; border-bottom: 1px solid #e5e9f0; font-weight: 700; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f8fafc; padding: 10px 14px; font-weight: 700; color: #64748b; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; border-bottom: 1px solid #e5e9f0; text-align: left; }
  td { padding: 10px 14px; border-bottom: 1px solid #f1f4f8; color: #0f1117; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8fafc; }
  .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e9f0; }
  @media print { body { background: white; padding: 16px; } }
</style>
</head>
<body>
  <div class="report-header">
    <div class="logo">
      <div class="logo-icon">K</div>
      <div>
        <div class="logo-name">KKUSIEM</div>
        <div class="logo-sub">Enterprise SOC Platform</div>
      </div>
    </div>
    <div class="meta">
      <strong>${title}</strong><br>
      ${subtitle ? subtitle + '<br>' : ''}\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e40\u0e21\u0e37\u0e48\u0e2d: ${dateStr}<br>
      \u0e08\u0e33\u0e19\u0e27\u0e19\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23: ${data.length} \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23
    </div>
  </div>
  <div class="card">
    <div class="card-header">${title}</div>
    <table><thead>${thead}</thead><tbody>${rows}</tbody></table>
  </div>
  <div class="footer">KKUSIEM Enterprise SOC \u2014 CONFIDENTIAL \u2014 \u0e2a\u0e23\u0e49\u0e32\u0e07\u0e42\u0e14\u0e22\u0e23\u0e30\u0e1a\u0e1a\u0e2d\u0e31\u0e15\u0e42\u0e19\u0e21\u0e31\u0e15\u0e34 ${dateStr}</div>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename.endsWith('.html') ? filename : filename + '.html';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
