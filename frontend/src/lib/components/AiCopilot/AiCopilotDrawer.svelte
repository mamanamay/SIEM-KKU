<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { aiCopilotStore } from '../../../stores/aiCopilotStore';
  import { eventsStore, roleStore } from '../../../stores/events';
  import { page } from '$app/stores';
  
  import type { AiMode, Message, SecurityContext } from '../../AiCopilot/types';
  import { IntentDetector } from '../../AiCopilot/IntentDetector';
  import { SecurityContextBuilder } from '../../AiCopilot/SecurityContextBuilder';
  import { SecurityIntelligenceEngine } from '../../AiCopilot/SecurityIntelligenceEngine';
  import { ApiIntelligenceEngine } from '../../AiCopilot/ApiIntelligenceEngine';
  
  import MessageBubble from './MessageBubble.svelte';
  import InvestigationHistory from './InvestigationHistory.svelte';
  import InvestigationProgress from './InvestigationProgress.svelte';

  $: state = $aiCopilotStore;
  $: activeSession = state.sessions.find((s: any) => s.id === state.activeSessionId);
  $: messages = activeSession ? activeSession.messages : [];
  
  let inputQuery = '';
  let isProcessing = false;
  let showHistory = false;
  let chatContainer: HTMLElement;
  
  $: currentPage = $page.url.pathname.split('/').pop() || 'dashboard';

  // Initialize if empty
  $: if (state.isOpen && !state.activeSessionId && state.sessions.length === 0) {
    createNewInvestigation();
  }

  function createNewInvestigation() {
    if (activeSession && activeSession.messages.length > 0) {
      const confirmNew = window.confirm("Are you sure you want to archive the current investigation and start a new one?");
      if (!confirmNew) return;
    }
    
    // Auto-detect context with Role
    const context = SecurityContextBuilder.build('UNKNOWN', currentPage, $eventsStore, '', $roleStore);
    aiCopilotStore.startNewSession(context, 'local');
  }

  async function handleSend() {
    if (!inputQuery.trim() || isProcessing) return;
    if (!activeSession) return;
    
    // Context Limit Protection
    if (activeSession.contextUsagePercent >= 100) {
       alert("Investigation Context Limit reached. Please start a new investigation.");
       return;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      source: 'User',
      content: inputQuery,
      timestamp: new Date().toISOString()
    };
    
    const query = inputQuery;
    inputQuery = '';
    aiCopilotStore.addMessage(activeSession.id, userMessage);
    await scrollToBottom();
    
    isProcessing = true;
    
    try {
      // 1. Intent Detection
      const intent = IntentDetector.detect(query, currentPage);
      
      // 2. Context Building (update existing context with new intent/query info)
      const contextUpdate = SecurityContextBuilder.build(intent, currentPage, $eventsStore, query, $roleStore);
      aiCopilotStore.updateSessionContext(activeSession.id, contextUpdate);
      
      // Merge context for this turn
      const currentContext = { ...activeSession.context, ...contextUpdate };
      
      let structuredData;
      let sourceName: any = 'Security Intelligence';
      
      // 3. Engine Execution
      if (activeSession.currentMode === 'local') {
        // Mode 1: Rule-based
        structuredData = SecurityIntelligenceEngine.analyze(intent, currentContext, query);
      } else {
        // Mode 2: AI API
        sourceName = 'KKU AI API';
        // Mock progress for UI
        activeSession.progress = [
          { label: 'Detecting investigation intent', status: 'done' },
          { label: 'Searching relevant logs', status: 'done' },
          { label: 'Generating AI analysis', status: 'active' }
        ];
        
        try {
           structuredData = await ApiIntelligenceEngine.analyze(intent, currentContext, query);
        } catch (e) {
           // Fallback if API fails
           structuredData = SecurityIntelligenceEngine.analyze(intent, currentContext, query);
           structuredData.securityAssessment = `âš ï¸ AI API Unavailable. Falling back to Local Engine.\n\n${structuredData.securityAssessment}`;
           sourceName = 'Security Intelligence';
        }
      }
      
      // Final Assessment step
      activeSession.progress = [];

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        source: sourceName,
        content: '',
        structuredData,
        timestamp: new Date().toISOString(),
        intent
      };
      
      aiCopilotStore.addMessage(activeSession.id, aiMessage);
      
    } catch (err) {
      console.error(err);
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        source: 'System',
        content: 'Error processing request.',
        timestamp: new Date().toISOString()
      };
      aiCopilotStore.addMessage(activeSession.id, errorMsg);
    } finally {
      isProcessing = false;
      await scrollToBottom();
    }
  }

  async function scrollToBottom() {
    await tick();
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
  
  function getContextColor(percent: number) {
    if (percent < 70) return '#10b981'; // Green
    if (percent < 90) return '#f59e0b'; // Yellow/Orange
    return '#ef4444'; // Red
  }
</script>

<style>
  .drawer-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.4);
    z-index: 9998;
    backdrop-filter: blur(2px);
  }
  .drawer {
    position: fixed;
    top: 0; right: 0; bottom: 0;
    width: 600px;
    max-width: 100vw;
    background: var(--bg-panel);
    z-index: 9999;
    box-shadow: -4px 0 24px rgba(0,0,0,0.1);
    display: flex;
    transform: translateX(100%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .drawer.open {
    transform: translateX(0);
  }
  
  .main-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
  }
  
  .header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-secondary);
  }
  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  
  .mode-selector {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--bg-panel);
    font-size: 0.85rem;
    color: var(--text-primary);
    outline: none;
  }
  
  .chat-area {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    background: var(--bg-secondary);
  }
  
  .input-area {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg-panel);
  }
  .input-box {
    display: flex;
    gap: 12px;
  }
  input[type="text"] {
    flex: 1;
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 0.95rem;
    outline: none;
  }
  input[type="text"]:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }
  
  .btn-send {
    background: #3b82f6;
    color: var(--text-primary);
    border: none;
    border-radius: 8px;
    padding: 0 20px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn-send:disabled {
    background: var(--text-muted);
    cursor: not-allowed;
  }
  
  .context-bar {
    height: 4px;
    width: 100%;
    background: var(--border);
    border-radius: 2px;
    margin-bottom: 8px;
    overflow: hidden;
  }
  .context-fill {
    height: 100%;
    transition: width 0.3s, background 0.3s;
  }
  .context-warning {
    font-size: 0.75rem;
    text-align: right;
    margin-bottom: 8px;
  }
</style>

{#if state.isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="drawer-overlay" on:click={() => aiCopilotStore.closePanel()}></div>
{/if}

<div class="drawer {state.isOpen ? 'open' : ''}">
  {#if showHistory}
    <InvestigationHistory onCloseMobile={() => {}} />
  {/if}
  
  <div class="main-chat">
    <div class="header">
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="btn btn-outline" on:click={() => showHistory = !showHistory} style="padding: 6px; border:none; background:transparent;">
          <i class="ti ti-menu-2" style="font-size:1.2rem;"></i>
        </button>
        <div>
          <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">KKU AI Copilot</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">Advanced SIEM Intelligence</div>
        </div>
      </div>
      
      <div class="header-actions">
        {#if activeSession}
          <select 
            class="mode-selector" 
            value={activeSession.currentMode}
            on:change={(e) => aiCopilotStore.updateSessionMode(activeSession.id, e.currentTarget.value)}
          >
            <option value="local">Security Intelligence</option>
            <option value="api">KKU AI API</option>
          </select>
        {/if}
        <button class="btn btn-outline" on:click={createNewInvestigation} title="New Investigation">
          <i class="ti ti-refresh"></i>
        </button>
        <button class="btn btn-outline" on:click={() => aiCopilotStore.closePanel()} style="border:none; background:transparent;">
          <i class="ti ti-x" style="font-size:1.2rem;"></i>
        </button>
      </div>
    </div>
    
    <div class="chat-area custom-scrollbar" bind:this={chatContainer}>
      {#if activeSession && messages.length === 0}
        <div style="text-align:center; padding: 40px 20px; color: var(--text-secondary);">
          <i class="ti ti-robot" style="font-size: 3rem; color: var(--border); margin-bottom: 16px; display:block;"></i>
          <h3>How can I assist your investigation?</h3>
          <p style="font-size: 0.9rem;">Current context: <strong>{currentPage}</strong></p>
          
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:24px;">
              {#if currentPage === 'hunting'}
                <button class="btn btn-outline" on:click={() => { inputQuery = "วิเคราะห์ Attack Pattern"; handleSend(); }}>วิเคราะห์ Attack Pattern</button>
                <button class="btn btn-outline" on:click={() => { inputQuery = "ตรวจสอบความเชื่อมโยง IP นี้"; handleSend(); }}>ตรวจสอบความเชื่อมโยง IP นี้</button>
              {:else if currentPage === 'network-map'}
                <button class="btn btn-outline" on:click={() => { inputQuery = "วิเคราะห์เส้นทางโจมตีที่ผ่านไฟร์วอลล์"; handleSend(); }}>วิเคราะห์เส้นทางโจมตีที่ผ่านไฟร์วอลล์</button>
                <button class="btn btn-outline" on:click={() => { inputQuery = "Network Zone ที่มีความเสี่ยง"; handleSend(); }}>Network Zone ที่มีความเสี่ยง</button>
              {:else if currentPage === 'cve'}
                <button class="btn btn-outline" on:click={() => { inputQuery = "สรุป CVE ที่พบในระบบ"; handleSend(); }}>สรุป CVE ที่พบในระบบ</button>
                <button class="btn btn-outline" on:click={() => { inputQuery = "แนะนำแนวทางแก้ไข CVE ฉบับเร่งด่วน"; handleSend(); }}>แนะนำแนวทางแก้ไข CVE ฉบับเร่งด่วน</button>
              {:else}
                <button class="btn btn-outline" on:click={() => { inputQuery = "วิเคราะห์ IP ที่น่าสงสัย"; handleSend(); }}>วิเคราะห์ IP ที่น่าสงสัย</button>
                <button class="btn btn-outline" on:click={() => { inputQuery = "สรุปเหตุการณ์ผิดปกติตอนนี้"; handleSend(); }}>สรุปเหตุการณ์ผิดปกติตอนนี้</button>
                <button class="btn btn-outline" on:click={() => { inputQuery = "ช่วยเขียนรายงานสรุปของวันนี้"; handleSend(); }}>ช่วยเขียนรายงานสรุปของวันนี้</button>
              {/if}
            </div>
        </div>
      {/if}
      
      {#each messages as msg (msg.id)}
        <MessageBubble message={msg} />
      {/each}
      
      {#if activeSession && activeSession.progress && activeSession.progress.length > 0}
        <InvestigationProgress progress={activeSession.progress} />
      {/if}
    </div>
    
    <div class="input-area">
      {#if activeSession}
        {#if activeSession.contextUsagePercent >= 70}
          <div class="context-warning" style="color: {getContextColor(activeSession.contextUsagePercent)}">
            {#if activeSession.contextUsagePercent >= 90}
              âš  Investigation Context Limit Reached. Please start a new investigation.
            {:else}
              Warning: AI investigation context is nearly full ({activeSession.contextUsagePercent}%).
            {/if}
          </div>
        {/if}
        <div class="context-bar">
          <div class="context-fill" style="width: {activeSession.contextUsagePercent}%; background: {getContextColor(activeSession.contextUsagePercent)}"></div>
        </div>
      {/if}
      
      <div class="input-box">
        <input 
          type="text" 
          bind:value={inputQuery} 
          on:keypress={(e) => e.key === 'Enter' && handleSend()} 
          placeholder="Ask AI Copilot..." 
          disabled={!activeSession || activeSession.contextUsagePercent >= 100 || isProcessing}
        />
        <button 
          class="btn-send" 
          on:click={handleSend} 
          disabled={!activeSession || activeSession.contextUsagePercent >= 100 || isProcessing || !inputQuery.trim()}
        >
          {#if isProcessing}
            <i class="ti ti-loader rotate"></i>
          {:else}
            <i class="ti ti-send"></i> Send
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>