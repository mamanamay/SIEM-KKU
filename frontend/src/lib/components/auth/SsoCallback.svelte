<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import AuthShell from './AuthShell.svelte';
  import AuthIcon from './AuthIcon.svelte';
  export let returnDelay = 5;
  let isLoading = true;
  let error = '';
  let countdown = returnDelay;
  let countdownInterval: ReturnType<typeof setInterval> | undefined;
  const controller = new AbortController();

  function goBack() { clearInterval(countdownInterval); window.location.href = '/'; }
  function fail(reason: string) {
    error = reason; isLoading = false;
    countdownInterval = setInterval(() => { countdown--; if (countdown <= 0) goBack(); }, 1000);
  }

  onMount(() => {
    const code = new URL(window.location.href).searchParams.get('code');
    if (!code) { fail('ไม่พบรหัสยืนยันจาก KKU SSO กรุณาเข้าสู่ระบบอีกครั้ง'); return; }
    (async () => {
      try {
        const res = await fetch('/api/auth/sso/callback', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), signal: controller.signal });
        const data = await res.json();
        if (!res.ok) { fail(Array.isArray(data.message) ? data.message.join(' · ') : data.message || 'ไม่สามารถยืนยันตัวตนผ่าน KKU SSO ได้'); return; }
        if (data.stage === 'verify') window.location.href = '/?verify=true';
        else {
          localStorage.setItem('token', data.access_token);
          localStorage.setItem('role', data.role);
          if (data.username) localStorage.setItem('username', data.username);
          localStorage.setItem('lastActive', Date.now().toString());
          window.location.href = '/dashboard';
        }
      } catch { if (!controller.signal.aborted) fail('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง'); }
    })();
  });
  onDestroy(() => { controller.abort(); clearInterval(countdownInterval); });
</script>

<svelte:head><title>ยืนยันตัวตน KKU SSO · SIEM KKU</title></svelte:head>
<AuthShell stage="sso">
  <div class="auth-stage-icon" class:failed={!!error}><AuthIcon name={error ? 'alert' : 'building'} size={26} /></div>
  {#if isLoading}
    <h2 class="auth-heading">กำลังยืนยันตัวตน</h2><p class="auth-description">กำลังเชื่อมต่อบัญชีของคุณกับ KKU SSO<br />กรุณารอสักครู่ ระบบจะพาคุณไปยังขั้นตอนถัดไป</p>
    <div class="sso-progress" role="status"><span class="auth-spinner"></span><div><strong>ตรวจสอบบัญชีมหาวิทยาลัย</strong><p>ดำเนินการผ่านระบบ KKU SSO</p></div></div>
  {:else}
    <h2 class="auth-heading">เข้าใช้งานไม่สำเร็จ</h2><p class="auth-description">กรุณาตรวจสอบสิทธิ์บัญชีของคุณแล้วลองอีกครั้ง</p>
    <div class="auth-alert" role="alert"><AuthIcon name="alert" />{error}</div>
    <button class="auth-button" type="button" on:click={goBack}><AuthIcon name="back" size={17} /> กลับสู่หน้าเข้าสู่ระบบ</button>
    <p class="return-countdown">กลับอัตโนมัติใน {countdown} วินาที</p><div class="countdown-track" aria-hidden="true"><span style:width={`${countdown / returnDelay * 100}%`}></span></div>
  {/if}
</AuthShell>

<style>
  .failed { color: var(--red); background: var(--red-bg); }.sso-progress { display: flex; align-items: center; gap: 17px; padding: 22px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--green); }.sso-progress strong { font-size: 12px; font-weight: 500; color: var(--text-primary); }.sso-progress p { color: var(--text-secondary); font-size: 11px; margin: 5px 0 0; }.return-countdown { text-align: center; font-size: 11px; color: var(--text-secondary); margin: 21px 0 10px; }.countdown-track { height: 3px; background: var(--bg-secondary); border-radius: 2px; overflow: hidden; }.countdown-track span { display: block; height: 100%; background: var(--green); transition: width 1s linear; }@media (prefers-reduced-motion: reduce) { .countdown-track span { transition: none; } }
</style>
