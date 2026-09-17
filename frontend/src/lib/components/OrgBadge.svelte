<script lang="ts">
  export let organization: string = '';
  export let country: string = '';
  export let full: boolean = false;

  function getDisplayOrg(org: string, isFull: boolean) {
    if (!org || typeof org !== 'string' || org === 'Unknown') return 'Unknown';
    if (isFull) return org;
    
    if (org.includes('—')) {
      return org.split('—')[0].trim();
    } else if (org.includes('-')) {
      return org.split('-')[0].trim();
    }
    return org;
  }

  $: displayOrg = getDisplayOrg(organization, full);
</script>

{#if displayOrg !== 'Unknown' && organization}
  <span class="org-badge internal">
    <i class="ti ti-building"></i> {displayOrg}
  </span>
{:else if country && country !== 'Unknown'}
  <span class="org-badge external">
    <i class="ti ti-world"></i> {country}
  </span>
{:else}
  <span class="org-badge unknown">
    <i class="ti ti-help"></i> Unknown
  </span>
{/if}

<style>
  .org-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    line-height: 1.2;
    border: 1px solid transparent;
  }
  
  .org-badge i {
    font-size: 12px;
  }
  
  .internal {
    background: rgba(14, 165, 233, 0.1);
    color: #0284c7;
    border-color: rgba(14, 165, 233, 0.2);
  }
  
  :global([data-theme="dark"]) .internal {
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border-color: rgba(14, 165, 233, 0.3);
  }
  
  .external {
    background: rgba(107, 114, 128, 0.1);
    color: #4b5563;
    border-color: rgba(107, 114, 128, 0.2);
  }
  
  :global([data-theme="dark"]) .external {
    background: rgba(156, 163, 175, 0.1);
    color: #9ca3af;
    border-color: rgba(156, 163, 175, 0.2);
  }
  
  .unknown {
    background: rgba(226, 232, 240, 0.5);
    color: #64748b;
    border-color: rgba(203, 213, 225, 0.5);
  }
  
  :global([data-theme="dark"]) .unknown {
    background: rgba(51, 65, 85, 0.5);
    color: #94a3b8;
    border-color: rgba(71, 85, 105, 0.5);
  }
</style>