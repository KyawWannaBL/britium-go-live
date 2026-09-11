import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'DataEntryPage.V31.tsx');
const srcRoot = path.join(root, 'src');
const marker = 'DATA_ENTRY_V31_REQUIRED_FIELDS_EXPLICIT_2026-07-29';

if (!fs.existsSync(sourcePath)) {
  console.error(`ERROR: Missing ${sourcePath}`);
  process.exit(1);
}
if (!fs.existsSync(srcRoot)) {
  console.error(`ERROR: Missing src directory at ${srcRoot}`);
  process.exit(1);
}

const source = fs.readFileSync(sourcePath, 'utf8');
for (const token of [
  marker,
  'tracking_code: row.way_id',
  "sender_name: row.os || row.merchant_id || row.customer_id || 'Unknown Sender'",
  'recipient_address: row.delivery_address || null',
  'data_entry_required_fields_explicit_fix_v31.sql',
  'filteredRowEntries',
]) {
  if (!source.includes(token)) {
    console.error(`ERROR: V31 source is missing required token: ${token}`);
    process.exit(1);
  }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
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
    const backup = `${target}.pre-v31.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  }
  fs.writeFileSync(target, source, 'utf8');
  console.log(`INSTALLED: ${path.relative(root, target)}`);
}

console.log(`PASS: installed ${marker}`);
console.log('NEXT: clear dist and node_modules/.vite, build, then run verify_data_entry_v31.mjs');
