const fs = require('fs');
const file = '../backend/src/auth.controller.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/status: 'success',\s*/g, '');
fs.writeFileSync(file, content);
console.log('Removed status field from sessionRepository.save');
