#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${dist}` }, null, 2));
  process.exit(1);
}
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html|map)$/i.test(entry.name)) files.push(full);
  }
}
walk(dist);
const blob = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const required = [
  'PORTAL_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_2026_08_03',
  'ALL_SIX_TYPES_V61_5',
  'actual-minus-included-times-rate',
  'မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်',
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'TOTAL_AMOUNT_INCLUDING_DELIVERY',
  'DELIVERY_CHARGE_ONLY',
  'EXACT_COLLECTION_AMOUNT',
  'OPAQUE_COD_COLLECTION',
  'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
];
const missing = required.filter((marker) => !blob.includes(marker));
const forbidden = ['PORTAL_DATA_ENTRY_CLEAN_REVIEW_V61_4_1_2026_08_03'];
const forbiddenFound = forbidden.filter((marker) => blob.includes(marker));
const ok = missing.length === 0 && forbiddenFound.length === 0;
console.log(JSON.stringify({
  ok,
  build: 'PORTAL_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_DIST_VERIFY_2026_08_03',
  scanned_files: files.length,
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  missing,
  forbidden_found: forbiddenFound,
  minimal_ui_present: blob.includes('ALL_SIX_TYPES_V61_5'),
  weight_formula_present: blob.includes('actual-minus-included-times-rate'),
  all_six_payment_types_present: required.slice(4).every((marker) => blob.includes(marker)),
  deploy_performed: false,
}, null, 2));
if (!ok) process.exit(1);
