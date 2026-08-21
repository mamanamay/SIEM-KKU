const fs = require('fs');
const path = require('path');

const titles = {
  '': 'Overview Dashboard', // /dashboard
  'soar': 'Alerts & SOAR',
  'hunting': 'Threat Hunting',
  'analytics': 'Attacker Analytics',
  'mitre': 'MITRE ATT&CK Matrix',
  'cve': 'CVE Database',
  'blocked_ip_audit': 'Blocked IP Audit',
  'settings': 'System Settings',
  'audit': 'System Audit Trail',
  'network-map': 'Network Map',
  'ai-briefing': 'AI Daily Briefing',
  'monitor': 'SOC Operations Center',
  'api-history': 'API History'
};

const baseDir = 'src/routes/dashboard';

for (const [dir, title] of Object.entries(titles)) {
  const file = path.join(baseDir, dir, '+page.svelte');
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const newTitle = `<title>${title} - KKUSIEM</title>`;
    
    // Replace existing <title>...</title> inside <svelte:head>
    if (content.match(/<title>.*?<\/title>/)) {
      content = content.replace(/<title>.*?<\/title>/, newTitle);
    } else if (content.includes('<svelte:head>')) {
      content = content.replace(/<svelte:head>/, `<svelte:head>\n  ${newTitle}`);
    } else {
      content = `<svelte:head>\n  ${newTitle}\n</svelte:head>\n\n` + content;
    }
    
    fs.writeFileSync(file, content);
    console.log(`Updated title for ${dir || 'dashboard'}`);
  } else {
    console.log(`File not found: ${file}`);
  }
}
