import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const srcRoot = path.join(root, 'src');
const distRoot = path.join(root, 'dist');
const BUILD = 'DATA_ENTRY_V21_BUTTONS_PHOTO_REVIEW_2026-07-29';
const required = [
  BUILD,
  'be_data_entry_pickup_list_web_v16',
  'BULK_UPLOAD_V19_SAFE_MERGE',
  'discoverProofPhotoUrl',
  'photoLoadingKeys',
  'Mark checked manually',
  'downloadReport',
  'registerSectionRef',
  'Retry secure photo link',
  'Full Register Screen',
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
  const source = fs.readFileSync(file, 'utf8');
  return source.includes('PARCEL DATA ENTRY REGISTRATION') && !/^\s*export\s*\{\s*default\s*\}/m.test(source);
});
if (!candidates.length) throw new Error('No full Data Entry component was found under src/.');

for (const file of candidates) {
  const source = fs.readFileSync(file, 'utf8');
  for (const marker of [...required, ...requiredHeaders]) {
    if (!source.includes(marker)) throw new Error(`Missing marker "${marker}" in ${path.relative(root, file)}`);
  }
  if (/DATA_ENTRY_V(1[4-9]|20)_/.test(source)) {
    throw new Error(`Stale V14-V20 build marker remains in ${path.relative(root, file)}`);
  }
  if (source.includes('disabled={!hasPhotoSource}')) {
    throw new Error(`Photo review button is still disabled when an image is unavailable in ${path.relative(root, file)}`);
  }
  const bytes = Buffer.byteLength(source, 'utf8');
  const hash = crypto.createHash('sha256').update(source).digest('hex');
  console.log(`PASS source: ${path.relative(root, file)} | ${bytes} bytes | ${hash}`);
}

const distFiles = walk(distRoot, /\.(js|html|css|map)$/);
if (!distFiles.length) throw new Error('dist/ is missing. Run npm run build before verification.');
const bundleText = distFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const marker of [BUILD, 'discoverProofPhotoUrl', 'Mark checked manually', 'Full Register Screen']) {
  if (!bundleText.includes(marker)) throw new Error(`Production bundle is missing marker: ${marker}`);
}
if (bundleText.includes('disabled={!hasPhotoSource}')) {
  throw new Error('Production bundle still contains the disabled photo-review control.');
}
console.log(`PASS bundle: contains ${BUILD}`);
console.log('PASS bundle: report, register scroll, photo retry, and manual photo review are present.');
console.log('SAFE TO DEPLOY V21');
