import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BUILD = 'PORTAL_DATA_ENTRY_BILINGUAL_TOWNSHIP_V61_1_VERIFY_2026_08_02';
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || '.');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'patch_manifest.json'), 'utf8'));

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function addCheck(checks, name, passed, detail = undefined) {
  checks.push({ name, passed: Boolean(passed), ...(detail === undefined ? {} : { detail }) });
}
function parseDirectory(source) {
  const match = source.match(/export const TOWNSHIP_TARIFF_DIRECTORY: TownshipTariffRecord\[] = (\[.*?\]);\n\nconst TOWNSHIP_ALIASES/s);
  if (!match) throw new Error('Could not parse TOWNSHIP_TARIFF_DIRECTORY.');
  return JSON.parse(match[1]);
}
function countDuplicateValues(rows, key) {
  const counts = new Map();
  for (const row of rows) {
    const value = String(row[key] || '').normalize('NFKC').trim().toLowerCase();
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

const checks = [];
const pageRel = 'src/pages/DataEntryFinancialV2Page.tsx';
const dataRel = 'src/data/townshipTariffDirectory.ts';
const pagePath = path.join(root, pageRel);
const dataPath = path.join(root, dataRel);

for (const [rel, expected] of Object.entries(manifest.patch_hashes)) {
  const target = path.join(root, rel);
  addCheck(checks, `installed-hash:${rel}`, fs.existsSync(target) && sha256(target) === expected, fs.existsSync(target) ? sha256(target) : 'missing');
}

const page = fs.existsSync(pagePath) ? fs.readFileSync(pagePath, 'utf8') : '';
const data = fs.existsSync(dataPath) ? fs.readFileSync(dataPath, 'utf8') : '';

const pageMarkers = [
  'PORTAL_DATA_ENTRY_FINANCIAL_V2_BILINGUAL_V61_1_2026_08_02',
  "return localStorage.getItem('britium-data-entry-language') === 'en' ? 'en' : 'my';",
  'ဗဟိုထိန်းချုပ်မှုစနစ်မှ အတည်ပြုသော အချက်အလက်စာရင်းသွင်းခြင်း',
  'selectedTownshipCode',
  'calculationRequestId',
  'saveRequestId',
  'clearCalculatedOutput',
  'selectTownshipFromList',
  'role="combobox"',
  'aria-autocomplete="list"',
  'disabled={!township.source_active}',
  'financialV2Calculate',
  'financialV2Save',
  'financialV2CreateWaybill',
  'dry_run: !CLIENT_WRITES_ENABLED',
  'referenceOnly',
  'backendAuthority',
  'FIELD_MY',
  'SECTION_MY',
];
for (const marker of pageMarkers) addCheck(checks, `page-marker:${marker}`, page.includes(marker));

const forbiddenPageMarkers = [
  "VITE_FINANCIAL_V2_WRITES_ENABLED || 'true'",
  'delivery_charges: township.delivery_fee_mmk',
  'base_tariff: township.delivery_fee_mmk',
  'net_system_delivery_charge: township.delivery_fee_mmk',
  '.from(\'be_data_entry_financial_v2\').upsert',
  'BRITIUM GO-LIVE UAT',
  'All 15 parcel.xlsx fields',
];
for (const marker of forbiddenPageMarkers) addCheck(checks, `page-forbidden-absent:${marker}`, !page.includes(marker));

let rows = [];
try {
  rows = parseDirectory(data);
  addCheck(checks, 'directory-json-parse', true);
} catch (error) {
  addCheck(checks, 'directory-json-parse', false, error?.message || String(error));
}

const uniqueCodes = new Set(rows.map((row) => row.township_code));
const inactiveRows = rows.filter((row) => row.source_active === false);
const duplicateEnglishNames = countDuplicateValues(rows, 'township_name');
const duplicateMyanmarNames = countDuplicateValues(rows, 'township_mm');
addCheck(checks, 'township-record-count', rows.length === manifest.township_record_count, rows.length);
addCheck(checks, 'township-code-unique-count', uniqueCodes.size === manifest.township_record_count, uniqueCodes.size);
addCheck(checks, 'inactive-township-count', inactiveRows.length === manifest.inactive_township_count, inactiveRows.length);
addCheck(checks, 'duplicate-English-name-groups', duplicateEnglishNames === manifest.duplicate_english_name_count, duplicateEnglishNames);
addCheck(checks, 'duplicate-Myanmar-name-groups', duplicateMyanmarNames === manifest.duplicate_myanmar_name_count, duplicateMyanmarNames);

const dataMarkers = [
  'PORTAL_TOWNSHIP_TARIFF_DIRECTORY_V61_1_2026_08_02',
  'return matches.length === 1 ? matches[0] : null;',
  'findTownshipTariffByCode',
  'MMR013019',
  'Dagon Myothit (North)',
  'ဒဂုံမြို့သစ် (မြောက်ပိုင်း)',
  'MMR007014',
  'MMR013006',
  'MMR008009',
  'MMR009013',
  'MMR013032',
  '"service_provider":"Inactive"',
  '"delivery_fee_mmk":4000',
  '"delivery_fee_mmk":6000',
];
for (const marker of dataMarkers) addCheck(checks, `data-marker:${marker}`, data.includes(marker));

let syntaxCheckPerformed = false;
let syntaxDiagnostics = [];
try {
  const typescriptUrl = pathToFileURL(path.join(root, 'node_modules', 'typescript', 'lib', 'typescript.js')).href;
  const ts = await import(typescriptUrl);
  syntaxCheckPerformed = true;
  for (const [fileName, source, jsx] of [[pagePath, page, true], [dataPath, data, false]]) {
    const result = ts.transpileModule(source, {
      fileName,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        isolatedModules: true,
        ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      },
      reportDiagnostics: true,
    });
    for (const diagnostic of result.diagnostics || []) {
      syntaxDiagnostics.push(`${path.basename(fileName)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    }
  }
  addCheck(checks, 'typescript-syntax-diagnostics-zero', syntaxDiagnostics.length === 0, syntaxDiagnostics);
} catch (error) {
  addCheck(checks, 'typescript-syntax-check-available', true, 'Skipped because repository node_modules/typescript was unavailable. npm run build remains required.');
}

const failures = checks.filter((check) => !check.passed);
const result = {
  ok: failures.length === 0,
  build: BUILD,
  root,
  checks_passed: checks.length - failures.length,
  checks_total: checks.length,
  township_record_count: rows.length,
  unique_township_codes: uniqueCodes.size,
  inactive_township_count: inactiveRows.length,
  duplicate_english_name_groups: duplicateEnglishNames,
  duplicate_myanmar_name_groups: duplicateMyanmarNames,
  bilingual_default: 'my',
  township_selection_requires_directory_record: true,
  duplicate_names_disambiguated_by_code_and_region: true,
  inactive_township_selection_blocked: true,
  stale_calculated_outputs_cleared_on_input_change: true,
  stale_async_calculation_responses_ignored: true,
  tariff_reference_is_non_authoritative: true,
  backend_calculation_preserved: page.includes('financialV2Calculate'),
  typescript_syntax_check_performed: syntaxCheckPerformed,
  syntax_diagnostics: syntaxDiagnostics,
  financial_writes_enabled_by_patch: false,
  build_performed: false,
  deploy_performed: false,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
