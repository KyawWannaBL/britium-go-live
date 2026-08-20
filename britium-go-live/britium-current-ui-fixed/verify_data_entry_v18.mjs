import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');
const BUILD = 'DATA_ENTRY_V18_PHOTO_REVIEW_FULL_REGISTER_2026-07-29';
const RPC = 'be_data_entry_pickup_list_web_v16';
const required = [
  BUILD,
  RPC,
  'Open large preview and mark checked',
  'Retry secure photo link',
  'Full Register Screen',
  'Full form',
  'Excel sheet',
  'Please open and check every Rider photo first',
];
const requiredHeaders = [
  'စဉ်', 'Status', 'Way ID', 'OS', 'လက်ခံမည့်သူအမည်', 'ဖုန်း', 'မြို့နယ်', 'လိပ်စာ',
  'ပစ္စည်းတန်ဖိုး', 'ပို့ဆောင်ခ', 'ကီလို', 'ကီလိုအပိုကြေး', 'ငွေကောက်ရန်', 'Destination', 'Remarks',
];

function walk(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, pattern));
    else if (entry.isFile() && pattern.test(entry.name)) files.push(full);
  }
  return files;
}

const candidates = walk(srcRoot, /\.(tsx|jsx)$/).filter((file) => {
  const text = fs.readFileSync(file, 'utf8');
  return text.includes('PARCEL DATA ENTRY REGISTRATION') && !/^\s*export\s*\{\s*default\s*\}/m.test(text);
});
if (!candidates.length) throw new Error('No full Data Entry component was found under src/.');

for (const file of candidates) {
  const text = fs.readFileSync(file, 'utf8');
  for (const marker of [...required, ...requiredHeaders]) {
    if (!text.includes(marker)) throw new Error(`Missing marker "${marker}" in ${path.relative(root, file)}`);
  }
  if (text.includes('DATA_ENTRY_V17_RPC_V16_52_PICKUPS_2026-07-29')) {
    throw new Error(`Stale V17 source remains in ${path.relative(root, file)}`);
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  console.log(`PASS source: ${path.relative(root, file)} | ${bytes} bytes | ${hash}`);
}

const distFiles = walk(distRoot, /\.(js|html|css|map)$/);
if (!distFiles.length) throw new Error('dist/ is missing. Run the production build before verification.');
const bundleText = distFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const marker of [BUILD, RPC, 'Full Register Screen', 'Retry secure photo link']) {
  if (!bundleText.includes(marker)) throw new Error(`Production bundle is missing marker: ${marker}`);
}
console.log(`PASS bundle: contains ${BUILD}`);
console.log(`PASS bundle: contains ${RPC}`);
console.log('SAFE TO DEPLOY V18');
