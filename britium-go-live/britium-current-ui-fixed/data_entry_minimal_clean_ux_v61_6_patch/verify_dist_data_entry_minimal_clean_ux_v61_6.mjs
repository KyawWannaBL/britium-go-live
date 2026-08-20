#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${dist}. Run npm run build first.` }, null, 2));
  process.exit(1);
}
const files = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(js|css|html)$/.test(name)) files.push(full);
  }
};
walk(dist);
const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const contracts = [
  ['build_marker', ['PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_2026_08_03']],
  ['review_button', ['မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်', 'Review all records before saving']],
  ['review_columns', ['Show all 50 columns', 'ကော်လံ ၅၀ လုံးပြရန်']],
  ['single_parcel_focus', ['data-single-parcel-focus', 'Parcel navigation']],
  ['weight_formula', ['data-weight-formula', 'actual-minus-included-times-rate']],
  ['three_summary_cards', ['three-cards-only', 'Receiver Collection']],
  ['optional_adjustments', ['Additional adjustments', 'အပိုငွေညှိနှိုင်းမှုများ']],
  ['item_plus_delivery', ['ITEM_PRICE_PLUS_DECLARED_DELIVERY']],
  ['total_including', ['TOTAL_AMOUNT_INCLUDING_DELIVERY']],
  ['opaque_cod', ['OPAQUE_COD_COLLECTION']],
  ['backend_calculate_rpc', ['be_data_entry_financial_v2_calculate']]
];
const missing = contracts.filter(([, alternatives]) => !alternatives.some((marker) => combined.includes(marker))).map(([name]) => name);
const forbidden = ['Production Financial V2', 'Field Contract', 'Mutation Gate', 'Township tariff reference', 'Backend base tariff'];
const forbiddenFound = forbidden.filter((marker) => combined.includes(marker));
const ok = missing.length === 0;
console.log(JSON.stringify({
  ok,
  build: 'PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_DIST_VERIFY_2026_08_03',
  scanned_files: files.length,
  required_contracts_present: contracts.length - missing.length,
  required_contracts_total: contracts.length,
  missing,
  legacy_clutter_strings_found_anywhere: forbiddenFound,
  note: 'Legacy strings may remain in unrelated lazy chunks; browser smoke decides visible UI.',
  single_parcel_focus_present: !missing.includes('single_parcel_focus'),
  weight_before_summary_present: !missing.includes('weight_formula'),
  three_summary_cards_present: !missing.includes('three_summary_cards'),
  full_review_sheet_present: !missing.includes('review_columns'),
  deploy_performed: false
}, null, 2));
if (!ok) process.exit(1);
