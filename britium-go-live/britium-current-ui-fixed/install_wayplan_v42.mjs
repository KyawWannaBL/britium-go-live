import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(root, 'src', 'pages');

if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(pagesDir)) {
  throw new Error('Run this installer from the repository root beside package.json and src/.');
}

const candidates = [
  path.join(scriptDir, 'src', 'pages', 'WayplanCommandCenterPage.V42.tsx'),
  path.join(scriptDir, 'WayplanCommandCenterPage.V42.tsx'),
  path.join(scriptDir, 'src', 'pages', 'WayplanCommandCenterPage.tsx'),
];
const source = candidates.find((candidate) => fs.existsSync(candidate));
if (!source) throw new Error('WayplanCommandCenterPage.V42.tsx was not found beside the installer.');
const sourceText = fs.readFileSync(source, 'utf8');
if (!sourceText.includes('WAYPLAN_V42_MASTER_DATA_ROUTE_ASSIGNMENT_2026-07-30')) {
  throw new Error(`Selected installer source is not Wayplan V42: ${source}`);
}

const active = path.join(pagesDir, 'WayplanCommandCenterPage.tsx');
const versioned = path.join(pagesDir, 'WayplanCommandCenterPage.V42.tsx');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

if (fs.existsSync(active)) {
  const backup = `${active}.before-v42-${stamp}`;
  fs.copyFileSync(active, backup);
  console.log(`Backup: ${path.relative(root, backup)}`);
}

fs.copyFileSync(source, active);
fs.copyFileSync(source, versioned);
console.log('Installed V42 into src/pages/WayplanCommandCenterPage.tsx');
console.log('Installed V42 into src/pages/WayplanCommandCenterPage.V42.tsx');

const sqlName = 'wayplan_master_assignment_v42.sql';
const sqlSource = path.join(scriptDir, sqlName);
if (!fs.existsSync(sqlSource)) throw new Error(`${sqlName} was not found beside the installer.`);
fs.copyFileSync(sqlSource, path.join(root, sqlName));

console.log('PASS: WAYPLAN_V42_MASTER_DATA_ROUTE_ASSIGNMENT_2026-07-30');
console.log('Next: run the V42 SQL, clear dist/node_modules/.vite, build, then run verify_wayplan_v42.mjs.');
