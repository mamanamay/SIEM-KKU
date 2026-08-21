const fs = require('fs');
const file = 'src/routes/dashboard/+layout.svelte';
let content = fs.readFileSync(file, 'utf8');

// Update getPageTitle mapping
content = content.replace("'/dashboard/api-history': 'API History'", `'/dashboard/api-history': 'API History',\n      '/dashboard/reports': 'Report Generation'`);

// Update sidebar nav
const sidebarRegex = /<!-- ADMINISTRATION -->/;
const reportNav = `
        <li class="nav-item">
          <a href="/dashboard/reports" class="nav-link {currentPath === '/dashboard/reports' ? 'active' : ''}">
            <i class="ti ti-file-report"></i> <span class="nav-text">Reports</span>
          </a>
        </li>
        <!-- ADMINISTRATION -->`;

content = content.replace(sidebarRegex, reportNav);

fs.writeFileSync(file, content);
console.log('Updated +layout.svelte with Reports nav');
