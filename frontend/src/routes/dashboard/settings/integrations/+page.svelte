<script>
    import { onMount } from 'svelte';
    import { showNotification } from '../../../../stores/notificationStore';

    let apiConfig = {
        aiApiUrl: '',
        aiKey: '',
        aiModel: '',
        slackUrl: '',
        teamsUrl: ''
    };
    let models = [];
    let loading = true;
    let saving = false;
    let fetchingModels = false;

    let showApiKey = false;

    onMount(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/settings', {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.apiConfig) {
                    apiConfig = { ...apiConfig, ...data.apiConfig };
                }
                if (apiConfig.aiKey) {
                    await fetchModels();
                }
            } else {
                showNotification('Failed to load integrations', 'error');
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            showNotification('Error loading integrations', 'error');
        } finally {
            loading = false;
        }
    });

    async function fetchModels() {
        if (!apiConfig.aiKey) return;
        fetchingModels = true;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/settings/integrations/ai-proxy/models', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({
                    aiApiUrl: apiConfig.aiApiUrl,
                    aiKey: apiConfig.aiKey
                })
            });
            if (res.ok) {
                const data = await res.json();
                models = data.models || [];
            } else {
                showNotification('Failed to load AI models', 'warning');
            }
        } catch (error) {
            console.error('Error fetching models:', error);
        } finally {
            fetchingModels = false;
        }
    }

    async function testConnection(endpoint) {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(apiConfig)
            });
            if (res.ok) {
                showNotification('success', 'Success', 'Connection successful');
            } else {
                showNotification('error', 'Error', 'Connection failed');
            }
        } catch (error) {
            console.error('Error testing connection:', error);
            showNotification('error', 'Error', 'Error testing connection');
        }
    }

    async function handleSave() {
        saving = true;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(apiConfig)
            });

            if (res.ok) {
                showNotification('Integrations saved successfully', 'success');
            } else {
                showNotification('Failed to save integrations', 'error');
            }
        } catch (error) {
            console.error('Error saving integrations:', error);
            showNotification('error', 'Error', 'Error saving integrations');
        } finally {
            saving = false;
        }
    }

    let showConfirmModal = false;
    let confirmTitle = '';
    let confirmMessage = '';
    let confirmIcon = 'ti-question-mark';
    let confirmAction = null;

    function promptConfirm(title, message, icon, actionFn) {
        confirmTitle = title;
        confirmMessage = message;
        confirmIcon = icon;
        confirmAction = actionFn;
        showConfirmModal = true;
    }

    function executeConfirmAction() {
        showConfirmModal = false;
        if (confirmAction) confirmAction();
    }
</script>

