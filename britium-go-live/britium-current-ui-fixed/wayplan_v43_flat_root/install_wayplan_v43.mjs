import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(root, 'src', 'pages');

if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(pagesDir)) {
  throw new Error('Run this installer from the repository root beside package.json and src/.');
}

const appPath = path.join(root, 'src', 'App.tsx');
if (!fs.existsSync(appPath)) throw new Error('src/App.tsx was not found.');
const appSource = fs.readFileSync(appPath, 'utf8');
if (!appSource.includes('/supervisor-wayplan') || !appSource.includes('SupervisorWayplanReviewPage')) {
  throw new Error('The repository is missing the existing /supervisor-wayplan route. Add the route before installing V43.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    source: 'WayplanCommandCenterPage.V43.tsx',
    active: 'WayplanCommandCenterPage.tsx',
    versioned: 'WayplanCommandCenterPage.V43.tsx',
    marker: 'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
  },
  {
    source: 'SupervisorWayplanReviewPage.V43.tsx',
    active: 'SupervisorWayplanReviewPage.tsx',
    versioned: 'SupervisorWayplanReviewPage.V43.tsx',
    marker: 'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
  },
  {
    source: 'DispatchCommandCenterPage.V43.tsx',
    active: 'DispatchCommandCenterPage.tsx',
    versioned: 'DispatchCommandCenterPage.V43.tsx',
    marker: 'DISPATCH_V43_SUPERVISOR_APPROVAL_GUARDED_PUBLISH_2026-07-30',
  },
];

for (const item of files) {
  const candidates = [
    path.join(scriptDir, 'src', 'pages', item.source),
    path.join(scriptDir, item.source),
  ];
  const source = candidates.find((candidate) => fs.existsSync(candidate));
  if (!source) throw new Error(`${item.source} was not found beside the installer.`);
  const content = fs.readFileSync(source, 'utf8');
  if (!content.includes(item.marker)) throw new Error(`${item.source} is not the expected V43 source.`);

  const active = path.join(pagesDir, item.active);
  const versioned = path.join(pagesDir, item.versioned);
  if (fs.existsSync(active)) {
    const backup = `${active}.before-v43-${stamp}`;
    fs.copyFileSync(active, backup);
    console.log(`Backup: ${path.relative(root, backup)}`);
  }
  fs.copyFileSync(source, active);
  fs.copyFileSync(source, versioned);
  console.log(`Installed V43 into ${path.relative(root, active)}`);
  console.log(`Installed V43 into ${path.relative(root, versioned)}`);
}

const sqlName = 'wayplan_supervisor_approval_v43.sql';
const sqlSource = path.join(scriptDir, sqlName);
if (!fs.existsSync(sqlSource)) throw new Error(`${sqlName} was not found beside the installer.`);
fs.copyFileSync(sqlSource, path.join(root, sqlName));

console.log('PASS: WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30');
console.log('Next: run the V43 SQL, clear dist/node_modules/.vite, build, then run verify_wayplan_v43.mjs.');
