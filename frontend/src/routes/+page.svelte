<script lang="ts">
  import { onMount } from 'svelte';

  // ── State ──────────────────────────────────────────────
  let username = '';
  let password = '';
  let error = '';
  let isSessionExpired = false;
  let isLoading = false;
  let showPassword = false;
  let currentTheme = 'dark';

  // 2FA State Machine: 'login' | 'verify'
  type AuthStage = 'login' | 'verify';
  let authStage: AuthStage = 'login';

  // 2FA data
  let totpCode = '';

  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
  }

  // ── Step 1: Login with username/password ───────────────
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
          // User has MFA enabled
          authStage = 'verify';
          totpCode = '';
        } else {
          // Normal login without MFA
          finalizeLogin(data);
        }
      } else {
        error = data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      }
    } catch (err) {
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง';
    } finally {
      isLoading = false;
    }
  }

  // ── Step 2: Verify TOTP (if required) ────────────────────
  async function handleVerify() {
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
        error = data.message || 'รหัส 2FA ไม่ถูกต้อง';
      }
    } catch {
      error = 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    } finally {
      isLoading = false;
    }
  }

  function finalizeLogin(data: any) {
    if (data.access_token) {
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('role', data.role);
      if (data.username) localStorage.setItem('username', data.username);
      window.location.href = '/dashboard';
    }
  }

  function goBackToLogin() {
    authStage = 'login';
    totpCode = '';
    error = '';
  }

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === 'true') {
      isSessionExpired = true;
      window.history.replaceState({}, document.title, '/');
    } else if (urlParams.get('verify') === 'true') {
      authStage = 'verify';
      window.history.replaceState({}, document.title, '/');
    }

    if (localStorage.getItem('token')) {
      window.location.href = '/dashboard';
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      currentTheme = savedTheme;
    } else {
      currentTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', currentTheme);
  });
</script>

<svelte:head>
  <title>KKUSIEM</title>
</svelte:head>

