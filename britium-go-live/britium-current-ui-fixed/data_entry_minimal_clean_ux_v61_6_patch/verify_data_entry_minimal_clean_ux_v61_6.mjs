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
  'PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_2026_08_03',
  'data-minimal-clean-ux="V61_6"',
  'data-single-parcel-focus="true"',
  'data-system-labels-hidden="true"',
  'data-backend-fields-hidden="true"',
  'data-weight-before-final-charges="true"',
  'data-final-charges-summary="three-cards-only"',
  'data-optional-adjustments="collapsed"',
  'data-proof-collapsed="true"',
  'data-full-review-sheet="true"',
  'မှတ်တမ်းအားလုံးကို မသိမ်းဆည်းမီစစ်ဆေးရန်',
  'Show all 50 columns',
  "rows[activeParcelIndex]",
  "setActiveParcelIndex",
  'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  'TOTAL_AMOUNT_INCLUDING_DELIVERY',
  'DELIVERY_CHARGE_ONLY',
  'EXACT_COLLECTION_AMOUNT',
  'OPAQUE_COD_COLLECTION',
  'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
  "VITE_FINANCIAL_V2_WRITES_ENABLED || 'false'",
  'financialV2Calculate',
  'financialV2Save',
  'financialV2CreateWaybill'
];
const missing = required.filter((marker) => !text.includes(marker));
const cardStart = text.indexOf('function FinancialRowCard(');
const cardEnd = text.indexOf('function MinimalFieldControl(', cardStart);
const card = cardStart >= 0 && cardEnd > cardStart ? text.slice(cardStart, cardEnd) : '';
const mainForbidden = [
  "render('base_tariff')",
  "render('included_kg')",
  "render('extra_kg')",
  "render('extra_per_kg')",
  "render('weight_surcharge')",
  "render('tariff_zone')",
  "render('tariff_zone_code')",
  "render('calculation_version')",
  "render('calculated_at')",
  "render('entered_by')",
  "render('authorized_by')",
  'tariffReference',
  'backendAuthority'
];
const forbiddenFound = mainForbidden.filter((marker) => card.includes(marker));
const summaryStart = text.indexOf('function MinimalFinalSummary(');
const summaryEnd = text.indexOf('function ReviewSheetModal(', summaryStart);
const summary = summaryStart >= 0 && summaryEnd > summaryStart ? text.slice(summaryStart, summaryEnd) : '';
const summaryCardCount = (summary.match(/<ResultTile /g) || []).length;
const directFinancialUpsert = /\.from\([^)]*(financial|parcel_financial)[^)]*\)\s*\.upsert\(/is.test(text);
const weightIndex = card.indexOf('data-weight-before-final-charges="true"');
const finalIndex = card.indexOf('<MinimalFinalSummary');
const ok = missing.length === 0 && forbiddenFound.length === 0 && summaryCardCount === 3 && weightIndex >= 0 && finalIndex > weightIndex && !directFinancialUpsert;
console.log(JSON.stringify({
  ok,
  build: 'PORTAL_DATA_ENTRY_MINIMAL_CLEAN_UX_V61_6_SOURCE_VERIFY_2026_08_03',
  required_markers_present: required.length - missing.length,
  required_markers_total: required.length,
  missing,
  forbidden_in_main_card: forbiddenFound,
  summary_card_count: summaryCardCount,
  single_parcel_focus: text.includes('rows[activeParcelIndex]'),
  backend_fields_hidden_from_main: forbiddenFound.length === 0,
  system_labels_and_suggestions_hidden: card.includes('MinimalFieldControl') && !card.includes('tariffReference'),
  weight_before_final_charges: weightIndex >= 0 && finalIndex > weightIndex,
  optional_adjustments_collapsed: text.includes('data-optional-adjustments="collapsed"'),
  editable_review_sheet: text.includes('ReviewCell') && text.includes('Show all 50 columns'),
  all_six_payment_types_present: required.slice(14, 20).every((marker) => text.includes(marker)),
  direct_financial_upsert_found: directFinancialUpsert,
  backend_sql_required: false,
  financial_writes_enabled: false
}, null, 2));
if (!ok) process.exit(1);
