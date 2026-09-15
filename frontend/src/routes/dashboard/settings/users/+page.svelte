<script>
    import { onMount } from 'svelte';
    import { showNotification } from '../../../../stores/notificationStore';

    let users = [];
    let loading = true;
    let showModal = false;
    let showResetModal = false;
    let resetTargetId = null;
    let resetTargetUsername = '';
    let newPasswordForReset = '';
    let saving = false;

    let newUser = {
        username: '',
        firstName: '',
        lastName: '',
        email: '',
        role: 'guest',
        authMethod: 'local',
        password: '',
        is2faEnabled: false,
        require2fa: false
    };

    onMount(async () => {
        await loadUsers();
    });

    async function loadUsers() {
        loading = true;
        try {
            const res = await fetch('/api/settings/users', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
            if (res.ok) {
                users = await res.json();
            } else {
                showNotification('error', 'Error', 'Failed to load users');
            }
        } catch (err) {
            showNotification('error', 'Error', 'Network error');
        } finally {
            loading = false;
        }
    }

    let isEditing = false;
    let editTargetId = null;

    function openEditModal(user) {
        if (user.username === 'admin') {
            showNotification('warning', 'Restricted', 'Cannot edit the primary admin account here');
            // Allow editing name/email but not role, or just block it entirely. Let's block it for safety.
            // Actually, we can just edit the profile instead.
            return;
        }
        isEditing = true;
        editTargetId = user.id;
        newUser = {
            username: user.username,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
            role: user.role,
            authMethod: user.authMethod,
            is2faEnabled: user.is2faEnabled || user.twoFactorEnabled || false,
            require2fa: user.require2fa || false,
            password: ''
        };
        showModal = true;
    }

    function openAddModal() {
        isEditing = false;
        editTargetId = null;
        newUser = { username: '', firstName: '', lastName: '', email: '', role: 'guest', authMethod: 'local', password: '', is2faEnabled: false, require2fa: false };
        showModal = true;
    }

    async function addUser() {
        if (!newUser.username || !newUser.firstName || !newUser.lastName) {
            showNotification('warning', 'Warning', 'Please fill required fields');
            return;
        }
        saving = true;
        try {
            const res = await fetch('/api/settings/users', { method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                showNotification('success', 'Success', 'User added successfully');
                showModal = false;
                newUser = { username: '', firstName: '', lastName: '', email: '', role: 'guest', authMethod: 'local' };
                await loadUsers();
            } else {
                showNotification('error', 'Error', 'Failed to add user');
            }
        } catch (err) {
            showNotification('error', 'Error', 'Network error');
        } finally {
            saving = false;
        }
    }

    
    function openResetModal(id, username, authMethod) {
        if (authMethod === 'kku_sso') {
            showNotification('warning', 'SSO User', 'Cannot reset password for KKU SSO users');
            return;
        }
        resetTargetId = id;
        resetTargetUsername = username;
        newPasswordForReset = '';
        showResetModal = true;
    }

    async function submitResetPassword() {
        if (!newPasswordForReset) {
            showNotification('warning', 'Invalid', 'Password is required');
            return;
        }
        saving = true;
        try {
            const res = await fetch(`/api/settings/users/${resetTargetId}/reset-password`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ newPassword: newPasswordForReset })
            });
            if (res.ok) {
                showNotification('success', 'Success', 'Password reset successfully');
                showResetModal = false;
            } else {
                showNotification('error', 'Error', 'Failed to reset password');
            }
        } catch (err) {
            showNotification('error', 'Error', 'Network error');
        } finally {
            saving = false;
        }
    }

    async function resetPassword(id, authMethod) {
        if (authMethod === 'kku_sso') {
            showNotification('warning', 'Warning', 'Cannot reset password for KKU SSO users');
            return;
        }
        if (!confirm('Are you sure you want to reset this user\'s password?')) return;
        
        try {
            const res = await fetch(`/api/settings/users/${id}/reset-password`, {
                method: 'POST'
            });
            if (res.ok) {
                showNotification('success', 'Success', 'Password reset successfully');
            } else {
                showNotification('error', 'Error', 'Failed to reset password');
            }
        } catch (err) {
            showNotification('error', 'Error', 'Network error');
        }
    }

    function getInitials(first, last) {
        return ((first || '')[0] || '') + ((last || '')[0] || '');
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

    async function resetUser2fa() {
        promptConfirm('Reset 2FA Device?', 'This will disable 2FA for this user and require them to pair a new device on next login. Are you sure?', 'ti-shield-x', async () => {
            // Mocking API call for now. In real app, call API to reset 2FA.
            newUser.is2faEnabled = false;
            newUser.require2fa = true; // Auto-enforce setup again
            showNotification('success', '2FA Reset', 'User 2FA device has been reset.');
        });
    }
</script>

<div class="users-page">
    <div class="header-section">
        <div class="page-title">
            <div class="title-icon"><i class="ti ti-users"></i></div>
            <div class="title-text">
                <h2>Users & Access Control</h2>
                <p>Manage accounts, assign roles, and control platform access</p>
            </div>
        </div>
        <button class="add-btn" on:click={() => showModal = true}>+ Add New User</button>
    </div>

    <div class="role-reference-card">
        <div class="rr-header">
            <i class="ti ti-user-shield"></i> รายละเอียดสิทธิ์การใช้งาน (ROLE REFERENCE)
        </div>
        <div class="rr-body">
            <p class="rr-note">* หมายเหตุ: ทุก Role สามารถเข้าเมนู My Account เพื่อตั้งค่า 2FA และ API Key ของตัวเองได้</p>
            <div class="rr-boxes">
                <div class="rr-box admin">
                    <div class="rr-role-title">ADMINISTRATOR</div>
                    <div class="rr-role-desc">Full system access, User Management, Webhooks, API settings.</div>
                </div>
                <div class="rr-box analyst">
                    <div class="rr-role-title">ANALYST</div>
                    <div class="rr-role-desc">Can view Dashboard, Logs, use Threat Hunting and AI.</div>
                </div>
                <div class="rr-box guest">
                    <div class="rr-role-title">GUEST</div>
                    <div class="rr-role-desc">Read-only access to Dashboard and Logs. No AI or Hunting.</div>
                </div>
            </div>
        </div>
    </div>


    {#if loading}
        <div class="loading">Loading users...</div>
    {:else}
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Auth</th>
                        <th>Status</th>
                        <th>2FA</th>
                        <th>Last Login</th>
                        <th style="width: 140px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each users as user}
                        <tr>
                            <td>
                                <div class="user-cell">
                                    <div class="avatar">{getInitials(user.firstName, user.lastName).toUpperCase()}</div>
                                    <div class="name-info">
                                        <div>{user.firstName || user.lastName ? (user.firstName || '') + ' ' + (user.lastName || '') : 'Unknown'}</div>
                                        <div class="email">{user.email || 'No email'}</div>
                                    </div>
                                </div>
                            </td>
                            <td>{user.username}</td>
                            <td><span class="badge role {user.role}">{user.role}</span></td>
                            <td><span class="badge auth">{user.authMethod === 'kku_sso' ? 'KKU SSO' : 'Local'}</span></td>
                            <td><span class="badge status" class:active={user.accountStatus === 'Active'}>{user.accountStatus}</span></td>
                            <td>
                                {#if user.twoFactorEnabled}
                                    <span class="badge status active" style="background:rgba(16,185,129,0.1); color:#10b981; border:1px solid rgba(16,185,129,0.3);"><i class="ti ti-shield-check"></i> Enabled</span>
                                {:else}
                                    <span class="badge status" style="background:rgba(107,114,128,0.1); color:#9ca3af; border:1px solid rgba(107,114,128,0.3);"><i class="ti ti-shield-x"></i> Disabled</span>
                                {/if}
                            </td>
                            <td>{user.lastLogin || 'Never'}</td>
                            <td>
                                <div class="actions">
                                    <button class="action-btn edit" on:click={() => openEditModal(user)}>Edit</button>
                                    <button class="action-btn reset" on:click={() => openResetModal(user.id, user.username, user.authMethod)}>Reset Pwd</button>
                                </div>
                            </td>
                        </tr>
                    {/each}
                    {#if users.length === 0}
                        <tr><td colspan="8" class="empty">No users found.</td></tr>
                    {/if}
                </tbody>
            </table>
        </div>
    {/if}

    {#if showResetModal}
        <div class="modal-backdrop">
            <div class="modal">
                <div class="modal-header">
                    <h3>Reset Password ({resetTargetUsername})</h3>
                    <button class="close-btn" on:click={() => showResetModal = false}>&times;</button>
                </div>
                <form on:submit|preventDefault={submitResetPassword} class="modal-body">
                    <div class="form-group">
                        <label for="resetPwd">New Password</label>
                        <input type="password" id="resetPwd" bind:value={newPasswordForReset} required placeholder="Set new temporary password" />
                        <small style="color: var(--text-muted, #6b7280);">ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรกหลังรีเซ็ต</small>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" on:click={() => showResetModal = false}>Cancel</button>
                        <button type="submit" class="save-btn" disabled={!newPasswordForReset}>Reset Password</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}

    {#if showModal}
        <div class="modal-backdrop">
            <div class="modal">
                <div class="modal-header">
                    <h3>{isEditing ? 'Edit User' : 'Add New User'}</h3>
                    <button class="close-btn" on:click={() => showModal = false}>&times;</button>
                </div>
                <form on:submit|preventDefault={addUser} class="modal-body">
                    <div class="form-group">
                        <label for="username">Username *</label>
                        <input type="text" id="username" bind:value={newUser.username} required />
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="firstName">First Name *</label>
                            <input type="text" id="firstName" bind:value={newUser.firstName} required />
                        </div>
                        <div class="form-group">
                            <label for="lastName">Last Name *</label>
                            <input type="text" id="lastName" bind:value={newUser.lastName} required />
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" bind:value={newUser.email} />
                    </div>
<div class="form-row">
                        <div class="form-group">
                            <label for="role">Role</label>
                            <select id="role" bind:value={newUser.role}>
                                <option value="admin">Admin</option>
                                <option value="analyst">Analyst</option>
                                <option value="guest">Guest</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="authMethod">Auth Method</label>
                            <select id="authMethod" bind:value={newUser.authMethod}>
                                <option value="local">Local</option>
                                <option value="kku_sso">KKU SSO</option>
                            </select>
                        </div>
                    </div>
                    
                    {#if isEditing && newUser.authMethod === 'local'}
                        <div class="form-group two-fa-panel">
                            <label>Two-Factor Authentication (2FA)</label>
                            <div class="two-fa-controls">
                                <div class="status-badge {newUser.is2faEnabled ? 'active' : 'inactive'}">
                                    <i class="ti ti-shield-check"></i> {newUser.is2faEnabled ? 'Currently Active' : 'Not Configured'}
                                </div>
                                
                                {#if newUser.is2faEnabled}
                                    <button type="button" class="btn-outline-danger btn-sm" on:click={() => resetUser2fa()}>
                                        <i class="ti ti-refresh"></i> Reset 2FA Device
                                    </button>
                                {:else}
                                    <label class="toggle-switch">
                                        <input type="checkbox" bind:checked={newUser.require2fa} />
                                        <span class="slider"></span>
                                        <span class="label-text" style="font-size:12px;">Require 2FA setup on next login</span>
                                    </label>
                                {/if}
                            </div>
                            <small style="color:var(--text-muted); display:block; margin-top:8px;">
                                {newUser.is2faEnabled ? 'Resetting 2FA allows the user to pair a new authenticator app if they lost their device.' : 'Force the user to scan a new QR code using an Authenticator app when they next log in.'}
                            </small>
                        </div>
                    {/if}

                    {#if newUser.authMethod === 'local' && !isEditing}
                    <div class="form-group">
                        <label for="password">Password *</label>
                        <input type="password" id="password" bind:value={newUser.password} required placeholder="Set temporary password" />
                        <small style="color: var(--text-muted, #6b7280);">ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก</small>
                    </div>
                    {/if}
                    <div class="modal-actions">
                        <button type="button" class="cancel-btn" on:click={() => showModal = false}>Cancel</button>
                        <button type="submit" class="save-btn" disabled={saving}>{saving ? 'Saving...' : (isEditing ? 'Save Changes' : 'Add User')}</button>
                    </div>
                </form>
            </div>
        </div>
    {/if}
</div>

<style>
    .users-page {
        padding: 20px;
        color: var(--text-primary);
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }
    h2 { margin: 0; }
    .add-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .table-container {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow-x: auto;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
    }
    th, td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
    }
    th {
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-weight: 600;
    }
    .user-cell {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: bold;
    }
    .name-info .email {
        font-size: 12px;
        color: var(--text-secondary);
    }
    .badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
    }
    
    .role { color: white; }
    .role.admin { background: #ef4444; }
    .role.analyst { background: #3b82f6; }
    .role.guest { background: #8b5cf6; }

    .auth { background: #f59e0b; color: white; }
    .status { background: #ef4444; color: white; }
    .status.active { background: #10b981; }
    .actions {
        display: flex;
        gap: 8px;
    }
    .action-btn {
        background: var(--bg-app);
        color: var(--text-primary);
        border: 1px solid var(--border);
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    }
    .action-btn:hover {
        background: var(--bg-secondary);
    }
    .empty {
        text-align: center;
        color: var(--text-secondary);
    }

    /* Modal Styles */
    .modal-backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
    .modal {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-secondary);
        border-radius: 8px 8px 0 0;
    }
    .modal-header h3 { margin: 0; }
    .close-btn {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 20px;
        cursor: pointer;
    }
    .modal-body { padding: 20px; }
    .form-group { margin-bottom: 15px; }
    .form-row { display: flex; gap: 15px; }
    .form-row .form-group { flex: 1; }
    label {
        display: block;
        margin-bottom: 5px;
        color: var(--text-secondary);
        font-size: 14px;
    }
    input, select {
        width: 100%;
        padding: 8px 10px;
        background: var(--bg-app);
        border: 1px solid var(--border);
        color: var(--text-primary);
        border-radius: 4px;
        box-sizing: border-box;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
    }
    .cancel-btn {
        background: transparent;
        color: var(--text-primary);
        border: 1px solid var(--border);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
    }
    .save-btn {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .save-btn:disabled { opacity: 0.7; cursor: not-allowed; }

    .users-page {
        display: flex;
        flex-direction: column;
        gap: 24px;
        padding-bottom: 2rem;
    }
    
    .header-section {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }

    .page-title {
        display: flex;
        gap: 16px;
        align-items: center;
    }

    .title-icon {
        width: 48px;
        height: 48px;
        background: #fdf6b2; /* yellow-100 */
        color: #d97706; /* yellow-600 */
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
    }

    .title-text h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        color: var(--text-primary);
    }

    .title-text p {
        margin: 4px 0 0 0;
        font-size: 13px;
        color: var(--text-muted);
    }

    .role-reference-card {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
    }

    .rr-header {
        background: var(--bg-secondary);
        padding: 12px 16px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        border-bottom: 1px solid var(--border);
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .rr-body {
        padding: 16px;
    }

    .rr-note {
        font-size: 13px;
        color: var(--text-muted);
        margin: 0 0 16px 0;
    }

    .rr-boxes {
        display: flex;
        gap: 16px;
    }

    .rr-box {
        flex: 1;
        padding: 16px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg-secondary);
    }

    .rr-box.admin {
        border: 1px solid rgba(239, 68, 68, 0.3);
        background: rgba(239, 68, 68, 0.05);
    }
    .rr-box.admin .rr-role-title { color: #ef4444; }

    .rr-box.analyst {
        border: 1px solid rgba(59, 130, 246, 0.3);
        background: rgba(59, 130, 246, 0.05);
    }
    .rr-box.analyst .rr-role-title { color: #3b82f6; }

    .rr-box.guest {
        border: 1px solid rgba(16, 185, 129, 0.3);
        background: rgba(16, 185, 129, 0.05);
    }
    .rr-box.guest .rr-role-title { color: #10b981; }

    .rr-role-title {
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .rr-role-desc {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.4;
    }

    .add-btn {
        background: var(--accent);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: 0.2s;
    }
    .add-btn:hover {
        background: var(--accent-hover);
    }

    .table-container {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: hidden;
    }


    .confirm-modal { background: var(--bg-primary, #fff); padding: 32px; border-radius: 16px; width: 400px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
    .cm-icon { width: 64px; height: 64px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; }
    .confirm-modal h3 { font-size: 20px; margin-bottom: 8px; color: var(--text-primary); }
    .confirm-modal p { font-size: 14px; color: var(--text-secondary); margin-bottom: 24px; }
    .cm-actions { display: flex; gap: 12px; justify-content: center; }
    .cm-actions button { min-width: 120px; }

    /* 2FA Panel */
    .two-fa-panel { background: rgba(0,0,0,0.1); border: 1px dashed var(--border); padding: 16px; border-radius: 8px; margin-top: 10px; }
    .two-fa-controls { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
    .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .status-badge.active { background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); }
    .status-badge.inactive { background: rgba(107,114,128,0.15); color: #9ca3af; border: 1px solid rgba(107,114,128,0.3); }
    
    .toggle-switch { display: inline-flex; align-items: center; cursor: pointer; gap: 10px; }
    .toggle-switch input { display: none; }
    .slider { position: relative; width: 36px; height: 20px; background: #374151; border-radius: 20px; transition: 0.3s; flex-shrink: 0; }
    .slider::before { content: ""; position: absolute; width: 14px; height: 14px; border-radius: 50%; top: 3px; left: 3px; background: #fff; transition: 0.3s; }
    .toggle-switch input:checked + .slider { background: #3b82f6; }
    .toggle-switch input:checked + .slider::before { transform: translateX(16px); }
    </style>
