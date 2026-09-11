import fs from 'node:fs';
import path from 'node:path';

const BUILD = 'PORTAL_FINANCIAL_V2_V60_DIST_VERIFY_2026_08_02';
const root = path.resolve(process.argv[2] || '.');
const dist = path.join(root, 'dist');
const textExtensions = new Set(['.js', '.css', '.html', '.txt', '.json', '.csv', '.svg', '.xml']);

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else result.push(full);
  }
  return result;
}

try {
  if (!fs.existsSync(dist)) throw new Error(`dist directory not found: ${dist}`);
  const files = walk(dist);
  const textFiles = files.filter((file) => textExtensions.has(path.extname(file).toLowerCase()));
  const bundle = textFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

  const required = [
    'PORTAL_DATA_ENTRY_FINANCIAL_V2_V60_2026_08_02',
    'be_data_entry_financial_v2_schema',
    'be_data_entry_financial_v2_snapshot',
    'be_data_entry_financial_v2_calculate',
    'be_data_entry_financial_v2_save',
    'be_data_entry_financial_v2_create_waybill',
    'Backend-Authoritative Data Entry',
  ];
  const forbidden = [
    'Britium Go-Live UAT',
    'BRITIUM GO-LIVE UAT',
    'Mobile Sandbox',
    'All 15 parcel.xlsx fields are displayed below',
    'be_calculate_parcel_sheet_amounts',
    'be_save_data_entry_parcel_sheet',
  ];
  const missing = required.filter((marker) => !bundle.includes(marker));
  const forbiddenFound = forbidden.filter((marker) => bundle.includes(marker));

  const csv = path.join(dist, 'templates', 'Britium_Data_Entry_Production_Template.csv');
  let templateHeaderCount = 0;
  if (fs.existsSync(csv)) {
    templateHeaderCount = fs.readFileSync(csv, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0].split(',').filter(Boolean).length;
  }
  const retiredFiles = [
    path.join(dist, 'uat.html'),
    path.join(dist, 'uat-build-check.txt'),
    path.join(dist, 'templates', 'uat_accounts.csv'),
    path.join(dist, 'templates', 'Britium_Data_Entry_UAT_GoLive_Template.xlsx'),
    path.join(dist, 'templates', 'Britium_Merchant_Customer_Upload_UAT_Template.xlsx'),
    path.join(dist, 'templates', 'Britium_Warehouse_Scan_UAT_GoLive_Template.xlsx'),
  ].filter(fs.existsSync);
  const templateFilesPresent = [
    path.join(dist, 'templates', 'parcel.xlsx'),
    path.join(dist, 'templates', 'Britium_Data_Entry_Production_Template.xlsx'),
    path.join(dist, 'templates', 'Britium_Merchant_Customer_Production_Template.xlsx'),
    path.join(dist, 'templates', 'Britium_Warehouse_Scan_Production_Template.xlsx'),
  ].every(fs.existsSync);

  const ok = missing.length === 0 && forbiddenFound.length === 0 && templateHeaderCount === 50 && retiredFiles.length === 0 && templateFilesPresent;
  console.log(JSON.stringify({
    ok,
    build: BUILD,
    dist,
    scanned_files: files.length,
    scanned_text_files: textFiles.length,
    required_markers_present: required.length - missing.length,
    required_markers_total: required.length,
    missing,
    forbidden_found: forbiddenFound,
    canonical_template_header_count: templateHeaderCount,
    production_template_files_present: templateFilesPresent,
    retired_files_found: retiredFiles.map((file) => path.relative(dist, file)),
    financial_writes_enabled_by_patch: false,
    deploy_performed: false,
  }, null, 2));
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, build: BUILD, dist, error: error?.message || String(error), deploy_performed: false }, null, 2));
  process.exit(1);
}
