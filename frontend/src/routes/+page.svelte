<script lang="ts">
  import { onMount } from 'svelte';
  import { themeStore } from '../stores/theme';

  let username = '';
  let password = '';
  let error = '';

  function toggleTheme() {
    $themeStore = $themeStore === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', $themeStore);
    localStorage.setItem('theme', $themeStore);
  }
  let isSessionExpired = false;
  let isLoading = false;
  let showPassword = false;

  type AuthStage = 'login' | 'verify';
  let authStage: AuthStage = 'login';
  let totpCode = '';

  let newPassword = '';
  let confirmPassword = '';
  let tempToken = '';
  let tempRole = '';
  let tempUsername = '';

  function finalizeLogin(data: any) {
    if (data.requirePasswordChange) {
      tempToken = data.access_token;
      tempRole = data.role;
      tempUsername = data.username;
      authStage = 'reset_password' as any;
      return;
    }
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('role', data.role);
    localStorage.setItem('username', data.username);
    localStorage.setItem('lastActive', Date.now().toString());
    window.location.href = '/dashboard';
  }

  async function handleForceReset() {
    if (newPassword !== confirmPassword) {
      error = "รหัสผ่านไม่ตรงกัน";
      return;
    }
    if (newPassword.length < 12) {
      error = "รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร";
      return;
    }
    isLoading = true;
    error = '';
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tempToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ currentPassword: password, newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', tempToken);
        localStorage.setItem('role', tempRole);
        localStorage.setItem('username', tempUsername);
        localStorage.setItem('lastActive', Date.now().toString());
        window.location.href = '/dashboard';
      } else {
        error = data.message || "เปลี่ยนรหัสผ่านไม่สำเร็จ";
      }
    } catch {
      error = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้";
    }
    isLoading = false;
  }

  async function handleLogin() {
    error = '';
    isLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.stage === 'verify') {
          authStage = 'verify';
          totpCode = '';
        } else {
          finalizeLogin(data);
        }
      } else {
        error = data.message || 'Login failed';
      }
    } catch (err) {
      error = 'Cannot connect to server';
    }
    isLoading = false;
  }

  async function handleVerify2FA() {
    error = '';
    isLoading = true;
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode.replace(/\s+/g, '') })
      });
      const data = await res.json();
      if (res.ok) {
        finalizeLogin(data);
      } else {
        error = data.message || 'Invalid 2FA code';
        totpCode = '';
      }
    } catch (err) {
      error = 'Cannot connect to server';
    }
    isLoading = false;
  }

  function goBackToLogin() {
    authStage = 'login';
    totpCode = '';
    error = '';
  }

  onMount(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) { $themeStore = savedTheme; } else { $themeStore = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    document.documentElement.setAttribute('data-theme', $themeStore);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === 'true') {
      isSessionExpired = true;
      window.history.replaceState({}, document.title, '/');
    }
    if (urlParams.get('token')) {
      // SSO redirect logic handled in login
    }
  });
</script>

