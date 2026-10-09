<script lang="ts">
  import { showUiMessage } from '../../workspace/feedback';
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { aiCopilotStore } from '../../../stores/aiCopilotStore';
  import { lanDetectionsStore as eventsStore, roleStore } from '../../../stores/events';
  import { page } from '$app/stores';
  
  import type { AiMode, Message, SecurityContext } from '../../AiCopilot/types';
  import { IntentDetector } from '../../AiCopilot/IntentDetector';
  import { SecurityContextBuilder } from '../../AiCopilot/SecurityContextBuilder';
  import { SecurityIntelligenceEngine } from '../../AiCopilot/SecurityIntelligenceEngine';
  import { ApiIntelligenceEngine } from '../../AiCopilot/ApiIntelligenceEngine';
  
  import { captureInvestigationReport } from '../../AiCopilot/investigationReport';
  import MessageBubble from './MessageBubble.svelte';
  import ConfirmModal from '../ConfirmModal.svelte';
  import InvestigationHistory from './InvestigationHistory.svelte';
  import InvestigationProgress from './InvestigationProgress.svelte';

  $: state = $aiCopilotStore;
  $: activeSession = state.sessions.find((s: any) => s.id === state.activeSessionId);
  $: messages = activeSession ? activeSession.messages : [];
  
  let inputQuery = '';
  let composer: HTMLTextAreaElement;
  const pageLabels: Record<string,string> = {dashboard:'Dashboard',hunting:'Threat Hunting',soar:'Incident Response',explorer:'Log Explorer','blocked_ip_audit':'Blocked IP Audit','blocked-ip-audit':'Blocked IP Audit','network-map':'Network Map',cve:'CVE Database','ai-briefing':'AI Daily Briefing'};
  $: contextLabel = pageLabels[currentPage] || currentPage.replace(/[_-]/g,' ');
  function suggestQuery(query: string) { inputQuery=query; tick().then(()=>composer?.focus()); }
  function composerKeydown(e: KeyboardEvent) {
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();handleSend();}
  }
  function closeHistoryOnMobile() { if(window.matchMedia('(max-width: 720px)').matches)showHistory=false; }


  let isProcessing = false;
  let showHistory = false;
  let chatContainer: HTMLElement;
  
  $: currentPage = $page.url.pathname.split('/').pop() || 'dashboard';

  // Initialize if empty
  $: if (state.isOpen && !state.activeSessionId && state.sessions.length === 0) {
    tick().then(() => {
      const latest=get(aiCopilotStore);
      if(latest.isOpen&&!latest.activeSessionId&&latest.sessions.length===0)executeNewInvestigation();
    });
  }

  let showConfirmModal = false;

  function createNewInvestigation() {
    if (activeSession && activeSession.messages.length > 0) {
      showConfirmModal = true;
      return;
    }
    executeNewInvestigation();
  }

  function executeNewInvestigation() {
    showConfirmModal = false;
    // Auto-detect context with Role
    const context = SecurityContextBuilder.build('UNKNOWN', currentPage, $eventsStore, '', $roleStore);
    aiCopilotStore.startNewSession(context, 'local');
  }

  async function handleSend() {
    if (!inputQuery.trim() || isProcessing) return;
    if (!activeSession) return;
    
    // Context Limit Protection
    if (activeSession.contextUsagePercent >= 100) {
       await showUiMessage("Investigation Context Limit reached. Please start a new investigation.");
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
      const currentContext = { ...activeSession.context, ...contextUpdate, selectedIP: contextUpdate.selectedIP };
      const reportScope = captureInvestigationReport(currentContext);
      
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
        reportScope,
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
:global(.drawer.siem-copilot) { width: min(660px,100%); max-width: 100%; }
:global(.drawer.siem-copilot.with-history) { width: min(920px,100%); }
:global(.siem-copilot .main-chat) { min-width: 0; min-height: 0; }
:global(.siem-copilot .header) { padding: 18px 20px; gap: 12px; flex-wrap: wrap; background: var(--bg-panel); }
:global(.siem-copilot .copilot-heading) { display: flex; align-items: center; gap: 10px; flex: 1 1 240px; min-width: 0; }
:global(.siem-copilot .copilot-title) { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.4; }
:global(.siem-copilot .copilot-subtitle) { margin: 2px 0 0; color: var(--text-secondary); font-size: 11px; }
:global(.siem-copilot .header-actions) { gap: 8px; flex-wrap: wrap; }
:global(.siem-copilot .copilot-icon-button) { width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg-panel); color: var(--text-secondary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
:global(.siem-copilot .copilot-icon-button:hover) { background: var(--green-bg); color: var(--green); }
:global(.siem-copilot .mode-selector) { width: 174px; max-width: 100%; min-height: 34px; padding: 6px 10px; font-size: 12px; }
:global(.siem-copilot .copilot-context) { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 20px; border-bottom: 1px solid var(--border); background: var(--bg-surface); font-size: 11px; color: var(--text-secondary); }
:global(.siem-copilot .context-chip) { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-panel); padding: 4px 8px; overflow-wrap: anywhere; }
:global(.siem-copilot .chat-area) { min-height: 0; padding: 20px; background: var(--bg-app); }
:global(.siem-copilot .copilot-welcome) { max-width: 520px; margin: 24px auto; padding: 22px; border: 1px solid var(--border); border-radius: 16px; background: var(--bg-panel); text-align: left; }
:global(.siem-copilot .welcome-icon) { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; margin-bottom: 14px; border-radius: 12px; background: var(--green-bg); color: var(--green); font-size: 22px; }
:global(.siem-copilot .copilot-welcome h3) { margin: 0 0 8px; font-size: 18px; }
:global(.siem-copilot .copilot-welcome p) { margin: 0 0 18px; font-size: 12px; color: var(--text-secondary); line-height: 1.7; }
:global(.siem-copilot .suggestion-grid) { display: grid; gap: 9px; }
:global(.siem-copilot .suggestion-grid button) { border: 1px solid var(--border); border-radius: 10px; padding: 11px 13px; text-align: left; background: var(--bg-surface); color: var(--text-primary); font-size: 12px; cursor: pointer; overflow-wrap: anywhere; }
:global(.siem-copilot .suggestion-grid button:hover) { border-color: var(--green); background: var(--green-bg); }
:global(.siem-copilot .input-area) { padding: 14px 20px 16px; flex-shrink: 0; }
:global(.siem-copilot .input-box) { align-items: flex-end; gap: 10px; }
:global(.siem-copilot .chat-input) { flex: 1; width: 100%; min-width: 0; min-height: 76px; max-height: 160px; resize: none; overflow-y: auto; padding: 12px; border: 1px solid var(--border); border-radius: 12px; font: inherit; font-size: 13px; line-height: 1.6; background: var(--bg-surface); color: var(--text-primary); }
:global(.siem-copilot .btn-send) { height: 42px; padding-inline: 16px; background: var(--green); color: #fff; white-space: nowrap; }
:global(.siem-copilot .btn-send:disabled) { opacity: .5; cursor: not-allowed; }
:global(.siem-copilot .composer-hint) { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; margin-top: 8px; color: var(--text-muted); font-size: 10px; }
:global(.siem-copilot .processing-note) { font-size: 12px; color: var(--text-secondary); padding: 12px 0; }
:global(.siem-copilot .history-panel) { width: 240px; flex: 0 0 240px; min-width: 0; background: var(--bg-surface); }
:global(.siem-copilot .history-header) { min-height: 78px; padding: 16px; gap: 8px; font-size: 13px; }
:global(.siem-copilot .history-item) { padding: 12px; border: 1px solid transparent; border-radius: 10px; }
:global(.siem-copilot .history-item.active) { color: var(--green); background: var(--green-bg); border-color: var(--border); }
:global(.siem-copilot .history-item .item-title) { min-width: 0; }
:global(.siem-copilot .msg-bubble) { max-width: 96%; min-width: 0; overflow-wrap: anywhere; }

@media (max-width: 720px) {
  :global(.drawer.siem-copilot) { width: 100%; }
  :global(.siem-copilot .history-panel) { position: absolute; inset: 0 auto 0 0; width: min(280px,calc(100vw - 48px)); z-index: 2; box-shadow: 8px 0 24px #071c3233; }
  :global(.siem-copilot .history-shade) { position: absolute; inset: 0; z-index: 1; background: #071c3266; border: 0; }
  :global(.siem-copilot :is(.header,.input-area,.copilot-context)) { padding-inline: 14px; }
  :global(.siem-copilot .chat-area) { padding: 14px; }
  :global(.siem-copilot .copilot-welcome) { padding: 18px; margin-top: 14px; }
}
@media (min-width: 721px) {
  :global(.siem-copilot .history-shade) { display: none; }
}
</style>

{#if state.isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="drawer-overlay" on:click={() => aiCopilotStore.closePanel()}></div>
{/if}

<div class="drawer siem-copilot {state.isOpen ? 'open' : ''}" class:with-history={showHistory}>
  {#if showHistory}
    <button class="history-shade" aria-label="ปิดประวัติการสืบสวน" on:click={() => showHistory=false}></button>
    <InvestigationHistory onCloseMobile={closeHistoryOnMobile} onClose={() => showHistory=false} />
  {/if}
  
  <div class="main-chat">
    <div class="header">
      <div class="copilot-heading">
        <button class="copilot-icon-button" aria-label="ประวัติการสืบสวน" aria-expanded={showHistory} on:click={() => showHistory=!showHistory} title="ประวัติการสืบสวน"><i class="ti ti-history"></i></button>
        <div><h2 class="copilot-title">KKU AI Copilot</h2><p class="copilot-subtitle">ผู้ช่วยวิเคราะห์และสืบสวนเหตุการณ์</p></div>
      </div>
      <div class="header-actions">
        {#if activeSession}
          <select class="mode-selector" aria-label="โหมดวิเคราะห์" value={activeSession.currentMode} on:change={(e) => aiCopilotStore.updateSessionMode(activeSession.id,e.currentTarget.value)}>
            <option value="local">Local · กฎในระบบ</option><option value="api">KKU AI · ผ่าน API</option>
          </select>
        {/if}
        <button class="copilot-icon-button" on:click={createNewInvestigation} title="เริ่มการสืบสวนใหม่" aria-label="เริ่มการสืบสวนใหม่"><i class="ti ti-message-plus"></i></button>
        <button class="copilot-icon-button" on:click={() => aiCopilotStore.closePanel()} title="ปิดแชท" aria-label="ปิดแชท"><i class="ti ti-x"></i></button>
      </div>
    </div>
    <div class="copilot-context">
      <span class="context-chip"><i class="ti ti-layout-dashboard"></i> {contextLabel}</span>
      <span>{activeSession?.currentMode === 'api' ? 'ใช้ KKU AI API เพื่อช่วยวิเคราะห์' : 'วิเคราะห์ด้วยกฎและข้อมูลที่หน้าเว็บโหลดไว้'}</span>
    </div>

    <div class="chat-area custom-scrollbar" bind:this={chatContainer}>
      {#if activeSession && messages.length === 0}
        <div class="copilot-welcome">
          <div class="welcome-icon"><i class="ti ti-robot"></i></div>
          <h3>เริ่มจากคำถามที่ต้องการตรวจสอบ</h3>
          <p>เลือกคำถามด้านล่าง แล้วเพิ่ม IP หรือรายละเอียดที่ต้องการในช่องพิมพ์ก่อนส่ง</p>
          <div class="suggestion-grid">
              {#if currentPage === 'hunting'}
                <button class="btn btn-outline" on:click={() => suggestQuery("วิเคราะห์ Attack Pattern")} >วิเคราะห์ Attack Pattern</button>
                <button class="btn btn-outline" on:click={() => suggestQuery("ตรวจสอบความเชื่อมโยง IP นี้")} >ตรวจสอบความเชื่อมโยง IP นี้</button>
              {:else if currentPage === 'network-map'}
                <button class="btn btn-outline" on:click={() => suggestQuery("วิเคราะห์เส้นทางโจมตีที่ผ่านไฟร์วอลล์")} >วิเคราะห์เส้นทางโจมตีที่ผ่านไฟร์วอลล์</button>
                <button class="btn btn-outline" on:click={() => suggestQuery("Network Zone ที่มีความเสี่ยง")} >Network Zone ที่มีความเสี่ยง</button>
              {:else if currentPage === 'cve'}
                <button class="btn btn-outline" on:click={() => suggestQuery("สรุป CVE ที่พบในระบบ")} >สรุป CVE ที่พบในระบบ</button>
                <button class="btn btn-outline" on:click={() => suggestQuery("แนะนำแนวทางแก้ไข CVE ฉบับเร่งด่วน")} >แนะนำแนวทางแก้ไข CVE ฉบับเร่งด่วน</button>
              {:else}
                <button class="btn btn-outline" on:click={() => suggestQuery("วิเคราะห์ IP ที่น่าสงสัย")} >วิเคราะห์ IP ที่น่าสงสัย</button>
                <button class="btn btn-outline" on:click={() => suggestQuery("สรุปเหตุการณ์ผิดปกติตอนนี้")} >สรุปเหตุการณ์ผิดปกติตอนนี้</button>
                <button class="btn btn-outline" on:click={() => suggestQuery("ช่วยเขียนรายงานสรุปของวันนี้")} >ช่วยเขียนรายงานสรุปของวันนี้</button>
              {/if}
            </div>
        </div>
      {/if}
      
      {#if isProcessing}<div class="processing-note" role="status">กำลังประมวลผลคำถาม…</div>{/if}
      {#each messages as msg (msg.id)}
        <MessageBubble message={msg} conversation={messages} />
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
              พื้นที่บทสนทนาใกล้เต็ม กรุณาเริ่มการสืบสวนใหม่ ({activeSession.contextUsagePercent}% โดยประมาณ).
            {:else}
              พื้นที่บทสนทนาถูกใช้ {activeSession.contextUsagePercent}% (โดยประมาณ)
            {/if}
          </div>
        {/if}
        <div class="context-bar">
          <div class="context-fill" style="width: {activeSession.contextUsagePercent}%; background: {getContextColor(activeSession.contextUsagePercent)}"></div>
        </div>
      {/if}
      
      <div class="input-box">
        <textarea class="chat-input" rows="3" bind:this={composer} bind:value={inputQuery}
          on:keydown={composerKeydown} aria-label="ข้อความถึง AI Copilot"
          placeholder="ระบุคำถาม หรือ IP ที่ต้องการตรวจสอบ…"
          disabled={!activeSession || activeSession.contextUsagePercent >= 100 || isProcessing}></textarea>
        <button 
          class="btn-send" 
          on:click={handleSend} 
          disabled={!activeSession || activeSession.contextUsagePercent >= 100 || isProcessing || !inputQuery.trim()}
        >
          {#if isProcessing}
            <i class="ti ti-loader rotate"></i>
          {:else}
            <i class="ti ti-send"></i> ส่ง
          {/if}
        </button>
      </div>
      <div class="composer-hint"><span>Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่</span><span>ควรตรวจหลักฐานประกอบคำตอบ</span></div>
    </div>
  </div>
</div>

<ConfirmModal bind:visible={showConfirmModal} title='เริ่มการสืบสวนใหม่?' message='คุณแน่ใจหรือไม่ว่าต้องการจัดเก็บการสืบสวนปัจจุบันเข้าคลัง และเริ่มต้นการสืบสวนใหม่?' icon='ti-message-plus' on:confirm={executeNewInvestigation} on:cancel={() => showConfirmModal = false} />
