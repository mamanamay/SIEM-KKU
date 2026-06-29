<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { initSocket, disconnectSocket, roleStore, connectionState } from '../../stores/events';
  
  let currentTime = '';
  let timeInterval: any;

  onMount(() => {
    initSocket();
    updateTime();
    timeInterval = setInterval(updateTime, 1000);
  });

  onDestroy(() => {
    disconnectSocket();
    if (timeInterval) clearInterval(timeInterval);
  });

  function updateTime() {
    const now = new Date();
    currentTime = now.getFullYear() + '-' + 
      String(now.getMonth()+1).padStart(2, '0') + '-' + 
      String(now.getDate()).padStart(2, '0') + ' ' + 
      String(now.getHours()).padStart(2, '0') + ':' + 
      String(now.getMinutes()).padStart(2, '0') + ':' + 
      String(now.getSeconds()).padStart(2, '0');
  }

  function getPageTitle(path: string) {
    const titles: Record<string, string> = {
      '/dashboard': 'Overview Dashboard',
      '/dashboard/alert': 'Alerts & SOAR',
      '/dashboard/investigate': 'Threat Investigation',
      '/dashboard/traffic': 'Network Traffic',
      '/dashboard/mitre': 'MITRE ATT&CK Matrix',
      '/dashboard/blocked_ip_audit': 'Blocked IP Audit',
      '/dashboard/ioc': 'Indicators of Compromise (IOC)',
      '/dashboard/threat': 'Threat Intelligence',
      '/dashboard/wazuh': 'Endpoint Security (Wazuh)',
      '/dashboard/ai_monitor': 'AI Threat Monitor',
      '/dashboard/malware': 'Malware Analysis',
      '/dashboard/ddos': 'DDoS Protection',
      '/dashboard/cis': 'CIS Compliance Audit',
      '/dashboard/pdpa': 'PDPA Audit',
      '/dashboard/remoteaccess': 'Remote Access Log',
      '/dashboard/analytics': 'Attacker Analytics',
      '/dashboard/settings': 'System Settings'
    };
    return titles[path] || 'Command Center';
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '/';
  }
</script>

<svelte:head>
  <title>Honeypot Command Center</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
</svelte:head>

