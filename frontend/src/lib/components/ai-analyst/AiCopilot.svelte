<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  
  export let messages: { role: string, content: string }[] = [];
  export let isTyping = false;
  
  let inputValue = '';
  let chatContainer: HTMLElement;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  
  function sendMessage() {
    if (!inputValue.trim()) return;
    dispatch('send', inputValue.trim());
    inputValue = '';
  }
  
  afterUpdate(() => {
    if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
  });
</script>

<div class="copilot-card">
  <div class="copilot-header">
    <div class="cp-title"><i class="ti ti-robot"></i> KKU AI Copilot</div>
    <div class="cp-subtitle">Context-Aware Assistant</div>
  </div>
  
  <div class="chat-area" bind:this={chatContainer}>
    {#if messages.length === 0}
      <div class="empty-chat">
        <i class="ti ti-messages"></i>
        <div>Ask AI to analyze specific IPs, summarize attacks, or investigate patterns.</div>
        <div class="suggestions">
          <button on:click={() => { inputValue = 'วิเคราะห์ SQL Injection วันนี้'; sendMessage(); }}>วิเคราะห์ SQL Injection วันนี้</button>
          <button on:click={() => { inputValue = 'เหตุการณ์ใดควรตรวจสอบก่อน'; sendMessage(); }}>เหตุการณ์ใดควรตรวจสอบก่อน</button>
        </div>
      </div>
    {:else}
      {#each messages as msg}
        <div class="msg {msg.role}">
          <div class="msg-bubble">{@html msg.content.replace(/\n/g, '<br/>')}</div>
        </div>
      {/each}
      {#if isTyping}
        <div class="msg ai">
          <div class="msg-bubble typing"><i class="ti ti-dots"></i> Thinking...</div>
        </div>
      {/if}
    {/if}
  </div>
  
  <div class="chat-input">
    <input type="text" placeholder="Ask AI Analyst..." bind:value={inputValue} on:keydown={e => e.key === 'Enter' && sendMessage()} />
    <button on:click={sendMessage} disabled={!inputValue.trim()}><i class="ti ti-send"></i></button>
  </div>
</div>

<style>
  .copilot-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    height: 500px;
  }
  .copilot-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    background: rgba(14, 165, 233, 0.05);
  }
  .cp-title {
    font-weight: 700;
    font-size: 15px;
    color: #0284c7;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cp-subtitle { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
  
  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--bg);
  }
  .empty-chat {
    margin: auto;
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
  }
  .empty-chat i { font-size: 32px; color: #cbd5e1; margin-bottom: 10px; }
  .suggestions { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; align-items: center; }
  .suggestions button { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 20px; padding: 6px 12px; font-size: 12px; cursor: pointer; color: var(--text-muted); }
  .suggestions button:hover { background: var(--bg-secondary); }
  
  .msg { display: flex; width: 100%; }
  .msg.user { justify-content: flex-end; }
  .msg.ai { justify-content: flex-start; }
  
  .msg-bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.5;
  }
  .msg.user .msg-bubble { background: var(--blue); color: var(--text-primary); border-bottom-right-radius: 4px; }
  .msg.ai .msg-bubble { background: var(--bg-panel); color: var(--text-primary); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
  .typing { font-style: italic; color: #94a3b8; }
  
  .chat-input {
    padding: 14px;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 10px;
    background: var(--bg-panel);
  }
    .chat-input input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    outline: none;
    font-size: 13px;
    background: var(--bg-secondary);
    color: var(--text-primary);
  }
  .chat-input button {
    background: var(--blue);
    color: var(--text-primary);
    border: none;
    border-radius: 8px;
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .chat-input button:disabled { background: #cbd5e1; cursor: not-allowed; }
</style>
