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
