import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_DATA_ENTRY_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_DIST_VERIFY_2026_08_02';
const root = path.resolve(process.argv[2] || '.');
const dist = path.join(root, 'dist');

function walk(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else if (/\.(?:js|mjs|css|html)$/i.test(entry.name)) output.push(full);
  }
  return output;
}

if (!fs.existsSync(dist)) {
  console.error(JSON.stringify({ ok: false, build: BUILD, root, message: 'dist directory is missing', deploy_performed: false }, null, 2));
  process.exit(1);
}

const files = walk(dist);
const content = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const required = [
  'PORTAL_DATA_ENTRY_FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_2026_08_02',
  'data-weight-surcharge-pass-through',
  'backend-authoritative',
  'Receiver collection',
  'Britium delivery entitlement',
  'Merchant settlement',
  'လက်ခံသူထံမှ ကောက်ခံရမည့် စုစုပေါင်းငွေ',
  'Britium Express ရရန် စုစုပေါင်းပို့ဆောင်ခ',
  'လုပ်ငန်းရှင်သို့ နောက်ဆုံးရှင်းလင်းငွေ',
  'ဖောက်သည်ထံမှ ကောက်ခံထားသော အပိုအလေးချိန်/CBM/အခြားပို့ဆောင်ခများကို Britium က ရယူမည်ဖြစ်ပြီး',
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'MUTATION_SHADOW',
];
const forbidden = [
  'BRITIUM GO-LIVE UAT',
  'All 15 parcel.xlsx fields',
];
const missing = required.filter((marker) => !content.includes(marker));
const forbiddenFound = forbidden.filter((marker) => content.includes(marker));
const uniqueTownshipCodes = new Set(content.match(/MMR\d{6}/g) || []).size;
if (uniqueTownshipCodes !== 356) missing.push(`township-code-count:${uniqueTownshipCodes}`);

const result = {
  ok: missing.length === 0 && forbiddenFound.length === 0,
  build: BUILD,
  root,
  scanned_files: files.length,
  required_markers_present: required.length - missing.filter((item) => !item.startsWith('township-code-count:')).length,
  required_markers_total: required.length,
  unique_township_codes_found: uniqueTownshipCodes,
  financial_flow_summary_present: content.includes('backend-authoritative'),
  weight_surcharge_pass_through_ui_present: content.includes('data-weight-surcharge-pass-through'),
  merchant_double_charge_prevention_present: content.includes('လုပ်ငန်းရှင်ရှင်းတမ်းမှ ထပ်မံနုတ်ယူခြင်း မပြုရပါ'),
  missing,
  forbidden_found: forbiddenFound,
  financial_writes_enabled_by_verifier: false,
  deploy_performed: false,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
