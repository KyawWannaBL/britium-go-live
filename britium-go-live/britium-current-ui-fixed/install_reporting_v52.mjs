import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const build = 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30';

const copies = [
  ['src/pages/ReportingPage.V52.tsx', 'src/pages/ReportingPage.tsx'],
  ['src/pages/ReportingPage.V52.tsx', 'src/pages/ReportingPage.V52.tsx'],
  ['src/components/reporting/CertifiedOperationalReportingV52.tsx', 'src/components/reporting/CertifiedOperationalReportingV52.tsx'],
];

function assertFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`);
}

for (const [sourceRel, targetRel] of copies) {
  const source = path.join(packageDir, sourceRel);
  const target = path.join(root, targetRel);
  assertFile(source, 'Package source');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && sourceRel !== targetRel) {
    const backup = `${target}.bak-v52-${new Date().toISOString().replaceAll(':', '-')}`;
    fs.copyFileSync(target, backup);
    console.log(`Backup ${path.relative(root, backup)}`);
  }
  fs.copyFileSync(source, target);
  console.log(`Installed V52 into ${path.relative(root, target)}`);
}

const activePage = fs.readFileSync(path.join(root, 'src/pages/ReportingPage.tsx'), 'utf8');
const component = fs.readFileSync(path.join(root, 'src/components/reporting/CertifiedOperationalReportingV52.tsx'), 'utf8');
for (const item of ['CertifiedOperationalReportingV52', "'certified'", build]) {
  if (!(activePage + component).includes(item)) throw new Error(`V52 active source is missing ${item}`);
}

const appFile = path.join(root, 'src/App.tsx');
assertFile(appFile, 'src/App.tsx');
const app = fs.readFileSync(appFile, 'utf8');
if (!app.includes("import('@/pages/ReportingPage')") || !app.includes('path="/reporting"')) {
  throw new Error('The existing /reporting route is missing from src/App.tsx');
}

console.log(`PASS installer ${build}`);
console.log('Next: run reporting_certified_v52.sql, clear dist/node_modules/.vite, build, then verify.');
