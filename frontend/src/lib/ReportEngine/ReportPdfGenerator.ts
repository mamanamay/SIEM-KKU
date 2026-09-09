import type { ReportConfig, ReportDataModel } from './types';
import { get } from 'svelte/store';
import { usernameStore } from '../../../stores/events';

export async function generatePdf(config: ReportConfig, dataModel: ReportDataModel, dataToExport: any[], language: string) {
  try {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF('portrait', 'mm', 'a4');
    
    doc.setFontSize(16);
    doc.text(`KKUSIEM - ${config.reportTitle}`, 14, 20);
    
    if (config.aiEnabled && dataModel.aiAnalysis) {
      doc.setFontSize(12);
      doc.text(language === 'th' ? 'สรุปการวิเคราะห์' : 'AI Assessment', 14, 30);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(dataModel.aiAnalysis.executiveSummary, 180);
      doc.text(lines, 14, 40);
    }
    
    // In a real implementation, use jsPDF-AutoTable for dataToExport
    doc.text(`Total Records: ${dataToExport.length}`, 14, 100);
    
    doc.save(`${config.pageType}_report.pdf`);
  } catch (e) {
    console.error(e);
  }
}
