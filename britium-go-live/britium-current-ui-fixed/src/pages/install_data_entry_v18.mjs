import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const sourceCandidates = [
  path.join(root, 'DataEntryPage.V18.tsx'),
  path.join(root, 'DataEntryPage.tsx'),
];
const sourcePath = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!sourcePath) throw new Error('DataEntryPage.V18.tsx was not found in the project root.');

const replacement = fs.readFileSync(sourcePath, 'utf8');
const required = [
  'DATA_ENTRY_V18_PHOTO_REVIEW_FULL_REGISTER_2026-07-29',
  'be_data_entry_pickup_list_web_v16',
  'Open large preview and mark checked',
  'Full Register Screen',
  "setRegisterView('form')",
  "'စဉ်'",
  "'Remarks'",
];
for (const marker of required) {
  if (!replacement.includes(marker)) throw new Error(`V18 source is missing marker: ${marker}`);
}

const srcRoot = path.join(root, 'src');
if (!fs.existsSync(srcRoot)) throw new Error(`src directory not found: ${srcRoot}`);

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile() && /\.(tsx|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const targets = new Set([path.join(srcRoot, 'pages', 'DataEntryPage.tsx')]);
for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, 'utf8');
  const isFullDataEntryComponent =
    text.includes('PARCEL DATA ENTRY REGISTRATION') &&
    (text.includes('PARCEL_TEMPLATE_HEADERS') || text.includes('No rider verified pickups found')) &&
    !/^\s*export\s*\{\s*default\s*\}/m.test(text);
  if (isFullDataEntryComponent) targets.add(file);
}

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) {
    const backup = `${target}.pre-v18.bak`;
    if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
  }
  fs.writeFileSync(target, replacement);
}

const hash = crypto.createHash('sha256').update(replacement).digest('hex');
console.log('Installed Data Entry V18 into:');
for (const target of [...targets].sort()) console.log(` - ${path.relative(root, target)}`);
console.log(`Bytes: ${Buffer.byteLength(replacement, 'utf8')}`);
console.log(`SHA256: ${hash}`);
console.log('Next: clear dist/node_modules/.vite, build, then run verify_data_entry_v18.mjs.');
