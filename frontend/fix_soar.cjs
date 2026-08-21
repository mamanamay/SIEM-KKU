const fs = require('fs');
const file = 'src/routes/dashboard/soar/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

const refreshScript = `
  let isRefreshing = false;
  function handleRefresh() {
    isRefreshing = true;
    setTimeout(() => { isRefreshing = false; }, 600);
  }
`;

content = content.replace(/let showExportMenu = false;/, "let showExportMenu = false;\n" + refreshScript);

const refreshBtn = `
      <button class="ds-btn" on:click={handleRefresh} disabled={isRefreshing}>
        <i class="ti ti-refresh" class:spinning={isRefreshing}></i> Refresh
      </button>`;

content = content.replace(/<div class="page-header-right">/, `<div class="page-header-right">${refreshBtn}`);

fs.writeFileSync(file, content);
console.log('Added Refresh button to soar');