<div class="layout-wrapper">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <i class="ti ti-radar"></i>
      </div>
      <div class="sidebar-title">KKUSIEM<br><span style="color:var(--text-muted);font-weight:400;font-size:11px">(demo)</span></div>
    </div>
    <nav class="sidebar-nav custom-scrollbar" style="overflow-y: auto;">
      <div class="nav-group-title">OVERVIEW</div>
      <a href="/dashboard" class="nav-item {$page.url.pathname === '/dashboard' ? 'active' : ''}">
        <i class="ti ti-dashboard"></i> Dashboard
      </a>

      <div class="nav-group-title mt-2">DETECTION & ANALYSIS</div>
      <a href="/dashboard/alert" class="nav-item {$page.url.pathname === '/dashboard/alert' ? 'active' : ''}">
        <i class="ti ti-bell-ringing"></i> Alerts
      </a>
      <a href="/dashboard/logs" class="nav-item {$page.url.pathname === '/dashboard/logs' ? 'active' : ''}">
        <i class="ti ti-list-search"></i> Investigate Logs
      </a>
      <a href="/dashboard/faculty" class="nav-item {$page.url.pathname === '/dashboard/faculty' ? 'active' : ''}">
        <i class="ti ti-building"></i> Faculty Monitor
      </a>
      <a href="/dashboard/traffic" class="nav-item {$page.url.pathname === '/dashboard/traffic' ? 'active' : ''}">
        <i class="ti ti-activity"></i> Network Traffic
      </a>
      <a href="/dashboard/mitre" class="nav-item {$page.url.pathname === '/dashboard/mitre' ? 'active' : ''}">
        <i class="ti ti-grid-dots"></i> MITRE ATT&CK
      </a>

      <div class="nav-group-title mt-2">RESPONSE & INTEL</div>
      <a href="/dashboard/blocked_ip_audit" class="nav-item {$page.url.pathname === '/dashboard/blocked_ip_audit' ? 'active' : ''}">
        <i class="ti ti-shield-x"></i> Blocked IP Audit
      </a>
      <a href="/dashboard/ioc" class="nav-item {$page.url.pathname === '/dashboard/ioc' ? 'active' : ''}">
        <i class="ti ti-target"></i> Indicators (IOC)
      </a>
      <a href="/dashboard/threat" class="nav-item {$page.url.pathname === '/dashboard/threat' ? 'active' : ''}">
        <i class="ti ti-virus"></i> Threat Intel
      </a>

      <div class="nav-group-title mt-2">INTEGRATION & COMPLIANCE</div>
      <a href="/dashboard/wazuh" class="nav-item {$page.url.pathname === '/dashboard/wazuh' ? 'active' : ''}">
        <i class="ti ti-shield-check"></i> Endpoint (Wazuh)
      </a>
      <a href="/dashboard/ai_monitor" class="nav-item {$page.url.pathname === '/dashboard/ai_monitor' ? 'active' : ''}">
        <i class="ti ti-brain"></i> AI Monitor
      </a>
      <a href="/dashboard/malware" class="nav-item {$page.url.pathname === '/dashboard/malware' ? 'active' : ''}">
        <i class="ti ti-bug"></i> Malware Analysis
      </a>
      <a href="/dashboard/ddos" class="nav-item {$page.url.pathname === '/dashboard/ddos' ? 'active' : ''}">
        <i class="ti ti-shield-half"></i> DDoS Protection
      </a>
      <a href="/dashboard/cis" class="nav-item {$page.url.pathname === '/dashboard/cis' ? 'active' : ''}">
        <i class="ti ti-clipboard-list"></i> CIS Audit
      </a>
      <a href="/dashboard/pdpa" class="nav-item {$page.url.pathname === '/dashboard/pdpa' ? 'active' : ''}">
        <i class="ti ti-file-check"></i> PDPA Audit
      </a>
      <a href="/dashboard/remoteaccess" class="nav-item {$page.url.pathname === '/dashboard/remoteaccess' ? 'active' : ''}">
        <i class="ti ti-devices-pc"></i> Remote Access
      </a>

      <div class="nav-group-title mt-2">SYSTEM</div>
      <a href="/dashboard/analytics" class="nav-item {$page.url.pathname === '/dashboard/analytics' ? 'active' : ''}">
        <i class="ti ti-chart-pie"></i> Analytics
      </a>
      <a href="/dashboard/settings" class="nav-item {$page.url.pathname === '/dashboard/settings' ? 'active' : ''}">
        <i class="ti ti-settings"></i> Settings
      </a>
    </nav>
    <div class="sidebar-footer">
      <div class="status-indicator">
        <span class="status-dot {$connectionState ? 'online' : 'offline'}"></span>
        {$connectionState ? 'Connected' : 'Disconnected'}
      </div>
    </div>
  </aside>

  <!-- Main Content Area -->
  <main class="main-content">
    <!-- Topbar -->
    <header class="topbar">
      <div class="topbar-left">
        <h1 class="page-title">
          {getPageTitle($page.url.pathname)}
        </h1>
      </div>
      <div class="topbar-right">
        <div class="role-badge">Role: <strong>{$roleStore}</strong></div>
        <div class="ts-block">
          <div style="color:var(--text-muted);font-size:11px">Server Time</div>
          <div class="ts-val">{currentTime}</div>
        </div>
        <button on:click={logout} class="btn-logout" title="Logout">
          <i class="ti ti-logout"></i>
        </button>
      </div>
    </header>

    <!-- Page Content Slot -->
    <div class="page-container custom-scrollbar">
      <slot />
    </div>
  </main>
</div>

