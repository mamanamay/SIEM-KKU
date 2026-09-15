<!--
  AiKeyModal.svelte
  Pop-up modal shown when user tries to use AI features without a configured API key.
  Also used from Account / Settings to manage the key at any time.

  Props:
    show      — whether modal is visible
    onClose   — callback when user dismisses
    onSaved   — callback after key is saved (and optionally tested OK)
-->
<script lang="ts">
  import { KKU_AI_MODELS, getKKUAIKey, setKKUAIKey, getKKUAIModel, setKKUAIModel, testKKUAIConnection } from '../utils/kkuai';

  export let show = false;
  export let onClose: () => void = () => {};
  export let onSaved: () => void = () => {};

  // ── Local state ─────────────────────────────────────────────────────────────
  let apiKey = '';
  let showKey = false;
  let selectedModel = KKU_AI_MODELS[0].id;

  // Test state
  let testStatus: 'idle' | 'testing' | 'ok' | 'fail' = 'idle';
  let testMessage = '';

  // Save state
  let saving = false;

  // ── Init from localStorage when modal opens ──────────────────────────────────
  $: if (show) {
    apiKey = getKKUAIKey();
    selectedModel = getKKUAIModel();
    testStatus = 'idle';
    testMessage = '';
    saving = false;
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  async function handleTest() {
    if (!apiKey.trim()) {
      testStatus = 'fail';
      testMessage = 'Please enter an API key first.';
      return;
    }
    testStatus = 'testing';
    testMessage = '';
    const result = await testKKUAIConnection(apiKey.trim(), selectedModel);
    if (result.ok) {
      testStatus = 'ok';
      testMessage = 'Connection successful! The API key works.';
    } else {
      testStatus = 'fail';
      testMessage = result.error || 'Connection failed. Check your API key.';
    }
  }

  function handleSave() {
    if (!apiKey.trim()) return;
    saving = true;
    setKKUAIKey(apiKey.trim());
    setKKUAIModel(selectedModel);
    setTimeout(() => {
      saving = false;
      onSaved();
      onClose();
    }, 300);
  }

  function handleClose() {
    onClose();
  }

  function handleBackdrop(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('ai-modal-overlay')) handleClose();
  }
</script>

