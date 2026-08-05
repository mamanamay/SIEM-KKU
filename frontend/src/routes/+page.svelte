<script lang="ts">
  import { onMount } from 'svelte';

  let username = '';
  let password = '';
  let error = '';
  let isSessionExpired = false;
  let isLoading = false;
  let showPassword = false;
  let currentTheme = 'dark';

  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
  }

  async function handleLogin() {
    error = '';
    isLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('role', data.role);
        window.location.href = '/dashboard';
      } else {
        error = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      }
    } catch (err) {
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง';
    } finally {
      isLoading = false;
    }
  }

  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('expired') === 'true') {
      isSessionExpired = true;
      window.history.replaceState({}, document.title, "/");
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

    <!-- Form -->
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
            on:click={() => showPassword = !showPassword}
            title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          >
            <i class="ti {showPassword ? 'ti-eye-off' : 'ti-eye'}"></i>
          </button>
        </div>
      </div>

      <button type="submit" class="btn-login" disabled={isLoading}>
        {#if isLoading}
          <span class="spinner"></span>
          <span>กำลังเข้าสู่ระบบ...</span>
        {:else}
          <i class="ti ti-login"></i>
          <span>เข้าสู่ระบบ</span>
        {/if}
      </button>
    </form>

    <!-- SSO Divider -->
    <div class="sso-divider">
      <span>Or continue with</span>
    </div>

    <!-- SSO Button -->
    <a href="/api/auth/sso/login" class="btn-sso">
      <i class="ti ti-login"></i>
      <span>KKU SSO</span>
    </a>
    <div class="sso-hint">Authorized personnel only</div>

    <!-- Footer -->
    <div class="login-footer">
      <i class="ti ti-shield-lock"></i>
      Khon Kaen University · Security Operations Center
    </div>
  </div>
</div>

<style>
  :global(:root) {
    --log-bg-grad: linear-gradient(135deg, #0f1117 0%, #0a1628 50%, #0f1117 100%);
    --log-card: rgba(24, 27, 36, 0.9);
    --log-card-border: rgba(255,255,255,0.08);
    --log-card-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(29,158,117,0.1);
    --log-text-primary: #e8eaf0;
    --log-text-muted: #5a6478;
    --log-input-bg: rgba(255,255,255,0.04);
    --log-input-border: rgba(255,255,255,0.1);
    --log-input-ph: #3d4558;
    --log-blob1: rgba(29,158,117,0.12);
    --log-blob2: rgba(24,95,165,0.1);
    --log-grid: rgba(29,158,117,0.06);
    --log-ring-bg: linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05));
    --log-ring-shadow: rgba(29,158,117,0.2);
    --log-btn-grad: linear-gradient(135deg, #1d9e75, #168a62);
    --log-btn-shadow: rgba(29,158,117,0.3);
    
    --exp-bg: rgba(24, 27, 36, 0.95);
    --exp-text: #e8eaf0;
    --exp-border: rgba(255,255,255,0.1);
  }
  :global([data-theme="light"]) {
    --log-bg-grad: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 50%, #f0f4f8 100%);
    --log-card: rgba(255, 255, 255, 0.95);
    --log-card-border: rgba(0,0,0,0.08);
    --log-card-shadow: 0 24px 64px rgba(0,0,0,0.05), 0 0 0 1px rgba(29,158,117,0.1);
    --log-text-primary: #1f2937;
    --log-text-muted: #6b7280;
    --log-input-bg: rgba(0,0,0,0.03);
    --log-input-border: rgba(0,0,0,0.15);
    --log-input-ph: #9ca3af;
    --log-blob1: rgba(29,158,117,0.1);
    --log-blob2: rgba(24,95,165,0.08);
    --log-grid: rgba(29,158,117,0.08);
    --log-ring-bg: linear-gradient(135deg, rgba(29,158,117,0.1), rgba(29,158,117,0.02));
    --log-ring-shadow: rgba(29,158,117,0.15);
    --log-btn-grad: linear-gradient(135deg, #1d9e75, #168a62);
    --log-btn-shadow: rgba(29,158,117,0.25);
    
    --exp-bg: rgba(255, 255, 255, 0.98);
    --exp-text: #1f2937;
    --exp-border: rgba(0,0,0,0.1);
  }


  :global(input[type="password"]::-ms-reveal),
  :global(input[type="password"]::-ms-clear) {
    display: none;
  }

  /* ── Theme Toggle ────────────────────────────────────────────── */
  .theme-toggle {
    position: absolute;
    top: 24px;
    right: 24px;
    z-index: 100;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--log-input-bg);
    border: 1px solid var(--log-input-border);
    color: var(--log-text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .theme-toggle:hover {
    transform: scale(1.05);
    background: var(--log-card-border);
  }

  /* ── Expired Modal ───────────────────────────────────────────── */
  .expired-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.3s ease-out;
  }
  .expired-modal {
    background: var(--exp-bg);
    border: 1px solid var(--exp-border);
    border-radius: 16px;
    padding: 32px;
    width: 100%;
    max-width: 380px;
    text-align: center;
    box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .expired-icon {
    width: 64px;
    height: 64px;
    margin: 0 auto 16px;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
  }
  .expired-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--exp-text);
    margin-bottom: 12px;
  }
  .expired-desc {
    font-size: 14px;
    color: var(--log-text-muted);
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .btn-expired-ok {
    width: 100%;
    padding: 12px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-expired-ok:hover {
    background: #dc2626;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }

  /* ── Background ──────────────────────────────────────────────── */
  .login-bg {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--log-bg-grad);
    position: relative;
    overflow: hidden;
    padding: 24px;
    transition: background 0.3s;
  }

  .grid-overlay {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(var(--log-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--log-grid) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
    animation: blobFloat 8s ease-in-out infinite;
  }
  .blob-1 {
    width: 400px; height: 400px;
    background: var(--log-blob1);
    top: -100px; left: -100px;
    animation-delay: 0s;
  }
  .blob-2 {
    width: 300px; height: 300px;
    background: var(--log-blob2);
    bottom: -80px; right: -80px;
    animation-delay: 4s;
  }
  @keyframes blobFloat {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50%       { transform: translate(20px, -20px) scale(1.05); }
  }

  /* ── Card ────────────────────────────────────────────────────── */
  .login-card {
    position: relative;
    z-index: 10;
    width: 100%;
    max-width: 420px;
    background: var(--log-card);
    border: 1px solid var(--log-card-border);
    border-radius: 20px;
    padding: 40px 36px 32px;
    box-shadow: var(--log-card-shadow);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    transition: all 0.3s;
  }

  /* ── Header ──────────────────────────────────────────────────── */
  .login-header {
    text-align: center;
    margin-bottom: 28px;
  }

  .logo-ring {
    width: 64px;
    height: 64px;
    margin: 0 auto 14px;
    background: var(--log-ring-bg);
    border: 2px solid rgba(29,158,117,0.4);
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #1d9e75;
    box-shadow: 0 0 24px var(--log-ring-shadow);
    animation: logoGlow 3s ease-in-out infinite alternate;
  }
  @keyframes logoGlow {
    from { box-shadow: 0 0 16px rgba(29,158,117,0.15); }
    to   { box-shadow: 0 0 32px rgba(29,158,117,0.35); }
  }

  .login-brand {
    font-size: 22px;
    font-weight: 700;
    color: var(--log-text-primary);
    letter-spacing: 0.08em;
  }

  .login-subtitle {
    font-size: 12px;
    color: var(--log-text-muted);
    margin-top: 4px;
    letter-spacing: 0.01em;
  }

  /* ── Error box ───────────────────────────────────────────────── */
  .error-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(163,45,45,0.15);
    border: 1px solid rgba(163,45,45,0.35);
    border-radius: 10px;
    padding: 10px 14px;
    color: #ef4444;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 18px;
    animation: shakeX 0.4s ease;
  }
  .error-box i { font-size: 16px; flex-shrink: 0; }

  @keyframes shakeX {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-6px); }
    40%     { transform: translateX(6px); }
    60%     { transform: translateX(-4px); }
    80%     { transform: translateX(4px); }
  }

  /* ── Form ────────────────────────────────────────────────────── */
  .login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--log-text-muted);
    letter-spacing: 0.01em;
  }

  .field-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .field-icon {
    position: absolute;
    left: 13px;
    color: var(--log-text-muted);
    font-size: 17px;
    pointer-events: none;
    z-index: 1;
  }

  .field-input {
    width: 100%;
    padding: 12px 44px 12px 40px;
    background: var(--log-input-bg);
    border: 1px solid var(--log-input-border);
    border-radius: 10px;
    font-size: 14px;
    color: var(--log-text-primary);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
  }
  .field-input::placeholder { color: var(--log-input-ph); }
  .field-input:focus {
    border-color: rgba(29,158,117,0.5);
    background: rgba(29,158,117,0.05);
    box-shadow: 0 0 0 3px rgba(29,158,117,0.1);
  }

  .field-toggle {
    position: absolute;
    right: 11px;
    background: none;
    border: none;
    color: var(--log-text-muted);
    cursor: pointer;
    font-size: 17px;
    padding: 4px;
    border-radius: 6px;
    transition: color 0.2s;
    display: flex;
    align-items: center;
  }
  .field-toggle:hover { color: var(--log-text-primary); }

  /* ── Login Button ────────────────────────────────────────────── */
  .btn-login {
    width: 100%;
    padding: 13px;
    margin-top: 4px;
    background: var(--log-btn-grad);
    color: #fff;
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
    box-shadow: 0 4px 16px var(--log-btn-shadow);
    letter-spacing: 0.02em;
  }
  .btn-login i { font-size: 18px; }
  .btn-login:hover:not([disabled]) {
    filter: brightness(1.1);
    box-shadow: 0 6px 24px rgba(29,158,117,0.45);
    transform: translateY(-1px);
  }
  .btn-login:active:not([disabled]) { transform: translateY(0); }
  .btn-login[disabled] { opacity: 0.6; cursor: not-allowed; }

  /* ── SSO Button ─────────────────────────────────────────────── */
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
</style>