<div class="page-container">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: rgba(139, 92, 246, 0.1); color: #8b5cf6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
            <i class="ti ti-plug-connected"></i>
        </div>
        <div>
            <h1 style="margin: 0; font-size: 24px; color: var(--text-primary);">Integrations</h1>
            <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 14px;">Configure API connections to external services and AI providers.</p>
        </div>
    </div>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else}
        <div class="cards">
            <!-- KKU AI Copilot -->
            <div class="card">
                <h2>KKU AI Copilot</h2>
                <div class="form-group">
                    <label for="aiApiUrl">API Endpoint</label>
                    <input type="text" id="aiApiUrl" bind:value={apiConfig.aiApiUrl} class="input-field" placeholder="https://api.openai.com/v1" />
                </div>
                <div class="form-group">
                    <label for="aiKey">API Key</label>
                    <div class="input-group">
                        {#if showApiKey}
                            <input type="text" id="aiKey" bind:value={apiConfig.aiKey} class="input-field" placeholder="sk-..." />
                        {:else}
                            <input type="password" id="aiKey" bind:value={apiConfig.aiKey} class="input-field" placeholder="sk-..." />
                        {/if}
                        <button type="button" class="btn-secondary" on:click={() => showApiKey = !showApiKey}>
                            {showApiKey ? 'Hide' : 'Show'}
                        </button>
                        <button type="button" class="btn-secondary" on:click={fetchModels} disabled={fetchingModels}>
                            {fetchingModels ? 'Loading...' : 'Load Models'}
                        </button>
                    </div>
                </div>
                <div class="form-group">
                    <label for="aiModel">Model</label>
                    <select id="aiModel" bind:value={apiConfig.aiModel} class="input-field">
                        <option value="">Select a model</option>
                        {#each models as model}
                            <option value={model.id || model}>{model.name || model.id || model}</option>
                        {/each}
                    </select>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-secondary" on:click={() => promptConfirm('Test AI Connection', 'Are you sure you want to test the connection to the AI provider?', 'ti-plug', () => testConnection('/api/settings/integrations/test-ai'))}>Test AI Connection</button>
                </div>
            </div>

            <!-- Slack -->
            <div class="card">
                <h2>Slack</h2>
                <div class="form-group">
                    <label for="slackUrl">Webhook URL</label>
                    <input type="text" id="slackUrl" bind:value={apiConfig.slackUrl} class="input-field" placeholder="https://hooks.slack.com/services/..." />
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-secondary" on:click={() => promptConfirm('Test Slack', 'Are you sure you want to send a test message to Slack?', 'ti-brand-slack', () => testConnection('/api/settings/integrations/test-slack'))}>Test Slack Connection</button>
                </div>
            </div>

            <!-- Teams -->
            <div class="card">
                <h2>Microsoft Teams</h2>
                <div class="form-group">
                    <label for="teamsUrl">Webhook URL</label>
                    <input type="text" id="teamsUrl" bind:value={apiConfig.teamsUrl} class="input-field" placeholder="https://outlook.office.com/webhook/..." />
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-secondary" on:click={() => promptConfirm('Test Teams', 'Are you sure you want to send a test message to Microsoft Teams?', 'ti-brand-teams', () => testConnection('/api/settings/integrations/test-teams'))}>Test Teams Connection</button>
                </div>
            </div>
        </div>

        <div class="actions">
            <button on:click={() => promptConfirm('Save Integrations', 'Are you sure you want to save all integration settings?', 'ti-device-floppy', handleSave)} disabled={saving} class="btn-primary">
                {saving ? 'Saving...' : 'Save Integrations'}
            </button>
        </div>
    {/if}
</div>

<style>
    .page-container {
        padding: 24px;
        color: var(--text-primary);
    }
    .page-title {
        font-size: 24px;
        margin-bottom: 24px;
        color: var(--text-primary);
    }
    .cards {
        display: flex;
        flex-direction: column;
        gap: 24px;
        margin-bottom: 24px;
    }
    .card {
        background-color: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 20px;
    }
    .card h2 {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 18px;
        color: var(--text-primary);
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }
    .input-group {
        display: flex;
        gap: 8px;
    }
    .input-group .input-field {
        flex: 1;
    }
    .form-group label {
        font-size: 14px;
        color: var(--text-secondary);
    }
    .input-field {
        background-color: var(--bg-app);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: 10px;
        border-radius: 4px;
        font-size: 14px;
    }
    .card-actions {
        display: flex;
        justify-content: flex-start;
        margin-top: 16px;
    }
    .actions {
        display: flex;
        justify-content: flex-end;
    }
    .btn-primary {
        background-color: #3b82f6;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
    }
    .btn-primary:hover:not(:disabled) {
        background-color: #2563eb;
    }
    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .btn-secondary {
        background-color: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border);
        padding: 10px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
    }
    .btn-secondary:hover:not(:disabled) {
        background-color: var(--border);
    }
    .btn-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .loading {
        color: var(--text-secondary);
    }

    .modal-backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(4px); }
    .confirm-modal { background: var(--bg-primary, #fff); padding: 32px; border-radius: 16px; width: 400px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
    .cm-icon { width: 64px; height: 64px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; }
    .confirm-modal h3 { font-size: 20px; margin-bottom: 8px; color: var(--text-primary); }
    .confirm-modal p { font-size: 14px; color: var(--text-secondary); margin-bottom: 24px; }
    .cm-actions { display: flex; gap: 12px; justify-content: center; }
    .cm-actions button { min-width: 120px; }
    </style>
