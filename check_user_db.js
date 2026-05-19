import { Catalog } from './src/core/catalog.js';

Catalog.open('C:/Users/ptkva/.nyx/nyx.db').then(c => {
  const items = c.getPendingReviewItems();
  console.log('Pending duplicate items:', items.filter(i => i.action === 'review_duplicate_deletion').length);
  console.log('All duplicates ever:', c.db.prepare("SELECT status, COUNT(*) as count FROM review_items WHERE action = 'review_duplicate_deletion' GROUP BY status").all());
}).catch(console.error);