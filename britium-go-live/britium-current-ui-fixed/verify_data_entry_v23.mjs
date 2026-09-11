import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'DATA_ENTRY_V23_ROW_PHOTOS_FAST_INPUT_2026-07-29';
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
  const checks = [
    [marker, 'V23 marker'],
    ['const FastInput', 'fast local editor'],
    ['const renderRowPhoto', 'row-level photo renderer'],
    ['>Photo</th>', 'photo table column'],
    ['Mark blank checked', 'blank-photo review action'],
    ['runAfterEditorCommit', 'save-after-editor-commit guard'],
    ['const handleSaveAll', 'Save All logic'],
  ];
  for (const [token, label] of checks) {
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
  for (const [token, label] of [[marker, 'V23 marker'], ['Mark blank checked', 'row photo review'], ['Save All', 'Save All control']]) {
    if (!bundleText.includes(token)) fail(`production bundle lacks ${label}.`);
    else pass(`production bundle contains ${label}.`);
  }
}

if (failed) process.exit(1);
console.log('SAFE TO DEPLOY V23');
