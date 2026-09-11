import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const build = 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30';
const deployBuild = 'REPORTING_V52_1_ENTERPRISE_PORTAL_GUARD_2026-07-31';

function requireFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`);
}

const appFile = path.join(root, 'src/App.tsx');
const existingPage = path.join(root, 'src/pages/ReportingPage.tsx');
requireFile(path.join(root, 'package.json'), 'package.json');
requireFile(appFile, 'Enterprise Portal src/App.tsx');
requireFile(existingPage, 'Existing Enterprise Portal ReportingPage');

const appBefore = fs.readFileSync(appFile, 'utf8');
const hasReportingRoute = /path\s*=\s*["']\/?reporting["']/.test(appBefore) || appBefore.includes('/reporting');
const hasReportingPage = /ReportingPage/.test(appBefore);
if (!hasReportingRoute || !hasReportingPage) {
  throw new Error('Wrong repository: V52 must be installed in the Enterprise Portal repository that already owns /reporting, not in Rider-App-main. No files were changed.');
}

const copies = [
  ['src/pages/ReportingPage.V52.tsx', 'src/pages/ReportingPage.tsx'],
  ['src/pages/ReportingPage.V52.tsx', 'src/pages/ReportingPage.V52.tsx'],
  ['src/components/reporting/CertifiedOperationalReportingV52.tsx', 'src/components/reporting/CertifiedOperationalReportingV52.tsx'],
];

for (const [sourceRel, targetRel] of copies) {
  const source = path.join(packageDir, sourceRel);
  const target = path.join(root, targetRel);
  requireFile(source, 'Package source');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && sourceRel !== targetRel) {
    const backup = `${target}.bak-v52-1-${new Date().toISOString().replaceAll(':', '-')}`;
    fs.copyFileSync(target, backup);
    console.log(`Backup ${path.relative(root, backup)}`);
  }
  fs.copyFileSync(source, target);
  console.log(`Installed V52 into ${path.relative(root, target)}`);
}

const active = fs.readFileSync(path.join(root, 'src/pages/ReportingPage.tsx'), 'utf8');
const component = fs.readFileSync(path.join(root, 'src/components/reporting/CertifiedOperationalReportingV52.tsx'), 'utf8');
for (const item of [build, 'CertifiedOperationalReportingV52', 'be_reporting_generate_v52']) {
  if (!(active + component).includes(item)) throw new Error(`V52 active source is missing ${item}`);
}
fs.writeFileSync(path.join(root, '.reporting-v52-1-installed'), `${deployBuild}\n`, 'utf8');
console.log(`PASS installer ${deployBuild}`);
console.log('Next: clear dist/node_modules/.vite, run npm run build, then node verify_reporting_v52_1.mjs.');
