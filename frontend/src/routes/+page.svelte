<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AuthShell from '../lib/components/auth/AuthShell.svelte';
  import AuthIcon from '../lib/components/auth/AuthIcon.svelte';

  type AuthStage = 'login' | 'verify' | 'reset_password';
  let authStage: AuthStage = 'login';
  let username = '';
  let password = '';
  let error = '';
  let isSessionExpired = false;
  let isLoading = false;
  let showPassword = false;
  let showNewPassword = false;
  let capsLock = false;
  let totpCode = '';
  let useBackupCode = false;
  let codeInput: HTMLInputElement;
  let newPasswordInput: HTMLInputElement;
  let newPassword = '';
  let confirmPassword = '';
  let tempToken = '';
  let tempRole = '';
  let tempUsername = '';

  $: passwordRules = [
    { label: 'อย่างน้อย 12 ตัวอักษร', valid: newPassword.length >= 12 },
    { label: 'ตัวพิมพ์ใหญ่ (A–Z)', valid: /[A-Z]/.test(newPassword) },
    { label: 'ตัวพิมพ์เล็ก (a–z)', valid: /[a-z]/.test(newPassword) },
    { label: 'ตัวเลข (0–9)', valid: /[0-9]/.test(newPassword) },
    { label: 'ไม่มีชื่อผู้ใช้ในรหัสผ่าน', valid: !!newPassword && (!(tempUsername || username) || !newPassword.toLowerCase().includes((tempUsername || username).toLowerCase())) },
  ];
  $: passwordReady = passwordRules.every(rule => rule.valid);
  $: codeReady = useBackupCode ? /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/.test(totpCode) : /^\d{6}$/.test(totpCode);

  function message(data: { message?: string | string[] }, fallback: string) {
    return Array.isArray(data.message) ? data.message.join(' · ') : data.message || fallback;
  }

  async function switchStage(stage: AuthStage) {
    authStage = stage;
    await tick();
    if (stage === 'verify') codeInput?.focus();
    if (stage === 'reset_password') newPasswordInput?.focus();
  }

  function storeSession(token: string, role: string, name: string) {
    localStorage.setItem('token', token);
    localStorage.setItem('role', role);
    localStorage.setItem('username', name);
    localStorage.setItem('lastActive', Date.now().toString());
    window.location.href = '/dashboard';
  }

  function finalizeLogin(data: { requirePasswordChange?: boolean; access_token: string; role: string; username: string }) {
    if (data.requirePasswordChange) {
      tempToken = data.access_token;
      tempRole = data.role;
      tempUsername = data.username;
      switchStage('reset_password');
      return;
    }
    storeSession(data.access_token, data.role, data.username);
  }

  async function handleForceReset() {
    if (isLoading) return;
    if (!passwordReady || newPassword !== confirmPassword) {
      error = 'กรุณาตั้งรหัสผ่านตามเงื่อนไขและยืนยันให้ตรงกัน';
      return;
    }
    isLoading = true;
    error = '';
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tempToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      const data = await res.json();
      if (res.ok) storeSession(tempToken, tempRole, tempUsername);
      else error = message(data, 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } catch {
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง';
    } finally { isLoading = false; }
  }

  async function handleLogin() {
    if (isLoading) return;
    error = '';
    isLoading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        isSessionExpired = false;
        if (data.stage === 'verify') {
          totpCode = '';
          useBackupCode = false;
          switchStage('verify');
        } else finalizeLogin(data);
      } else error = message(data, 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบบัญชีผู้ใช้');
    } catch {
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง';
    } finally { isLoading = false; }
  }

  async function handleVerify2FA() {
    if (isLoading || !codeReady) return;
    error = '';
    isLoading = true;
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode.replace(/\s+/g, '') }),
      });
      const data = await res.json();
      if (res.ok) finalizeLogin(data);
      else { error = message(data, 'รหัสยืนยันไม่ถูกต้อง กรุณาลองอีกครั้ง'); totpCode = ''; codeInput?.focus(); }
    } catch {
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง';
    } finally { isLoading = false; }
  }

  function goBackToLogin() {
    if (isLoading) return;
    authStage = 'login';
    totpCode = ''; error = ''; password = ''; newPassword = ''; confirmPassword = '';
    tempToken = ''; tempRole = ''; tempUsername = ''; capsLock = false;
    showPassword = false; showNewPassword = false; useBackupCode = false;
  }

  function checkCapsLock(event: KeyboardEvent) { capsLock = event.getModifierState('CapsLock'); }

  function updateCode(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    totpCode = useBackupCode ? value.replace(/\s/g, '') : value.replace(/\D/g, '').slice(0, 6);
    (event.currentTarget as HTMLInputElement).value = totpCode;
  }

  async function toggleBackupCode() { useBackupCode = !useBackupCode; totpCode = ''; error = ''; await tick(); codeInput?.focus(); }

  onMount(() => {
    const url = new URL(window.location.href);
    isSessionExpired = url.searchParams.get('expired') === 'true';
    if (url.searchParams.get('verify') === 'true') switchStage('verify');
    if (url.searchParams.has('expired') || url.searchParams.has('verify')) {
      url.searchParams.delete('expired'); url.searchParams.delete('verify');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  });
</script>

<svelte:head><title>เข้าสู่ระบบ · SIEM KKU</title><meta name="description" content="เข้าสู่ SIEM KKU พื้นที่ทำงานด้านความปลอดภัยไซเบอร์ มหาวิทยาลัยขอนแก่น" /></svelte:head>

<AuthShell stage={authStage}>
  {#if authStage === 'login'}
    <h2 class="auth-heading">Welcome back.</h2>
    <p class="auth-description">เข้าสู่พื้นที่ทำงานด้านความปลอดภัยของคุณ<br />ด้วยบัญชีผู้ใช้ หรือบัญชีมหาวิทยาลัยขอนแก่น</p>
  {:else if authStage === 'verify'}
    <div class="auth-stage-icon"><AuthIcon name="shield" size={26} /></div>
    <h2 class="auth-heading">ยืนยันว่าเป็นคุณ</h2>
    <p class="auth-description">{useBackupCode ? 'กรอกรหัสสำรองที่คุณบันทึกไว้ รหัสแต่ละชุดใช้ได้ครั้งเดียว' : 'กรอกรหัส 6 หลักจากแอป Authenticator เพื่อเข้าใช้งานอย่างปลอดภัย'}</p>
  {:else}
    <div class="auth-stage-icon"><AuthIcon name="key" size={26} /></div>
    <h2 class="auth-heading">เริ่มต้นอย่างปลอดภัย</h2>
    <p class="auth-description">ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ<br />ก่อนเข้าใช้งาน SIEM KKU ครั้งนี้</p>
  {/if}

  {#if isSessionExpired}<div class="auth-alert warning" role="status"><AuthIcon name="alert" />Session หมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</div>{/if}
  {#if error}<div class="auth-alert" role="alert"><AuthIcon name="alert" />{error}</div>{/if}

  {#if authStage === 'login'}
    <form on:submit|preventDefault={handleLogin} aria-busy={isLoading}>
      <div class="auth-field">
        <label for="username">ชื่อผู้ใช้ <span class="field-english">Username</span></label>
        <div class="auth-input-wrap"><AuthIcon name="user" size={18} /><input class="auth-input" id="username" bind:value={username} required autocomplete="username" placeholder="กรอกชื่อผู้ใช้ของคุณ" disabled={isLoading} /></div>
      </div>
      <div class="auth-field">
        <label for="password">รหัสผ่าน <span class="field-english">Password</span></label>
        <div class="auth-input-wrap">
          <AuthIcon name="lock" size={18} />
          <input class="auth-input" id="password" type={showPassword ? 'text' : 'password'} value={password} on:input={(e) => password = e.currentTarget.value} required autocomplete="current-password" placeholder="กรอกรหัสผ่านของคุณ" on:keydown={checkCapsLock} on:keyup={checkCapsLock} on:blur={() => capsLock = false} aria-describedby={capsLock ? 'caps-lock-hint' : undefined} disabled={isLoading} />
          <button class="auth-eye" type="button" aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={showPassword} on:click={() => showPassword = !showPassword}><AuthIcon name={showPassword ? 'hidden' : 'eye'} size={18} /></button>
        </div>
        {#if capsLock}<p class="auth-hint warning" id="caps-lock-hint" role="status">Caps Lock เปิดอยู่ ตรวจสอบตัวพิมพ์ใหญ่ก่อนเข้าสู่ระบบ</p>{/if}
      </div>
      <button class="auth-button" type="submit" disabled={isLoading}>{#if isLoading}<span class="auth-spinner"></span>กำลังเข้าสู่ระบบ…{:else}เข้าสู่ระบบ <AuthIcon name="arrow" size={17} />{/if}</button>
      <div class="auth-divider">หรือใช้บัญชีมหาวิทยาลัย</div>
      <a class="auth-button secondary" href="/api/auth/sso/login" data-sveltekit-reload><AuthIcon name="building" size={19} /> เข้าสู่ระบบด้วย KKU SSO</a>
      <div class="auth-help"><strong>ใช้บัญชี KKU ของคุณได้เลย</strong><br />เลือก KKU SSO เพื่อยืนยันตัวตนผ่านระบบของมหาวิทยาลัย หากไม่มีสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ</div>
    </form>
  {:else if authStage === 'verify'}
    <form on:submit|preventDefault={handleVerify2FA} aria-busy={isLoading}>
      <div class="auth-field">
        <label for="verification-code">{useBackupCode ? 'รหัสสำรอง' : 'รหัสยืนยัน 6 หลัก'}</label>
        <input bind:this={codeInput} class="auth-input verification-input" class:backup={useBackupCode} id="verification-code" type="text" value={totpCode} on:input={updateCode} placeholder={useBackupCode ? 'ABCDE-12345' : '000000'} inputmode={useBackupCode ? 'text' : 'numeric'} autocomplete="one-time-code" maxlength={useBackupCode ? 32 : 12} required disabled={isLoading} aria-describedby="code-hint" />
        <p class="auth-hint" id="code-hint">{useBackupCode ? 'ใช้รหัสสำรองแทนได้เมื่อไม่สามารถเข้าถึงแอป Authenticator' : 'วางรหัสทั้ง 6 หลักได้ทันที หากรหัสหมดอายุให้ใช้รหัสใหม่ในแอป'}</p>
      </div>
      <button class="auth-button" type="submit" disabled={isLoading || !codeReady}>{#if isLoading}<span class="auth-spinner"></span>กำลังตรวจสอบ…{:else}ยืนยันและเข้าใช้งาน <AuthIcon name="arrow" size={17} />{/if}</button>
      <button class="text-button" type="button" disabled={isLoading} on:click={toggleBackupCode}>{useBackupCode ? 'ใช้รหัสจากแอป Authenticator' : 'เข้าแอปไม่ได้? ใช้รหัสสำรอง'}</button>
      <button class="auth-back" type="button" disabled={isLoading} on:click={goBackToLogin}><AuthIcon name="back" size={15} /> กลับสู่หน้าเข้าสู่ระบบ</button>
    </form>
  {:else}
    <form on:submit|preventDefault={handleForceReset} aria-busy={isLoading}>
      <div class="auth-field">
        <label for="new-password">รหัสผ่านใหม่</label>
        <div class="auth-input-wrap">
          <AuthIcon name="lock" size={18} />
          <input bind:this={newPasswordInput} class="auth-input" id="new-password" type={showNewPassword ? 'text' : 'password'} value={newPassword} on:input={(e) => newPassword = e.currentTarget.value} required minlength="12" autocomplete="new-password" placeholder="ตั้งรหัสผ่านใหม่ของคุณ" aria-describedby="password-rules" disabled={isLoading} />
          <button class="auth-eye" type="button" aria-label={showNewPassword ? 'ซ่อนรหัสผ่านใหม่' : 'แสดงรหัสผ่านใหม่'} aria-pressed={showNewPassword} on:click={() => showNewPassword = !showNewPassword}><AuthIcon name={showNewPassword ? 'hidden' : 'eye'} size={18} /></button>
        </div>
      </div>
      <div class="password-rules" id="password-rules" aria-label="เงื่อนไขรหัสผ่าน">{#each passwordRules as rule}<span class:valid={rule.valid}><span class="rule-mark"><AuthIcon name="check" size={11} /></span>{rule.label}</span>{/each}</div>
      <div class="auth-field">
        <label for="confirm-password">ยืนยันรหัสผ่านใหม่</label>
        <div class="auth-input-wrap"><AuthIcon name="lock" size={18} /><input class="auth-input" id="confirm-password" type={showNewPassword ? 'text' : 'password'} value={confirmPassword} on:input={(e) => confirmPassword = e.currentTarget.value} required autocomplete="new-password" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" aria-describedby={confirmPassword ? 'password-match' : undefined} aria-invalid={!!confirmPassword && confirmPassword !== newPassword} disabled={isLoading} /></div>
        {#if confirmPassword}<p id="password-match" class="auth-hint" class:success={confirmPassword === newPassword} class:warning={confirmPassword !== newPassword} aria-live="polite">{confirmPassword === newPassword ? 'รหัสผ่านตรงกัน' : 'รหัสผ่านยังไม่ตรงกัน'}</p>{/if}
      </div>
      <button class="auth-button" type="submit" disabled={isLoading || !passwordReady || newPassword !== confirmPassword}>{#if isLoading}<span class="auth-spinner"></span>กำลังบันทึก…{:else}บันทึกและเข้าใช้งาน <AuthIcon name="arrow" size={17} />{/if}</button>
      <button class="auth-back" type="button" disabled={isLoading} on:click={goBackToLogin}><AuthIcon name="back" size={15} /> กลับสู่หน้าเข้าสู่ระบบ</button>
    </form>
  {/if}
</AuthShell>

<style>
  .field-english { font-size: 10px; color: var(--text-secondary); margin-left: 7px; font-weight: 400; }
  .verification-input { padding: 17px; min-height: 68px; text-align: center; font-size: 28px; letter-spacing: 12px; font-weight: 500; }.verification-input.backup { font-size: 17px; letter-spacing: 2px; }.verification-input::placeholder { opacity: .45; }
  .text-button { display: block; margin: 19px auto 0; padding: 5px; background: transparent; border: none; color: var(--green); font-size: 11px; cursor: pointer; }
  .password-rules { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; margin: -5px 0 23px; }.password-rules > span { display: flex; gap: 6px; align-items: center; color: var(--text-secondary); font-size: 10px; }.password-rules > span.valid { color: var(--green); }.rule-mark { display: grid; place-items: center; width: 14px; height: 14px; border-radius: 50%; border: 1px solid var(--border); }.valid .rule-mark { background: var(--green-bg); border-color: #1d9e7533; }
</style>




