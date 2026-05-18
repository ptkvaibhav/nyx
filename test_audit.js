import { buildLocalAudit } from './src/organization/local-audit.js';
import { Catalog } from './src/core/catalog.js';

async function test() {
  await buildLocalAudit({ targetDirectory: "C:/Users/ptkva/Documents/nyx/File", dbPath: "C:/Users/ptkva/.nyx/nyx.db" });
  const catalog = await Catalog.open("C:/Users/ptkva/.nyx/nyx.db");
  const items = catalog.getPendingReviewItems();
  console.log('Pending duplicate items:', items.filter(i => i.action === 'review_duplicate_deletion').length);
}

test().catch(console.error);