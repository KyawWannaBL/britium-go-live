import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'DATA_ENTRY_V24_WAYBILL_BRIDGE_2026-07-29';
const active = path.join(root, 'src', 'pages', 'DataEntryPage.tsx');
const sql = path.join(root, 'data_entry_waybill_bridge_v24.sql');
const dist = path.join(root, 'dist');
let failed = false;

const fail = (message) => { failed = true; console.error(`FAIL: ${message}`); };
const pass = (message) => console.log(`PASS: ${message}`);
function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

if (!fs.existsSync(active)) {
  fail('src/pages/DataEntryPage.tsx does not exist.');
} else {
  const content = fs.readFileSync(active, 'utf8');
  const checks = [
    [marker, 'V24 marker'],
    ['be_data_entry_confirm_waybill_v24', 'V24 backend bridge call'],
    ['syncLegacyParcelDetails', 'legacy Data Entry row synchronization'],
    ['be_data_entry_create_waybill_from_rows', 'legacy screen/queue API fallback'],
    ['be_data_entry_create_waybill', 'old pickup-level API fallback'],
    ['Open Waybill Studio', 'Waybill Studio link'],
    ['Open Doc Print Room', 'Doc Print Room link'],
    ['Open Warehouse Ops', 'Warehouse Ops link'],
    ['britium:waybill-created', 'cross-screen browser event'],
    ['persistAllRowsForWaybill', 'save-all-before-create guard'],
  ];
  for (const [token, label] of checks) {
    if (!content.includes(token)) fail(`active component lacks ${label}.`);
    else pass(`active component contains ${label}.`);
  }
}

if (!fs.existsSync(sql)) {
  fail('data_entry_waybill_bridge_v24.sql is missing from the project root.');
} else {
  const sqlText = fs.readFileSync(sql, 'utf8');
  for (const [token, label] of [
    ['be_data_entry_confirm_waybill_v24', 'V24 SQL RPC'],
    ['be_data_entry_create_waybill_from_parcel_sheet', 'parcel-sheet API bridge'],
    ['be_data_entry_create_waybill_from_rows', 'legacy workflow API bridge'],
    ['be_data_entry_parcel_details', 'legacy row table synchronization'],
  ]) {
    if (!sqlText.includes(token)) fail(`SQL lacks ${label}.`);
    else pass(`SQL contains ${label}.`);
  }
}

const stale = walk(path.join(root, 'src'))
  .filter((file) => file.endsWith('.tsx'))
  .filter((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return content.includes('PARCEL DATA ENTRY REGISTRATION') &&
      content.includes('PICKUP_RPC_V16') &&
      !content.includes(marker);
  });
if (stale.length) fail(`stale Data Entry component(s): ${stale.map((file) => path.relative(root, file)).join(', ')}`);
else pass('no stale full Data Entry component remains under src/.');

const bundleFiles = walk(dist).filter((file) => file.endsWith('.js'));
if (!bundleFiles.length) {
  fail('dist JavaScript bundle was not found; run npm run build first.');
} else {
  const bundleText = bundleFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const [token, label] of [
    [marker, 'V24 marker'],
    ['be_data_entry_confirm_waybill_v24', 'backend bridge RPC'],
    ['Open Waybill Studio', 'related-screen link'],
    ['Confirm & Create Waybill', 'Waybill action'],
  ]) {
    if (!bundleText.includes(token)) fail(`production bundle lacks ${label}.`);
    else pass(`production bundle contains ${label}.`);
  }
}

if (failed) process.exit(1);
console.log('SAFE TO DEPLOY V24');
