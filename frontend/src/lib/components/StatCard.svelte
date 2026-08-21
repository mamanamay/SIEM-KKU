<script lang="ts">
  export let title = '';
  export let value: string | number = 0;
  export let icon = 'ti-chart-bar';
  export let trend: number | null = null;
  export let trendUp = true;
  export let color = '#1d9e75';
  export let subtitle = '';
  export let href = '';

  $: iconBg = color + '1a'; // ~0.1 opacity appended as hex
  $: trendColor = trendUp ? '#16a34a' : '#dc2626';
  $: trendBg   = trendUp ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)';
  $: trendIcon  = trendUp ? 'ti-trending-up' : 'ti-trending-down';
  $: trendPrefix = trendUp ? '+' : '';
</script>

{#if href}
  <a class="stat-card stat-card--link" {href}>
    <div class="card-top">
      <span class="card-icon" style="background:{iconBg};">
        <i class="ti {icon}" style="color:{color};"></i>
      </span>
      <span class="card-title">{title}</span>
    </div>
    <div class="card-value">{value}</div>
    <div class="card-bottom">
      {#if trend !== null}
        <span class="trend-badge" style="color:{trendColor}; background:{trendBg};">
          <i class="ti {trendIcon}"></i>
          {trendPrefix}{trend}%
        </span>
      {/if}
      {#if subtitle}
        <span class="card-subtitle">{subtitle}</span>
      {/if}
    </div>
  </a>
{:else}
  <div class="stat-card">
    <div class="card-top">
      <span class="card-icon" style="background:{iconBg};">
        <i class="ti {icon}" style="color:{color};"></i>
      </span>
      <span class="card-title">{title}</span>
    </div>
    <div class="card-value">{value}</div>
    <div class="card-bottom">
      {#if trend !== null}
        <span class="trend-badge" style="color:{trendColor}; background:{trendBg};">
          <i class="ti {trendIcon}"></i>
          {trendPrefix}{trend}%
        </span>
      {/if}
      {#if subtitle}
        <span class="card-subtitle">{subtitle}</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .stat-card {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border, #e5e9f0);
    border-radius: 12px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }

  .stat-card--link {
    text-decoration: none;
    cursor: pointer;
    color: inherit;
  }

  .stat-card--link:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .card-icon i {
    font-size: 18px;
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #64748b);
  }

  .card-value {
    font-size: 30px;
    font-weight: 900;
    color: var(--text-primary, #0f1117);
    line-height: 1;
  }

  .card-bottom {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .trend-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 20px;
  }

  .trend-badge i {
    font-size: 12px;
  }

  .card-subtitle {
    font-size: 12px;
    color: var(--text-muted, #64748b);
  }
</style>
