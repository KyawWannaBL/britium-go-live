import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(root, 'src', 'pages');
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(pagesDir)) {
  throw new Error('Run this installer from the repository root beside package.json and src/.');
}

const files = [
  ['DispatchCommandCenterPage.tsx', 'DispatchCommandCenterPage.V41.tsx'],
  ['WayplanCommandCenterPage.tsx', 'WayplanCommandCenterPage.V41.tsx'],
];
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

for (const [activeName, versionedName] of files) {
  const candidates = [
    path.join(scriptDir, 'src', 'pages', versionedName),
    path.join(scriptDir, 'src', 'pages', activeName),
    path.join(scriptDir, versionedName),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) throw new Error(`${versionedName} was not found beside the installer.`);

  const active = path.join(pagesDir, activeName);
  const versioned = path.join(pagesDir, versionedName);
  if (fs.existsSync(active)) fs.copyFileSync(active, `${active}.before-v41-${stamp}`);
  fs.copyFileSync(source, active);
  fs.copyFileSync(source, versioned);
  console.log(`Installed V41 into src/pages/${activeName}`);
  console.log(`Installed V41 into src/pages/${versionedName}`);
}

const sqlName = 'dispatch_wayplan_execution_v41.sql';
const sqlSource = path.join(scriptDir, sqlName);
if (!fs.existsSync(sqlSource)) throw new Error(`${sqlName} was not found beside the installer.`);
fs.copyFileSync(sqlSource, path.join(root, sqlName));

console.log('PASS: DISPATCH_V41_WAYPLAN_SCANNING_GUARDED_RELEASE_2026-07-30');
console.log('Next: run the V41 SQL, clear dist/node_modules/.vite, build, then run verify_dispatch_wayplan_v41.mjs.');
