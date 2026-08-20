import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(root, 'src', 'pages');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(pagesDir)) {
  throw new Error('Run this installer from the repository root beside package.json and src/.');
}

const appPath = path.join(root, 'src', 'App.tsx');
if (!fs.existsSync(appPath)) throw new Error('src/App.tsx was not found.');
const appSource = fs.readFileSync(appPath, 'utf8');
if (!appSource.includes('/wayplan-command') || !appSource.includes('WayplanCommandCenterPage')) {
  throw new Error('The active /wayplan-command route was not found in src/App.tsx.');
}
if (!appSource.includes('/supervisor-wayplan') || !appSource.includes('SupervisorWayplanReviewPage')) {
  throw new Error('The /supervisor-wayplan V43 route is required before V44.');
}

const candidates = [
  path.join(scriptDir, 'src', 'pages', 'WayplanCommandCenterPage.V44.tsx'),
  path.join(scriptDir, 'WayplanCommandCenterPage.V44.tsx'),
];
const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
if (!sourcePath) throw new Error('WayplanCommandCenterPage.V44.tsx was not found beside the installer.');
const content = fs.readFileSync(sourcePath, 'utf8');
const required = [
  'WAYPLAN_V44_EXCLUSIVE_ASSIGNMENT_MODES_FULL_FLEET_VISIBILITY_2026-07-30',
  'be_wayplan_assignment_options_v44',
  'be_generate_wayplan_from_warehouse_v44',
  'Rider Delivery — Rider only',
  'Vehicle Crew — Vehicle + Driver + Helper',
  'POLICY BLOCKED',
  'V44 ASSIGNMENT MODES ACTIVE',
  'be_wayplan_submit_review_v43',
];
for (const token of required) {
  if (!content.includes(token)) throw new Error(`V44 source is missing ${token}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const activePath = path.join(pagesDir, 'WayplanCommandCenterPage.tsx');
const versionedPath = path.join(pagesDir, 'WayplanCommandCenterPage.V44.tsx');
if (fs.existsSync(activePath)) {
  const backup = `${activePath}.before-v44-${stamp}`;
  fs.copyFileSync(activePath, backup);
  console.log(`Backup: ${path.relative(root, backup)}`);
}
fs.copyFileSync(sourcePath, activePath);
fs.copyFileSync(sourcePath, versionedPath);
const sourceHash = hash(content);
const activeHash = hash(fs.readFileSync(activePath, 'utf8'));
if (sourceHash !== activeHash) throw new Error('Hash mismatch after installing WayplanCommandCenterPage.tsx');
console.log(`Installed exact V44 source into ${path.relative(root, activePath)} · sha256 ${activeHash.slice(0, 16)}`);

const sqlName = 'wayplan_assignment_modes_v44.sql';
const sqlSource = path.join(scriptDir, sqlName);
if (!fs.existsSync(sqlSource)) throw new Error(`${sqlName} was not found beside the installer.`);
fs.copyFileSync(sqlSource, path.join(root, sqlName));

fs.writeFileSync(path.join(root, 'WAYPLAN_V44_BUILD_STAMP.txt'), [
  'WAYPLAN_V44_EXCLUSIVE_ASSIGNMENT_MODES_FULL_FLEET_VISIBILITY_2026-07-30',
  `installed_at=${new Date().toISOString()}`,
  'assignment_mode_1=RIDER',
  'assignment_mode_2=VEHICLE_CREW',
  'expected_options_rpc=be_wayplan_assignment_options_v44',
  'expected_create_rpc=be_generate_wayplan_from_warehouse_v44',
].join('\n') + '\n');

console.log('PASS: V44 exclusive assignment modes and full Fleet Master visibility installed.');
console.log('Next: run V44 SQL, clear dist/node_modules/.vite, build, then run verify_wayplan_v44.mjs.');
