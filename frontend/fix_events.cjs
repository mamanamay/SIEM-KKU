const fs = require('fs');
const file = 'src/stores/events.ts';
let content = fs.readFileSync(file, 'utf8');

// Use localStorage instead of sessionStorage
content = content.replace(/typeof sessionStorage/g, "typeof localStorage");
content = content.replace(/sessionStorage/g, "localStorage");

// Cap events array at 2000
const newAttackRegex = /eventsStore\.update\(events => \[data, \.\.\.events\]\);/;
content = content.replace(newAttackRegex, `eventsStore.update(events => {
        const newEvents = [data, ...events].slice(0, 2000);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cachedEvents', JSON.stringify(newEvents));
        }
        return newEvents;
      });`);

// Update status_updated to save to localStorage as well
const statusRegex = /events\[index\] = \{ \.\.\.events\[index\], status: data\.status \};\n      \}/;
content = content.replace(statusRegex, `events[index] = { ...events[index], status: data.status };
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cachedEvents', JSON.stringify(events));
      }`);

fs.writeFileSync(file, content);
console.log('Done events.ts');
