import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'DATA_ENTRY_V25_GUIDED_PHOTO_PARTIAL_WAYBILL_2026-07-29';
const active = path.join(root, 'src', 'pages', 'DataEntryPage.tsx');
const sql = path.join(root, 'data_entry_partial_waybill_v25.sql');
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
  for (const [token, label] of [
    [marker, 'V25 marker'],
    ['Check All Pics', 'guided photo review button'],
    ['Parcel Photo Review &amp; Single Registration', 'new-window review workspace'],
    ['Save, Check & Close', 'review save/close flow'],
    ['Needed to Fix', 'consolidated issue queue'],
    ['handleEditRow', 'post-save Edit control'],
    ['eligibleWaybillEntries', 'partial Waybill eligibility'],
    ['be_data_entry_confirm_partial_waybill_v25', 'V25 partial backend RPC'],
  ]) {
    if (!content.includes(token)) fail(`active component lacks ${label}.`);
    else pass(`active component contains ${label}.`);
  }
}

if (!fs.existsSync(sql)) {
  fail('data_entry_partial_waybill_v25.sql is missing from the project root.');
} else {
  const sqlText = fs.readFileSync(sql, 'utf8');
  for (const [token, label] of [
    ['be_data_entry_confirm_partial_waybill_v25', 'partial Waybill RPC'],
    ['be_data_entry_needs_fix_v25', 'durable Needed-to-Fix queue'],
    ['be_data_entry_confirm_waybill_v24', 'V24 related-screen bridge'],
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
    [marker, 'V25 marker'],
    ['Check All Pics', 'guided photo review control'],
    ['Needed to Fix', 'issue consolidation panel'],
    ['be_data_entry_confirm_partial_waybill_v25', 'partial Waybill RPC call'],
  ]) {
    if (!bundleText.includes(token)) fail(`production bundle lacks ${label}.`);
    else pass(`production bundle contains ${label}.`);
  }
}

if (failed) process.exit(1);
console.log('SAFE TO DEPLOY V25');
