<script lang="ts">
  import { onMount } from 'svelte';
  import { 
    KKU_AI_MODELS, 
    getKKUAIKey, 
    setKKUAIKey, 
    getKKUAIModel, 
    setKKUAIModel,
    testKKUAIConnection 
  } from '../../utils/kkuai';
  import { showNotification } from '../../../stores/notificationStore';

  let isSavingApi = false;
  let isTesting = false;
  let showApiKey: Record<string, boolean> = {};
  let isDirty = false;
  
  // States
  let apiConfig = { aiApiUrl: 'https://gen.ai.kku.ac.th/api/v1', aiKey: '', aiModel: KKU_AI_MODELS[0].id };
  let integForm = {
    geminiKey: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    scorecardUrl: 'https://api.securityscorecard.io',
    scorecardKey: 'xxxxxxxxxxxx'
  };
  let webhookConfig = { slackUrl: '', teamsUrl: '', lineToken: '' };

  onMount(() => {
    // Load KKU AI Settings
    apiConfig.aiKey = getKKUAIKey();
    apiConfig.aiModel = getKKUAIModel();
  });
  
  async function testConnection() {
    if (!apiConfig.aiKey) {
       showNotification('Please enter KKU AI API Key first.', 'error');
       return;
    }
    isTesting = true;
    try {
      const res = await testKKUAIConnection(apiConfig.aiKey, apiConfig.aiModel);
      if (res.ok) {
        showNotification('Connection successful! Model is ready.', 'success');
      } else {
        showNotification('Connection failed: ' + res.error, 'error');
      }
    } catch (err: any) {
      showNotification('Error testing connection: ' + err.message, 'error');
    } finally {
      isTesting = false;
    }
  }

  async function saveIntegrations() {
    isSavingApi = true;
    try {
      // Save KKU AI Settings
      setKKUAIKey(apiConfig.aiKey);
      setKKUAIModel(apiConfig.aiModel);
      
      await new Promise(r => setTimeout(r, 500));
      isDirty = false;
      showNotification('Integrations saved successfully', 'success');
    } catch (err: any) {
      showNotification('Failed to save settings: ' + err.message, 'error');
    } finally {
      isSavingApi = false;
    }
  }
</script>

<div class="content-header">
  <div class="content-header-icon" style="background: rgba(168,85,247,0.12); color: #a855f7;">
    <i class="ti ti-plug-connected"></i>
  </div>
  <div>
    <h2>Integrations</h2>
    <p>AI analysis APIs and alerting webhook endpoints</p>
  </div>
</div>

<div class="panel" style="margin-top: 16px;">
  <div class="panel-head" style="display:flex; justify-content:space-between; align-items:center;">
    <span class="panel-label" style="color: #a855f7;"><i class="ti ti-brain"></i> KKU AI Platform</span>
    <button class="btn btn-outline btn-sm" on:click={testConnection} disabled={isTesting}>
      {#if isTesting}<i class="ti ti-loader ti-spin"></i> Testing...{:else}Test Connection{/if}
    </button>
  </div>
  <div class="panel-body">
    <div class="form-group">
      <label>AI Endpoint URL</label>
      <input class="st-input" type="url" bind:value={apiConfig.aiApiUrl} disabled />
    </div>
    <div class="form-group" style="margin-top: 12px;">
      <label>AI API Key</label>
      <div style="display: flex; gap: 8px;">
        <input class="st-input" type={showApiKey['ai'] ? 'text' : 'password'} value={apiConfig.aiKey} on:input={(e) => { apiConfig.aiKey = e.currentTarget.value; isDirty = true; }} placeholder="kku-ai-key-..." style="flex: 1;" />
        <button class="btn-icon-sm" on:click={() => showApiKey['ai'] = !showApiKey['ai']} title="Toggle visibility">
          <i class="ti {showApiKey['ai'] ? 'ti-eye-off' : 'ti-eye'}"></i>
        </button>
      </div>
    </div>
    <div class="form-group" style="margin-top: 12px;">
      <label>AI Model</label>
      <select class="st-input" bind:value={apiConfig.aiModel} on:change={() => isDirty = true}>
        {#each KKU_AI_MODELS as m}
          <option value={m.id}>{m.name} ({m.provider})</option>
        {/each}
      </select>
    </div>
  </div>
</div>

<div class="panel" style="margin-top: 16px;">
  <div class="panel-head"><span class="panel-label" style="color: #f59e0b;"><i class="ti ti-bell-ringing"></i> Alert Webhooks</span></div>
  <div class="panel-body">
    <div class="form-group">
      <label><i class="ti ti-brand-slack" style="color:#4A154B;"></i> Slack Webhook URL</label>
      <input class="st-input" type="url" bind:value={webhookConfig.slackUrl} on:input={() => isDirty = true} placeholder="https://hooks.slack.com/services/..." />
    </div>
    <div class="form-group" style="margin-top: 12px;">
      <label><i class="ti ti-brand-teams" style="color:#6264A7;"></i> Microsoft Teams Webhook</label>
      <input class="st-input" type="url" bind:value={webhookConfig.teamsUrl} on:input={() => isDirty = true} placeholder="https://outlook.office.com/webhook/..." />
    </div>
    <div class="form-group" style="margin-top: 12px;">
      <label><i class="ti ti-message-circle" style="color:#00B900;"></i> LINE Notify Token</label>
      <div style="display: flex; gap: 8px;">
        <input class="st-input" type={showApiKey['line'] ? 'text' : 'password'} value={webhookConfig.lineToken} on:input={(e) => { webhookConfig.lineToken = e.currentTarget.value; isDirty = true; }} placeholder="LINE Notify token" style="flex: 1;" />
        <button class="btn-icon-sm" on:click={() => showApiKey['line'] = !showApiKey['line']} title="Toggle visibility">
          <i class="ti {showApiKey['line'] ? 'ti-eye-off' : 'ti-eye'}"></i>
        </button>
      </div>
    </div>
  </div>
</div>

<div class="form-actions" style="margin-top: 20px;">
  <button class="btn-primary" on:click={saveIntegrations} disabled={isSavingApi}>
    {#if isSavingApi}<i class="ti ti-loader ti-spin"></i>{:else}<i class="ti ti-device-floppy"></i>{/if}
    Save Integrations
  </button>
</div>