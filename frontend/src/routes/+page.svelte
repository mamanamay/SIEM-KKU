<script lang="ts">
  import { onMount } from 'svelte';

  let username = '';
  let password = '';
  let error = '';

  async function handleLogin() {
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
      error = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
    }
  }

  onMount(() => {
    if (localStorage.getItem('token')) {
      window.location.href = '/dashboard';
    }
  });
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-100">
  <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
    <div class="text-center mb-8">
      <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <i class="ti ti-shield-check text-3xl text-green-600"></i>
      </div>
      <h2 class="text-2xl font-bold text-gray-900">เข้าสู่ระบบ</h2>
      <p class="text-gray-500 mt-2">Honeypot Dashboard (Enterprise PoC)</p>
    </div>

    {#if error}
      <div class="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm text-center">{error}</div>
    {/if}

    <form on:submit|preventDefault={handleLogin} class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้ (admin หรือ guest)</label>
        <input type="text" bind:value={username} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition" required>
      </div>
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
        <input type="password" bind:value={password} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition" required>
      </div>
      <button type="submit" class="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition">
        เข้าสู่ระบบ
      </button>
    </form>
  </div>
</div>
