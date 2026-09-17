<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let isLoading = true;
  let error = '';
  let countdown = 5;
  let countdownInterval: ReturnType<typeof setInterval>;

  onMount(async () => {
    const code = $page.url.searchParams.get('code');

    if (!code) {
      error = 'ไม่พบ Authorization Code กรุณาลองใหม่อีกครั้ง';
      isLoading = false;
      startCountdown();
      return;
    }

    try {
      const res = await fetch('/api/auth/sso/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      if (res.ok) {
        const data = await res.json();
        
        if (data.stage === 'verify') {
          // Enforce local 2FA: backend already set pre_auth_token cookie
          window.location.href = '/?verify=true';
        } else {
          localStorage.setItem('token', data.access_token);
          localStorage.setItem('role', data.role);
          if (data.username) localStorage.setItem('username', data.username);
          window.location.href = '/dashboard';
        }
      } else {
        const errData = await res.json();
        // Check if this is an "unauthorized" error (not whitelisted)
        error = errData.message || 'SSO Authentication failed';
        isLoading = false;
        startCountdown();
      }
    } catch (err) {
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง';
      isLoading = false;
      startCountdown();
    }
  });

  function startCountdown() {
    countdownInterval = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        window.location.href = '/';
      }
    }, 1000);
  }

  function goBack() {
    clearInterval(countdownInterval);
    window.location.href = '/';
  }
</script>

<svelte:head>
  <title>KKUSIEM</title>
</svelte:head>

<div class="login-wrapper">
  <div class="login-box" style="max-width: 420px; text-align: center;">
    <div class="brand">
      <div class="logo"><i class="ti ti-shield-lock"></i></div>
      <h1>KKUSIEM <span>3.0</span></h1>
    </div>

    {#if isLoading}
      <!-- Loading State -->
      <div style="margin: 30px 0;">
        <div class="spinner" style="width: 40px; height: 40px; border-width: 4px; border-top-color: var(--primary); margin: 0 auto 20px;"></div>
        <h3 style="color: var(--text-primary); font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">กำลังตรวจสอบตัวตน</h3>
        <p style="color: var(--text-muted); font-size: 14px; margin: 0;">กำลังเชื่อมต่อกับ KKU SSO กรุณารอสักครู่...</p>
      </div>
    {:else if error}
      <!-- Error State -->
      <div style="margin: 20px 0;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #ef4444; font-size: 32px;">
          <i class="ti ti-shield-x"></i>
        </div>
        <h3 style="color: #ef4444; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">ไม่ได้รับอนุญาต</h3>
        <div class="alert error" style="text-align: left; margin-bottom: 24px;">
          <i class="ti ti-alert-triangle"></i> {error}
        </div>
        
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">
          ระบบจะพากลับหน้าเข้าสู่ระบบใน <strong style="color: var(--text-primary);">{countdown}</strong> วินาที
        </p>

        <button class="btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;" on:click={goBack}>
          <i class="ti ti-arrow-left"></i> กลับหน้าเข้าสู่ระบบทันที
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body) { margin: 0; padding: 0; }
  .login-wrapper {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    padding: 20px;
    font-family: var(--font-sans, 'Inter', sans-serif);
  }
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

  .alert {
    padding: 12px 16px; border-radius: 8px; font-size: 14px; display: flex; align-items: center; gap: 8px; margin-bottom: 24px;
  }
  .alert.error { background: rgba(239,68,68,0.1); color: var(--red, #ef4444); border: 1px solid rgba(239,68,68,0.2); }

  .btn-secondary {
    width: 100%; padding: 12px; background: transparent; color: var(--text-secondary); border: 1px solid var(--border); border-radius: 8px;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: 0.2s; margin-top: 12px;
  }
  .btn-secondary:hover { background: var(--bg-hover); color: var(--text-primary); }

  .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 768px) {
    .login-box { padding: 20px; }
  }
</style>
