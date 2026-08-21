const fs = require('fs');
const file = 'src/routes/dashboard/+layout.svelte';
let content = fs.readFileSync(file, 'utf8');

// 1. Notification: critical + network map only
const notifRegex = /\$: if \(\$latestAttackStore\) \{[\s\S]*?localStorage\.setItem\('unreadCount', unreadCount\.toString\(\)\);\n    \}\n  \}/;
const notifReplace = `$: if ($latestAttackStore) {
    const attack = $latestAttackStore;
    if (!notificationsHistory.find(n => n.id === attack.id)) {
      const isCritical = attack.severity === 'critical';
      const isLocal = !attack.country || attack.country === 'Local Network';
      
      if (isCritical || isLocal) {
        notificationsHistory = [attack, ...notificationsHistory];
        unreadCount++;
        
        activeToast = attack;
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => { activeToast = null; }, 5000);
        
        localStorage.setItem('notifications', JSON.stringify(notificationsHistory.slice(0, 50)));
        localStorage.setItem('unreadCount', unreadCount.toString());
      }
    }
  }`;
content = content.replace(notifRegex, notifReplace);

// 2. getPageTitle update
const titleRegex = /function getPageTitle\(path: string\) \{[\s\S]*?return titles\[path\] \|\| 'Command Center';\n  \}/;
const titleReplace = `function getPageTitle(path: string) {
    const titles: Record<string, string> = {
      '/dashboard': 'Overview Dashboard',
      '/dashboard/soar': 'Alerts & SOAR',
      '/dashboard/hunting': 'Threat Hunting',
      '/dashboard/analytics': 'Attacker Analytics',
      '/dashboard/mitre': 'MITRE ATT&CK Matrix',
      '/dashboard/cve': 'CVE Database',
      '/dashboard/blocked_ip_audit': 'Blocked IP Audit',
      '/dashboard/settings': 'System Settings',
      '/dashboard/audit': 'System Audit Trail',
      '/dashboard/network-map': 'Network Map',
      '/dashboard/ai-briefing': 'AI Daily Briefing',
      '/dashboard/monitor': 'SOC Operations Center',
      '/dashboard/api-history': 'API History'
    };
    return titles[path] || 'Command Center';
  }`;
content = content.replace(titleRegex, titleReplace);

// 3. Rename sidebar nav
content = content.replace('Threat Monitor', 'SOC Operations Center');
content = content.replace('Network Map Management', 'Network Map');

fs.writeFileSync(file, content);
console.log('Updated +layout.svelte');
