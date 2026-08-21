const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../backend/database.sqlite');
db.all('SELECT username FROM users', (err, rows) => {
  if (err) throw err;
  console.log(rows);
});