{#if show}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="ai-modal-overlay" on:click={handleBackdrop}>
    <div class="ai-modal-box" role="dialog" aria-modal="true" aria-label="KKU AI API Key Setup">

      <!-- Header -->
      <div class="am-header">
        <div class="am-header-left">
          <div class="am-icon"><i class="ti ti-brain"></i></div>
          <div>
            <div class="am-title">KKU AI Setup Required</div>
            <div class="am-subtitle">Connect to KKU IntelSphere AI to use AI features</div>
          </div>
        </div>
        <button class="am-close" on:click={handleClose} title="Close">
          <i class="ti ti-x"></i>
        </button>
      </div>

      <!-- Info banner -->
      <div class="am-info-banner">
        <i class="ti ti-info-circle"></i>
        <span>Get your API key from <strong>gen.ai.kku.ac.th</strong> — KKU IntelSphere AI Portal</span>
      </div>

      <!-- Form -->
      <div class="am-body">

        <!-- API Key input -->
        <div class="am-field">
          <label for="ai-key-input">API Key</label>
          <div class="am-input-wrap">
            <i class="ti ti-key am-input-icon"></i>
            <input
              id="ai-key-input"
              type={showKey ? 'text' : 'password'}
              value={apiKey} on:input={(e) => apiKey = e.target.value}
              placeholder="sk-..."
              autocomplete="off"
              spellcheck="false"
              class="am-input"
            />
            <button class="am-eye" on:click={() => showKey = !showKey} title={showKey ? 'Hide key' : 'Show key'}>
              <i class="ti {showKey ? 'ti-eye-off' : 'ti-eye'}"></i>
            </button>
          </div>
        </div>

        <!-- Model selector -->
        <div class="am-field">
          <label for="ai-model-select">AI Model</label>
          <select id="ai-model-select" class="am-select" bind:value={selectedModel}>
            {#each KKU_AI_MODELS as m}
              <option value={m.id}>{m.name} — {m.provider}</option>
            {/each}
          </select>
        </div>

        <!-- Test result -->
        {#if testStatus !== 'idle'}
          <div class="am-test-result {testStatus}">
            {#if testStatus === 'testing'}
              <i class="ti ti-loader-2 spin"></i> Testing connection...
            {:else if testStatus === 'ok'}
              <i class="ti ti-circle-check"></i> {testMessage}
            {:else}
              <i class="ti ti-circle-x"></i> {testMessage}
            {/if}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="am-footer">
        <a href="/dashboard/account" class="am-link" on:click={handleClose}>
          <i class="ti ti-settings"></i> Manage in Account Settings
        </a>
        <div class="am-actions">
          <button class="am-btn secondary" on:click={handleTest} disabled={testStatus === 'testing'}>
            {#if testStatus === 'testing'}
              <i class="ti ti-loader-2 spin"></i> Testing...
            {:else}
              <i class="ti ti-plug-connected"></i> Test Connection
            {/if}
          </button>
          <button class="am-btn primary" on:click={handleSave} disabled={!apiKey.trim() || saving}>
            {#if saving}
              <i class="ti ti-loader-2 spin"></i> Saving...
            {:else}
              <i class="ti ti-device-floppy"></i> Save & Use AI
            {/if}
          </button>
        </div>
      </div>

    </div>
  </div>
{/if}

<style>
  .ai-modal-overlay {
    position: fixed; inset: 0; z-index: 9000;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
  }

  .ai-modal-box {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    width: 100%;
    max-width: 480px;
    box-shadow: 0 24px 48px rgba(0,0,0,0.3);
    overflow: hidden;
  }

  /* Header */
  .am-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border);
  }
  .am-header-left { display: flex; align-items: center; gap: 14px; }
  .am-icon {
    width: 44px; height: 44px; border-radius: 12px;
    background: rgba(139,92,246,0.12); color: #8b5cf6;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; flex-shrink: 0;
  }
  .am-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
  .am-subtitle { font-size: 12px; color: var(--text-muted); }
  .am-close {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); font-size: 18px; padding: 4px;
    border-radius: 6px; transition: 0.15s;
    display: flex; align-items: center;
  }
  .am-close:hover { background: var(--bg-secondary); color: var(--text-primary); }

  /* Info banner */
  .am-info-banner {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 24px;
    background: rgba(59,130,246,0.06);
    border-bottom: 1px solid rgba(59,130,246,0.12);
    font-size: 12px; color: var(--text-secondary);
  }
  .am-info-banner i { color: #3b82f6; font-size: 14px; flex-shrink: 0; }
  .am-info-banner strong { color: #3b82f6; }

  /* Body */
  .am-body { padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }

  .am-field { display: flex; flex-direction: column; gap: 6px; }
  .am-field label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }

  .am-input-wrap {
    display: flex; align-items: center;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-secondary); overflow: hidden;
    transition: border-color 0.2s;
  }
  .am-input-wrap:focus-within { border-color: #8b5cf6; }
  .am-input-icon { padding: 0 10px; color: var(--text-muted); font-size: 16px; flex-shrink: 0; }
  .am-input {
    flex: 1; border: none; background: transparent; outline: none;
    padding: 10px 0; font-size: 13px; color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
  }
  .am-eye {
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); padding: 0 12px; font-size: 15px;
    display: flex; align-items: center;
  }
  .am-eye:hover { color: var(--text-primary); }

  .am-select {
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg-secondary); color: var(--text-primary);
    padding: 10px 12px; font-size: 13px; outline: none; cursor: pointer;
    transition: border-color 0.2s;
  }
  .am-select:focus { border-color: #8b5cf6; }

  /* Test result */
  .am-test-result {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 500;
  }
  .am-test-result.testing { background: rgba(59,130,246,0.08); color: #3b82f6; }
  .am-test-result.ok      { background: rgba(16,185,129,0.08); color: #10b981; }
  .am-test-result.fail    { background: rgba(239,68,68,0.08);  color: #ef4444; }
  .am-test-result i { font-size: 16px; flex-shrink: 0; }

  /* Footer */
  .am-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
    gap: 12px; flex-wrap: wrap;
  }
  .am-link {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--text-muted); text-decoration: none;
    transition: color 0.15s;
  }
  .am-link:hover { color: var(--text-primary); }
  .am-actions { display: flex; gap: 8px; }

  .am-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px; border-radius: 8px;
    font-size: 13px; font-weight: 600; cursor: pointer;
    border: none; transition: 0.15s;
  }
  .am-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .am-btn.secondary {
    background: var(--bg-secondary); color: var(--text-primary);
    border: 1px solid var(--border);
  }
  .am-btn.secondary:not(:disabled):hover { border-color: #8b5cf6; color: #8b5cf6; }
  .am-btn.primary {
    background: #8b5cf6; color: var(--text-primary);
  }
  .am-btn.primary:not(:disabled):hover { background: #7c3aed; }

  /* Spinner */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { display: inline-block; animation: spin 0.8s linear infinite; }
</style>
