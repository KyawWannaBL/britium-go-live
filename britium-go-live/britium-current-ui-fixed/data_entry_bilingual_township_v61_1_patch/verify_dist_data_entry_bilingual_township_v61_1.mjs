import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_DATA_ENTRY_BILINGUAL_TOWNSHIP_V61_1_DIST_VERIFY_2026_08_02';
const root = path.resolve(process.argv[2] || '.');
const dist = path.join(root, 'dist');

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.(js|mjs|css|html)$/i.test(entry.name)) result.push(full);
  }
  return result;
}

if (!fs.existsSync(dist)) {
  console.error(JSON.stringify({
    ok: false,
    build: BUILD,
    root,
    message: 'dist directory is missing',
    financial_writes_enabled_by_verifier: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(1);
}

const files = walk(dist);
const content = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const required = [
  'PORTAL_DATA_ENTRY_FINANCIAL_V2_BILINGUAL_V61_1_2026_08_02',
  'ဗဟိုထိန်းချုပ်မှုစနစ်မှ အတည်ပြုသော အချက်အလက်စာရင်းသွင်းခြင်း',
  'တွက်ချက်ခြင်း သို့မဟုတ် မှတ်တမ်းစစ်ဆေးခြင်းမပြုမီ အကြံပြုစာရင်းမှ မြို့နယ်တစ်ခုကို ရွေးချယ်ပါ။',
  'Dagon Myothit (North)',
  'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)',
  'MMR013019',
  'MMR007014',
  'MMR013006',
  'Cocokyun',
  'Inactive / unavailable',
  'britium-data-entry-language',
  'MUTATION_SHADOW',
];
const forbidden = [
  'BRITIUM GO-LIVE UAT',
  'All 15 parcel.xlsx fields',
  'PORTAL_DATA_ENTRY_FINANCIAL_V2_BILINGUAL_V61_2026_08_02',
  'PORTAL_DATA_ENTRY_FINANCIAL_V2_V60_2026_08_02',
];
const missing = required.filter((marker) => !content.includes(marker));
const forbiddenFound = forbidden.filter((marker) => content.includes(marker));
const townshipCodeCount = new Set(content.match(/MMR\d{6}/g) || []).size;
if (townshipCodeCount < 350) missing.push(`township-code-count:${townshipCodeCount}`);

const result = {
  ok: missing.length === 0 && forbiddenFound.length === 0,
  build: BUILD,
  root,
  scanned_files: files.length,
  required_markers_present: required.length - missing.filter((item) => !item.startsWith('township-code-count:')).length,
  required_markers_total: required.length,
  unique_township_codes_found: townshipCodeCount,
  duplicate_name_disambiguation_markers_present: content.includes('MMR007014') && content.includes('MMR013006'),
  inactive_township_marker_present: content.includes('Cocokyun') && content.includes('Inactive / unavailable'),
  missing,
  forbidden_found: forbiddenFound,
  financial_writes_enabled_by_verifier: false,
  deploy_performed: false,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