<div class="login-wrapper">
  <div class="theme-toggle">
    <button class="btn-icon" on:click={() => toggleTheme()}>
      {#if $themeStore === 'dark'}
        <i class="ti ti-sun"></i>
      
    {:else if authStage === 'reset_password'}
      <form on:submit|preventDefault={handleForceReset} class="mfa-form">
        <div class="mfa-icon"><i class="ti ti-lock"></i></div>
        <h3>เปลี่ยนรหัสผ่านครั้งแรก</h3>
        <p>เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่ก่อนเข้าใช้งาน</p>
        
        <div class="form-group">
          <label for="new-pwd">รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร)</label>
          <input type="password" id="new-pwd" bind:value={newPassword} required class="input-totp" style="font-size: 16px; letter-spacing: 2px;" placeholder="รหัสผ่านใหม่" />
        </div>
        <div class="form-group">
          <label for="conf-pwd">ยืนยันรหัสผ่านใหม่</label>
          <input type="password" id="conf-pwd" bind:value={confirmPassword} required class="input-totp" style="font-size: 16px; letter-spacing: 2px;" placeholder="ยืนยันรหัสผ่านใหม่" />
        </div>

        <button type="submit" class="btn-primary" disabled={isLoading || newPassword.length < 12}>
          {#if isLoading}<span class="spinner"></span>{/if}
          ยืนยันการเปลี่ยนรหัสผ่าน
        </button>
        <button type="button" class="btn-secondary" on:click={goBackToLogin}>กลับสู่หน้าล็อคอิน</button>
      </form>

      {:else}
        <i class="ti ti-moon"></i>
      {/if}
    </button>
  </div>

  <div class="login-box">
    <div class="brand">
      <div class="logo"><i class="ti ti-shield-lock"></i></div>
      <h1>KKUSIEM <span>3.0</span></h1>
      <p>Security Information & Event Management</p>
    </div>

    {#if isSessionExpired}
      <div class="alert warning">
        <i class="ti ti-alert-circle"></i> Your session has expired. Please log in again.
      </div>
    {/if}
    {#if error}
      <div class="alert error">
        <i class="ti ti-alert-triangle"></i> {error}
      </div>
    {/if}

    {#if authStage === 'login'}
      <form on:submit|preventDefault={handleLogin}>
        <div class="form-group">
          <label for="username">Username</label>
          <div class="input-wrapper">
            <i class="ti ti-user input-icon"></i>
            <input type="text" id="username" bind:value={username} required autocomplete="username" placeholder="Enter username" />
          </div>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <div class="input-wrapper">
            <i class="ti ti-lock input-icon"></i>
            <input type={showPassword ? 'text' : 'password'} id="password" value={password} on:input={(e) => password = e.target.value} required autocomplete="current-password" placeholder="Enter password" />
            <button type="button" class="btn-toggle-pwd" on:click={() => showPassword = !showPassword}>
              <i class="ti {showPassword ? 'ti-eye-off' : 'ti-eye'}"></i>
            </button>
          </div>
        </div>
        
        <button type="submit" class="btn-primary" disabled={isLoading}>
          {#if isLoading}<span class="spinner"></span>{/if}
          Sign In
        </button>

        <div class="divider"><span>OR</span></div>
        <a href="/api/auth/sso/login" class="btn-sso">
          <i class="ti ti-brand-windows"></i> Login with KKU SSO
        </a>
      </form>
    
    {:else if authStage === 'reset_password'}
      <form on:submit|preventDefault={handleForceReset} class="mfa-form">
        <div class="mfa-icon"><i class="ti ti-lock"></i></div>
        <h3>เปลี่ยนรหัสผ่านครั้งแรก</h3>
        <p>เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่ก่อนเข้าใช้งาน</p>
        
        <div class="form-group">
          <label for="new-pwd">รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร)</label>
          <input type="password" id="new-pwd" bind:value={newPassword} required class="input-totp" style="font-size: 16px; letter-spacing: 2px;" placeholder="รหัสผ่านใหม่" />
        </div>
        <div class="form-group">
          <label for="conf-pwd">ยืนยันรหัสผ่านใหม่</label>
          <input type="password" id="conf-pwd" bind:value={confirmPassword} required class="input-totp" style="font-size: 16px; letter-spacing: 2px;" placeholder="ยืนยันรหัสผ่านใหม่" />
        </div>

        <button type="submit" class="btn-primary" disabled={isLoading || newPassword.length < 12}>
          {#if isLoading}<span class="spinner"></span>{/if}
          ยืนยันการเปลี่ยนรหัสผ่าน
        </button>
        <button type="button" class="btn-secondary" on:click={goBackToLogin}>กลับสู่หน้าล็อคอิน</button>
      </form>

      {:else}
      <form on:submit|preventDefault={handleVerify2FA} class="mfa-form">
        <div class="mfa-icon"><i class="ti ti-shield-check"></i></div>
        <h3>Two-Factor Authentication</h3>
        <p>Enter the 6-digit code from your authenticator app.</p>
        
        <div class="form-group">
          <input type="text" class="input-totp" bind:value={totpCode} placeholder="000 000" maxlength="10" inputmode="numeric" autocomplete="one-time-code" required autofocus />
        </div>

        <button type="submit" class="btn-primary" disabled={isLoading || totpCode.length < 6}>
          {#if isLoading}<span class="spinner"></span>{/if}
          Verify Code
        </button>
        <button type="button" class="btn-secondary" on:click={goBackToLogin}>Back to Login</button>
      </form>
    {/if}
  </div>
</div>

<style>
  .login-wrapper {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    padding: 20px;
    font-family: var(--font-sans, 'Inter', sans-serif);
  }
  .theme-toggle {
    position: absolute;
    top: 24px;
    right: 24px;
  }
  .btn-icon {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: pointer;
    transition: 0.2s;
  }
  .btn-icon:hover { background: var(--bg-hover); color: var(--text-primary); }
  
  .login-box {
    width: 100%;
    max-width: 400px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  }
  .brand { text-align: center; margin-bottom: 32px; }
  .logo { 
    width: 64px; height: 64px; background: rgba(29,158,117,0.1); color: var(--green);
    border-radius: 16px; display: flex; align-items: center; justify-content: center;
    font-size: 32px; margin: 0 auto 16px;
  }
  .brand h1 { font-size: 24px; font-weight: 800; color: var(--text-primary); margin: 0 0 8px; }
  .brand h1 span { color: var(--green); }
  .brand p { font-size: 14px; color: var(--text-muted); margin: 0; }

  .alert {
    padding: 12px 16px; border-radius: 8px; font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 24px;
  }
  .alert.error { background: rgba(239,68,68,0.1); color: var(--red, #ef4444); border: 1px solid rgba(239,68,68,0.2); }
  .alert.warning { background: rgba(245,158,11,0.1); color: #f59e0b; border: 1px solid rgba(245,158,11,0.2); }

  .form-group { margin-bottom: 20px; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
  .input-wrapper { position: relative; }
  .input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 18px; }
  input {
    width: 100%; padding: 12px 12px 12px 42px; background: var(--bg); border: 1px solid var(--border);
    color: var(--text-primary); border-radius: 8px; font-size: 14px; transition: 0.2s;
  }
  input:focus { border-color: var(--green); outline: none; box-shadow: 0 0 0 3px rgba(29,158,117,0.15); }
  
  .btn-toggle-pwd {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none;
    color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 4px;
  }
  .btn-toggle-pwd:hover { color: var(--text-primary); }

  .btn-primary {
    width: 100%; padding: 12px; background: var(--green); color: white; border: none; border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .btn-primary:hover:not(:disabled) { background: #168863; }
  .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
  
  .btn-secondary {
    width: 100%; padding: 12px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; margin-top: 12px;
  }
  .btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); }

  .divider { display: flex; align-items: center; text-align: center; margin: 24px 0; color: var(--text-muted); font-size: 12px; }
  .divider::before, .divider::after { content: ''; flex: 1; border-bottom: 1px solid var(--border); }
  .divider span { padding: 0 12px; }

  .btn-sso {
    display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px;
    background: rgba(59,130,246,0.1); color: #3b82f6; border: 1px solid rgba(59,130,246,0.2); border-radius: 8px;
    font-size: 15px; font-weight: 600; text-decoration: none; transition: 0.2s;
  }
  .btn-sso:hover { background: rgba(59,130,246,0.2); }

  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .mfa-form { text-align: center; }
  .mfa-icon { width: 64px; height: 64px; border-radius: 50%; background: rgba(29,158,117,0.1); color: var(--green); display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; }
  .mfa-form h3 { font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0 0 8px; }
  .mfa-form p { font-size: 14px; color: var(--text-muted); margin: 0 0 24px; }
  .input-totp { text-align: center; font-size: 24px; letter-spacing: 4px; padding: 16px; font-weight: 700; padding-left: 16px; }
@media (max-width: 768px) {
      .login-box { flex-direction: column !important; }
      .login-box > div { padding: 20px !important; }
      .login-box > div:nth-child(2) { width: 100% !important; height: 1px !important; margin: 0 !important; }
    }
</style>




