<script lang="ts">
  import { onMount } from 'svelte';
  import { themeStore } from '../../../stores/theme';
  import AuthIcon from './AuthIcon.svelte';

  export let stage: 'login' | 'verify' | 'reset_password' | 'sso' = 'login';
  let activeFeature = 0;
  const features = [
    { name: 'Observe', icon: 'radar', title: 'เห็นภาพรวมจากทุกสัญญาณ', detail: 'รวมเหตุการณ์ด้านความปลอดภัยไว้ในมุมมองเดียว เพื่อให้ทีมเห็นภาพและค้นหาสิ่งที่สำคัญได้เร็วขึ้น' },
    { name: 'Detect', icon: 'shield', title: 'เชื่อมโยงสัญญาณ ค้นหาภัยคุกคาม', detail: 'วิเคราะห์เหตุการณ์และพฤติกรรมที่น่าสงสัย เพื่อช่วยทีมตรวจสอบและจัดลำดับความสำคัญ' },
    { name: 'Respond', icon: 'bolt', title: 'จากข้อมูล สู่การรับมือที่ชัดเจน', detail: 'ใช้ข้อมูลประกอบการสืบค้นและตอบสนองต่อเหตุการณ์ เพื่อดูแลเครือข่ายของมหาวิทยาลัย' },
  ];

  onMount(() => {
    const saved = localStorage.getItem('theme');
    $themeStore = saved === 'light' || saved === 'dark' ? saved : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', $themeStore);
  });

  function toggleTheme() {
    $themeStore = $themeStore === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', $themeStore);
    localStorage.setItem('theme', $themeStore);
  }
</script>

