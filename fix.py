import codecs
import re

with codecs.open("frontend/src/routes/+page.svelte", "r", "utf-8") as f:
    content = f.read()

new_html = """    {:else if authStage === 'reset_password'}
      <form on:submit|preventDefault={handleForceReset} class="mfa-form">
        <div class="mfa-icon"><i class="ti ti-lock"></i></div>
        <h3>เปลี่ยนรหัสผ่านครั้งแรก</h3>
        <p>เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านใหม่ก่อนเข้าใช้งาน</p>
        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px; text-align: left; line-height: 1.4;">
          * รหัสผ่านต้องมีความยาวอย่างน้อย 12 ตัวอักษร<br>
          * ประกอบด้วยตัวอักษรพิมพ์ใหญ่, พิมพ์เล็ก, และตัวเลข
        </p>
        
        <div class="form-group">
          <label for="new-pwd">รหัสผ่านใหม่</label>
          <input type="password" id="new-pwd" bind:value={newPassword} required class="input-totp" style="font-size: 16px; letter-spacing: 2px;" placeholder="กรอกรหัสผ่านใหม่" />
        </div>
        <div class="form-group">
          <label for="conf-pwd">ยืนยันรหัสผ่านใหม่</label>
          <input type="password" id="conf-pwd" bind:value={confirmPassword} required class="input-totp" style="font-size: 16px; letter-spacing: 2px;" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" />
        </div>

        <button type="submit" class="btn-primary" disabled={isLoading || newPassword.length < 12}>
          {#if isLoading}<span class="spinner"></span>{/if}
          ยืนยันการเปลี่ยนรหัสผ่าน
        </button>
        <button type="button" class="btn-secondary" on:click={goBackToLogin}>กลับสู่หน้าล็อคอิน</button>
      </form>

      {:else}"""

content = re.sub(r"\{\:else if authStage === 'reset_password'\}.*?\{\:else\}", new_html, content, flags=re.DOTALL)

with codecs.open("frontend/src/routes/+page.svelte", "w", "utf-8") as f:
    f.write(content)