<style>
/* Base Global Styles based closely on HTML mockup but adapted for Layout */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:global(:root) {
  --bg: #f5f6f7;
  --bg-panel: #ffffff;
  --bg-secondary: #f0f1f3;
  --border: rgba(0,0,0,0.08);
  --text-primary: #1a1d23;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;
  --radius-sm: 8px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --green: #1d9e75;
  --green-bg: #eaf6f1;
  --red: #a32d2d;
  --red-bg: #fcebeb;
  --orange: #854f0b;
  --orange-bg: #faeeda;
  --blue: #185fa5;
  --blue-bg: #e6f1fb;
}

@media (prefers-color-scheme: dark) {
  :global(:root) {
    --bg: #0f1117;
    --bg-panel: #181b24;
    --bg-secondary: #1f2330;
    --border: rgba(255,255,255,0.08);
    --text-primary: #e8eaf0;
    --text-secondary: #8b95a8;
    --text-muted: #5a6478;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --green-bg: rgba(29,158,117,0.15);
    --red-bg: rgba(163,45,45,0.15);
    --orange-bg: rgba(133,79,11,0.15);
    --blue-bg: rgba(24,95,165,0.15);
  }
}

:global(body) {
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  overflow: hidden; /* Prevent body scroll, handled by page-container */
}

/* Layout Structure */
.layout-wrapper { display: flex; height: 100vh; width: 100vw; }

/* Sidebar */
.sidebar {
  width: 240px; background: var(--bg-panel); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; z-index: 10;
}
.sidebar-header {
  height: 70px; display: flex; align-items: center; gap: 12px;
  padding: 0 20px; border-bottom: 1px solid var(--border);
}
.sidebar-logo {
  width: 36px; height: 36px; background: var(--green-bg); color: var(--green);
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  font-size: 20px;
}
.sidebar-title { font-weight: 700; font-size: 14px; line-height: 1.2; }
.sidebar-nav { padding: 20px 12px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
.nav-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-radius: var(--radius-sm); font-size: 13px; font-weight: 500;
  color: var(--text-secondary); text-decoration: none; transition: all 0.2s;
}
.nav-item i { font-size: 18px; }
.nav-item:hover { background: var(--bg-secondary); color: var(--text-primary); }
.nav-item.active { background: var(--green-bg); color: var(--green); }
.nav-group-title { font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; padding: 10px 14px 4px; letter-spacing: 0.5px; }
.mt-2 { margin-top: 8px; }
.sidebar-footer { padding: 20px; border-top: 1px solid var(--border); font-size: 12px; color: var(--text-muted); }
.status-indicator { display: flex; align-items: center; gap: 6px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-muted); }
.status-dot.online { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

/* Main Content */
.main-content { flex: 1; display: flex; flex-direction: column; min-width: 0; }

/* Topbar */
.topbar {
  height: 70px; background: var(--bg); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; padding: 0 24px;
  flex-shrink: 0;
}
.page-title { font-size: 18px; font-weight: 600; color: var(--text-primary); }
.topbar-right { display: flex; align-items: center; gap: 16px; }
.role-badge { background: var(--bg-secondary); padding: 4px 10px; border-radius: 20px; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); }
.role-badge strong { color: var(--green); }
.ts-block { text-align: right; }
.ts-val { font-family: 'Courier New', monospace; font-size: 13px; font-weight: 500; }
.btn-logout {
  width: 36px; height: 36px; border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: var(--bg-panel); color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center; font-size: 18px; transition: all 0.2s;
}
.btn-logout:hover { background: var(--red-bg); color: var(--red); border-color: transparent; }

/* Page Container */
.page-container { flex: 1; overflow-y: auto; padding: 24px; }

/* Shared Scrollbar */
:global(.custom-scrollbar::-webkit-scrollbar) { width: 6px; height: 6px; }
:global(.custom-scrollbar::-webkit-scrollbar-track) { background: transparent; }
:global(.custom-scrollbar::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 10px; }
:global(.custom-scrollbar::-webkit-scrollbar-thumb:hover) { background: var(--text-muted); }
</style>
