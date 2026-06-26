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
      <div class="sidebar-title">Cowrie<br><span style="color:var(--text-muted);font-weight:400;font-size:11px">Honeypot System</span></div>
    </div>
    <nav class="sidebar-nav">
      <a href="/dashboard" class="nav-item {$page.url.pathname === '/dashboard' ? 'active' : ''}">
        <i class="ti ti-dashboard"></i> Overview
      </a>
      <a href="/dashboard/logs" class="nav-item {$page.url.pathname === '/dashboard/logs' ? 'active' : ''}">
        <i class="ti ti-list-search"></i> Threat Logs
      </a>
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
          {#if $page.url.pathname === '/dashboard'}
            Overview Dashboard
          {:else if $page.url.pathname === '/dashboard/logs'}
            Detailed Threat Logs
          {:else if $page.url.pathname === '/dashboard/analytics'}
            Attacker Analytics
          {:else if $page.url.pathname === '/dashboard/settings'}
            System Settings
          {/if}
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
