const fs = require('fs');
const file = 'src/routes/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// I will just add a new animated background and make the login card sleek glassmorphism
const newStyle = `<style>
  :global(body) { margin: 0; font-family: 'Inter', sans-serif; background: #050a14; overflow: hidden; }
  
  .login-bg {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 1;
  }
  
  /* Cyberpunk Grid Background */
  .grid-overlay {
    position: absolute;
    top: -50%; left: -50%; right: -50%; bottom: -50%;
    background-image: 
      linear-gradient(rgba(0, 212, 255, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 212, 255, 0.1) 1px, transparent 1px);
    background-size: 50px 50px;
    transform: perspective(500px) rotateX(60deg);
    animation: gridMove 20s linear infinite;
    z-index: -2;
  }
  @keyframes gridMove {
    0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
    100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
  }

  /* Glowing Orbs */
  .blob { position: absolute; border-radius: 50%; filter: blur(80px); z-index: -1; opacity: 0.5; animation: float 10s infinite alternate; }
  .blob-1 { width: 400px; height: 400px; background: rgba(0, 212, 255, 0.4); top: 10%; left: 20%; }
  .blob-2 { width: 300px; height: 300px; background: rgba(168, 85, 247, 0.4); bottom: 10%; right: 20%; animation-delay: -5s; }
  @keyframes float { 0% { transform: translateY(0) scale(1); } 100% { transform: translateY(-30px) scale(1.1); } }

  /* Login Card - Glassmorphism */
  .login-card {
    background: rgba(10, 15, 28, 0.6);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(0, 212, 255, 0.2);
    border-radius: 16px;
    padding: 40px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 0 40px rgba(0, 212, 255, 0.1), inset 0 0 20px rgba(0, 212, 255, 0.05);
    color: #fff;
    position: relative;
    overflow: hidden;
  }
  .login-card::before {
    content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
    background: linear-gradient(90deg, transparent, #00d4ff, transparent);
  }

  .login-header { text-align: center; margin-bottom: 30px; }
  .logo-ring {
    width: 64px; height: 64px; margin: 0 auto 15px; border-radius: 50%;
    background: rgba(0, 212, 255, 0.1); border: 2px solid #00d4ff;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.4);
  }
  .logo-ring i { font-size: 32px; color: #00d4ff; }
  .login-brand { font-family: 'Orbitron', sans-serif; font-size: 28px; font-weight: 800; letter-spacing: 2px; margin-bottom: 5px; text-shadow: 0 0 10px rgba(0,212,255,0.5); }
  .login-subtitle { font-size: 13px; color: #94a3b8; }

  .field-group { margin-bottom: 20px; }
  .field-label { display: block; font-size: 13px; color: #94a3b8; margin-bottom: 8px; font-weight: 600; }
  .field-wrap { position: relative; }
  .field-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #00d4ff; font-size: 18px; }
  .field-input {
    width: 100%; padding: 12px 14px 12px 42px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px; color: #fff; font-size: 15px; outline: none; transition: 0.3s; box-sizing: border-box;
  }
  .field-input:focus { border-color: #00d4ff; box-shadow: 0 0 15px rgba(0,212,255,0.2); background: rgba(0,0,0,0.5); }

  .btn-submit {
    width: 100%; padding: 14px; background: linear-gradient(135deg, #00d4ff, #0088ff); color: #000;
    border: none; border-radius: 8px; font-size: 15px; font-weight: 800; cursor: pointer; transition: 0.2s;
    font-family: 'Orbitron', sans-serif; letter-spacing: 1px; margin-top: 10px;
  }
  .btn-submit:hover { filter: brightness(1.2); box-shadow: 0 0 20px rgba(0,212,255,0.5); transform: translateY(-2px); }
  
  .error-box { background: rgba(239,68,68,0.1); border: 1px solid #ef4444; color: #ef4444; padding: 12px; border-radius: 8px; font-size: 13px; display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
  
  /* Utilities */
  .theme-toggle { position: absolute; top: 20px; right: 20px; color: #94a3b8; cursor: pointer; font-size: 24px; z-index: 10; }
  .theme-toggle:hover { color: #fff; }
</style>`;

// Replace existing style block entirely
content = content.replace(/<style>[\s\S]*?<\/style>/, newStyle);
fs.writeFileSync(file, content);
console.log('Login redesigned');
