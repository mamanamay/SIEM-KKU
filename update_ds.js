const fs = require('fs');
function updateFile(path) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(/<div class="page-container">/g, '<div style="display:flex;flex-direction:column;gap:16px;padding-bottom:2rem;">');
  content = content.replace(/<div class="page-header">/g, '<div class="ds-card-head" style="margin-bottom:0;">');
  content = content.replace(/<div class="page-title">/g, '<div class="ds-card-title">');
  content = content.replace(/<div class="page-subtitle">/g, '<div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">');
  content = content.replace(/<div class="panel">/g, '<div class="ds-card" style="padding:0;overflow:hidden;">');
  content = content.replace(/<table class="data-table">/g, '<div class="ds-table-wrap"><table class="ds-table">');
  content = content.replace(/<\/table>/g, '</table></div>');
  content = content.replace(/<span class="badge {sevClass\(e.severity\)}">/g, '<span class="ds-badge {sevClass(e.severity)}">');
  content = content.replace(/if \(s === 'critical'\) return 'b-red';/g, "if (s === 'critical') return 'red';");
  content = content.replace(/if \(s === 'high'\)     return 'b-orange';/g, "if (s === 'high')     return 'orange';");
  content = content.replace(/return 'b-cyan';/g, "return 'blue';");
  
  content = content.replace(/<div class="pagination">/g, '<div class="ds-pagination">');
  content = content.replace(/<button class="page-btn"/g, '<button class="ds-page-btn"');
  content = content.replace(/<span class="page-info">/g, '<div class="ds-pagination-info">');
  content = content.replace(/<\/span>\s*<button class="ds-page-btn" on:click={nextPage}/g, '</div><div class="ds-pagination-btns"><button class="ds-page-btn" on:click={nextPage}');
  
  // A bit of a hack for the pagination closing tags
  content = content.replace(/<\/button>\s*<\/div>\s*{\/if}/g, '</button></div></div>{/if}');
  
  // Also clean up local CSS styles
  content = content.replace(/\.page-container \{ [^\}]+\}/g, '');
  content = content.replace(/\.page-header \{ [^\}]+\}/g, '');
  content = content.replace(/\.page-title \{ [^\}]+\}/g, '');
  content = content.replace(/\.page-title i \{ [^\}]+\}/g, '');
  content = content.replace(/\.page-subtitle \{ [^\}]+\}/g, '');
  content = content.replace(/\.panel \{ [^\}]+\}/g, '');
  content = content.replace(/\.data-table \{ [^\}]+\}/g, '');
  content = content.replace(/\.data-table thead th \{ [^\}]+\}/g, '');
  content = content.replace(/\.data-table td \{ [^\}]+\}/g, '');
  
  fs.writeFileSync(path, content, 'utf8');
  console.log('Updated', path);
}
updateFile('c:/Users/InternCY/Documents/GitHub/Demo_Honeypot/frontend/src/routes/dashboard/investigate/+page.svelte');
updateFile('c:/Users/InternCY/Documents/GitHub/Demo_Honeypot/frontend/src/routes/dashboard/+page.svelte');
