import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');
const BUILD = 'DATA_ENTRY_V19_BULK_UPLOAD_SAFE_2026-07-29';
const RPC = 'be_data_entry_pickup_list_web_v16';
const required = [
  BUILD,
  RPC,
  'BULK_UPLOAD_V19_SAFE_MERGE',
  'mapWithConcurrency(sourceRows, 6',
  'currentRows.filter(isParcelRow)',
  'validUploadedRows.forEach',
  'Excel row ${excelRowNumber}',
  'Full Register Screen',
  'Retry secure photo link',
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
  if (/DATA_ENTRY_V1[78]_/.test(text)) {
    throw new Error(`Stale V17/V18 build marker remains in ${path.relative(root, file)}`);
  }
  const unsafeMerge = /findIndex\(\(row\)\s*=>\s*row\.way_id\s*===\s*uploadedRow\.way_id\)/.test(text);
  if (unsafeMerge) throw new Error(`Unsafe bulk merge remains in ${path.relative(root, file)}`);
  const bytes = Buffer.byteLength(text, 'utf8');
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  console.log(`PASS source: ${path.relative(root, file)} | ${bytes} bytes | ${hash}`);
}

const distFiles = walk(distRoot, /\.(js|html|css|map)$/);
if (!distFiles.length) throw new Error('dist/ is missing. Run the production build before verification.');
const bundleText = distFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const marker of [BUILD, RPC, 'BULK_UPLOAD_V19_SAFE_MERGE', 'Full Register Screen']) {
  if (!bundleText.includes(marker)) throw new Error(`Production bundle is missing marker: ${marker}`);
}
console.log(`PASS bundle: contains ${BUILD}`);
console.log(`PASS bundle: contains ${RPC}`);
console.log('SAFE TO DEPLOY V19');
