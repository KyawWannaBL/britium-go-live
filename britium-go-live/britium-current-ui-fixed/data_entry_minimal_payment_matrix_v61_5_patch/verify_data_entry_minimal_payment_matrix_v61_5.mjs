#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const file = path.join(root, 'src', 'pages', 'DataEntryFinancialV2Page.tsx');
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, error: `Missing ${file}` }, null, 2));
  process.exit(1);
}
const text = fs.readFileSync(file, 'utf8');
const required = [
  'PORTAL_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_2026_08_03',
  'data-minimal-entry-ui="true"',
  'data-backend-fields-hidden="true"',
  'data-payment-matrix="ALL_SIX_TYPES_V61_5"',
  'data-minimal-pickup-toolbar="true"',
  'data-minimal-parcel-card="true"',
  'data-main-inputs="recipient"',
  'data-main-inputs="payment"',
  'data-weight-before-final-charges="true"',
  'data-weight-formula="actual-minus-included-times-rate"',
  'data-final-charges-summary="minimal"',
  'မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်',
  'Show all 50 columns',
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'TOTAL_AMOUNT_INCLUDING_DELIVERY',
  'DELIVERY_CHARGE_ONLY',
  'EXACT_COLLECTION_AMOUNT',
  'OPAQUE_COD_COLLECTION',
  'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
  "return showAllColumns || field.editable || field.ownership === 'INPUT';",
  "status === 'OK' || status === 'PASS' || status === 'REVIEW'",
  "VITE_FINANCIAL_V2_WRITES_ENABLED || 'false'",
];
const missing = required.filter((marker) => !text.includes(marker));
const cardStart = text.indexOf('function FinancialRowCard(');
const cardEnd = text.indexOf('function ReviewSheetModal(', cardStart);
const card = cardStart >= 0 && cardEnd > cardStart ? text.slice(cardStart, cardEnd) : '';
const forbiddenInMainCard = [
  "render('customer_id')",
  "render('merchant_id')",
  "render('status')",
  "render('cbm_surcharge')",
  "render('other_surcharge')",
  "render('merchant_payable_charges')",
  "render('other_merchant_credits')",
  '<SERVER_CLASS',
];
const forbiddenFound = forbiddenInMainCard.filter((marker) => card.includes(marker));
const directFinancialUpsert = /\.from\([^)]*(financial|parcel_financial)[^)]*\)\s*\.upsert\(/is.test(text);
const ok = missing.length === 0 && forbiddenFound.length === 0 && !directFinancialUpsert;
console.log(JSON.stringify({
  ok,
  build: 'PORTAL_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_SOURCE_VERIFY_2026_08_03',
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  missing,
  forbidden_in_main_card: forbiddenFound,
  clean_main_inputs_only: forbiddenFound.length === 0,
  backend_fields_hidden_from_main: text.includes('data-backend-fields-hidden="true"'),
  weight_before_final_charges: text.indexOf('data-weight-before-final-charges="true"', cardStart) < text.indexOf('data-final-charges-summary="minimal"', cardStart),
  editable_review_sheet: text.includes('Show all 50 columns') && text.includes('ReviewCell'),
  system_columns_hidden_by_default: text.includes("return showAllColumns || field.editable || field.ownership === 'INPUT';"),
  all_six_payment_types_present: required.slice(13, 19).every((marker) => text.includes(marker)),
  direct_financial_upsert_found: directFinancialUpsert,
  financial_writes_enabled: false,
}, null, 2));
if (!ok) process.exit(1);
