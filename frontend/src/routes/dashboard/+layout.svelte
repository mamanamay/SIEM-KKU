<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { initSocket, disconnectSocket, roleStore, connectionState, latestAttackStore } from '../../stores/events';
  
  let currentTime = '';
  let timeInterval: any;

  // Notifications State
  let notificationsHistory: any[] = [];
  let unreadCount = 0;
  let showNotifications = false;
  let activeToast: any = null;
  let toastTimeout: any;

  $: if ($latestAttackStore) {
    // Prevent duplicate triggers if store hasn't actually changed reference (Svelte reactivity quirk)
    const attack = $latestAttackStore;
    if (!notificationsHistory.find(n => n.id === attack.id)) {
      notificationsHistory = [attack, ...notificationsHistory];
      unreadCount++;
      
      activeToast = attack;
      if (toastTimeout) clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => { activeToast = null; }, 5000);
    }
  }

  function clearNotifications() {
    notificationsHistory = [];
    unreadCount = 0;
    showNotifications = false;
  }
  
  function toggleNotifications() {
    showNotifications = !showNotifications;
    if (showNotifications) unreadCount = 0;
  }

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
      <a href="/dashboard/analytics" class="nav-item {$page.url.pathname === '/dashboard/analytics' ? 'active' : ''}">
        <i class="ti ti-chart-pie"></i> Analyst Center
      </a>
      <a href="/dashboard/logs" class="nav-item {$page.url.pathname === '/dashboard/logs' ? 'active' : ''}">
        <i class="ti ti-list-search"></i> Security Logs
      </a>
      <a href="/dashboard/investigate" class="nav-item {$page.url.pathname === '/dashboard/investigate' ? 'active' : ''}">
        <i class="ti ti-zoom-in"></i> Threat Investigate
      </a>
      <a href="/dashboard/faculty" class="nav-item {$page.url.pathname === '/dashboard/faculty' ? 'active' : ''}">
        <i class="ti ti-building"></i> Faculty Monitor
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
      <a href="/dashboard/cve" class="nav-item {$page.url.pathname === '/dashboard/cve' ? 'active' : ''}">
        <i class="ti ti-database-search"></i> CVE Database
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
        <!-- Notification Bell -->
        <div class="notification-wrapper">
          <button class="btn-icon" on:click={toggleNotifications} title="Notifications">
            <i class="ti ti-bell"></i>
            {#if unreadCount > 0}
              <span class="badge-dot">{unreadCount}</span>
            {/if}
          </button>
          
          {#if showNotifications}
            <div class="notification-dropdown">
              <div class="dropdown-header">
                <span style="font-weight:600;font-size:12px;">Notifications</span>
                <button class="btn-clear" on:click={clearNotifications}>Clear All</button>
              </div>
              <div class="dropdown-list custom-scrollbar">
                {#each notificationsHistory as notif}
                  <a href="/dashboard/logs?ip={notif.ip}" class="dropdown-item" on:click={() => showNotifications = false}>
                    <div class="notif-icon {notif.severity === 'critical' ? 'b-red' : 'b-orange'}">
                      <i class="ti ti-alert-triangle"></i>
                    </div>
                    <div class="notif-content">
                      <div class="notif-title">{notif.type || 'Intrusion Detected'}</div>
                      <div class="notif-desc">From: {notif.ip} ({notif.country || 'Unknown'})</div>
                      <div class="notif-time">{notif.time || notif.timeStr}</div>
                    </div>
                  </a>
                {/each}
                {#if notificationsHistory.length === 0}
                  <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">No new notifications</div>
                {/if}
              </div>
            </div>
          {/if}
        </div>

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

    <!-- Global Toast Notification -->
    {#if activeToast}
      <a href="/dashboard/logs?ip={activeToast.ip}" class="toast-notification {activeToast.severity === 'critical' ? 'toast-critical' : 'toast-high'}">
        <div class="toast-icon">
          <i class="ti ti-alert-octagon"></i>
        </div>
        <div class="toast-content">
          <div class="toast-title">New Attack Detected!</div>
          <div class="toast-desc">{activeToast.type || 'Intrusion Attempt'} from <strong>{activeToast.ip}</strong></div>
        </div>
        <button class="toast-close" on:click|preventDefault={() => activeToast = null}><i class="ti ti-x"></i></button>
      </a>
    {/if}

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
.topbar-right { display: flex; align-items: center; gap: 15px; }
.btn-icon { background: none; border: none; font-size: 20px; color: var(--text-secondary); cursor: pointer; position: relative; padding: 4px; display: flex; align-items: center; justify-content: center; transition: 0.2s; border-radius: 6px; }
.btn-icon:hover { background: var(--bg-secondary); color: var(--text-primary); }
.badge-dot { position: absolute; top: 0; right: 0; background: var(--red); color: white; font-size: 9px; font-weight: bold; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid var(--bg-panel); }

/* Notification Dropdown */
.notification-wrapper { position: relative; }
.notification-dropdown { position: absolute; top: 110%; right: 0; width: 320px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-md); z-index: 1000; overflow: hidden; animation: slideDown 0.2s ease; }
.dropdown-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid var(--border); background: var(--bg-secondary); }
.btn-clear { background: none; border: none; color: var(--text-secondary); font-size: 11px; cursor: pointer; }
.btn-clear:hover { color: var(--text-primary); text-decoration: underline; }
.dropdown-list { max-height: 350px; overflow-y: auto; }
.dropdown-item { display: flex; gap: 12px; padding: 12px 15px; border-bottom: 1px solid var(--border); text-decoration: none; transition: 0.2s; }
.dropdown-item:hover { background: rgba(0,0,0,0.02); }
.notif-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.notif-content { display: flex; flex-direction: column; gap: 2px; }
.notif-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.notif-desc { font-size: 11px; color: var(--text-secondary); }
.notif-time { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

/* Toast Notification */
.toast-notification { position: fixed; bottom: 25px; right: 25px; background: var(--bg-panel); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); padding: 15px; display: flex; align-items: center; gap: 12px; z-index: 9999; animation: toastSlide 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); text-decoration: none; border-left: 4px solid var(--accent); min-width: 300px; }
.toast-critical { border-left-color: var(--red); }
.toast-high { border-left-color: var(--orange); }
.toast-icon { font-size: 24px; color: var(--text-primary); }
.toast-critical .toast-icon { color: var(--red); }
.toast-high .toast-icon { color: var(--orange); }
.toast-content { flex-grow: 1; }
.toast-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.toast-desc { font-size: 11px; color: var(--text-secondary); }
.toast-close { background: none; border: none; font-size: 14px; color: var(--text-muted); cursor: pointer; padding: 4px; }
.toast-close:hover { color: var(--text-primary); }

@keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes toastSlide { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }

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
