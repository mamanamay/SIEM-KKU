<script>
    import { onMount } from 'svelte';
    import { showNotification } from '../../../../stores/notificationStore';
    import ConfirmModal from '$lib/components/ConfirmModal.svelte';

    let sysConfig = {
        retentionDays: 30,
        autoLogout: 15
    };
    let loading = true;
    let saving = false;
    
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
                if (data.sysConfig) {
                    sysConfig = { ...sysConfig, ...data.sysConfig };
                }
            } else {
                showNotification('error', 'Error', 'Failed to load settings');
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            showNotification('error', 'Error', 'Error loading settings');
        } finally {
            loading = false;
        }
    });

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
                body: JSON.stringify({ sysConfig })
            });

            if (res.ok) {
                showNotification('success', 'สำเร็จ', 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
            } else {
                showNotification('error', 'ผิดพลาด', 'ไม่สามารถบันทึกการตั้งค่าได้');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('error', 'ผิดพลาด', 'เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
        } finally {
            saving = false;
        }
    }
    
    function requestSaveConfig() {
        promptConfirm('บันทึกการตั้งค่า', 'คุณต้องการบันทึกการตั้งค่าระบบใช่หรือไม่?', 'ti-device-floppy', handleSave);
    }
</script>

<div class="page-container">
    
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: rgba(249, 115, 22, 0.1); color: #f97316; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
            <i class="ti ti-settings"></i>
        </div>
        <div>
            <h1 style="margin: 0; font-size: 24px; color: var(--text-primary);">Configuration Settings</h1>
            <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 14px;">Manage global system parameters and retention policies.</p>
        </div>
    </div>


    {#if loading}
        <div class="loading">Loading...</div>
    {:else}
        <div class="cards">
            <!-- Data Management -->
            <div class="card">
                <h2>Data Management</h2>
                <div class="form-group">
                    <label for="retention">Log Data Retention (Days)</label>
                    <input type="number" id="retention" bind:value={sysConfig.retentionDays} min="1" class="input-field" />
                </div>
            </div>

            <!-- Session Security -->
            <div class="card">
                <h2>Session Security</h2>
                <div class="form-group">
                    <label for="logout">Auto Logout Timeout (Minutes)</label>
                    <input type="number" id="logout" bind:value={sysConfig.autoLogout} min="1" class="input-field" />
                </div>
            </div>
        </div>

        <div class="actions">
            <button on:click={requestSaveConfig} disabled={saving} class="btn-primary">
                {saving ? 'Saving...' : 'Save Configuration'}
            </button>
        </div>
    {/if}
    
    <ConfirmModal bind:visible={showConfirmModal} title={confirmTitle} message={confirmMessage} icon={confirmIcon} on:confirm={executeConfirmAction} on:cancel={() => showConfirmModal = false} />
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
    .loading {
        color: var(--text-secondary);
    }
</style>
