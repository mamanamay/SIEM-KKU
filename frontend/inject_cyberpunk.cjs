const fs = require('fs');
const file = 'src/routes/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// Inject the cyberpunk background elements into the HTML structure
if (!content.includes('grid-overlay')) {
  content = content.replace(
    /<div class="login-bg">/,
    `<div class="login-bg">\n  <div class="grid-overlay"></div>\n  <div class="blob blob-1"></div>\n  <div class="blob blob-2"></div>`
  );
  
  // Replace standard header with cyberpunk header
  content = content.replace(
    /Khon Kaen University/,
    `KKUSIEM - SOC`
  );

  // Append new Cyberpunk CSS at the end of the file
  const cyberpunkStyle = `
  /* --- Cyberpunk Redesign Append --- */
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
    pointer-events: none;
  }
  @keyframes gridMove {
    0% { transform: perspective(500px) rotateX(60deg) translateY(0); }
    100% { transform: perspective(500px) rotateX(60deg) translateY(50px); }
  }

  .blob { position: absolute; border-radius: 50%; filter: blur(80px); z-index: -1; opacity: 0.5; animation: float 10s infinite alternate; pointer-events: none; }
  .blob-1 { width: 400px; height: 400px; background: rgba(0, 212, 255, 0.4); top: 10%; left: 20%; }
  .blob-2 { width: 300px; height: 300px; background: rgba(168, 85, 247, 0.4); bottom: 10%; right: 20%; animation-delay: -5s; }
  @keyframes float { 0% { transform: translateY(0) scale(1); } 100% { transform: translateY(-30px) scale(1.1); } }
  
  /* Override login card with glassmorphism */
  .login-card {
    background: rgba(10, 15, 28, 0.7) !important;
    backdrop-filter: blur(20px) !important;
    border: 1px solid rgba(0, 212, 255, 0.3) !important;
    box-shadow: 0 0 40px rgba(0, 212, 255, 0.15), inset 0 0 20px rgba(0, 212, 255, 0.05) !important;
    position: relative;
    overflow: hidden;
  }
  .login-card::before {
    content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px;
    background: linear-gradient(90deg, transparent, #00d4ff, transparent);
  }
  `;
  content = content.replace(/<\/style>/, `${cyberpunkStyle}\n</style>`);
  fs.writeFileSync(file, content);
  console.log('Appended Cyberpunk styles safely');
}
