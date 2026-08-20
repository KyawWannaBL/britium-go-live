#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const file = path.join(root, 'src', 'pages', 'DataEntryFinancialV2Page.tsx');
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${file}` }, null, 2));
  process.exit(1);
}
const source = fs.readFileSync(file, 'utf8');
const required = [
  'PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04',
  "PAYMENT_SETTLEMENT_RULE_V61_8_1 = 'EXACT_AND_OPAQUE_GROSS_MINUS_BRITIUM'",
  'data-payment-type-normalization="V61_8_1"',
  'data-payment-semantics="V61_8_1"',
  'data-payment-summary="V61_8_1"',
  'data-exact-opaque-settlement="gross-minus-britium"',
  "case 'TOTAL_AMOUNT_INCLUDING_DELIVERY': return [renderAmount('item_price'), renderAmount('delivery_charges')]",
  "payload.merchant_stated_total_amount = null;",
  'Britium Delivery Charge',
  'data-minimal-clean-ux="V61_6"',
  'data-canonical-tariff-source="be_parcel_tariffs_v2"',
  'data-weight-before-final-charges="true"',
  'မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်',
];
const forbidden = [
  'Contract Service Fee',
  'Review is required before settlement.',
  'data-exact-total-preserved="true"',
  'data-payment-semantics="V61_8"',
];
const missing = required.filter((marker) => !source.includes(marker));
const forbiddenFound = forbidden.filter((marker) => source.includes(marker));
const directFinancialUpsert = /\.from\([^)]*(financial|parcel_financial)[^)]*\)\s*\.upsert\(/is.test(source);
const ok = missing.length === 0 && forbiddenFound.length === 0 && !directFinancialUpsert;
console.log(JSON.stringify({
  ok,
  build: 'PORTAL_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_SOURCE_VERIFY_2026_08_04',
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  missing,
  forbidden_found: forbiddenFound,
  total_including_item_and_delivery_fields: source.includes("case 'TOTAL_AMOUNT_INCLUDING_DELIVERY': return [renderAmount('item_price'), renderAmount('delivery_charges')]"),
  exact_and_opaque_gross_minus_britium: source.includes('data-exact-opaque-settlement="gross-minus-britium"'),
  opaque_britium_charge_visible: source.includes('Britium Delivery Charge') && !source.includes('Contract Service Fee'),
  canonical_tariff_wiring_preserved: source.includes('be_parcel_tariffs_v2'),
  v61_6_clean_ux_preserved: source.includes('data-minimal-clean-ux="V61_6"'),
  direct_financial_upsert_found: directFinancialUpsert,
  financial_writes_enabled: false,
}, null, 2));
if (!ok) process.exit(1);
