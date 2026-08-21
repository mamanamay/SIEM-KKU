const fs = require('fs');
const file = 'src/routes/dashboard/+layout.svelte';
let content = fs.readFileSync(file, 'utf8');

const oldProfileMenu = `        {#if showProfileMenu}
          <!-- Backdrop to close menu -->
          <div style="position:fixed; inset:0; z-index:99;" on:click={() => showProfileMenu = false}></div>
          <div class="profile-dropdown" style="position: absolute; bottom: calc(100% + 8px); left: 0; width: 300px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); z-index: 100; padding: 16px;">
            <div class="dropdown-head" style="display: flex; gap: 12px; align-items: center; margin-bottom: 16px;">
              <div class="avatar lg" style="width: 48px; height: 48px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; font-size: 20px;"><i class="ti ti-user"></i></div>
              <div>
                <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: var(--text-primary);">นภัสวรรณ ชัยบาล</h4>
                <div style="display: inline-block; padding: 2px 6px; background: rgba(59,130,246,0.1); color: #3b82f6; border-radius: 4px; font-size: 10px; font-weight: 700; margin: 4px 0;">นักวิเคราะห์ SOC</div>
                <div style="font-size: 12px; color: var(--text-muted);">napatwan.c@kkumail.com</div>
              </div>
            </div>

            <div class="dropdown-section" style="margin-bottom: 16px;">
              <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); display: flex; align-items: center; gap: 6px; margin-bottom: 8px;"><i class="ti ti-palette"></i> ธีมการแสดงผล</div>
              <div class="theme-toggle-group" style="display: flex; background: var(--bg-secondary); border-radius: 8px; padding: 4px;">
                <button class="theme-btn"><i class="ti ti-sun"></i> Light</button>
                <button class="theme-btn active"><i class="ti ti-device-desktop"></i> Sys</button>
                <button class="theme-btn"><i class="ti ti-moon"></i> Dark</button>
              </div>
            </div>

            <hr class="ds-divider" style="margin: 12px 0;" />

            <div class="dropdown-menu">
              <a href="/dashboard/account" class="menu-link" on:click={() => showProfileMenu = false}><i class="ti ti-user-edit"></i> แก้ไขประวัติส่วนตัว</a>
              <button class="menu-link text-red" on:click={() => logout()}><i class="ti ti-logout"></i> ออกจากระบบ</button>
            </div>
          </div>
        {/if}`;

const newProfileMenu = `        {#if showProfileMenu}
          <!-- Backdrop to close menu -->
          <div style="position:fixed; inset:0; z-index:99;" on:click={() => showProfileMenu = false}></div>
          <div class="profile-dropdown" style="position: absolute; bottom: calc(100% + 12px); left: 16px; width: 260px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); z-index: 100; overflow: hidden; display: flex; flex-direction: column;">
            
            <div class="dropdown-header" style="padding: 16px; background: var(--bg-secondary); border-bottom: 1px solid var(--border);">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="avatar" style="width: 40px; height: 40px; border-radius: 50%; background: var(--color-cyan); color: #000; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700;">N</div>
                <div style="overflow: hidden;">
                  <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">นภัสวรรณ ชัยบาล</div>
                  <div style="font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">napatwan.c@kkumail.com</div>
                </div>
              </div>
              <div style="margin-top: 12px; display: flex; align-items: center; gap: 6px;">
                <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                  <i class="ti ti-shield-check" style="font-size: 12px;"></i> นักวิเคราะห์ SOC
                </span>
              </div>
            </div>

            <div class="dropdown-body" style="padding: 8px;">
              <a href="/dashboard/settings" class="menu-link-modern" on:click={() => showProfileMenu = false} style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--text-primary); text-decoration: none; transition: background 0.2s;">
                <i class="ti ti-settings" style="font-size: 16px; color: var(--text-muted);"></i> การตั้งค่าระบบ
              </a>
              <a href="/dashboard/account" class="menu-link-modern" on:click={() => showProfileMenu = false} style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--text-primary); text-decoration: none; transition: background 0.2s;">
                <i class="ti ti-user-edit" style="font-size: 16px; color: var(--text-muted);"></i> แก้ไขประวัติส่วนตัว
              </a>
            </div>

            <div class="dropdown-footer" style="padding: 8px; border-top: 1px solid var(--border); background: var(--bg-surface);">
              <button on:click={() => logout()} style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: none; background: none; border-radius: 8px; font-size: 13px; font-weight: 500; color: #ef4444; cursor: pointer; text-align: left; transition: background 0.2s;">
                <i class="ti ti-logout" style="font-size: 16px;"></i> ออกจากระบบ
              </button>
            </div>
          </div>
        {/if}`;

// I will just replace the old block with the new one. Since there might be slight encoding differences (Thai chars), I will use regex or find-replace.
const oldProfileRegex = /\{\#if showProfileMenu\}[\s\S]*?<\/div>\s*\{\/if\}/;

if (oldProfileRegex.test(content)) {
  content = content.replace(oldProfileRegex, newProfileMenu);
  fs.writeFileSync(file, content);
  console.log('Updated profile menu');
} else {
  console.log('Profile menu not found');
}
