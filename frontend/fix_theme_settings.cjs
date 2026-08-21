const fs = require('fs');
const file = 'src/routes/dashboard/settings/+page.svelte';
let content = fs.readFileSync(file, 'utf8');

// The theme preference row
const themeRowRegex = /<div class="config-row">\s*<div class="config-label">\s*<div class="config-name">Theme Preference[\s\S]*?<\/div>\s*<hr class="ds-divider" \/>/;
if (themeRowRegex.test(content)) {
  content = content.replace(themeRowRegex, '');
  fs.writeFileSync(file, content);
  console.log('Removed Theme Preference');
} else {
  console.log('Theme Preference not found');
}
