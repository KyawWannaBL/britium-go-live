import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const marker = 'DATA_ENTRY_V22_SAVE_ALL_2026-07-29';
const active = path.join(root, 'src', 'pages', 'DataEntryPage.tsx');
const dist = path.join(root, 'dist');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`FAIL: ${message}`);
}
function pass(message) {
  console.log(`PASS: ${message}`);
}
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
  if (!content.includes(marker)) fail('active DataEntryPage.tsx lacks the V22 marker.');
  else pass('active DataEntryPage.tsx contains the V22 marker.');
  if (!content.includes('const handleSaveAll')) fail('active component lacks handleSaveAll.');
  else pass('active component contains Save All logic.');
  if (!content.includes('Save All (')) fail('active component lacks the Save All button label.');
  else pass('active component contains the Save All button.');
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
const bundleText = bundleFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
if (!bundleFiles.length) fail('dist JavaScript bundle was not found; run npm run build first.');
else {
  if (!bundleText.includes(marker)) fail('production bundle lacks the V22 marker.');
  else pass('production bundle contains the V22 marker.');
  if (!bundleText.includes('Save All')) fail('production bundle lacks the Save All label.');
  else pass('production bundle contains the Save All control.');
}

if (failed) process.exit(1);
console.log('SAFE TO DEPLOY V22');
