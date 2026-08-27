<script lang="ts">
  import { onMount } from 'svelte';

  let currentUsername = '';
  let mfaEnabled = false;
  let loadingStatus = true;
  let errorMsg = '';
  let successMsg = '';

  // Setup Modal State
  let showModal = false;
  let setupStage: 'init' | 'qr' | 'backup' = 'init';
  let qrCodeDataUrl = '';
  let manualSecret = '';
  let totpCode = '';
  let backupCodes: string[] = [];
  let backupCodesCopied = false;
  let actionLoading = false;

  onMount(async () => {
    currentUsername = localStorage.getItem('username') || '';
    if (!currentUsername) {
      errorMsg = 'ไม่พบข้อมูลผู้ใช้ในระบบ กรุณาล็อกอินใหม่';
      loadingStatus = false;
      return;
    }
    await loadUserStatus();
  });

  async function loadUserStatus() {
    loadingStatus = true;
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const users = await res.json();
        const me = users.find((u: any) => u.username === currentUsername);
        if (me) {
          mfaEnabled = me.totpEnabled;
        }
      }
    } catch (err) {
      errorMsg = 'ไม่สามารถดึงข้อมูลได้';
    }
    loadingStatus = false;
  }

  async function startEnableMfa() {
    actionLoading = true;
    errorMsg = '';
    const token = localStorage.getItem('token');
    // 1. Init 2FA (sets pre_auth_token cookie)
    try {
      const res = await fetch(`/api/auth/users/${currentUsername}/init-2fa`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Init failed: ${res.status} ${txt}`);
      }
      
      // 2. Fetch QR Code
      const qrRes = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!qrRes.ok) {
        const txt = await qrRes.text();
        throw new Error(`QR failed: ${qrRes.status} ${txt}`);
      }
      
      const qrData = await qrRes.json();
      qrCodeDataUrl = qrData.qrCodeDataUrl;
      manualSecret = qrData.secret;
      
      setupStage = 'qr';
      totpCode = '';
      showModal = true;
    } catch (err: any) {
      errorMsg = 'ไม่สามารถเริ่มตั้งค่า 2FA ได้: ' + (err.message || err);
      console.error(err);
    }
    actionLoading = false;
  }

  async function confirmMfaSetup() {
    actionLoading = true;
    errorMsg = '';
    try {
      const res = await fetch('/api/auth/2fa/setup/confirm', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode.replace(/\s+/g, '') })
      });
      const data = await res.json();
      
      if (res.ok) {
        backupCodes = data.backupCodes || [];
        setupStage = 'backup';
        mfaEnabled = true;
        
        // Re-store token since the server might have issued a new one
        if (data.access_token) {
          localStorage.setItem('token', data.access_token);
        }
      } else {
        errorMsg = data.message || 'รหัสไม่ถูกต้อง';
      }
    } catch (err) {
      errorMsg = 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
    }
    actionLoading = false;
  }

  function finishSetup() {
    showModal = false;
    setupStage = 'init';
    successMsg = 'เปิดใช้งาน 2FA เรียบร้อยแล้ว!';
    setTimeout(() => successMsg = '', 3000);
  }

  function copyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    backupCodesCopied = true;
    setTimeout(() => backupCodesCopied = false, 2000);
  }

  async function disableMfa() {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะปิดการใช้งาน 2FA? ความปลอดภัยของบัญชีจะลดลง')) return;
    
    actionLoading = true;
    try {
      const res = await fetch(`/api/auth/users/${currentUsername}/disable-2fa`, { method: 'POST' });
      if (res.ok) {
        mfaEnabled = false;
        successMsg = 'ปิดใช้งาน 2FA สำเร็จ';
        setTimeout(() => successMsg = '', 3000);
      } else {
        errorMsg = 'ไม่สามารถปิดการใช้งานได้';
      }
    } catch (err) {
      errorMsg = 'Network Error';
    }
    actionLoading = false;
  }
</script>

<div class="ds-card">
  <div class="ds-card-head">
    <div class="ds-card-title"><i class="ti ti-shield-lock"></i> ความปลอดภัยและการยืนยันตัวตน (2FA)</div>
  </div>
  <div class="config-section">
  
  {#if loadingStatus}
    <div class="config-row" style="justify-content: center; padding: 30px;"><span class="mini-spin"></span> กำลังตรวจสอบสถานะ...</div>
  {:else}
    <div class="config-row" style="flex-direction: column; align-items: stretch; gap: 15px; border: 1px solid var(--border); background: var(--bg-surface); padding: 20px; border-radius: var(--radius-md);">
      <div>
        <div style="font-size: 16px; font-weight: 600; color: var(--text-base); margin-bottom: 8px;">ยืนยันตัวตนสองขั้นตอน (2FA)</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">
          เพิ่มความปลอดภัยอีกชั้นด้วยรหัสจากแอป Authenticator ทุกครั้งที่เข้าสู่ระบบ
        </div>
        
        <div style="display: flex; align-items: center; gap: 12px;">
          {#if mfaEnabled}
            <span style="background: rgba(0, 200, 83, 0.15); color: #00e676; padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 500;">
              ✓ เปิดใช้งานอยู่
            </span>
            <span style="font-size: 13px; color: var(--text-muted); margin-right: auto;">
              เหลือ 8 backup code
            </span>
            
            <button class="ds-btn sm" style="border-color: var(--primary); color: var(--primary); background: transparent;" on:click={startEnableMfa} disabled={actionLoading}>
              สร้าง Backup Codes ใหม่
            </button>
            <button class="ds-btn sm" style="border-color: var(--red); color: var(--red); background: transparent;" on:click={disableMfa} disabled={actionLoading}>
              {#if actionLoading}<span class="mini-spin" style="border-top-color: var(--red);"></span>{/if}
              ปิดใช้งาน
            </button>
          {:else}
            <button class="ds-btn sm primary" style="margin-left: auto;" on:click={startEnableMfa} disabled={actionLoading}>
              {#if actionLoading}<span class="mini-spin"></span>{/if}
              เปิดใช้งาน 2FA
            </button>
          {/if}
        </div>
      </div>
      
      {#if successMsg}
        <div style="margin-top: 15px; padding: 10px; border-radius: 4px; background: rgba(0, 200, 83, 0.1); color: #00e676; border: 1px solid rgba(0, 200, 83, 0.2); font-size: 13px;">
          <i class="ti ti-check"></i> {successMsg}
        </div>
      {/if}
      
      {#if errorMsg}
        <div style="margin-top: 15px; padding: 10px; border-radius: 4px; background: rgba(255, 61, 113, 0.1); color: var(--red); border: 1px solid rgba(255, 61, 113, 0.2); font-size: 13px;">
          <i class="ti ti-alert-triangle"></i> {errorMsg}
        </div>
      {/if}
    </div>
  {/if}
  </div>
</div>
  <!-- 2FA Setup Modal -->
{#if showModal}
  <div class="modal-overlay" on:click|self={() => { if(setupStage !== 'backup') showModal = false; }}>
    <div class="modal-box" style="max-width: 400px;">
      
      {#if setupStage === 'qr'}
        <div class="modal-head">
          <div class="modal-title"><i class="ti ti-qrcode"></i> ตั้งค่า 2FA</div>
          <button class="modal-close" on:click={() => showModal = false}><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body" style="text-align: center; padding: 24px;">
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 24px;">
            1. สแกน QR Code ด้วยแอป <strong>Google Authenticator</strong> หรือ <strong>Authy</strong>
          </p>
          
          <div style="background: white; padding: 16px; display: inline-block; border-radius: 12px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <img src={qrCodeDataUrl} alt="QR Code" style="width: 180px; height: 180px;" />
          </div>
          
          {#if manualSecret}
             <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 24px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px;">
               Secret Key: <code style="font-size: 14px; color: #3b82f6;">{manualSecret}</code>
             </div>
          {/if}
          
          <p style="font-size: 14px; color: var(--text-muted); margin-bottom: 12px; text-align: left;">
            2. นำรหัส 6 หลักจากแอปมากรอกด้านล่างนี้
          </p>
          <div style="text-align: left; background: var(--bg-level-1); padding: 16px; border-radius: 12px; border: 1px solid var(--border-color);">
            <input 
              type="text" 
              bind:value={totpCode} 
              on:input={() => totpCode = totpCode.replace(/[^0-9]/g, '')}
              class="input-field" 
              placeholder="000 000" 
              maxlength="6" 
              inputmode="numeric" 
              pattern="[0-9]*" 
              style="text-align: center; font-size: 28px; letter-spacing: 12px; font-weight: bold; width: 100%; padding: 16px; background: var(--bg-body); border: 2px solid var(--border-color); border-radius: 8px; color: var(--text-base); outline: none; transition: border-color 0.2s;" 
              on:focus={(e) => (e.target as HTMLInputElement).style.borderColor = '#3b82f6'}
              on:blur={(e) => (e.target as HTMLInputElement).style.borderColor = 'var(--border-color)'}
            />
          </div>
          
          {#if errorMsg}
            <div style="margin-top: 16px; padding: 12px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); font-size: 13px; text-align: left;">
              <i class="ti ti-alert-triangle"></i> {errorMsg}
            </div>
          {/if}
        </div>
        <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 25px;">
          <button class="ds-btn sm" style="background: transparent; border-color: var(--border-color); color: var(--text-base);" on:click={() => showModal = false}>ยกเลิก</button>
          <button class="ds-btn sm primary" on:click={confirmMfaSetup} disabled={actionLoading || totpCode.length < 6}>
            {#if actionLoading}<span class="mini-spin"></span>{/if}
            ยืนยันรหัส
          </button>
        </div>
        
      {:else if setupStage === 'backup'}
        <div class="modal-head">
          <div class="modal-title"><i class="ti ti-key"></i> Backup Codes (สำคัญ)</div>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--red); font-weight: bold; margin-bottom: 15px;">
            กรุณาเก็บรหัสเหล่านี้ไว้ในที่ปลอดภัย จะใช้ได้ครั้งเดียวและโชว์แค่ครั้งนี้เท่านั้น!
          </p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
            {#each backupCodes as code}
              <div style="background: var(--bg-level-1); padding: 8px; border-radius: 4px; text-align: center; font-family: monospace; font-size: 14px; border: 1px solid var(--border-color); color: var(--text-base);">
                {code}
              </div>
            {/each}
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between;">
          <button class="ds-btn sm" style="border-color: var(--primary); color: var(--primary);" on:click={copyBackupCodes}>
            <i class="ti {backupCodesCopied ? 'ti-check' : 'ti-copy'}"></i> {backupCodesCopied ? 'คัดลอกแล้ว' : 'คัดลอกรหัส'}
          </button>
          <button class="ds-btn sm primary" on:click={finishSetup}>
            ฉันบันทึกไว้แล้ว ดำเนินการต่อ
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .mini-spin {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 6px;
    vertical-align: text-bottom;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
