const fs = require('fs');

function checkDivs(file) {
  let content = fs.readFileSync(file, 'utf8');
  let lines = content.split('\n');
  let stack = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let m;
    let divRegex = /<(div)[^>]*>|<\/(div)>/g;
    while ((m = divRegex.exec(line)) !== null) {
      if (m[1]) {
        stack.push(i + 1);
      } else if (m[2]) {
        if (stack.length === 0) {
          console.log(`Unmatched closing div at line ${i + 1}: ${line.trim()}`);
        } else {
          stack.pop();
        }
      }
    }
  }
  if (stack.length > 0) {
    console.log(`Unmatched open divs at lines: ${stack.join(', ')}`);
  } else {
    console.log(`Divs are perfectly matched in ${file}`);
  }
}

checkDivs('frontend/src/routes/dashboard/+page.svelte');
checkDivs('frontend/src/routes/dashboard/analytics/+page.svelte');
