<script lang="ts">
  export let event: any; // The IncidentObject

  $: pathNodes = event?.attack_session?.attack_path || [];
</script>

{#if pathNodes.length > 0}
<div class="path-wrapper custom-scrollbar">
  <div class="path-container">
    {#each pathNodes as node, i}
      <div class="path-node" style="--idx:{i};">
        <div class="node-icon">
          {#if i === 0}
            <i class="ti ti-device-desktop"></i>
          {:else if i === pathNodes.length - 1 && node.startsWith('/')}
            <i class="ti ti-file-code"></i>
          {:else if node.toLowerCase().includes('firewall')}
            <i class="ti ti-wall"></i>
          {:else}
            <i class="ti ti-server"></i>
          {/if}
        </div>
        <div class="node-label">{node}</div>
      </div>
      
      {#if i < pathNodes.length - 1}
        <div class="path-edge">
          <i class="ti ti-arrow-right"></i>
        </div>
      {/if}
    {/each}
  </div>
</div>
{/if}

<style>
  .path-wrapper {
    overflow-x: auto;
    padding-bottom: 8px;
    width: 100%;
  }
  
  .path-container {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 10px 10px;
    box-sizing: border-box;
  }
  
  .custom-scrollbar::-webkit-scrollbar { height: 6px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  
  .path-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 100px;
    flex-shrink: 0;
    animation: fadeInNode 0.4s ease calc(var(--idx) * 100ms) both;
  }
  
  .node-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--bg-secondary);
    border: 2px solid #f59e0b;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    color: var(--text-primary);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
    transition: all 0.2s;
  }
  
  .path-node:hover .node-icon {
    transform: scale(1.1);
    box-shadow: 0 0 15px rgba(245, 158, 11, 0.4);
  }
  
  .node-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    max-width: 140px;
    text-align: center;
    word-break: break-word;
  }
  
  .path-edge {
    flex-grow: 1;
    display: flex;
    justify-content: center;
    color: var(--text-muted);
    font-size: 24px;
    margin-top: -20px; /* Align with icon center */
    opacity: 0.6;
  }

  @keyframes fadeInNode { from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none} }
</style>
