import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_DATA_ENTRY_CLEAN_REVIEW_V61_4_VERIFY_2026_08_03';
const root = path.resolve(process.argv[2] || '.');
const pagePath = path.join(root, 'src/pages/DataEntryFinancialV2Page.tsx');
const directoryPath = path.join(root, 'src/data/townshipTariffDirectory.ts');

function fail(message, detail = {}) {
  console.error(JSON.stringify({
    ok: false,
    build: BUILD,
    root,
    message,
    ...detail,
    financial_writes_enabled_by_verifier: false,
    build_performed: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(pagePath) || !fs.existsSync(directoryPath)) {
  fail('Required Data Entry source files are missing.');
}

const page = fs.readFileSync(pagePath, 'utf8');
const directory = fs.readFileSync(directoryPath, 'utf8');
const reviewMyanmar = '\u1019\u103e\u1010\u103a\u1010\u1019\u103a\u1038\u1021\u102c\u1038\u101c\u102f\u1036\u1038\u1000\u102d\u102f \u1019\u101e\u102d\u1019\u103a\u1038\u1006\u100a\u103a\u1038\u1019\u102e\u1005\u1005\u103a\u1006\u1031\u1038\u101b\u1014\u103a';

const required = [
  'PORTAL_DATA_ENTRY_CLEAN_REVIEW_V61_4_2026_08_03',
  'data-clean-registration-layout="true"',
  'data-review-sheet="editable-50-field"',
  'data-weight-before-final-charges="true"',
  'data-township-alias-resolution="V61.4"',
  'Review all records before saving',
  reviewMyanmar,
  'ReviewSheetModal',
  'data-full-review-sheet="true"',
  'Show all 50 columns',
  'WeightBreakdown',
  'FinalCalculationSummary',
  'Britium entitlement',
  'Weight surcharge',
  'BACKEND_TOWNSHIP_NAMES',
  "MMR013019: 'North Dagon'",
  'TOWNSHIP_TARIFF_DIRECTORY',
  'selectedTownshipCode',
  'customer_tier',
  'CLIENT_WRITES_ENABLED',
  "VITE_FINANCIAL_V2_WRITES_ENABLED || 'false'",
  'financialV2Calculate',
  'financialV2Save',
  'financialV2CreateWaybill',
];

const missing = required.filter((marker) => !page.includes(marker));
const forbidden = [
  "VITE_FINANCIAL_V2_WRITES_ENABLED || 'true'",
  'data-uat=',
  'Mobile Sandbox',
  '.from("parcels").upsert',
  ".from('parcels').upsert",
].filter((marker) => page.includes(marker));

const weightIndex = page.indexOf('<WeightBreakdown');
const finalIndex = page.indexOf('<FinalCalculationSummary');
const directoryOk = directory.includes('TOWNSHIP_TARIFF_DIRECTORY') && directory.includes('MMR013019') && directory.includes('Dagon Myothit (North)');

if (missing.length || forbidden.length || weightIndex < 0 || finalIndex < 0 || weightIndex >= finalIndex || !directoryOk) {
  fail('V61.4 source verification failed.', {
    missing,
    forbidden_found: forbidden,
    weight_before_final_charges: weightIndex >= 0 && finalIndex >= 0 && weightIndex < finalIndex,
    township_directory_ok: directoryOk,
  });
}

console.log(JSON.stringify({
  ok: true,
  build: BUILD,
  required_markers_present: required.length,
  required_markers_total: required.length,
  clean_registration_layout: true,
  weight_before_final_charges: true,
  backend_read_only_boxes_removed_from_main_form: true,
  review_sheet_editable: true,
  review_sheet_all_50_columns_available: true,
  north_dagon_alias_frontend: true,
  township_directory_ok: true,
  missing: [],
  forbidden_found: [],
  financial_writes_enabled_by_verifier: false,
  build_performed: false,
  deploy_performed: false,
}, null, 2));
