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
    else if (/\.(js|css|html)$/i.test(entry.name)) files.push(full);
  }
}
walk(dist);
const bundle = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const required = [
  'V61_8_1',
  'EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM',
  'data-payment-semantics',
  'data-payment-summary',
  'data-exact-opaque-settlement',
  'Britium Delivery Charge',
  'be_tariff_catalog_v61_7',
  'be_parcel_tariffs_v2',
  'data-minimal-clean-ux',
  'data-weight-before-final-charges',
];
const forbidden = ['Contract Service Fee', 'Review is required before settlement.'];
const missing = required.filter((marker) => !bundle.includes(marker));
const forbiddenFound = forbidden.filter((marker) => bundle.includes(marker));
const ok = missing.length === 0 && forbiddenFound.length === 0;
console.log(JSON.stringify({
  ok,
  build: 'PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_DIST_VERIFY_2026_08_04',
  scanned_files: files.length,
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  missing,
  forbidden_found: forbiddenFound,
  payment_settlement_present: bundle.includes('EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM'),
  exact_opaque_merchant_settlement_visible: bundle.includes('data-exact-opaque-settlement'),
  canonical_tariff_wiring_preserved: bundle.includes('be_tariff_catalog_v61_7'),
  v61_6_clean_ux_preserved: bundle.includes('data-minimal-clean-ux'),
  deploy_performed: false,
}, null, 2));
if (!ok) process.exit(1);
