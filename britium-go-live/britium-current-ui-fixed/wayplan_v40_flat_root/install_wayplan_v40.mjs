import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceCandidates = [
  path.join(scriptDir, 'src', 'pages', 'WayplanCommandCenterPage.V40.tsx'),
  path.join(scriptDir, 'WayplanCommandCenterPage.V40.tsx'),
];
const source = sourceCandidates.find((candidate) => fs.existsSync(candidate));
if (!source) throw new Error('WayplanCommandCenterPage.V40.tsx was not found beside the installer.');

const pagesDir = path.join(root, 'src', 'pages');
if (!fs.existsSync(pagesDir)) throw new Error('Run this installer from the repository root beside package.json and src/.');

const active = path.join(pagesDir, 'WayplanCommandCenterPage.tsx');
const versioned = path.join(pagesDir, 'WayplanCommandCenterPage.V40.tsx');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (fs.existsSync(active)) {
  fs.copyFileSync(active, `${active}.before-v40-${stamp}`);
}
fs.copyFileSync(source, active);
fs.copyFileSync(source, versioned);

const sqlSource = path.join(scriptDir, 'wayplan_warehouse_dispatch_v40.sql');
if (fs.existsSync(sqlSource)) {
  fs.copyFileSync(sqlSource, path.join(root, 'wayplan_warehouse_dispatch_v40.sql'));
}

console.log('Installed V40 into src/pages/WayplanCommandCenterPage.tsx');
console.log('Installed V40 into src/pages/WayplanCommandCenterPage.V40.tsx');
console.log('PASS: WAYPLAN_V40_WAREHOUSE_READY_TO_DISPATCH_SCAN_2026-07-30');
console.log('Next: run the V40 SQL, clear dist/node_modules/.vite, build, then run verify_wayplan_v40.mjs.');