<div class="theme-toggle" on:click={toggleTheme} title={currentTheme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'}>
  <i class="ti {currentTheme === 'dark' ? 'ti-sun' : 'ti-moon'}"></i>
</div>

{#if isSessionExpired}
  <div class="expired-overlay">
    <div class="expired-modal">
      <div class="expired-icon"><i class="ti ti-time-duration-off"></i></div>
      <div class="expired-title">เซสชันหมดอายุ</div>
      <div class="expired-desc">เซสชันของคุณหมดอายุเนื่องจากไม่มีการใช้งาน กรุณาเข้าสู่ระบบใหม่เพื่อใช้งานต่อ</div>
      <button class="btn-expired-ok" on:click={() => isSessionExpired = false}>ตกลง</button>
    </div>
  </div>
{/if}

<div class="login-bg">
  <!-- Animated background grid -->
  <div class="grid-overlay"></div>
  <!-- Glow blobs -->
  <div class="blob blob-1"></div>
  <div class="blob blob-2"></div>

  <div class="login-card">
    <!-- Logo + Title -->
    <div class="login-header">
      <div class="logo-ring">
        <i class="ti ti-radar"></i>
      </div>
      <div class="login-brand">KKUSIEM</div>
      <div class="login-subtitle">KKUSIEM Dashboard — Enterprise PoC</div>
    </div>

    <!-- Error message -->
    {#if error}
      <div class="error-box">
        <i class="ti ti-alert-circle"></i>
        <span>{error}</span>
      </div>
    {/if}

    <!-- ══════════════════════════════════════════════════════ -->
    <!-- STAGE: Login (Username + Password)                      -->
    <!-- ══════════════════════════════════════════════════════ -->
    {#if authStage === 'login'}
      <form on:submit|preventDefault={handleLogin} class="login-form">
        <div class="field-group">
          <label class="field-label" for="username">ชื่อผู้ใช้งาน</label>
          <div class="field-wrap">
            <i class="ti ti-user field-icon"></i>
            <input
              id="username"
              type="text"
              bind:value={username}
              class="field-input"
              placeholder="กรอกชื่อผู้ใช้งาน"
              autocomplete="username"
              required
            />
          </div>
        </div>

        <div class="field-group">
          <label class="field-label" for="password-text">รหัสผ่าน</label>
          <div class="field-wrap">
            <i class="ti ti-lock field-icon"></i>
            {#if showPassword}
              <input
                id="password-text"
                type="text"
                bind:value={password}
                class="field-input"
                placeholder="กรอกรหัสผ่าน"
                autocomplete="current-password"
                required
              />
            {:else}
              <input
                id="password-hidden"
                type="password"
                bind:value={password}
                class="field-input"
                placeholder="กรอกรหัสผ่าน"
                autocomplete="current-password"
                required
              />
            {/if}
            <button
              type="button"
              class="field-toggle"
              on:click={() => (showPassword = !showPassword)}
              title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            >
              <i class="ti {showPassword ? 'ti-eye-off' : 'ti-eye'}"></i>
            </button>
          </div>
        </div>

        <button type="submit" class="btn-login" disabled={isLoading}>
          {#if isLoading}
            <span class="spinner"></span>
            <span>กำลังตรวจสอบ...</span>
          {:else}
            <i class="ti ti-login"></i>
            <span>เข้าสู่ระบบ</span>
          {/if}
        </button>
      </form>

      <!-- SSO Divider -->
      <div class="sso-divider"><span>Or continue with</span></div>
      <a href="/api/auth/sso/login" class="btn-sso">
        <i class="ti ti-login"></i>
        <span>KKU SSO</span>
      </a>
      <div class="sso-hint">Authorized personnel only</div>

    {:else if authStage === 'verify'}
      <div class="mfa-section">
        <div class="mfa-icon-ring">
          <i class="ti ti-device-mobile"></i>
        </div>
        <div class="mfa-title">ยืนยัน 2-Factor Authentication</div>
        <p class="mfa-desc">กรอกรหัส 6 หลักจากแอป Authenticator หรือ Backup Code เพื่อเข้าสู่ระบบ</p>

        <form on:submit|preventDefault={handleVerify} class="login-form">
          <div class="field-group">
            <div class="field-wrap">
              <i class="ti ti-shield-lock field-icon"></i>
              <input
                type="text"
                bind:value={totpCode}
                class="field-input totp-input"
                placeholder="000 000"
                maxlength="10"
                inputmode="numeric"
                autocomplete="one-time-code"
                required
              />
            </div>
          </div>
          <button type="submit" class="btn-login" disabled={isLoading || totpCode.length < 6}>
            {#if isLoading}<span class="spinner"></span>{/if}
            <i class="ti ti-shield-check"></i> ยืนยันรหัส
          </button>
        </form>
        <button class="btn-back" on:click={goBackToLogin}>
          <i class="ti ti-arrow-left"></i> กลับหน้าเข้าสู่ระบบ
        </button>
      </div>
    {/if}

    <!-- Footer (always shown) -->
    <div class="login-footer">
      <i class="ti ti-shield-lock"></i>
      Khon Kaen University · Security Operations Center
    </div>
  </div>
</div>

<style>
  :global(body) { margin: 0; font-family: 'Inter', sans-serif; background: #050a14; overflow: hidden; }
  
  .login-bg {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
  }
  
  /* Cyberpunk Grid Background */
  .grid-overlay {
    position: absolute;
    top: -50%; left: -50%; right: -50%; bottom: -50%;
    background-image: 
      linear-gradient(rgba(0, 212, 255, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 212, 255, 0.1) 1px, transparent 1px);
    background-size: 50px 50px;
    transform: perspective(500px) rotateX(60deg);
    animation: gridMove 20s linear infinite;
    z-index: -2;
  }
  @keyframes gridMove {
    0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
    100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
  }

  /* Glowing Orbs */
  .blob { position: absolute; border-radius: 50%; filter: blur(80px); z-index: -1; opacity: 0.5; animation: float 10s infinite alternate; }
  .blob-1 { width: 400px; height: 400px; background: rgba(0, 212, 255, 0.4); top: 10%; left: 20%; }
  .blob-2 { width: 300px; height: 300px; background: rgba(168, 85, 247, 0.4); bottom: 10%; right: 20%; animation-delay: -5s; }
  @keyframes float { 0% { transform: translateY(0) scale(1); } 100% { transform: translateY(-30px) scale(1.1); } }

  /* Login Card - Glassmorphism */
  .login-card {
    background: rgba(10, 15, 28, 0.6);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 0 40px rgba(0, 212, 255, 0.1), inset 0 0 20px rgba(0, 212, 255, 0.05);
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .login-card::before {
    content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
    background: linear-gradient(90deg, transparent, #00d4ff, transparent);
  }

  .login-header { text-align: center; margin-bottom: 30px; }
  .logo-ring {
    width: 64px; height: 64px; margin: 0 auto 15px; border-radius: 50%;
    background: rgba(0, 212, 255, 0.1); border: 2px solid #00d4ff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
  }
  .logo-ring i { font-size: 32px; color: #00d4ff; }
  .login-brand { font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 800; letter-spacing: 2px; margin-bottom: 5px; text-shadow: 0 0 10px rgba(0,212,255,0.5); }
  .login-subtitle { font-size: 13px; color: #94a3b8; }

  .field-group { margin-bottom: 20px; }
  .field-label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 8px; font-weight: 600; }
  .field-wrap { position: relative; }
  .field-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #00d4ff; font-size: 18px; }
  .field-input {
    width: 100%; padding: 12px 14px 12px 42px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; color: #fff; font-size: 15px; outline: none; transition: 0.3s; box-sizing: border-box;
  }
  .field-input:focus { border-color: #00d4ff; box-shadow: 0 0 15px rgba(0,212,255,0.2); background: rgba(0,0,0,0.5); }

  .btn-submit, .btn-login {
    width: 100%; padding: 14px; background: linear-gradient(135deg, #00d4ff, #0088ff); color: #000;
    border: none; border-radius: 8px; font-size: 15px; font-weight: 800; cursor: pointer; transition: 0.2s;
    font-family: 'Orbitron', sans-serif; letter-spacing: 1px; margin-top: 10px;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .btn-submit:hover, .btn-login:hover:not([disabled]) { filter: brightness(1.2); box-shadow: 0 0 20px rgba(0,212,255,0.5); transform: translateY(-2px); }
  .btn-submit[disabled], .btn-login[disabled] { opacity: 0.6; cursor: not-allowed; }
  
  .error-box { background: rgba(239,68,68,0.1); border: 1px solid #ef4444; color: #ef4444; padding: 12px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  
  /* Utilities */
  .theme-toggle { position: absolute; top: 20px; right: 20px; color: #94a3b8; cursor: pointer; font-size: 24px; z-index: 10; }
  .theme-toggle:hover { color: #fff; }


  .sso-divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 24px 0 16px;
    color: var(--log-text-muted);
    font-size: 12px;
  }
  .sso-divider::before,
  .sso-divider::after {
    content: '';
    flex: 1;
    border-bottom: 1px solid var(--log-input-border);
  }
  .sso-divider span {
    padding: 0 12px;
  }
  
  .btn-sso {
    width: 100%;
    padding: 13px;
    background: #93c5fd; /* Light blue representing SSO */
    color: #1e3a8a;
    font-size: 14px;
    font-weight: 700;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.2s;
    text-decoration: none;
  }
  .btn-sso:hover {
    background: #bfdbfe;
    transform: translateY(-1px);
  }
  .sso-hint {
    text-align: center;
    font-size: 11px;
    color: var(--log-text-muted);
    margin-top: 8px;
  }

  /* ── Spinner ─────────────────────────────────────────────────── */
  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Footer ──────────────────────────────────────────────────── */
  .login-footer {
    text-align: center;
    margin-top: 24px;
    font-size: 11px;
    color: var(--log-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .login-footer i { font-size: 13px; color: #1d9e75; opacity: 0.7; }

  /* ── 2FA: MFA Section Wrapper ─────────────────────────────────── */
  .mfa-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    width: 100%;
    animation: fadeIn 0.3s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

  .mfa-icon-ring {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--log-ring-bg);
    box-shadow: 0 0 0 8px var(--log-btn-shadow);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #1d9e75;
    margin-bottom: 4px;
  }
  .mfa-icon-ring.success { color: #22c55e; box-shadow: 0 0 0 8px rgba(34,197,94,0.15); }

  .mfa-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--log-text-primary);
    text-align: center;
  }
  .mfa-desc {
    font-size: 13px;
    color: var(--log-text-muted);
    text-align: center;
    line-height: 1.6;
    margin: 0;
  }
  .mfa-desc.backup-warning { color: #f59e0b; }
  .mfa-desc strong { color: var(--log-text-primary); }

  /* ── 2FA: QR Code ─────────────────────────────────────────────── */
  .qr-wrapper {
    padding: 12px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
  }
  .qr-image {
    display: block;
    width: 180px;
    height: 180px;
    border-radius: 4px;
  }
  .qr-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--log-text-muted);
    padding: 20px;
  }

  /* ── 2FA: Manual Secret ───────────────────────────────────────── */
  .manual-secret {
    width: 100%;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 10px 14px;
    text-align: center;
  }
  .manual-secret-label {
    font-size: 11px;
    color: var(--log-text-muted);
    margin-bottom: 4px;
  }
  .manual-secret-value {
    font-family: 'Courier New', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #1d9e75;
    letter-spacing: 0.08em;
    word-break: break-all;
  }
  .mfa-divider {
    width: 100%;
    height: 1px;
    background: rgba(255,255,255,0.07);
  }
  .mfa-code-label {
    font-size: 12px;
    color: var(--log-text-muted);
    margin: 0;
    text-align: center;
  }

  /* ── 2FA: TOTP Input (large centered digits) ──────────────────── */
  .totp-input {
    letter-spacing: 0.25em;
    font-size: 22px;
    font-weight: 700;
    text-align: center;
  }

  /* ── 2FA: Backup Codes Grid ───────────────────────────────────── */
  .backup-codes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }
  .backup-code {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 10px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #e8eaf0;
    text-align: center;
    letter-spacing: 0.05em;
    transition: background 0.2s;
  }
  .backup-code:hover { background: rgba(255,255,255,0.08); }

  /* ── 2FA: Copy Button ─────────────────────────────────────────── */
  .btn-copy {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(29,158,117,0.4);
    background: rgba(29,158,117,0.08);
    color: #1d9e75;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-copy:hover { background: rgba(29,158,117,0.16); }

  /* ── 2FA: Back Button ─────────────────────────────────────────── */
  .btn-back {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    border: none;
    background: transparent;
    color: var(--log-text-muted);
    border-radius: 10px;
    font-size: 13px;
    cursor: pointer;
    transition: color 0.2s;
    margin-top: 4px;
  }
  .btn-back:hover { color: var(--log-text-primary); }
</style>
