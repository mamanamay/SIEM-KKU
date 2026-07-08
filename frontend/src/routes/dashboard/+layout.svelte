<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { initSocket, disconnectSocket, roleStore, connectionState, latestAttackStore } from '../../stores/events';
  
  let currentTime = '';
  let timeInterval: any;
  let idleTimeout: any;

  function resetIdleTime() {
    localStorage.setItem('lastActive', Date.now().toString());
  }

  function checkIdleTime() {
    const lastActive = parseInt(localStorage.getItem('lastActive') || Date.now().toString());
    const now = Date.now();
    const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1 hour in ms

    if (now - lastActive > IDLE_LIMIT_MS) {
      alert('เซสชันหมดอายุเนื่องจากไม่มีการใช้งานเกิน 1 ชั่วโมง กรุณาเข้าสู่ระบบใหม่');
      logout();
    }
  }

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
      
      localStorage.setItem('notifications', JSON.stringify(notificationsHistory.slice(0, 50)));
      localStorage.setItem('unreadCount', unreadCount.toString());
    }
  }

  function clearNotifications() {
    notificationsHistory = [];
    unreadCount = 0;
    showNotifications = false;
    localStorage.removeItem('notifications');
    localStorage.removeItem('unreadCount');
  }
  
  function toggleNotifications() {
    showNotifications = !showNotifications;
    if (showNotifications) {
      unreadCount = 0;
      localStorage.setItem('unreadCount', '0');
    }
  }

  onMount(() => {
    // Restore persistent notifications
    const savedNotifs = localStorage.getItem('notifications');
    const savedUnread = localStorage.getItem('unreadCount');
    if (savedNotifs) {
      try { notificationsHistory = JSON.parse(savedNotifs); } catch (e) {}
    }
    if (savedUnread) {
      unreadCount = parseInt(savedUnread) || 0;
    }

    initSocket();
    updateTime();
    timeInterval = setInterval(updateTime, 1000);

    // Auto logout tracking
    resetIdleTime();
    window.addEventListener('mousemove', resetIdleTime);
    window.addEventListener('keydown', resetIdleTime);
    window.addEventListener('click', resetIdleTime);
    window.addEventListener('scroll', resetIdleTime);
    idleTimeout = setInterval(checkIdleTime, 60000); // Check every minute
  });

  onDestroy(() => {
    disconnectSocket();
    if (timeInterval) clearInterval(timeInterval);
    if (idleTimeout) clearInterval(idleTimeout);
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', resetIdleTime);
      window.removeEventListener('keydown', resetIdleTime);
      window.removeEventListener('click', resetIdleTime);
      window.removeEventListener('scroll', resetIdleTime);
    }
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
      '/dashboard/analytics': 'Attacker Analytics',
      '/dashboard/mitre': 'MITRE ATT&CK Matrix',
      '/dashboard/cve': 'CVE Database',
      '/dashboard/blocked_ip_audit': 'Blocked IP Audit',
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
</svelte:head>

<div class="layout-wrapper">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <i class="ti ti-radar"></i>
      </div>
      <div class="sidebar-title">KKUSIEM</div>
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
      <a href="/dashboard/alert" class="nav-item {$page.url.pathname === '/dashboard/alert' ? 'active' : ''}">
        <i class="ti ti-alert-triangle"></i> Alerts & SOAR
      </a>
      <a href="/dashboard/investigate" class="nav-item {$page.url.pathname === '/dashboard/investigate' ? 'active' : ''}">
        <i class="ti ti-zoom-in"></i> Threat Investigate
      </a>
      <a href="/dashboard/mitre" class="nav-item {$page.url.pathname === '/dashboard/mitre' ? 'active' : ''}">
        <i class="ti ti-grid-dots"></i> MITRE ATT&CK
      </a>

      <div class="nav-group-title mt-2">RESPONSE & INTEL</div>
      <a href="/dashboard/faculty" class="nav-item {$page.url.pathname === '/dashboard/faculty' ? 'active' : ''}">
        <i class="ti ti-building"></i> Faculty IP Mapping
      </a>
      <a href="/dashboard/blocked_ip_audit" class="nav-item {$page.url.pathname === '/dashboard/blocked_ip_audit' ? 'active' : ''}">
        <i class="ti ti-shield-x"></i> Blocked IP Audit
      </a>
      <a href="/dashboard/cve" class="nav-item {$page.url.pathname === '/dashboard/cve' ? 'active' : ''}">
        <i class="ti ti-database-search"></i> CVE Database
      </a>

      {#if $roleStore === 'admin'}
      <div class="nav-group-title mt-2">ADMINISTRATION</div>
      <a href="/dashboard/settings" class="nav-item {$page.url.pathname === '/dashboard/settings' ? 'active' : ''}">
        <i class="ti ti-settings"></i> System Settings
      </a>
      <a href="/dashboard/users" class="nav-item {$page.url.pathname === '/dashboard/users' ? 'active' : ''}">
        <i class="ti ti-users"></i> User Management
      </a>
      {/if}
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
                  <a href="/dashboard/investigate?ip={notif.ip}&time={notif.timeStr}" class="dropdown-item {notif.is_blocked_repeat ? 'dropdown-repeat' : ''}" on:click={() => showNotifications = false}>
                    <div class="notif-icon {notif.is_blocked_repeat ? 'b-red' : (notif.severity === 'critical' ? 'b-red' : 'b-orange')}">
                      {#if notif.is_blocked_repeat}
                        <i class="ti ti-shield-x"></i>
                      {:else}
                        <i class="ti ti-alert-triangle"></i>
                      {/if}
                    </div>
                    <div class="notif-content">
                      <div class="notif-title" style={notif.is_blocked_repeat ? 'color: var(--red); font-weight: 700;' : ''}>
                        {notif.is_blocked_repeat ? '🚨 Blocked IP Breach Attempt' : (notif.type || 'Intrusion Detected')}
                      </div>
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
      <a href="/dashboard/investigate?ip={activeToast.ip}&time={activeToast.timeStr}" class="toast-notification {activeToast.is_blocked_repeat ? 'toast-repeat' : (activeToast.severity === 'critical' ? 'toast-critical' : 'toast-high')}">
        <div class="toast-icon">
          {#if activeToast.is_blocked_repeat}
            <i class="ti ti-shield-x" style="color: #ef4444;"></i>
          {:else}
            <i class="ti ti-alert-octagon"></i>
          {/if}
        </div>
        <div class="toast-content">
          <div class="toast-title">
            {#if activeToast.is_blocked_repeat}
              🚨 BLOCKED IP BREACH ATTEMPT!
            {:else}
              New Attack Detected!
            {/if}
          </div>
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
  --accent: #1d9e75;
  --accent-bg: #eaf6f1;
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
    --accent-bg: rgba(29,158,117,0.15);
  }
}

:global(html) {
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

:global(body) {
  font-family: 'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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
.page-title { font-size: 16px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
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
.dropdown-item { display: flex; gap: 10px; padding: 12px 15px; border-bottom: 1px solid var(--border); cursor: pointer; text-decoration: none; color: inherit; transition: background 0.15s; }
.dropdown-item:hover { background: var(--bg-hover); }
.dropdown-repeat { background: rgba(239,68,68,0.05); }
.dropdown-repeat:hover { background: rgba(239,68,68,0.1); }
.notif-icon { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.notif-content { display: flex; flex-grow: 1; flex-direction: column; gap: 2px; }
.notif-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.notif-desc { font-size: 11px; color: var(--text-secondary); }
.notif-time { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

/* Toast Notification */
.toast-notification { position: fixed; bottom: 25px; right: 25px; background: var(--bg-panel); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); padding: 15px; display: flex; align-items: center; gap: 12px; z-index: 9999; animation: toastSlide 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); text-decoration: none; border-left: 4px solid var(--accent); min-width: 300px; }
.toast-critical { border-left-color: var(--red); }
.toast-high { border-left-color: var(--orange); }
.toast-repeat { border-left-color: var(--red); background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-left: 4px solid var(--red); }
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

/* ═══════════════════════════════════════════════════════════════════════════════
   GLOBAL DESIGN SYSTEM — Used across ALL dashboard pages
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ─── Page Layout ────────────────────────────────────────────────────────────── */
:global(.ds-page) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 2rem;
}
:global(.ds-page-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
:global(.ds-page-title) {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
:global(.ds-page-title i) { font-size: 18px; color: var(--green); }
:global(.ds-page-subtitle) {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ─── Cards / Panels ─────────────────────────────────────────────────────────── */
:global(.ds-card) {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  box-shadow: var(--shadow-sm);
}
:global(.ds-card-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
:global(.ds-card-title) {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
:global(.ds-card-title i) { font-size: 16px; color: var(--green); }

/* ─── Stat / KPI Cards ───────────────────────────────────────────────────────── */
:global(.ds-kpi-row) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
:global(.ds-kpi) {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.18s;
}
:global(.ds-kpi:hover) { transform: translateY(-2px); }
:global(.ds-kpi-icon) {
  width: 44px; height: 44px;
  border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}
:global(.ds-kpi-icon.green)  { background: rgba(29,158,117,0.12); color: #1d9e75; }
:global(.ds-kpi-icon.blue)   { background: rgba(24,95,165,0.12);  color: #185fa5; }
:global(.ds-kpi-icon.red)    { background: rgba(163,45,45,0.12);  color: #a32d2d; }
:global(.ds-kpi-icon.orange) { background: rgba(133,79,11,0.12);  color: #854f0b; }
:global(.ds-kpi-icon.purple) { background: rgba(139,92,246,0.12); color: #8b5cf6; }
:global(.ds-kpi-val) { font-size: 24px; font-weight: 800; color: var(--text-primary); line-height: 1.1; }
:global(.ds-kpi-lbl) { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 3px; }
:global(.ds-kpi.border-green) { border-left: 3px solid #1d9e75; }
:global(.ds-kpi.border-blue)  { border-left: 3px solid #185fa5; }
:global(.ds-kpi.border-red)   { border-left: 3px solid #a32d2d; }
:global(.ds-kpi.border-orange){ border-left: 3px solid #854f0b; }
:global(.ds-kpi.border-purple){ border-left: 3px solid #8b5cf6; }

/* ─── Badges ─────────────────────────────────────────────────────────────────── */
:global(.ds-badge) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 99px;
  border: 1px solid;
  white-space: nowrap;
}
:global(.ds-badge.green)  { background: var(--green-bg);  color: var(--green);  border-color: var(--green); }
:global(.ds-badge.red)    { background: var(--red-bg);    color: var(--red);    border-color: var(--red); }
:global(.ds-badge.orange) { background: var(--orange-bg); color: var(--orange); border-color: var(--orange); }
:global(.ds-badge.blue)   { background: var(--blue-bg);   color: var(--blue);   border-color: var(--blue); }
:global(.ds-badge.gray)   { background: var(--bg-secondary); color: var(--text-secondary); border-color: var(--border); }
:global(.ds-badge.purple) { background: rgba(139,92,246,0.1); color: #8b5cf6; border-color: rgba(139,92,246,0.3); }

/* Severity badges */
:global(.sev-critical) { background: var(--red-bg);    color: var(--red);    border: 1px solid var(--red);    border-radius: 6px; font-size: 10px; font-weight: 700; padding: 2px 7px; text-transform: uppercase; }
:global(.sev-high)     { background: var(--orange-bg); color: var(--orange); border: 1px solid var(--orange); border-radius: 6px; font-size: 10px; font-weight: 700; padding: 2px 7px; text-transform: uppercase; }
:global(.sev-medium)   { background: var(--blue-bg);   color: var(--blue);   border: 1px solid var(--blue);   border-radius: 6px; font-size: 10px; font-weight: 700; padding: 2px 7px; text-transform: uppercase; }
:global(.sev-low)      { background: var(--green-bg);  color: var(--green);  border: 1px solid var(--green);  border-radius: 6px; font-size: 10px; font-weight: 700; padding: 2px 7px; text-transform: uppercase; }

/* ─── Buttons ────────────────────────────────────────────────────────────────── */
:global(.ds-btn) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.18s;
  text-decoration: none;
  background: var(--bg-panel);
  color: var(--text-primary);
}
:global(.ds-btn:hover) { background: var(--bg-secondary); }
:global(.ds-btn.primary) { background: var(--green); color: #fff; border-color: var(--green); }
:global(.ds-btn.primary:hover) { filter: brightness(1.1); }
:global(.ds-btn.danger)  { background: var(--red-bg);  color: var(--red);  border-color: var(--red); }
:global(.ds-btn.danger:hover)  { background: var(--red); color: #fff; }
:global(.ds-btn.sm) { padding: 5px 11px; font-size: 11px; border-radius: 6px; }
:global(.ds-btn i) { font-size: 14px; }
:global(.ds-btn[disabled]) { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

/* ─── Data Table ─────────────────────────────────────────────────────────────── */
:global(.ds-table-wrap) {
  width: 100%;
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid var(--border);
}
:global(.ds-table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
:global(.ds-table thead tr) {
  background: var(--bg-secondary);
  border-bottom: 2px solid var(--border);
}
:global(.ds-table th) {
  padding: 11px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  white-space: nowrap;
}
:global(.ds-table td) {
  padding: 12px 14px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
  font-size: 13px;
}
:global(.ds-table tbody tr:last-child td) { border-bottom: none; }
:global(.ds-table tbody tr:hover td) { background: rgba(0,0,0,0.015); }

/* ─── Filter / Search Bar ────────────────────────────────────────────────────── */
:global(.ds-filters) {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
:global(.ds-search) {
  position: relative;
  flex: 1;
  min-width: 180px;
  max-width: 340px;
}
:global(.ds-search i) {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 15px;
  pointer-events: none;
}
:global(.ds-search input) {
  width: 100%;
  padding: 8px 12px 8px 34px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.18s;
}
:global(.ds-search input:focus) { border-color: var(--green); }
:global(.ds-select) {
  padding: 8px 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
}

/* ─── Pagination ─────────────────────────────────────────────────────────────── */
:global(.ds-pagination) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  background: var(--bg-secondary);
  border-radius: 0 0 12px 12px;
}
:global(.ds-pagination-info) {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
:global(.ds-pagination-btns) { display: flex; align-items: center; gap: 6px; }
:global(.ds-page-btn) {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 12px;
  font-size: 12px; font-weight: 600;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-primary);
  transition: all 0.15s;
}
:global(.ds-page-btn:hover:not([disabled])) { border-color: var(--green); color: var(--green); }
:global(.ds-page-btn[disabled]) { opacity: 0.4; cursor: not-allowed; }
:global(.ds-page-info) { font-size: 12px; font-weight: 700; color: var(--text-secondary); padding: 0 8px; }

/* ─── Empty State ────────────────────────────────────────────────────────────── */
:global(.ds-empty) {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 3rem 1rem;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}
:global(.ds-empty i) { font-size: 36px; opacity: 0.3; }

/* ─── Tabs ───────────────────────────────────────────────────────────────────── */
:global(.ds-tabs) {
  display: flex;
  gap: 4px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 5px;
  overflow-x: auto;
}
:global(.ds-tab) {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.18s;
  white-space: nowrap;
}
:global(.ds-tab i) { font-size: 14px; }
:global(.ds-tab:hover) { background: var(--bg-secondary); color: var(--text-primary); }
:global(.ds-tab.active) { background: var(--green); color: #fff; box-shadow: 0 2px 8px rgba(29,158,117,0.25); }

/* ─── Monospace / Code ───────────────────────────────────────────────────────── */
:global(.ds-mono) { font-family: 'Courier New', Courier, monospace; font-size: 12.5px; }
:global(.ds-code) {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  word-break: break-all;
}

/* ─── Separator ──────────────────────────────────────────────────────────────── */
:global(.ds-divider) { border: none; border-top: 1px solid var(--border); margin: 16px 0; }

/* ─── Accent borders for rows/cards ─────────────────────────────────────────── */
:global(.ds-accent-green) { border-left: 3px solid var(--green)  !important; }
:global(.ds-accent-red)   { border-left: 3px solid var(--red)    !important; }
:global(.ds-accent-orange){ border-left: 3px solid var(--orange) !important; }
:global(.ds-accent-blue)  { border-left: 3px solid var(--blue)   !important; }
</style>

