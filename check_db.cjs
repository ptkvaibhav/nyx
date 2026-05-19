const Database = require('better-sqlite3');
const db = new Database('.nyx/nyx.db');
console.log('Total review items:', db.prepare('SELECT COUNT(*) as c FROM review_items').get().c);
console.log('Duplicate items:', db.prepare("SELECT COUNT(*) as c FROM review_items WHERE action = 'review_duplicate_deletion'").get().c);
console.log('Duplicate statuses:', db.prepare("SELECT status, COUNT(*) as c FROM review_items WHERE action = 'review_duplicate_deletion' GROUP BY status").all());