<div class="auth-layout">
  <aside class="brand-panel" aria-label="เกี่ยวกับ SIEM KKU">
    <div class="brand-grid" aria-hidden="true"></div>
    <a class="wordmark" href="/" data-sveltekit-reload aria-label="SIEM KKU หน้าเข้าสู่ระบบ">
      <span class="wordmark-icon"><AuthIcon size={25} /></span>
      <span><strong>KKU</strong><span class="wordmark-divider"></span>SECURITY OPERATIONS</span>
    </a>

    <div class="brand-main">
      <div class="eyebrow"><span></span> KHON KAEN UNIVERSITY</div>
      <h1>SIEM <span>KKU.</span></h1>
      <p class="brand-subtitle">มองเห็นทุกสัญญาณ<br />ปกป้องทุกการเชื่อมต่อ</p>
      <p class="brand-description">Security Information &amp; Event Management<br />พื้นที่ทำงานของทีมความปลอดภัยไซเบอร์ มหาวิทยาลัยขอนแก่น</p>

      <div class="security-visual" aria-hidden="true">
        <div class="radar-disc"><div class="radar-sweep"></div><div class="radar-ring ring-one"></div><div class="radar-ring ring-two"></div><div class="radar-ring ring-three"></div><div class="radar-axis horizontal"></div><div class="radar-axis vertical"></div></div>
        <div class="shield-emblem">
          <svg viewBox="0 0 120 140" fill="none"><defs><linearGradient id="siem-shield" x1="16" y1="0" x2="100" y2="136" gradientUnits="userSpaceOnUse"><stop stop-color="#45f2be" /><stop offset="1" stop-color="#128e79" /></linearGradient></defs><path d="M60 6 108 24v42c0 32-48 64-48 64S12 98 12 66V24L60 6Z" fill="#0b302e" stroke="url(#siem-shield)" stroke-width="2" /><path d="M60 17 98 31v34c0 25-38 53-38 53S22 90 22 65V31l38-14Z" fill="#104238" fill-opacity=".55" stroke="#48eab5" stroke-opacity=".16" /><path d="m41 68 13 13 27-29" stroke="#6cffd0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /><path d="M60 0v10 M60 129v11 M0 65h12 M108 65h12" stroke="#3ee8b3" stroke-opacity=".6" /></svg>
        </div>
        <span class="signal-point point-one"></span><span class="signal-point point-two"></span><span class="signal-point point-three"></span>
        <span class="orbit-label label-one"><AuthIcon name="radar" size={14} /> EVENT VISIBILITY</span>
        <span class="orbit-label label-two"><AuthIcon size={14} /> THREAT DETECTION</span>
        <span class="orbit-label label-three"><AuthIcon name="bolt" size={14} /> INCIDENT RESPONSE</span>
      </div>

      <div class="feature-switcher" role="group" aria-label="สำรวจความสามารถของ SIEM">
        {#each features as feature, index}
          <button type="button" class:active={activeFeature === index} aria-pressed={activeFeature === index} on:click={() => activeFeature = index}><span class="feature-number">0{index + 1}</span> {feature.name}<AuthIcon name={feature.icon} size={17} /></button>
        {/each}
      </div>
      <div class="feature-detail" aria-live="polite"><h2>{features[activeFeature].title}</h2><p>{features[activeFeature].detail}</p></div>
    </div>
    <div class="brand-footer"><span class="footer-line"></span> ONE PLATFORM. CONNECTED DEFENSE.<span class="version">V 3.0</span></div>
  </aside>

  <main class="access-panel">
    <div class="access-top"><span><AuthIcon name="lock" size={14} /> IDENTITY &amp; ACCESS</span><button class="theme-button" on:click={toggleTheme} aria-label={$themeStore === 'dark' ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'} title={$themeStore === 'dark' ? 'ธีมสว่าง' : 'ธีมมืด'}><AuthIcon name={$themeStore === 'dark' ? 'sun' : 'moon'} size={19} /></button></div>
    <div class="access-content">
      <div class="access-kicker"><span class="access-dot"></span> KKU SIEM <span class="access-version">3.0</span></div>
      <nav class="auth-steps" aria-label="ขั้นตอนเข้าสู่ระบบ">
        <span class:current={stage === 'login' || stage === 'sso'}><span>01</span> บัญชีผู้ใช้</span><span class="step-line"></span><span class:current={stage === 'verify' || stage === 'reset_password'}><span>02</span> ยืนยันตัวตน</span><span class="step-line"></span><span><span>03</span> เข้าใช้งาน</span>
      </nav>
      <slot />
    </div>
    <footer class="access-footer"><span><AuthIcon size={15} /> สำหรับผู้ใช้งานที่ได้รับอนุญาตเท่านั้น</span><span>Khon Kaen University</span></footer>
  </main>
</div>

<style>
  .auth-layout { min-height: 100svh; display: grid; grid-template-columns: 56% 44%; }
  .brand-panel { position: relative; display: flex; flex-direction: column; overflow: hidden; background: #091f29; color: #eefaf6; padding: 42px 64px 30px; isolation: isolate; }
  .brand-panel::before { content: ''; position: absolute; z-index: -1; width: 700px; height: 700px; right: -350px; top: 25%; background: radial-gradient(circle, #147b6540, transparent 65%); }
  .brand-grid { position: absolute; inset: 0; z-index: -1; opacity: .22; background-image: linear-gradient(#74bda60c 1px, transparent 1px), linear-gradient(90deg, #74bda60c 1px, transparent 1px); background-size: 52px 52px; mask-image: linear-gradient(to bottom, transparent, black 25%, black 75%, transparent); }
  .wordmark { display: flex; align-items: center; gap: 13px; text-decoration: none; color: #b4cdc8; font-size: 10px; font-weight: 500; letter-spacing: 1.7px; }
  .wordmark > span:last-child { display: flex; align-items: center; }
  .wordmark strong { color: #fff; font-size: 19px; letter-spacing: .6px; }
  .wordmark-icon { display: grid; place-items: center; width: 43px; height: 43px; border: 1px solid #4bcc9d40; border-radius: 12px; color: #51e5b6; background: #143c35; }
  .wordmark-divider { width: 1px; height: 18px; background: #abc5bd38; margin: 0 13px; }
  .brand-main { width: 100%; max-width: 580px; margin: auto; padding: 58px 0 30px; }
  .eyebrow { display: flex; align-items: center; gap: 9px; font-size: 10px; letter-spacing: 2.3px; color: #91b9ac; font-weight: 500; }
  .eyebrow > span { height: 5px; width: 5px; background: #50d8ae; border-radius: 50%; }
  h1 { font-size: clamp(50px, 5.3vw, 83px); letter-spacing: -3px; line-height: 1.2; font-weight: 600; margin: 17px 0 17px; }
  h1 span { color: #58e4b4; }
  .brand-subtitle { font-size: clamp(20px, 2vw, 28px); line-height: 1.65; font-weight: 400; margin: 0; color: #e0eee9; }
  .brand-description { font-size: 12px; line-height: 1.85; color: #92afa7; margin: 15px 0 0; }
  .security-visual { position: relative; height: 254px; max-width: 490px; margin: 11px auto 5px; }
  .radar-disc { position: absolute; height: 250px; width: 250px; border-radius: 50%; top: 2px; left: 50%; transform: translateX(-50%); overflow: hidden; background: radial-gradient(circle, #25b78814, transparent 70%); }
  .radar-ring { position: absolute; border: 1px solid #64ccad22; border-radius: 50%; inset: 0; }
  .ring-two { inset: 28px; border-style: dashed; border-color: #64ccad25; }
  .ring-three { inset: 57px; }
  .radar-sweep { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0deg, #30dfa000 290deg, #30dfa025 360deg); animation: sweep 14s linear infinite; }
  .radar-axis { position: absolute; background: #5ce0b812; }
  .horizontal { height: 1px; width: 100%; top: 50%; }
  .vertical { width: 1px; height: 100%; left: 50%; }
  .shield-emblem { position: absolute; left: 50%; top: 50%; width: 104px; transform: translate(-50%, -50%); filter: drop-shadow(0 10px 26px #1de6a41a); animation: float 6s ease-in-out infinite; }
  .shield-emblem svg { width: 100%; }
  .signal-point { position: absolute; height: 6px; width: 6px; background: #68efc6; border-radius: 50%; box-shadow: 0 0 0 5px #38da9c15, 0 0 12px #31bf95; animation: pulse 4s ease-in-out infinite; }
  .point-one { top: 41px; left: calc(50% - 89px); }.point-two { top: 111px; left: calc(50% + 100px); animation-delay: 1s; }.point-three { bottom: 29px; left: calc(50% - 49px); animation-delay: 2s; }
  .orbit-label { position: absolute; display: flex; align-items: center; gap: 7px; color: #a6c5ba; font-size: 8px; letter-spacing: 1px; background: #112f30; padding: 9px 11px; border-radius: 6px; border: 1px solid #78bda620; }
  .label-one { top: 40px; left: 0; }.label-two { top: 118px; right: 0; }.label-three { bottom: 25px; left: 8px; }
  .feature-switcher { display: flex; gap: 7px; border-bottom: 1px solid #adc9bf21; padding-bottom: 12px; }
  .feature-switcher button { display: flex; align-items: center; justify-content: space-between; gap: 9px; flex: 1; color: #9dbdb1; background: transparent; border: 1px solid transparent; border-radius: 8px; padding: 10px 12px; font-size: 12px; cursor: pointer; transition: background .2s, color .2s; }
  .feature-switcher button.active { color: #76efc4; background: #43dca012; border-color: #43dca02d; }.feature-switcher button:hover { background: #43dca01c; }.feature-number { font-size: 9px; opacity: .6; }
  .feature-detail { min-height: 95px; padding-top: 17px; }.feature-detail h2 { font-size: 14px; font-weight: 500; margin: 0 0 6px; }.feature-detail p { font-size: 11px; line-height: 1.85; color: #9cb6ac; max-width: 430px; margin: 0; }
  .brand-footer { display: flex; align-items: center; gap: 10px; color: #94b0a5; font-size: 8px; letter-spacing: 1.5px; }.footer-line { width: 24px; height: 1px; background: #5bc8a3; }.version { margin-left: auto; color: #9db8ad; }
  .access-panel { display: flex; flex-direction: column; min-width: 0; padding: 35px 46px 27px; background: var(--bg-panel); color: var(--text-primary); }
  .access-top { display: flex; align-items: center; justify-content: space-between; }.access-top > span { display: flex; align-items: center; gap: 8px; font-size: 9px; letter-spacing: 1.7px; color: var(--text-secondary); }
  .theme-button { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 10px; background: transparent; color: var(--text-secondary); cursor: pointer; }.theme-button:hover { background: var(--bg-secondary); }
  .access-content { width: 100%; max-width: 400px; margin: auto; padding: 55px 0; }
  .access-kicker { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 1.3px; }.access-dot { width: 7px; height: 7px; background: #1d9e75; border-radius: 2px; }.access-version { font-size: 9px; border-radius: 4px; padding: 2px 5px; background: var(--green-bg); color: var(--green); letter-spacing: 0; }
  .auth-steps { display: flex; align-items: center; gap: 8px; margin: 26px 0 32px; }.auth-steps > span:not(.step-line) { display: flex; align-items: center; gap: 5px; white-space: nowrap; font-size: 9px; color: var(--text-secondary); }.auth-steps > span > span { font-size: 9px; }.auth-steps .current { color: var(--green) !important; font-weight: 600; }.step-line { width: 15px; height: 1px; background: var(--border); }
  .access-footer { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 10px; }.access-footer > span:first-child { display: flex; align-items: center; gap: 6px; }.access-footer > span:last-child { font-size: 9px; opacity: .8; }
  :global(.auth-layout *) { box-sizing: border-box; }
  :global(.auth-heading) { font-size: 32px; letter-spacing: -.7px; font-weight: 600; line-height: 1.4; margin: 0 0 8px; color: var(--text-primary); }
  :global(.auth-description) { margin: 0 0 30px; color: var(--text-secondary); font-size: 12px; line-height: 1.85; }
  :global(.auth-field) { margin-bottom: 20px; }:global(.auth-field label) { display: block; margin-bottom: 8px; font-size: 12px; font-weight: 500; }
  :global(.auth-input-wrap) { display: flex; align-items: center; position: relative; }
  :global(.auth-input-wrap > svg) { position: absolute; left: 15px; color: var(--text-secondary); pointer-events: none; }
  :global(.auth-input) { width: 100%; min-height: 51px; border: 1px solid var(--border); border-radius: 9px; padding: 13px 45px 13px 44px; background: var(--bg); color: var(--text-primary); font-size: 13px; transition: border-color .2s, box-shadow .2s; }
  :global(.auth-input::placeholder) { color: var(--text-secondary); opacity: .8; }:global(.auth-input:focus) { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px #1d9e7514; }
  :global(.auth-eye) { position: absolute; right: 8px; width: 35px; height: 35px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 6px; color: var(--text-secondary); cursor: pointer; }
  :global(.auth-button) { width: 100%; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 10px; background: #168361; color: #fff; border: 1px solid transparent; border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .2s, transform .2s; text-decoration: none; padding: 12px 18px; }
  :global(.auth-button:hover:not(:disabled)) { background: #116e51; transform: translateY(-1px); }:global(.auth-button:disabled) { opacity: .5; cursor: not-allowed; }
  :global(.auth-button.secondary) { background: transparent; border-color: var(--border); color: var(--text-primary); font-weight: 500; }:global(.auth-button.secondary:hover:not(:disabled)) { background: var(--bg-secondary); }
  :global(.auth-divider) { display: flex; align-items: center; gap: 14px; color: var(--text-secondary); font-size: 10px; margin: 25px 0; }:global(.auth-divider::before), :global(.auth-divider::after) { content: ''; flex: 1; height: 1px; background: var(--border); }
  :global(.auth-help) { font-size: 11px; line-height: 1.8; color: var(--text-secondary); margin: 20px 0 0; padding: 13px 15px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); }
  :global(.auth-alert) { display: flex; align-items: flex-start; gap: 9px; padding: 12px 14px; border-radius: 8px; margin-bottom: 18px; font-size: 12px; line-height: 1.8; background: var(--red-bg); color: var(--red); }:global(.auth-alert > svg) { flex-shrink: 0; margin-top: 2px; }:global(.auth-alert.warning) { background: var(--orange-bg); color: #b07414; }
  :global(.auth-hint) { font-size: 11px; color: var(--text-secondary); line-height: 1.7; margin: 8px 0 0; }:global(.auth-hint.success) { color: var(--green); }:global(.auth-hint.warning) { color: #b07414; }
  :global(.auth-back) { display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; margin-top: 19px; font-size: 12px; color: var(--text-secondary); background: none; border: none; cursor: pointer; padding: 9px; }
  :global(.auth-stage-icon) { display: grid; place-items: center; width: 50px; height: 50px; margin-bottom: 20px; background: var(--green-bg); color: var(--green); border: 1px solid #1d9e7522; border-radius: 14px; }
  :global(.auth-spinner) { height: 17px; width: 17px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: sweep .8s linear infinite; }
  :global(.auth-layout button:focus-visible), :global(.auth-layout a:focus-visible) { outline: 2px solid #1d9e75; outline-offset: 4px; }
  @keyframes sweep { to { transform: rotate(360deg); } } @keyframes float { 50% { transform: translate(-50%, calc(-50% - 6px)); } } @keyframes pulse { 50% { opacity: .4; } }
  @media (min-width: 1600px) { .brand-panel { padding-left: 84px; padding-right: 84px; }.brand-main { max-width: 640px; }.security-visual { margin-top: 26px; margin-bottom: 22px; height: 285px; }.radar-disc { top: 18px; } }
  @media (max-width: 1100px) { .brand-panel { padding: 30px 36px 26px; }.access-panel { padding: 28px 32px; }.feature-switcher button { padding: 9px 8px; }.wordmark { font-size: 8px; letter-spacing: 1px; }.orbit-label { font-size: 7px; padding: 7px; }.brand-description { font-size: 11px; } }
  @media (max-width: 760px) { .auth-layout { grid-template-columns: 1fr; }.brand-panel { padding: 23px 26px 26px; }.brand-main { padding: 28px 0 0; margin: 0; }.eyebrow { font-size: 8px; }h1 { font-size: 47px; margin: 10px 0; letter-spacing: -2px; }.brand-subtitle { font-size: 17px; }.brand-subtitle br { display: none; }.brand-description, .security-visual, .feature-switcher, .feature-detail, .brand-footer { display: none; }.access-panel { padding: 23px 25px 28px; }.access-content { padding: 32px 0 35px; }.auth-steps { margin: 20px 0 25px; }:global(.auth-heading) { font-size: 28px; } }
  @media (prefers-reduced-motion: reduce) { .radar-sweep, .signal-point, .shield-emblem { animation: none; }:global(.auth-layout *) { transition: none !important; } }
</style>
