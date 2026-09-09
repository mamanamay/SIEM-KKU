import type { ReportConfig, ReportDataModel } from './types';

export function generateHtml(config: ReportConfig, dataModel: ReportDataModel, dataToExport: any[], language: string) {
  const html = `
    <html>
      <head><title>${config.reportTitle}</title></head>
      <body>
        <h1>${config.reportTitle}</h1>
        <p>Total Records: ${dataToExport.length}</p>
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${config.pageType}_report.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
