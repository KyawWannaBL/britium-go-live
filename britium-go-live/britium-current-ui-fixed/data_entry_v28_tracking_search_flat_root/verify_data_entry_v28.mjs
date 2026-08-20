import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'DATA_ENTRY_V28_TRACKING_CODE_SEARCH_2026-07-29';
const active = path.join(root, 'src', 'pages', 'DataEntryPage.tsx');
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
    [marker, 'V28 marker'],
    ['tracking_code: row.way_id', 'tracking_code fallback payload'],
    ['filteredRowEntries', 'parcel search filter'],
    ['Search Way ID, OS / merchant, customer, recipient, phone, township...', 'search box'],
    ['No parcel rows match', 'no-match search state'],
    ['data_entry_tracking_code_fix_v28.sql', 'tracking-code SQL guidance'],
    ['PHOTO_REVIEW_OPTIONAL = true', 'optional photo checking'],
  ]) {
    if (!content.includes(token)) fail(`active component lacks ${label}.`);
    else pass(`active component contains ${label}.`);
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
    [marker, 'V28 marker'],
    ['Search Way ID, OS / merchant, customer, recipient, phone, township...', 'search box placeholder'],
    ['No parcel rows match', 'search no-match message'],
  ]) {
    if (!bundleText.includes(token)) fail(`production bundle lacks ${label}.`);
    else pass(`production bundle contains ${label}.`);
  }
}

if (failed) process.exit(1);
console.log('SAFE TO DEPLOY V28');
