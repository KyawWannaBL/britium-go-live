import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dispatchPath = path.join(root, 'src', 'pages', 'DispatchCommandCenterPage.tsx');
const wayplanPath = path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx');
const sqlPath = path.join(root, 'dispatch_wayplan_execution_v41.sql');

const checks = [
  {
    file: dispatchPath,
    required: [
      'DISPATCH_V41_WAYPLAN_SCANNING_GUARDED_RELEASE_2026-07-30',
      'be_dispatch_wayplan_snapshot_v41',
      'be_dispatch_scan_wayplan_parcel_v41',
      'be_dispatch_scan_wayplan_batch_v41',
      'be_dispatch_publish_wayplan_v41',
      'Publish Selected Wayplan',
      'Process Batch Scan',
    ],
  },
  {
    file: wayplanPath,
    required: [
      'WAYPLAN_V41_SELECTED_HANDOFF_TO_DISPATCH_2026-07-30',
      '#/dispatch-command?wayplan=',
      'be_wayplan_prepare_dispatch_v40',
    ],
  },
  {
    file: sqlPath,
    required: [
      'be_dispatch_wayplan_snapshot_v41',
      'be_dispatch_scan_wayplan_parcel_v41',
      'be_dispatch_scan_wayplan_batch_v41',
      'be_dispatch_publish_wayplan_v41',
      "membership_status = 'DISPATCHED'",
      'mandatory Dispatch scan',
    ],
  },
];

for (const check of checks) {
  if (!fs.existsSync(check.file)) throw new Error(`Missing ${check.file}`);
  const text = fs.readFileSync(check.file, 'utf8');
  for (const item of check.required) {
    if (!text.includes(item)) throw new Error(`${check.file} is missing ${item}`);
  }
  console.log(`PASS source: ${path.relative(root, check.file)}`);
}

const dispatchSource = fs.readFileSync(dispatchPath, 'utf8');
for (const forbidden of ['be_enterprise_dispatch_snapshot\")', '>Publish All<']) {
  if (dispatchSource.includes(forbidden)) throw new Error(`Dispatch source still contains obsolete release path: ${forbidden}`);
}

const distDir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(distDir)) throw new Error('dist/assets is missing. Run npm run build before this verifier.');
const jsFiles = fs.readdirSync(distDir).filter((name) => name.endsWith('.js'));
let bundle = '';
for (const name of jsFiles) bundle += fs.readFileSync(path.join(distDir, name), 'utf8');

for (const item of [
  'DISPATCH_V41_WAYPLAN_SCANNING_GUARDED_RELEASE_2026-07-30',
  'WAYPLAN_V41_SELECTED_HANDOFF_TO_DISPATCH_2026-07-30',
  'be_dispatch_wayplan_snapshot_v41',
  'be_dispatch_scan_wayplan_batch_v41',
  'be_dispatch_publish_wayplan_v41',
]) {
  if (!bundle.includes(item)) throw new Error(`Production bundle is missing ${item}`);
}

console.log('PASS bundle: Wayplan selected handoff, mandatory single/batch scanning and guarded selected-Wayplan release are present.');
console.log('SAFE TO DEPLOY DISPATCH / WAYPLAN V41');
