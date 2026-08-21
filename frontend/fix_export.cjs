const fs = require('fs');
const file = 'src/routes/dashboard/blocked_ip_audit/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/showExportModal = true/g, 'showExportMenu = !showExportMenu');

fs.writeFileSync(file, content);
console.log('Fixed showExportModal');
