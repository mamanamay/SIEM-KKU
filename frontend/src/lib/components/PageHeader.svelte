<script lang="ts">
  export let title = '';
  export let description = '';
  export let icon = 'ti-layout-dashboard';
</script>

<header class="page-header">
  <div class="header-left">
    <div class="header-icon-block">
      <i class="ti {icon}"></i>
    </div>
    <div class="header-text">
      <h1 class="header-title">{title}</h1>
      {#if description}
        <p class="header-desc">{description}</p>
      {/if}
    </div>
  </div>

  <div class="header-actions">
    <slot name="actions"></slot>
  </div>
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-icon-block {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--blue-bg);
    color: var(--blue);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    flex-shrink: 0;
  }

  

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.2;
  }

  .header-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }
</style>