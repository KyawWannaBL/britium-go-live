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
  throw new Error('The /supervisor-wayplan route is missing. Install the V43 route before this hotfix.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    source: 'WayplanCommandCenterPage.V43_1.tsx',
    active: 'WayplanCommandCenterPage.tsx',
    versioned: 'WayplanCommandCenterPage.V43_1.tsx',
    marker: 'WAYPLAN_V43_1_MASTER_DROPDOWN_ACTIVATION_2026-07-30',
    required: [
      'be_wayplan_assignment_options_v42',
      'Vehicle Master Data / Manual',
      'Rider Master Data / Manual',
      'Driver Master Data / Manual',
      'Helper Master Data / Manual',
      '— Blank / type manually —',
      'MASTER DATA DROPDOWNS ACTIVE',
      'be_wayplan_submit_review_v43',
    ],
  },
  {
    source: 'SupervisorWayplanReviewPage.V43.tsx',
    active: 'SupervisorWayplanReviewPage.tsx',
    versioned: 'SupervisorWayplanReviewPage.V43.tsx',
    marker: 'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
    required: ['be_wayplan_supervisor_snapshot_v43', 'Approve & Send to Dispatch'],
  },
  {
    source: 'DispatchCommandCenterPage.V43.tsx',
    active: 'DispatchCommandCenterPage.tsx',
    versioned: 'DispatchCommandCenterPage.V43.tsx',
    marker: 'DISPATCH_V43_SUPERVISOR_APPROVAL_GUARDED_PUBLISH_2026-07-30',
    required: ['be_dispatch_publish_wayplan_v43', 'Supervisor-approved'],
  },
];

for (const item of files) {
  const candidates = [
    path.join(scriptDir, 'src', 'pages', item.source),
    path.join(scriptDir, item.source),
  ];
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) throw new Error(`${item.source} was not found beside the installer.`);
  const content = fs.readFileSync(sourcePath, 'utf8');
  for (const token of [item.marker, ...item.required]) {
    if (!content.includes(token)) throw new Error(`${item.source} is missing ${token}`);
  }

  const activePath = path.join(pagesDir, item.active);
  const versionedPath = path.join(pagesDir, item.versioned);
  if (fs.existsSync(activePath)) {
    const backup = `${activePath}.before-v43-1-${stamp}`;
    fs.copyFileSync(activePath, backup);
    console.log(`Backup: ${path.relative(root, backup)}`);
  }
  fs.copyFileSync(sourcePath, activePath);
  fs.copyFileSync(sourcePath, versionedPath);

  const sourceHash = hash(content);
  const activeHash = hash(fs.readFileSync(activePath, 'utf8'));
  if (sourceHash !== activeHash) throw new Error(`Hash mismatch after installing ${item.active}`);
  console.log(`Installed exact V43.1 source into ${path.relative(root, activePath)} · sha256 ${activeHash.slice(0, 16)}`);
}

const sqlName = 'wayplan_supervisor_approval_v43.sql';
const sqlSource = path.join(scriptDir, sqlName);
if (fs.existsSync(sqlSource)) fs.copyFileSync(sqlSource, path.join(root, sqlName));

fs.writeFileSync(path.join(root, 'WAYPLAN_V43_1_BUILD_STAMP.txt'), [
  'WAYPLAN_V43_1_MASTER_DROPDOWN_ACTIVATION_2026-07-30',
  `installed_at=${new Date().toISOString()}`,
  'expected_header=MASTER DATA DROPDOWNS ACTIVE',
  'expected_rpc=be_wayplan_assignment_options_v42',
].join('\n') + '\n');

console.log('PASS: exact active page now contains all four Master Data dropdowns and V43 approval controls.');
console.log('Next: remove dist and node_modules/.vite, build, run verify_wayplan_v43_1.mjs, then deploy.');
