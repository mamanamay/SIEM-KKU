<script lang="ts">
  export let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
  export let size: 'sm' | 'md' = 'md';

  const colorMap: Record<string, { color: string; bg: string }> = {
    critical: { color: '#dc2626', bg: 'rgba(220,38,38,0.1)' },
    high:     { color: '#ea580c', bg: 'rgba(234,88,12,0.1)' },
    medium:   { color: '#ca8a04', bg: 'rgba(202,138,4,0.1)' },
    low:      { color: '#16a34a', bg: 'rgba(22,163,74,0.1)' },
    info:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  };

  $: c = colorMap[severity] ?? colorMap['info'];
</script>

<span
  class="badge badge--{size}"
  style="color:{c.color}; background:{c.bg}; border-color:{c.color}33;"
>
  {severity}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    font-weight: 700;
    text-transform: uppercase;
    border-radius: 20px;
    border: 1px solid;
    letter-spacing: 0.04em;
    white-space: nowrap;
    line-height: 1;
  }
  .badge--sm {
    font-size: 10px;
    padding: 2px 6px;
  }
  .badge--md {
    font-size: 11px;
    padding: 3px 8px;
  }
</style>
