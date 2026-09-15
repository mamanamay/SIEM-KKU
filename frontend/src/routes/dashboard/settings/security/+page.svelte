<script>
    import { onMount } from 'svelte';
    import { showNotification } from '../../../../stores/notificationStore';

    let user = { totpEnabled: false };
    let loading = true;
    
    let currentPassword = '';
    let newPassword = '';
    let confirmPassword = '';
    let changingPassword = false;

    let setupQrUrl = '';
    let setupSecret = '';
    let setupBackupCodes = [];
    let totpCode = '';
    let verifyingTotp = false;

    onMount(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            if (res.ok) {
                user = await res.json();
            } else {
                showNotification('error', 'Error', 'Failed to load user info');
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            showNotification('error', 'Error', 'Error loading user info');
        } finally {
            loading = false;
        }
    });

    async function changePassword() {
        if (!currentPassword || !newPassword || !confirmPassword) {
            showNotification('warning', 'Warning', 'Please fill all password fields');
            return;
        }
        if (newPassword !== confirmPassword) {
            showNotification('error', 'Error', 'New passwords do not match');
            return;
        }

        changingPassword = true;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            if (res.ok) {
                showNotification('success', 'Success', 'Password changed successfully');
                currentPassword = '';
                newPassword = '';
                confirmPassword = '';
            } else {
                const errorData = await res.json().catch(() => ({}));
                showNotification('error', 'Error', errorData.message || 'Failed to change password');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            showNotification('error', 'Error', 'Error changing password');
        } finally {
            changingPassword = false;
        }
    }

    async function setup2FA() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/auth/me/2fa/setup', {
                method: 'POST',
                headers: {
                    'Authorization': token ? `Bearer ${token}` : ''
                }
            });
            if (res.ok) {
                const data = await res.json();
                setupQrUrl = data.qrCodeUrl || data.qrUrl;
                setupSecret = data.secret;
                setupBackupCodes = data.backupCodes || [];
            } else {
                showNotification('error', 'Error', 'Failed to start 2FA setup');
            }
        } catch (error) {
            console.error('Error setting up 2FA:', error);
            showNotification('error', 'Error', 'Error setting up 2FA');
        }
    }

    async function confirm2FA() {
        if (!totpCode) {
            showNotification('warning', 'Warning', 'Please enter verification code');
            return;
        }

        verifyingTotp = true;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/auth/me/2fa/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ code: totpCode, secret: setupSecret })
            });

            if (res.ok) {
                showNotification('success', 'Success', '2FA enabled successfully');
                user.totpEnabled = true;
                setupQrUrl = '';
                setupSecret = '';
                totpCode = '';
            } else {
                showNotification('error', 'Error', 'Invalid verification code');
            }
        } catch (error) {
            console.error('Error confirming 2FA:', error);
            showNotification('error', 'Error', 'Error confirming 2FA');
        } finally {
            verifyingTotp = false;
        }
    }
</script>

