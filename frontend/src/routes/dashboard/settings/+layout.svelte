<script lang="ts">
  import { page } from '$app/stores';
  import { roleStore } from '../../../stores/events';
  
  const menuItems = [
    { id: 'profile', label: 'My Profile', icon: 'ti-user', roles: ['admin', 'analyst', 'guest'] },
    { id: 'users', label: 'User Access Control', icon: 'ti-users', roles: ['admin'] },
    { id: 'config', label: 'System Config', icon: 'ti-settings', roles: ['admin'] },
    { id: 'integrations', label: 'Integrations', icon: 'ti-plug', roles: ['admin'] },
    { id: 'api-history', label: 'API History', icon: 'ti-history', roles: ['admin'] },
    { id: 'report-history', label: 'Report History', icon: 'ti-file-report', roles: ['admin', 'analyst'] },
    { id: 'audit-trail', label: 'Audit Trail', icon: 'ti-clipboard-list', roles: ['admin'] },
    { id: 'security', label: 'Security & 2FA', icon: 'ti-shield-lock', roles: ['admin', 'analyst', 'guest'] }
  ];

  $: allowedItems = menuItems.filter(item => item.roles.includes($roleStore));

  $: {
    // Route guard logic
    if ($roleStore) {
      const currentPath = $page.url.pathname;
      const currentMenu = menuItems.find(m => currentPath.includes(`/dashboard/settings/${m.id}`));
      if (currentMenu && !currentMenu.roles.includes($roleStore)) {
        // Unauthorized! Redirect to profile which everyone has
        if (typeof window !== 'undefined') {
          window.location.href = '/dashboard/settings/profile';
        }
      }
    }
  }
</script>

<div class="settings-layout">
  <div class="settings-sidebar">
    <div class="sidebar-header">
      <i class="ti ti-settings"></i>
      <h2>Settings</h2>
    </div>
    
    <nav class="settings-nav">
      {#each allowedItems as item}
        <a 
          href={`/dashboard/settings/${item.id}`} 
          class="nav-item" 
          class:active={$page.url.pathname.includes(`/dashboard/settings/${item.id}`)}
        >
          <i class={`ti ${item.icon}`}></i>
          {item.label}
        </a>
      {/each}
    </nav>
  </div>

  <div class="settings-content">
    <slot />
  </div>
</div>

<style>
  .settings-layout {
    display: flex;
    height: 100%;
    background: var(--bg-app);
  }

  .settings-sidebar {
    width: 260px;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sidebar-header {
    height: 70px;
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }

  .sidebar-header i {
    font-size: 24px;
    color: var(--blue);
  }

  .sidebar-header h2 {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
  }

  .settings-nav {
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .nav-item i {
    font-size: 18px;
  }

  .nav-item:hover {
    background: var(--bg-surface-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: rgba(59, 130, 246, 0.1);
    color: var(--blue);
  }

  .settings-content {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-app);
  }
</style>
