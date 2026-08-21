const fs = require('fs');
const file = 'src/routes/dashboard/+layout.svelte';
let content = fs.readFileSync(file, 'utf8');

const modernHoverCss = `
  .menu-link-modern:hover { background: var(--bg-surface-hover); color: var(--color-cyan) !important; }
  .menu-link-modern:hover i { color: var(--color-cyan) !important; }
  .dropdown-footer button:hover { background: rgba(239, 68, 68, 0.1); }
`;

content = content.replace(/<\/style>/, modernHoverCss + '\n</style>');
fs.writeFileSync(file, content);
console.log('Added hover styles');
