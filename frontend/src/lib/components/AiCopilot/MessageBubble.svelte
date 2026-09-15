<script lang="ts">
  import type { Message } from '../../AiCopilot/types';
  import { globalReportStore } from '../../../stores/globalReportStore';

  export let message: Message;

  function handleAction(action: any) {
    if (action.action === 'export') {
       globalReportStore.openReportWizard([], 'executive');
    } else if (action.action === 'navigate' && action.payload) {
       window.location.href = action.payload;
    }
  }

  function getBadgeColor(source: string) {
    if (source.includes('KKU AI API')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (source.includes('Security Intelligence')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  }
</script>

<style>
  .msg-wrapper {
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
  }
  .msg-wrapper.user {
    align-items: flex-end;
  }
  .msg-wrapper.assistant {
    align-items: flex-start;
  }
  
  .msg-bubble {
    max-width: 85%;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 0.95rem;
    line-height: 1.5;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .user .msg-bubble {
    background: #3b82f6;
    color: var(--text-primary);
    border-bottom-right-radius: 2px;
  }
  .assistant .msg-bubble {
    background: var(--bg-panel);
    color: #1e293b;
    border: 1px solid var(--border);
    border-bottom-left-radius: 2px;
  }
  
  .meta-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 0.75rem;
  }
  .badge {
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid;
    font-weight: 500;
  }
  
  .structured-section {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--bg-secondary);
  }
  .structured-section h4 {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .structured-list {
    margin: 0;
    padding-left: 20px;
    color: var(--text-primary);
  }
  .structured-list li {
    margin-bottom: 4px;
  }
  .actions-container {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }
  .action-btn {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 0.8rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
  }
  .action-btn:hover {
    background: var(--bg-secondary);
    border-color: var(--text-muted);
  }
</style>

<div class="msg-wrapper {message.role}">
  <div class="msg-bubble">
    {#if message.role === 'assistant'}
      <div class="meta-bar">
        <span class="badge {getBadgeColor(message.source)}">{message.source.replace(/[^a-zA-Z0-9 ]/g, '').trim()}</span>
        <span style="color: var(--text-muted);">{new Date(message.timestamp).toLocaleTimeString('th-TH')}</span>
      </div>
    {/if}

    {#if message.structuredData}
      <!-- Structured AI Response -->
      {#if message.structuredData.observedEvidence && message.structuredData.observedEvidence.length > 0}
        <div class="structured-section" style="border-top:none; margin-top:0; padding-top:0;">
          <h4><i class="ti ti-search"></i> 1. OBSERVED EVIDENCE</h4>
          <ul class="structured-list">
            {#each message.structuredData.observedEvidence as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if message.structuredData.correlatedEvents && message.structuredData.correlatedEvents.length > 0}
        <div class="structured-section">
          <h4><i class="ti ti-link"></i> 2. CORRELATED EVENTS</h4>
          <ul class="structured-list">
            {#each message.structuredData.correlatedEvents as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if message.structuredData.securityAssessment}
        <div class="structured-section">
          <h4><i class="ti ti-shield"></i> 3. SECURITY ASSESSMENT</h4>
          <p style="margin:0; color:var(--text-primary); font-size:0.9rem;">{message.structuredData.securityAssessment}</p>
        </div>
      {/if}

      {#if message.structuredData.recommendedActions && message.structuredData.recommendedActions.length > 0}
        <div class="structured-section">
          <h4><i class="ti ti-bulb"></i> 4. RECOMMENDED ACTIONS</h4>
          <ul class="structured-list">
            {#each message.structuredData.recommendedActions as item}
              <li>{item}</li>
            {/each}
          </ul>
        </div>
      {/if}
      
      {#if message.structuredData.suggestedNextActions && message.structuredData.suggestedNextActions.length > 0}
        <div class="actions-container">
          {#each message.structuredData.suggestedNextActions as action}
            <button class="action-btn" on:click={() => handleAction(action)}>
              {action.label}
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Raw Text -->
      <div style="white-space: pre-wrap;">{message.content}</div>
      {#if message.role === 'user'}
        <div style="text-align: right; font-size: 0.7rem; color: #bae6fd; margin-top: 4px;">
          {new Date(message.timestamp).toLocaleTimeString('th-TH')}
        </div>
      {/if}
    {/if}
  </div>
</div>