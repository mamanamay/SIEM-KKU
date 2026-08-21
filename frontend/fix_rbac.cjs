const fs = require('fs');
const file = 'src/routes/dashboard/settings/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

const newPermissionsHtml = `
                      <td>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={true} disabled={u.role === 'admin'} /> View Logs & Dashboards
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={true} disabled={u.role === 'admin'} /> Threat Hunting & Query
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} /> Execute SOAR Actions
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} /> Manage Network Map
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} disabled={u.role === 'admin'} /> Edit System Configs
                          </label>
                          <label style="font-size:11px; display:flex; align-items:center; gap:6px;">
                            <input type="checkbox" checked={u.role === 'admin'} disabled={u.role === 'admin'} /> Manage Users & Roles
                          </label>
                        </div>
                      </td>`;

// Let's replace the existing td
content = content.replace(/<td>\s*<div style="display:flex; flex-direction:column; gap:6px;">\s*<label[\s\S]*?<\/div>\s*<\/td>/, newPermissionsHtml);

fs.writeFileSync(file, content);
console.log('Fixed permissions');
