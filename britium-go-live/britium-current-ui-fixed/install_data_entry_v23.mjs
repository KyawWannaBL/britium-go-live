import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'DataEntryPage.V23.tsx');
const srcRoot = path.join(root, 'src');
const marker = 'DATA_ENTRY_V23_ROW_PHOTOS_FAST_INPUT_2026-07-29';

if (!fs.existsSync(sourcePath)) {
  console.error(`ERROR: Missing ${sourcePath}`);
  process.exit(1);
}
if (!fs.existsSync(srcRoot)) {
  console.error(`ERROR: Missing src directory at ${srcRoot}`);
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const required = [marker, 'const FastInput', 'const renderRowPhoto', 'Mark blank checked', 'runAfterEditorCommit'];
for (const token of required) {
  if (!source.includes(token)) {
    console.error(`ERROR: V23 source is missing required token: ${token}`);
    process.exit(1);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const tsxFiles = walk(srcRoot).filter((file) => file.endsWith('.tsx'));
const targets = tsxFiles.filter((file) => {
  const base = path.basename(file);
  if (base === 'DataEntryPage.tsx' || base === 'DataEntryPage.register_now.tsx') return true;
  const content = fs.readFileSync(file, 'utf8');
  return content.includes('PARCEL DATA ENTRY REGISTRATION') &&
    content.includes('PICKUP_RPC_V16') &&
    content.includes('PARCEL_TEMPLATE_HEADERS');
});

const canonicalTarget = path.join(srcRoot, 'pages', 'DataEntryPage.tsx');
if (!targets.includes(canonicalTarget)) {
  fs.mkdirSync(path.dirname(canonicalTarget), { recursive: true });
  targets.push(canonicalTarget);
}

for (const target of [...new Set(targets)]) {
  if (fs.existsSync(target)) {
    const backup = `${target}.pre-v23.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  }
  fs.writeFileSync(target, source, 'utf8');
  console.log(`INSTALLED: ${path.relative(root, target)}`);
}

console.log(`PASS: installed ${marker}`);
console.log('NEXT: remove dist/node_modules/.vite, build, then run verify_data_entry_v23.mjs');
