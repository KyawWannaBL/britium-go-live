import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_DATA_ENTRY_CLEAN_REVIEW_V61_4_1_DIST_VERIFY_2026_08_03';
const root = path.resolve(process.argv[2] || '.');
const distRoot = path.join(root, 'dist');

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(js|html|css)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

function fail(message, detail = {}) {
  console.error(JSON.stringify({
    ok: false,
    build: BUILD,
    root,
    message,
    ...detail,
    financial_writes_enabled_by_verifier: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(distRoot)) fail('dist directory is missing. Run npm run build first.');
const files = walk(distRoot);
const bundle = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const reviewMyanmar = '\u1019\u103e\u1010\u103a\u1010\u1019\u103a\u1038\u1021\u102c\u1038\u101c\u102f\u1036\u1038\u1000\u102d\u102f \u1019\u101e\u102d\u1019\u103a\u1038\u1006\u100a\u103a\u1038\u1019\u102e\u1005\u1005\u103a\u1006\u1031\u1038\u101b\u1014\u103a';
const required = [
  'PORTAL_DATA_ENTRY_CLEAN_REVIEW_V61_4_1_2026_08_03',
  'editable-50-field',
  'data-full-review-sheet',
  'Review all records before saving',
  reviewMyanmar,
  'Show all 50 columns',
  'Weight surcharge',
  'Britium entitlement',
  'MMR013019',
  'North Dagon',
  'V61.4.1',
];
const missing = required.filter((marker) => !bundle.includes(marker));
const forbidden = ['Mobile Sandbox', 'UAT Financial V2'].filter((marker) => bundle.includes(marker));
if (missing.length || forbidden.length) fail('V61.4.1 compiled-dist verification failed.', { missing, forbidden_found: forbidden, scanned_files: files.length });

console.log(JSON.stringify({
  ok: true,
  build: BUILD,
  scanned_files: files.length,
  required_markers_present: required.length,
  required_markers_total: required.length,
  clean_registration_layout_present: true,
  review_sheet_present: true,
  weight_before_final_charges_present: true,
  north_dagon_alias_present: true,
  missing: [],
  forbidden_found: [],
  financial_writes_enabled_by_verifier: false,
  deploy_performed: false,
}, null, 2));
