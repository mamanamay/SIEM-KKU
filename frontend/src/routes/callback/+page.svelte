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
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('role', data.role);
        window.location.href = '/dashboard';
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

<div class="cb-wrap">
  <div class="cb-card">
    <!-- Logo -->
    <div class="cb-logo">
      <i class="ti ti-radar"></i>
    </div>
    <div class="cb-brand">KKUSIEM</div>

    {#if isLoading}
      <!-- Loading State -->
      <div class="spinner"></div>
      <div class="cb-title">กำลังตรวจสอบตัวตน</div>
      <div class="cb-sub">กำลังเชื่อมต่อกับ KKU SSO กรุณารอสักครู่...</div>
      <div class="step-dots">
        <span class="dot active"></span>
        <span class="dot active"></span>
        <span class="dot pulse"></span>
      </div>
    {:else if error}
      <!-- Error State — Not Whitelisted or Other Error -->
      <div class="err-icon">
        <i class="ti ti-shield-x"></i>
      </div>
      <div class="cb-title err">ไม่ได้รับอนุญาต</div>
      <div class="err-box">
        <i class="ti ti-alert-circle"></i>
        <span>{error}</span>
      </div>
      <div class="cb-sub">
        ระบบจะพากลับหน้าเข้าสู่ระบบใน <strong class="countdown">{countdown}</strong> วินาที
      </div>
      <div class="cb-actions">
        <button class="btn-back" on:click={goBack}>
          <i class="ti ti-arrow-left"></i> กลับหน้าเข้าสู่ระบบทันที
        </button>
      </div>
      <div class="contact-hint">
        <i class="ti ti-info-circle"></i>
        หากคุณเชื่อว่าควรได้รับสิทธิ์ กรุณาติดต่อผู้ดูแลระบบเพื่อให้เพิ่มบัญชีให้คุณ
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body) { margin: 0; padding: 0; }

  .cb-wrap {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0f1117 0%, #0a1628 50%, #0f1117 100%);
    font-family: 'Inter', 'Noto Sans Thai', sans-serif;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }
  .cb-wrap::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(29,158,117,0.04) 1px, transparent 1px),
      linear-gradient(90deg, rgba(29,158,117,0.04) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
  }

  .cb-card {
    position: relative;
    z-index: 10;
    background: rgba(24,27,36,0.92);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 44px 40px 36px;
    max-width: 420px;
    width: 100%;
    text-align: center;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 24px 64px rgba(0,0,0,0.5);
  }

  .cb-logo {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(29,158,117,0.2), rgba(29,158,117,0.05));
    border: 2px solid rgba(29,158,117,0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #1d9e75;
    margin: 0 auto 10px;
    box-shadow: 0 0 24px rgba(29,158,117,0.2);
    animation: logoGlow 3s ease-in-out infinite alternate;
  }
  @keyframes logoGlow {
    from { box-shadow: 0 0 16px rgba(29,158,117,0.1); }
    to   { box-shadow: 0 0 32px rgba(29,158,117,0.35); }
  }

  .cb-brand {
    font-size: 16px;
    font-weight: 800;
    color: #e8eaf0;
    letter-spacing: 0.1em;
    margin-bottom: 28px;
  }

  /* ── Spinner ── */
  .spinner {
    width: 52px;
    height: 52px;
    border: 4px solid rgba(29,158,117,0.2);
    border-top-color: #1d9e75;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
    margin: 0 auto 20px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .cb-title {
    font-size: 20px;
    font-weight: 700;
    color: #e8eaf0;
    margin-bottom: 8px;
  }
  .cb-title.err { color: #ef4444; }

  .cb-sub {
    font-size: 13px;
    color: #5a6478;
    line-height: 1.6;
    margin-bottom: 20px;
  }

  /* ── Step Dots ── */
  .step-dots {
    display: flex;
    gap: 8px;
    justify-content: center;
    margin-top: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(29,158,117,0.3);
    transition: background 0.3s;
  }
  .dot.active { background: #1d9e75; }
  .dot.pulse {
    background: #1d9e75;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.4; transform: scale(0.8); }
  }

  /* ── Error State ── */
  .err-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(239,68,68,0.1);
    border: 2px solid rgba(239,68,68,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 30px;
    color: #ef4444;
    margin: 0 auto 20px;
    animation: errShake 0.5s ease-out;
  }
  @keyframes errShake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-8px); }
    40%     { transform: translateX(8px); }
    60%     { transform: translateX(-5px); }
    80%     { transform: translateX(5px); }
  }

  .err-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    background: rgba(239,68,68,0.08);
    border: 1px solid rgba(239,68,68,0.25);
    border-radius: 12px;
    padding: 12px 16px;
    text-align: left;
    font-size: 13px;
    color: #fca5a5;
    line-height: 1.5;
    margin-bottom: 16px;
  }
  .err-box i { font-size: 16px; color: #ef4444; flex-shrink: 0; margin-top: 1px; }

  .countdown {
    color: #ef4444;
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }

  .cb-actions {
    margin-top: 8px;
    margin-bottom: 16px;
  }

  .btn-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 24px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    color: #e8eaf0;
    font-size: 13px;
    font-weight: 600;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }
  .btn-back:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.2);
  }

  .contact-hint {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 11px;
    color: #3d4558;
    line-height: 1.5;
    text-align: left;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 8px;
    padding: 10px 12px;
  }
  .contact-hint i { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
</style>