<div class="page-container">
        <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
            <i class="ti ti-shield-lock"></i>
        </div>
        <div>
            <h1 style="margin: 0; font-size: 24px; color: var(--text-primary);">Security Settings</h1>
            <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 14px;">Manage your account security and two-factor authentication.</p>
        </div>
    </div>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else}
        <div class="cards">
            <!-- Password Management -->
            <div class="card">
                <h2>Password Management</h2>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px;">
                    * รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 12 ตัวอักษร และประกอบด้วยตัวอักษรพิมพ์ใหญ่, พิมพ์เล็ก, และตัวเลข
                </p>
                <div class="form-group">
                    <label for="currentPassword">Current Password</label>
                    <input type="password" id="currentPassword" bind:value={currentPassword} class="input-field" />
                </div>
                <div class="form-group">
                    <label for="newPassword">New Password</label>
                    <input type="password" id="newPassword" bind:value={newPassword} class="input-field" />
                </div>
                <div class="form-group">
                    <label for="confirmPassword">Confirm Password</label>
                    <input type="password" id="confirmPassword" bind:value={confirmPassword} class="input-field" />
                </div>
                <div class="card-actions">
                    <button type="button" class="btn-primary" on:click={changePassword} disabled={changingPassword}>
                        {changingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                </div>
            </div>

            <!-- Two-Factor Authentication -->
            <div class="card">
                <h2>Two-Factor Authentication</h2>
                
                {#if user.totpEnabled}
                    <div class="status-success">
                        ✓ Two-Factor Authentication is currently enabled.
                    </div>
                {:else}
                    <div class="status-warning">
                        ⚠ Two-Factor Authentication is not enabled.
                    </div>
                    
                    {#if !setupQrUrl}
                        <div class="card-actions">
                            <button type="button" class="btn-primary" on:click={setup2FA}>Enable 2FA</button>
                        </div>
                    {:else}
                        <div class="setup-container">
                            <p>สแกน QR code หรือกรอกรหัส Setup Key ด้านล่างนี้ในแอป Authenticator ของคุณ (เช่น Google Authenticator, Microsoft Authenticator):</p>
                            <div class="qr-section" style="display: flex; gap: 24px; align-items: center; margin-bottom: 24px;">
                                <div class="qr-code">
                                    <img src={setupQrUrl} alt="2FA QR Code" />
                                </div>
                                <div class="secret-text">
                                    <strong>Setup Key:</strong><br/>
                                    <code style="background: var(--bg-secondary); padding: 4px 8px; border-radius: 4px; font-size: 16px; margin-top: 8px; display: inline-block;">{setupSecret}</code>
                                </div>
                            </div>
                            
                            <div class="backup-codes" style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.3); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                                <h4 style="margin: 0 0 12px 0; color: #ca8a04;"><i class="ti ti-alert-triangle"></i> รหัสสำรอง (Backup Codes)</h4>
                                <p style="font-size: 13px; color: var(--text-secondary); margin-top: 0;">กรุณาจดจำหรือบันทึกรหัสทั้ง 10 ชุดนี้ไว้ในที่ปลอดภัย กั้นลืมในกรณีที่คุณไม่สามารถเข้าถึงแอป Authenticator ได้</p>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-family: monospace; font-size: 14px;">
                                    {#each setupBackupCodes as code}
                                        <div style="background: var(--bg-secondary); padding: 6px 12px; border-radius: 4px; text-align: center;">{code}</div>
                                    {/each}
                                </div>
                            </div>
                            <div class="form-group">
                                <label for="totpCode">Verification Code</label>
                                <input type="text" id="totpCode" bind:value={totpCode} class="input-field" placeholder="กรอกรหัส 6 หลัก (123456)" maxlength="6" />
                            </div>
                            <div class="card-actions">
                                <button type="button" class="btn-primary" on:click={confirm2FA} disabled={verifyingTotp}>
                                    {verifyingTotp ? 'Verifying...' : 'Verify & Enable'}
                                </button>
                                <button type="button" class="btn-secondary" on:click={() => setupQrUrl = ''}>Cancel</button>
                            </div>
                        </div>
                    {/if}
                {/if}
            </div>
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
    .card-actions {
        display: flex;
        justify-content: flex-start;
        gap: 12px;
        margin-top: 16px;
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
    .loading {
        color: var(--text-secondary);
    }
    .status-success {
        color: #10b981;
        background-color: rgba(16, 185, 129, 0.1);
        padding: 12px;
        border-radius: 4px;
        border: 1px solid rgba(16, 185, 129, 0.2);
    }
    .status-warning {
        color: #f59e0b;
        background-color: rgba(245, 158, 11, 0.1);
        padding: 12px;
        border-radius: 4px;
        border: 1px solid rgba(245, 158, 11, 0.2);
        margin-bottom: 16px;
    }
    .setup-container {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--border);
    }
    .setup-container p {
        margin-top: 0;
        margin-bottom: 16px;
        color: var(--text-secondary);
        font-size: 14px;
    }
    .qr-code {
        margin-bottom: 16px;
        background: white;
        padding: 16px;
        display: inline-block;
        border-radius: 8px;
    }
    .qr-code img {
        display: block;
        max-width: 200px;
        height: auto;
    }
</style>
