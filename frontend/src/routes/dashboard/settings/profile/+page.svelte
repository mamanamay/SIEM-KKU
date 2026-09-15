<script>
    import { onMount } from 'svelte';
    import { showNotification } from '../../../../stores/notificationStore';

    let user = {
        firstName: '',
        lastName: '',
        email: '',
        username: '',
        role: '',
        authMethod: '',
        status: ''
    };
    let loading = true;
    let saving = false;

    onMount(async () => {
        try {
            const res = await fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
            if (res.ok) {
                user = await res.json();
            } else {
                showNotification('error', 'Failed to load profile');
            }
        } catch (err) {
            showNotification('error', 'Network error');
        } finally {
            loading = false;
        }
    });

    async function saveProfile() {
        if (!user.firstName || !user.lastName) {
            showNotification('warning', 'First Name and Last Name are required');
            return;
        }
        saving = true;
        try {
            const res = await fetch('/api/auth/me', {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email
                })
            });
            if (res.ok) {
                showNotification('success', 'Profile updated successfully');
                const updated = await res.json();
                user = { ...user, ...updated };
            } else {
                showNotification('error', 'Failed to update profile');
            }
        } catch (err) {
            showNotification('error', 'Network error');
        } finally {
            saving = false;
        }
    }

    function getInitials(first, last) {
        return ((first || '')[0] || '') + ((last || '')[0] || '');
    }
</script>

<div class="profile-page">
    
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px;">
        <div style="width: 56px; height: 56px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px;">
            <i class="ti ti-user-circle"></i>
        </div>
        <div>
            <h2 style="margin: 0; font-size: 24px; color: var(--text-primary);">My Profile</h2>
            <p style="margin: 4px 0 0; color: var(--text-secondary); font-size: 14px;">Manage your personal account settings and profile details.</p>
        </div>
    </div>

    {#if loading}
        <div class="loading">Loading...</div>
    {:else}
        <div class="card">
            <div class="card-header">
                <div class="avatar">{getInitials(user.firstName, user.lastName).toUpperCase()}</div>
                <div class="user-info">
                    <h3>{user.username}</h3>
                    <div class="badges">
                        <span class="badge role">{user.role}</span>
                        <span class="badge auth">{user.authMethod === 'kku_sso' ? 'KKU SSO' : 'Local'}</span>
                        <span class="badge status" class:active={user.status === 'Active'}>{user.status}</span>
                    </div>
                </div>
            </div>
            <form on:submit|preventDefault={saveProfile} class="card-body">
                <div class="form-group">
                    <label for="firstName">First Name *</label>
                    <input type="text" id="firstName" bind:value={user.firstName} required />
                </div>
                <div class="form-group">
                    <label for="lastName">Last Name *</label>
                    <input type="text" id="lastName" bind:value={user.lastName} required />
                </div>
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" bind:value={user.email} />
                </div>
                <div class="form-actions">
                    <button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
            </form>
        </div>
    {/if}
</div>

<style>
    .profile-page {
        padding: 20px;
        color: var(--text-primary);
    }
    .card {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 8px;
        max-width: 600px;
        margin-top: 20px;
    }
    .card-header {
        display: flex;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border);
        background: var(--bg-secondary);
        border-radius: 8px 8px 0 0;
    }
    .avatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        font-weight: bold;
        margin-right: 20px;
    }
    .user-info h3 {
        margin: 0 0 10px 0;
    }
    .badges {
        display: flex;
        gap: 10px;
    }
    .badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: bold;
    }
    .role { background: #8b5cf6; color: white; }
    .auth { background: #f59e0b; color: white; }
    .status { background: #ef4444; color: white; }
    .status.active { background: #10b981; }
    .card-body {
        padding: 20px;
    }
    .form-group {
        margin-bottom: 15px;
    }
    label {
        display: block;
        margin-bottom: 5px;
        color: var(--text-secondary);
    }
    input {
        width: 100%;
        padding: 10px;
        background: var(--bg-app);
        border: 1px solid var(--border);
        color: var(--text-primary);
        border-radius: 4px;
        box-sizing: border-box;
    }
    .form-actions {
        margin-top: 20px;
        text-align: right;
    }
    button {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    button:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }
</style>
