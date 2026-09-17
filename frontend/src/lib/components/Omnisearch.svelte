
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { goto } from "$app/navigation";
  
  export let isOpen = false;
  
  let searchQuery = "";
  let searchInput: HTMLInputElement;
  
  // Navigation commands
  const commands = [
    { label: "Go to Dashboard", path: "/dashboard", icon: "ti-layout-dashboard" },
    { label: "Go to SOAR (Kill-Chain)", path: "/dashboard/soar", icon: "ti-bolt" },
    { label: "Go to Network Map", path: "/dashboard/network-map", icon: "ti-sitemap" },
    { label: "Go to Archive Logs", path: "/dashboard/archive", icon: "ti-archive" },
    { label: "Go to Settings", path: "/dashboard/settings", icon: "ti-settings" }
  ];
  
  $: filteredCommands = searchQuery 
    ? commands.filter(c => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : commands;
    
  // IP Search regex
  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  $: isIpSearch = ipRegex.test(searchQuery.trim());
  
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      isOpen = !isOpen;
      if (isOpen) {
        setTimeout(() => searchInput?.focus(), 100);
      } else {
        searchQuery = "";
      }
    }
    if (e.key === "Escape" && isOpen) {
      isOpen = false;
      searchQuery = "";
    }
  }
  
  function executeCommand(cmd: any) {
    goto(cmd.path);
    isOpen = false;
    searchQuery = "";
  }
  
  function executeIpSearch() {
    if (isIpSearch) {
      // Pass IP via query param (assuming SOAR can read it, or just archive)
      goto(`/dashboard/archive?search=${searchQuery.trim()}`);
      isOpen = false;
      searchQuery = "";
    }
  }
  
  onMount(() => {
    window.addEventListener("keydown", handleKeydown);
  });
  
  onDestroy(() => {
    if (typeof window !== "undefined") if (typeof window !== "undefined") window.removeEventListener("keydown", handleKeydown);
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div class="omnisearch-overlay" on:click|self={() => { isOpen = false; searchQuery = ""; }}>
    <div class="omnisearch-modal">
      <div class="omnisearch-header">
        <i class="ti ti-search" style="font-size: 20px; color: var(--text-muted);"></i>
        <input 
          bind:this={searchInput}
          bind:value={searchQuery}
          type="text" 
          placeholder="Search IPs, actions, or type > for commands... (Ctrl+K)" 
          on:keydown={(e) => { if (e.key === "Enter") { if (isIpSearch) executeIpSearch(); else if (filteredCommands.length > 0) executeCommand(filteredCommands[0]); } }}
        />
        <div class="esc-hint">ESC</div>
      </div>
      
      <div class="omnisearch-results">
        {#if isIpSearch}
          <div class="result-section">INVESTIGATE IP</div>
          <button class="result-item" on:click={executeIpSearch}>
            <i class="ti ti-world-search"></i>
            <span>Search logs for <strong>{searchQuery.trim()}</strong></span>
          </button>
        {:else if searchQuery && filteredCommands.length === 0}
          <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
            No results found for "{searchQuery}"
          </div>
        {:else}
          <div class="result-section">QUICK ACTIONS</div>
          {#each filteredCommands as cmd}
            <button class="result-item" on:click={() => executeCommand(cmd)}>
              <i class="ti {cmd.icon}"></i>
              <span>{cmd.label}</span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .omnisearch-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10vh;
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  
  .omnisearch-modal {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 100%;
    max-width: 600px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes slideDown { from { transform: translateY(-20px) scale(0.95); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
  
  .omnisearch-header {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }
  .omnisearch-header input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 16px;
    font-family: inherit;
  }
  .omnisearch-header input::placeholder { color: var(--text-muted); }
  
  .esc-hint {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 600;
  }
  
  .omnisearch-results {
    max-height: 400px;
    overflow-y: auto;
    padding: 10px;
  }
  
  .result-section {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.05em;
    padding: 10px 10px 4px 10px;
  }
  
  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .result-item:hover, .result-item:focus {
    background: var(--bg-secondary);
    outline: none;
  }
  .result-item i {
    font-size: 18px;
    color: var(--text-muted);
  }
  .result-item:hover i {
    color: var(--blue);
  }
</style>


