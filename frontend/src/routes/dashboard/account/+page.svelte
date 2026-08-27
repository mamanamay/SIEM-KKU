<script lang="ts">
  import { onMount } from 'svelte';

  // ─── Active Tab ──────────────────────────────────────────────────────────────
  let activeTab: 'profile' | 'apikey' | 'loginmethods' | 'devices' | 'delete' = 'profile';

  // ─── Toast ───────────────────────────────────────────────────────────────────
  let toast: { msg: string; type: 'success' | 'error' } | null = null;
  let toastTimer: any;

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    toast = { msg, type };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = null; }, 3500);
  }

  // ─── Tab 1 — ข้อมูลบัญชี ────────────────────────────────────────────────────
  let firstName = 'นภัสวรรณ';
  let lastName = 'ชัยบาล';
  let email = 'napatwan.c@kkumail.com';

  function saveProfile() {
    showToast('บันทึกข้อมูลบัญชีสำเร็จ');
  }

  // ─── Tab 2 — KKU AI API Key ──────────────────────────────────────────────────
  const AI_MODELS = [
    { value: 'typhoon-v2-70b-instruct', label: 'Typhoon v2 70B — แนะนำ' },
    { value: 'typhoon-v2-8b-instruct',  label: 'Typhoon v2 8B — เร็ว' },
    { value: 'llama-3.3-70b-instruct',  label: 'Llama 3.3 70B' },
    { value: 'llama-3.1-8b-instruct',   label: 'Llama 3.1 8B' },
    { value: 'wangchanglm-7.5b-instruct', label: 'WangchanLM 7.5B — ภาษาไทย' },
  ];

  let savedApiKey = '';
  let savedApiKeyDate = '';
  let newApiKey = '';
  let showApiKey = false;
  let selectedModel = 'typhoon-v2-70b-instruct';

  onMount(() => {
    const stored = localStorage.getItem('kkuai_api_key');
    if (stored) {
      savedApiKey = stored;
      const d = localStorage.getItem('kkuai_api_key_date');
      savedApiKeyDate = d || '20 ส.ค. 2569';
    }
    const storedModel = localStorage.getItem('kkuai_model');
    if (storedModel) selectedModel = storedModel;
  });

  function saveApiKey() {
    if (!newApiKey.trim()) {
      showToast('กรุณาใส่ API Key ก่อนบันทึก', 'error');
      return;
    }
    localStorage.setItem('kkuai_api_key', newApiKey.trim());
    const now = new Date();
    const thDate = now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    localStorage.setItem('kkuai_api_key_date', thDate);
    localStorage.setItem('kkuai_model', selectedModel);
    savedApiKey = newApiKey.trim();
    savedApiKeyDate = thDate;
    newApiKey = '';
    showToast('บันทึก API Key สำเร็จ');
  }

  function saveModel() {
    localStorage.setItem('kkuai_model', selectedModel);
    showToast('บันทึกการตั้งค่าโมเดลสำเร็จ');
  }

  function deleteApiKey() {
    if (!confirm('ต้องการลบ API Key นี้ใช่ไหม?')) return;
    localStorage.removeItem('kkuai_api_key');
    localStorage.removeItem('kkuai_api_key_date');
    savedApiKey = '';
    savedApiKeyDate = '';
    newApiKey = '';
    showToast('ลบ API Key เรียบร้อยแล้ว');
  }

  // ─── Tab 4 — Devices ─────────────────────────────────────────────────────────
  let deviceSubTab: 'active' | 'all' = 'active';

  // ─── Tab 5 — Delete Account ───────────────────────────────────────────────────
  let deleteConfirmed = false;

  function handleDeleteAccount() {
    showToast('ไม่สามารถลบบัญชีในโหมดสาธิต', 'error');
    deleteConfirmed = false;
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════ PAGE ════ -->
<div class="acc-page">

  <!-- PAGE HEADER -->
  <div class="acc-header">
    <div class="acc-header-left">
      <div class="acc-header-icon"><i class="ti ti-user-circle"></i></div>
      <div>
        <h1 class="acc-title">ศูนย์จัดการบัญชี</h1>
        <div class="acc-subtitle">การตั้งค่าบัญชี</div>
        <div class="acc-desc">จัดการข้อมูลบัญชี วิธีเข้าสู่ระบบ KKU AI API Key และอุปกรณ์จากที่เดียว</div>
      </div>
    </div>
    <button class="btn-local-login" on:click={() => showToast('เข้าสู่ระบบด้วยรหัสผ่าน Local (Mock)')}>
      <i class="ti ti-lock"></i> เข้าสู่ระบบด้วยรหัสผ่าน Local
    </button>
  </div>

  <!-- TWO-COLUMN LAYOUT -->
  <div class="acc-layout">

    <!-- LEFT SIDEBAR -->
    <aside class="acc-sidebar">
      <nav class="acc-nav">
        <button class="acc-nav-item {activeTab === 'profile' ? 'active' : ''}" on:click={() => activeTab = 'profile'}>
          <i class="ti ti-user"></i>
          <span>ข้อมูลบัญชี</span>
        </button>
        <button class="acc-nav-item {activeTab === 'apikey' ? 'active' : ''}" on:click={() => activeTab = 'apikey'}>
          <i class="ti ti-key"></i>
          <span>KKU AI API Key</span>
        </button>
        <button class="acc-nav-item {activeTab === 'loginmethods' ? 'active' : ''}" on:click={() => activeTab = 'loginmethods'}>
          <i class="ti ti-link"></i>
          <span>วิธีเข้าสู่ระบบ</span>
        </button>
        <button class="acc-nav-item {activeTab === 'devices' ? 'active' : ''}" on:click={() => activeTab = 'devices'}>
          <i class="ti ti-device-laptop"></i>
          <span>อุปกรณ์ที่เข้าสู่ระบบ</span>
        </button>
        <div class="acc-nav-divider"></div>
        <button class="acc-nav-item danger {activeTab === 'delete' ? 'active-danger' : ''}" on:click={() => activeTab = 'delete'}>
          <i class="ti ti-trash"></i>
          <span>ลบบัญชี</span>
        </button>
      </nav>
    </aside>

    <!-- MAIN CONTENT -->
    <main class="acc-main">

      <!-- TAB 1 — ข้อมูลบัญชี -->
      {#if activeTab === 'profile'}
        <div class="acc-card">
          <div class="acc-card-head">
            <div>
              <h2 class="acc-card-title"><i class="ti ti-user"></i> ข้อมูลบัญชี</h2>
              <p class="acc-card-desc">แก้ไขชื่อ-นามสกุลและข้อมูลส่วนตัวของบัญชีนี้</p>
            </div>
            <div class="badge-row">
              <span class="badge gray">ผู้ใช้งาน</span>
              <span class="badge green">ใช้งานได้</span>
            </div>
          </div>
          <div class="avatar-section">
            <div class="avatar-circle"><i class="ti ti-user"></i></div>
            <div class="avatar-info">
              <div class="avatar-name">{firstName} {lastName}</div>
              <div class="avatar-email">{email}</div>
              <button class="btn-link"><i class="ti ti-upload"></i> เปลี่ยนรูปโปรไฟล์</button>
            </div>
          </div>
          <div class="form-divider"></div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">ชื่อ</label>
              <input class="form-input" type="text" bind:value={firstName} placeholder="กรอกชื่อ" />
            </div>
            <div class="form-group">
              <label class="form-label">นามสกุล</label>
              <input class="form-input" type="text" bind:value={lastName} placeholder="กรอกนามสกุล" />
            </div>
          </div>
          <div class="form-group mt-16">
            <label class="form-label">
              อีเมลหลักของบัญชี
              <span class="form-hint">จัดการโดยมหาวิทยาลัย</span>
            </label>
            <input class="form-input disabled" type="text" value={email} disabled />
          </div>
          <div class="form-divider"></div>
          <div class="form-actions">
            <button class="btn-primary" on:click={saveProfile}>
              <i class="ti ti-device-floppy"></i> บันทึกข้อมูล
            </button>
          </div>
        </div>
      {/if}

      <!-- TAB 2 — KKU AI API Key -->
      {#if activeTab === 'apikey'}
        <div class="acc-card">
          <div class="acc-card-head">
            <div>
              <h2 class="acc-card-title"><i class="ti ti-key"></i> KKU AI Platform API Key</h2>
              <p class="acc-card-desc">ใช้เชื่อมต่อ KKU AI Platform เพื่อวิเคราะห์หลักฐานและช่วยออกรายงานด้วย AI โดยคีย์นี้เป็นของคุณและไม่ใช้ร่วมกับผู้ใช้อื่น</p>
            </div>
            {#if savedApiKey}
              <div class="badge-col">
                <span class="badge green"><i class="ti ti-check"></i> ตั้งค่าแล้ว</span>
                <span class="badge-date">อัปเดตล่าสุด: {savedApiKeyDate}</span>
              </div>
            {:else}
              <span class="badge gray">ยังไม่ตั้งค่า</span>
            {/if}
          </div>
          <div class="info-box blue">
            <i class="ti ti-shield-lock"></i>
            <span>ระบบจะเข้ารหัสคีย์ก่อนจัดเก็บและจะไม่แสดงค่าเดิมกลับมา ผู้ดูแลและระบบเห็นได้เฉพาะสถานะและเวลาอัปเดตเท่านั้น</span>
          </div>
          <div class="form-group mt-20">
            <label class="form-label">ใส่คีย์ใหม่เพื่อแทนที่คีย์เดิม</label>
            <div class="input-with-action">
              {#if showApiKey}
                <input class="form-input" type="text" bind:value={newApiKey} placeholder="วาง API Key จาก KKU AI Platform" />
              {:else}
                <input class="form-input" type="password" bind:value={newApiKey} placeholder="วาง API Key จาก KKU AI Platform" />
              {/if}
              <button class="btn-icon-inline" on:click={() => showApiKey = !showApiKey} title="แสดง/ซ่อน">
                <i class="ti {showApiKey ? 'ti-eye-off' : 'ti-eye'}"></i>
              </button>
            </div>
          </div>
          <div class="form-group mt-16">
            <label class="form-label">โมเดล AI ที่ใช้</label>
            <select class="form-select" bind:value={selectedModel} on:change={saveModel}>
              {#each AI_MODELS as m}
                <option value={m.value}>{m.label}</option>
              {/each}
            </select>
            <div class="form-hint-block">Base URL: <code>https://gen.ai.kku.ac.th/api/v1</code></div>
          </div>
          <div class="form-divider"></div>
          <div class="form-actions gap-8">
            <button class="btn-primary" on:click={saveApiKey}>
              <i class="ti ti-key"></i> บันทึกคีย์ใหม่
            </button>
            {#if savedApiKey}
              <button class="btn-danger-outline" on:click={deleteApiKey}>
                <i class="ti ti-trash"></i> ลบ API Key
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- TAB 3 — วิธีเข้าสู่ระบบ -->
      {#if activeTab === 'loginmethods'}
        <div class="section-header-row">
          <h2 class="section-title"><i class="ti ti-link"></i> วิธีเข้าสู่ระบบ</h2>
          <span class="section-count">2 วิธี</span>
        </div>
        <div class="acc-card method-card">
          <div class="method-row">
            <div class="method-icon-wrap sso"><i class="ti ti-school"></i></div>
            <div class="method-body">
              <div class="method-name">KKU SSONext</div>
              <div class="method-email">{email}</div>
              <div class="method-note">ใช้บัญชีมหาวิทยาลัยเพื่อยืนยันตัวตน วิธีนี้ไม่สามารถนำออกจากหน้าค่าทั่วไปได้</div>
              <div class="badge-row mt-8">
                <span class="badge blue">วิธีเข้าระบบหลัก</span>
                <span class="badge gray">ดูแลโดยมหาวิทยาลัย</span>
              </div>
            </div>
            <div class="method-status">
              <span class="badge orange">ยังไม่เชื่อมต่อ</span>
            </div>
          </div>
        </div>
        <div class="acc-card method-card mt-12">
          <div class="method-row">
            <div class="method-icon-wrap local"><i class="ti ti-lock-password"></i></div>
            <div class="method-body">
              <div class="method-name">เข้าสู่ระบบด้วยรหัสผ่าน</div>
              <div class="method-expiry"><i class="ti ti-clock"></i> หมดอายุ 21 ส.ค. 2569 10:34</div>
              <div class="method-note">เหลือ 23 ชม. 14 นาที · การเปลี่ยนรหัสผ่านไม่ทำให้วันหมดอายุเลื่อนออกไป</div>
            </div>
            <div class="method-status-col">
              <span class="badge green">ใช้งานได้</span>
              <button class="btn-dots" title="ตัวเลือก"><i class="ti ti-dots"></i></button>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 4 — อุปกรณ์ -->
      {#if activeTab === 'devices'}
        <div class="section-header-row">
          <h2 class="section-title"><i class="ti ti-device-laptop"></i> อุปกรณ์ที่เข้าสู่ระบบ</h2>
          <span class="section-count">1 อุปกรณ์</span>
        </div>
        <div class="sub-tabs">
          <button class="sub-tab {deviceSubTab === 'active' ? 'active' : ''}" on:click={() => deviceSubTab = 'active'}>กำลังใช้งาน</button>
          <button class="sub-tab {deviceSubTab === 'all' ? 'active' : ''}" on:click={() => deviceSubTab = 'all'}>ทั้งหมด</button>
        </div>
        <div class="acc-card device-card">
          <div class="device-row">
            <div class="device-icon"><i class="ti ti-device-laptop"></i></div>
            <div class="device-body">
              <div class="device-name-row">
                <span class="device-name">อุปกรณ์นี้</span>
                <span class="badge green">อุปกรณ์ปัจจุบัน</span>
                <span class="badge gray">รหัสผ่าน Local</span>
                <span class="badge blue">กำลังใช้งาน</span>
              </div>
              <div class="device-ua">Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36</div>
              <div class="device-meta"><i class="ti ti-clock"></i> ใช้งานล่าสุด 20 ส.ค. 2569 11:19</div>
            </div>
            <div class="device-action">
              <button class="btn-danger-outline sm" disabled><i class="ti ti-logout"></i> ออกจากระบบอุปกรณ์นี้</button>
            </div>
          </div>
        </div>
        {#if deviceSubTab === 'all'}
          <div class="empty-state"><i class="ti ti-device-laptop"></i><span>ไม่มีอุปกรณ์อื่น</span></div>
        {/if}
      {/if}

      <!-- TAB 5 — ลบบัญชี -->
      {#if activeTab === 'delete'}
        <div class="acc-card danger-card">
          <div class="acc-card-head">
            <div>
              <h2 class="acc-card-title danger-title"><i class="ti ti-trash"></i> ลบบัญชีถาวร</h2>
              <p class="acc-card-desc">โซนอันตราย — การกระทำนี้ไม่สามารถยกเลิกได้</p>
            </div>
          </div>
          <div class="warning-box">
            <i class="ti ti-alert-triangle"></i>
            <div><strong>คำเตือน:</strong> การลบบัญชีจะลบข้อมูลทั้งหมดที่เกี่ยวข้องกับบัญชีของคุณออกจากระบบอย่างถาวร และไม่สามารถกู้คืนได้ รวมถึงประวัติการวิเคราะห์ การตั้งค่า และ API Key ทั้งหมด</div>
          </div>
          <div class="form-divider"></div>
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={deleteConfirmed} />
            <span>ฉันเข้าใจว่าการกระทำนี้ไม่สามารถยกเลิกได้</span>
          </label>
          <div class="form-actions mt-20">
            <button class="btn-danger-solid" disabled={!deleteConfirmed} on:click={handleDeleteAccount}>
              <i class="ti ti-trash"></i> ลบบัญชีของฉัน
            </button>
          </div>
        </div>
      {/if}

    </main>
  </div>
</div>

<!-- GLOBAL TOAST -->
{#if toast}
  <div class="acc-toast {toast.type}">
    <i class="ti {toast.type === 'success' ? 'ti-circle-check' : 'ti-alert-circle'}"></i>
    {toast.msg}
  </div>
{/if}

<style>
  .acc-page {
    --acc-bg: #f1f4f8;
    --acc-card: #ffffff;
    --acc-border: #e5e9f0;
    --acc-text: #0f1117;
    --acc-text-2: #4b5563;
    --acc-muted: #9ca3af;
    --acc-accent: #1d9e75;
    --acc-accent-bg: #eaf6f1;
    --acc-red: #dc2626;
    --acc-red-bg: #fef2f2;
    --acc-blue: #3b82f6;
    --acc-blue-bg: #eff6ff;
    --acc-orange: #ea580c;
    --acc-orange-bg: #fff7ed;
    --acc-radius: 12px;
    --acc-shadow: 0 1px 4px rgba(15,17,23,0.06), 0 0 0 1px rgba(15,17,23,0.04);
    display: flex; flex-direction: column; gap: 20px;
    max-width: 1100px; margin: 0 auto; padding-bottom: 40px;
  }

  /* Header */
  .acc-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
  .acc-header-left { display: flex; align-items: flex-start; gap: 16px; }
  .acc-header-icon {
    width: 52px; height: 52px; background: var(--acc-accent-bg); color: var(--acc-accent);
    border-radius: 14px; display: flex; align-items: center; justify-content: center;
    font-size: 26px; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(29,158,117,0.2);
  }
  .acc-title { font-size: 22px; font-weight: 800; color: var(--acc-text); line-height: 1.2; }
  .acc-subtitle { font-size: 13px; font-weight: 600; color: var(--acc-text-2); margin-top: 2px; }
  .acc-desc { font-size: 12px; color: var(--acc-muted); margin-top: 3px; max-width: 480px; }
  .btn-local-login {
    display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px;
    font-size: 13px; font-weight: 600; background: var(--acc-card);
    border: 1px solid var(--acc-border); border-radius: 8px; cursor: pointer;
    color: var(--acc-text-2); transition: all 0.18s; white-space: nowrap; flex-shrink: 0;
  }
  .btn-local-login:hover { background: var(--acc-accent-bg); color: var(--acc-accent); border-color: var(--acc-accent); }
  .btn-local-login i { font-size: 16px; }

  /* Two-column layout */
  .acc-layout { display: flex; gap: 20px; align-items: flex-start; }

  /* Sidebar */
  .acc-sidebar {
    width: 220px; flex-shrink: 0; background: var(--acc-card);
    border: 1px solid var(--acc-border); border-radius: var(--acc-radius);
    box-shadow: var(--acc-shadow); padding: 8px; position: sticky; top: 0;
  }
  .acc-nav { display: flex; flex-direction: column; gap: 2px; }
  .acc-nav-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--acc-text-2);
    background: none; border: none; cursor: pointer; text-align: left;
    transition: all 0.16s; width: 100%;
  }
  .acc-nav-item i { font-size: 17px; flex-shrink: 0; }
  .acc-nav-item:hover { background: #f1f4f8; color: var(--acc-text); }
  .acc-nav-item.active { background: var(--acc-accent-bg); color: var(--acc-accent); font-weight: 700; }
  .acc-nav-item.danger { color: var(--acc-red); }
  .acc-nav-item.danger:hover { background: var(--acc-red-bg); }
  .acc-nav-item.active-danger { background: var(--acc-red-bg); color: var(--acc-red); font-weight: 700; }
  .acc-nav-divider { height: 1px; background: var(--acc-border); margin: 6px 8px; }

  /* Main */
  .acc-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }

  /* Card */
  .acc-card {
    background: var(--acc-card); border: 1px solid var(--acc-border);
    border-radius: var(--acc-radius); box-shadow: var(--acc-shadow); padding: 24px 28px;
  }
  .acc-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
  .acc-card-title { font-size: 15px; font-weight: 700; color: var(--acc-text); display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .acc-card-title i { color: var(--acc-accent); font-size: 17px; }
  .acc-card-desc { font-size: 12px; color: var(--acc-muted); max-width: 480px; line-height: 1.5; }
  .danger-card { border-left: 4px solid var(--acc-red); }
  .danger-title { color: var(--acc-red) !important; }
  .danger-title i { color: var(--acc-red) !important; }

  /* Avatar */
  .avatar-section { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
  .avatar-circle {
    width: 72px; height: 72px; background: var(--acc-accent-bg); color: var(--acc-accent);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 34px; flex-shrink: 0; border: 2px solid rgba(29,158,117,0.25);
  }
  .avatar-name { font-size: 17px; font-weight: 700; color: var(--acc-text); }
  .avatar-email { font-size: 12px; color: var(--acc-muted); margin-top: 2px; }
  .btn-link {
    display: inline-flex; align-items: center; gap: 5px; background: none; border: none;
    cursor: pointer; color: var(--acc-accent); font-size: 12px; font-weight: 600;
    padding: 0; margin-top: 6px; text-decoration: underline;
  }
  .btn-link:hover { opacity: 0.8; }

  /* Form */
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 6px; }
  .form-label { font-size: 12px; font-weight: 600; color: var(--acc-text-2); display: flex; align-items: center; gap: 8px; }
  .form-hint { font-size: 10px; font-weight: 500; color: var(--acc-muted); background: #f1f4f8; padding: 2px 7px; border-radius: 99px; }
  .form-hint-block { font-size: 11px; color: var(--acc-muted); margin-top: 5px; }
  .form-hint-block code { font-family: 'Inter', monospace; background: #f1f4f8; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
  .form-input {
    padding: 9px 13px; font-size: 13px; border: 1px solid var(--acc-border);
    border-radius: 8px; background: var(--bg-panel); color: var(--acc-text);
    outline: none; transition: border-color 0.18s; font-family: inherit; width: 100%;
  }
  .form-input:focus { border-color: var(--acc-accent); box-shadow: 0 0 0 3px rgba(29,158,117,0.1); }
  .form-input.disabled { background: #f8f9fb; color: var(--acc-muted); cursor: not-allowed; }
  .form-select {
    padding: 9px 13px; font-size: 13px; border: 1px solid var(--acc-border);
    border-radius: 8px; background: var(--bg-panel); color: var(--acc-text);
    outline: none; font-family: inherit; cursor: pointer; width: 100%;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px;
  }
  .form-select:focus { border-color: var(--acc-accent); box-shadow: 0 0 0 3px rgba(29,158,117,0.1); }
  .form-divider { height: 1px; background: var(--acc-border); margin: 20px 0; }
  .form-actions { display: flex; align-items: center; gap: 10px; }
  .mt-16 { margin-top: 16px; } .mt-20 { margin-top: 20px; } .mt-8 { margin-top: 8px; } .mt-12 { margin-top: 12px; }
  .input-with-action { position: relative; display: flex; }
  .input-with-action .form-input { padding-right: 44px; }
  .btn-icon-inline {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; color: var(--acc-muted);
    font-size: 16px; display: flex; align-items: center; padding: 4px; border-radius: 4px;
  }
  .btn-icon-inline:hover { color: var(--acc-text); }

  /* Buttons */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px;
    font-size: 13px; font-weight: 600; background: var(--acc-accent); color: #fff;
    border: 1px solid var(--acc-accent); border-radius: 8px; cursor: pointer;
    transition: all 0.18s; font-family: inherit;
  }
  .btn-primary:hover { filter: brightness(1.08); }
  .btn-primary i { font-size: 15px; }
  .btn-danger-outline {
    display: inline-flex; align-items: center; gap: 7px; padding: 9px 18px;
    font-size: 13px; font-weight: 600; background: transparent; color: var(--acc-red);
    border: 1px solid var(--acc-red); border-radius: 8px; cursor: pointer;
    transition: all 0.18s; font-family: inherit;
  }
  .btn-danger-outline:hover { background: var(--acc-red); color: #fff; }
  .btn-danger-outline.sm { padding: 7px 13px; font-size: 12px; }
  .btn-danger-outline[disabled] { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
  .btn-danger-solid {
    display: inline-flex; align-items: center; gap: 7px; padding: 10px 20px;
    font-size: 13px; font-weight: 700; background: var(--acc-red); color: #fff;
    border: 1px solid var(--acc-red); border-radius: 8px; cursor: pointer;
    transition: all 0.18s; font-family: inherit;
  }
  .btn-danger-solid:hover { filter: brightness(1.08); }
  .btn-danger-solid:disabled { opacity: 0.4; cursor: not-allowed; }
  .gap-8 { gap: 8px; }

  /* Badges */
  .badge {
    display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700;
    letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 9px;
    border-radius: 99px; border: 1px solid; white-space: nowrap;
  }
  .badge.green { background: var(--acc-accent-bg); color: var(--acc-accent); border-color: rgba(29,158,117,0.3); }
  .badge.gray { background: #f1f4f8; color: var(--text-secondary); border-color: #e5e9f0; }
  .badge.blue { background: var(--acc-blue-bg); color: var(--acc-blue); border-color: rgba(59,130,246,0.3); }
  .badge.orange { background: var(--acc-orange-bg); color: var(--acc-orange); border-color: rgba(234,88,12,0.3); }
  .badge-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .badge-col { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
  .badge-date { font-size: 11px; color: var(--acc-muted); }

  /* Info Box */
  .info-box { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: 8px; font-size: 12px; line-height: 1.6; }
  .info-box.blue { background: var(--acc-blue-bg); border: 1px solid rgba(59,130,246,0.2); color: #1d4ed8; }
  .info-box i { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

  /* Warning Box */
  .warning-box {
    display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px;
    border-radius: 8px; background: var(--acc-red-bg); border: 1px solid rgba(220,38,38,0.2);
    font-size: 13px; color: #991b1b; line-height: 1.6;
  }
  .warning-box i { font-size: 18px; flex-shrink: 0; margin-top: 1px; color: var(--acc-red); }

  /* Checkbox */
  .checkbox-label { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--acc-text-2); cursor: pointer; font-weight: 500; }
  .checkbox-label input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--acc-red); }

  /* Section header */
  .section-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .section-title { font-size: 15px; font-weight: 700; color: var(--acc-text); display: flex; align-items: center; gap: 8px; }
  .section-title i { color: var(--acc-accent); font-size: 17px; }
  .section-count { font-size: 11px; font-weight: 700; color: var(--acc-muted); background: #f1f4f8; border: 1px solid var(--acc-border); padding: 3px 10px; border-radius: 99px; text-transform: uppercase; }

  /* Sub-tabs */
  .sub-tabs { display: flex; gap: 4px; background: #f1f4f8; border: 1px solid var(--acc-border); border-radius: 8px; padding: 4px; margin-bottom: 12px; width: fit-content; }
  .sub-tab { padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; border: none; background: none; cursor: pointer; color: var(--acc-text-2); transition: all 0.16s; }
  .sub-tab.active { background: var(--bg-panel); color: var(--acc-accent); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }

  /* Method Card */
  .method-card { padding: 20px 24px; }
  .method-row { display: flex; align-items: flex-start; gap: 16px; }
  .method-icon-wrap { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
  .method-icon-wrap.sso { background: #eff6ff; color: #3b82f6; }
  .method-icon-wrap.local { background: var(--acc-accent-bg); color: var(--acc-accent); }
  .method-body { flex: 1; min-width: 0; }
  .method-name { font-size: 14px; font-weight: 700; color: var(--acc-text); margin-bottom: 3px; }
  .method-email { font-size: 12px; color: var(--acc-muted); margin-bottom: 4px; }
  .method-expiry { font-size: 12px; font-weight: 600; color: var(--acc-text-2); display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
  .method-expiry i { color: var(--acc-accent); }
  .method-note { font-size: 11px; color: var(--acc-muted); line-height: 1.5; }
  .method-status { flex-shrink: 0; }
  .method-status-col { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
  .btn-dots { width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--acc-border); background: var(--bg-panel); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; color: var(--acc-muted); }
  .btn-dots:hover { background: #f1f4f8; color: var(--acc-text); }

  /* Device Card */
  .device-card { padding: 20px 24px; }
  .device-row { display: flex; align-items: flex-start; gap: 16px; }
  .device-icon { width: 44px; height: 44px; background: #f1f4f8; border: 1px solid var(--acc-border); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; color: var(--acc-text-2); flex-shrink: 0; }
  .device-body { flex: 1; min-width: 0; }
  .device-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .device-name { font-size: 14px; font-weight: 700; color: var(--acc-text); }
  .device-ua { font-size: 11px; color: var(--acc-muted); font-family: 'Inter', monospace; background: #f8f9fb; border: 1px solid var(--acc-border); padding: 6px 10px; border-radius: 6px; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .device-meta { font-size: 12px; color: var(--acc-muted); display: flex; align-items: center; gap: 5px; }
  .device-meta i { color: var(--acc-accent); }
  .device-action { flex-shrink: 0; display: flex; align-items: center; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; color: var(--acc-muted); font-size: 13px; }
  .empty-state i { font-size: 32px; opacity: 0.4; }

  /* Toast */
  .acc-toast {
    position: fixed; bottom: 28px; right: 28px; z-index: 9999;
    display: flex; align-items: center; gap: 10px; padding: 13px 20px;
    border-radius: 10px; font-size: 13px; font-weight: 600;
    box-shadow: 0 8px 24px rgba(0,0,0,0.14);
    animation: toastIn 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .acc-toast.success { background: var(--acc-accent); color: #fff; }
  .acc-toast.error { background: var(--acc-red); color: #fff; }
  .acc-toast i { font-size: 18px; }
  @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

  /* Dark theme */
  :global([data-theme="dark"]) .acc-sidebar,
  :global([data-theme="dark"]) .acc-card { background: var(--bg-panel); border-color: var(--border); }
  :global([data-theme="dark"]) .acc-page { --acc-text: #e8eaf0; --acc-text-2: #8b95a8; --acc-muted: #5a6478; --acc-border: rgba(255,255,255,0.08); --acc-card: #181b24; }
  :global([data-theme="dark"]) .acc-title,
  :global([data-theme="dark"]) .device-name,
  :global([data-theme="dark"]) .method-name { color: var(--text-primary); }
  :global([data-theme="dark"]) .form-input,
  :global([data-theme="dark"]) .form-select { background: #1f2330; color: var(--text-primary); border-color: rgba(255,255,255,0.1); }
  :global([data-theme="dark"]) .btn-local-login,
  :global([data-theme="dark"]) .btn-dots { background: #1f2330; border-color: rgba(255,255,255,0.1); color: #8b95a8; }
  :global([data-theme="dark"]) .acc-nav-item:hover { background: rgba(255,255,255,0.05); }
  :global([data-theme="dark"]) .sub-tabs { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
  :global([data-theme="dark"]) .sub-tab.active { background: #1f2330; }
  :global([data-theme="dark"]) .device-icon,
  :global([data-theme="dark"]) .device-ua,
  :global([data-theme="dark"]) .form-input.disabled { background: rgba(255,255,255,0.05); }
  :global([data-theme="dark"]) .badge.gray { background: rgba(255,255,255,0.06); color: #8b95a8; border-color: rgba(255,255,255,0.1); }
  :global([data-theme="dark"]) .section-count { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.08); }
  :global([data-theme="dark"]) .info-box.blue { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.2); color: #93c5fd; }
  :global([data-theme="dark"]) .warning-box { background: rgba(220,38,38,0.1); border-color: rgba(220,38,38,0.2); color: #fca5a5; }
  :global([data-theme="dark"]) .form-hint { background: rgba(255,255,255,0.06); }
  :global([data-theme="dark"]) .form-hint-block code { background: rgba(255,255,255,0.06); }
</style>
