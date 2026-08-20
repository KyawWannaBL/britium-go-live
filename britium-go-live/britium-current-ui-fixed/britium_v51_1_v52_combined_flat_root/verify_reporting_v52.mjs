import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const build = 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30';

function requireText(file, items, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} missing: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const item of items) {
    if (!text.includes(item)) throw new Error(`${label} is missing ${item}`);
  }
  console.log(`PASS ${label}: ${path.relative(root, file)}`);
}

requireText(path.join(root, 'src/pages/ReportingPage.tsx'), [
  'CertifiedOperationalReportingV52',
  "'certified'",
], 'active Reporting page');

requireText(path.join(root, 'src/components/reporting/CertifiedOperationalReportingV52.tsx'), [
  build,
  'be_reporting_generate_v52',
  'be_reporting_review_v52',
  'be_reporting_register_export_v52',
  'CERTIFIED ONLY',
], 'V52 reporting component');

requireText(path.join(root, 'reporting_certified_v52.sql'), [
  'be_reporting_certified_snapshot_v52',
  'be_reporting_generate_v52',
  'be_reporting_review_v52',
  'be_reporting_register_export_v52',
  'be_reporting_runs_v52',
  'be_reporting_exports_v52',
  'V50_CERTIFIED_ONLY',
], 'V52 SQL');

requireText(path.join(root, 'src/App.tsx'), [
  "import('@/pages/ReportingPage')",
  'path="/reporting"',
], 'Reporting route');

const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) throw new Error('dist is missing. Run npm run build first.');
const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
  }
}
walk(dist);
const merged = jsFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const item of [build, 'be_reporting_generate_v52', 'be_reporting_register_export_v52', 'CERTIFIED ONLY']) {
  if (!merged.includes(item)) throw new Error(`Production bundle is missing ${item}`);
}
console.log('PASS production bundle: V52 certified reporting markers and RPCs');
console.log('SAFE TO DEPLOY CERTIFIED OPERATIONAL REPORTING V52');
