import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sources = [
  path.join(root, 'src', 'pages', 'WarehousePage.tsx'),
  path.join(root, 'src', 'pages', 'WarehousePage.V36.tsx'),
];
const requiredSource = [
  'WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30',
  'be_warehouse_receipt_snapshot_v36',
  'be_warehouse_receive_scan_v36',
  'be_warehouse_receive_batch_v36',
  'be_warehouse_mark_scanned_ready_v36',
  'Consolidated Warehouse Holds',
  'Mark All Scanned as Warehouse Ready',
];

for (const file of sources) {
  if (!fs.existsSync(file)) throw new Error(`Missing source: ${path.relative(root, file)}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of requiredSource) {
    if (!text.includes(marker)) throw new Error(`${path.relative(root, file)} is missing: ${marker}`);
  }
  console.log(`PASS source: ${path.relative(root, file)} | ${Buffer.byteLength(text)} bytes`);
}

const distAssets = path.join(root, 'dist', 'assets');
if (!fs.existsSync(distAssets)) throw new Error('dist/assets is missing. Run npm run build first.');
const bundles = fs.readdirSync(distAssets).filter((name) => name.endsWith('.js'));
let activeBundle = '';
for (const name of bundles) {
  const full = path.join(distAssets, name);
  const text = fs.readFileSync(full, 'utf8');
  if (text.includes('WAREHOUSE_V36_RECEIPT_RECONCILIATION_2026-07-30')) {
    activeBundle = name;
    for (const marker of ['be_warehouse_receipt_snapshot_v36', 'be_warehouse_receive_scan_v36', 'Consolidated Warehouse Holds']) {
      if (!text.includes(marker)) throw new Error(`Production bundle ${name} is missing ${marker}`);
    }
    break;
  }
}
if (!activeBundle) throw new Error('No production bundle contains the V36 Warehouse marker.');
console.log(`PASS bundle: dist/assets/${activeBundle}`);
console.log('SAFE TO DEPLOY WAREHOUSE V36');
