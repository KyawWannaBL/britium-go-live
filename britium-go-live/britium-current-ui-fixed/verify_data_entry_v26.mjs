import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'DATA_ENTRY_V26_SAVE_CLOSE_AND_CONFLICT_SAFE_2026-07-29';
const active = path.join(root, 'src', 'pages', 'DataEntryPage.tsx');
const sql = path.join(root, 'data_entry_save_conflict_fix_v26.sql');
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
    [marker, 'V26 marker'],
    ['saveParcelWithoutUniqueConstraint', 'conflict-safe direct save fallback'],
    ['closeReviewWorkspaceAndReturn', 'popup close and return flow'],
    ['data-parcel-row-index', 'main-page row return anchors'],
    ['Save failed:', 'row-level save error display'],
    ['Save, Check & Close', 'review save/close button'],
  ]) {
    if (!content.includes(token)) fail(`active component lacks ${label}.`);
    else pass(`active component contains ${label}.`);
  }
  if (content.includes(".upsert(databaseParcelPayload(calculated), { onConflict: 'way_id' })")) {
    fail('active component still uses the failing way_id ON CONFLICT fallback.');
  } else pass('active component does not depend on a way_id unique constraint for direct saves.');
}

if (!fs.existsSync(sql)) {
  fail('data_entry_save_conflict_fix_v26.sql is missing from project root.');
} else {
  const sqlText = fs.readFileSync(sql, 'utf8');
  for (const [token, label] of [
    ['be_save_data_entry_parcel_sheet', 'parcel-sheet save RPC'],
    ['be_save_data_entry_parcel', 'legacy save RPC'],
    ['update_by_id', 'UPDATE-then-INSERT save strategy'],
  ]) {
    if (!sqlText.includes(token)) fail(`SQL lacks ${label}.`);
    else pass(`SQL contains ${label}.`);
  }
  if (/on\s+conflict\s*\(\s*way_id\s*\)/i.test(sqlText)) fail('V26 SQL still contains ON CONFLICT (way_id).');
  else pass('V26 SQL does not require ON CONFLICT (way_id).');
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
    [marker, 'V26 marker'],
    ['Save, Check & Close', 'popup save/close control'],
    ['Save failed:', 'row save feedback'],
  ]) {
    if (!bundleText.includes(token)) fail(`production bundle lacks ${label}.`);
    else pass(`production bundle contains ${label}.`);
  }
}

if (failed) process.exit(1);
console.log('SAFE TO DEPLOY V26');
