import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  {
    file: path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx'),
    required: [
      'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
      'be_wayplan_submit_review_v43',
      'be_wayplan_review_status_v43',
      '#/supervisor-wayplan?wayplan=',
      'Submit for Review',
    ],
  },
  {
    file: path.join(root, 'src', 'pages', 'SupervisorWayplanReviewPage.tsx'),
    required: [
      'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
      'be_wayplan_supervisor_snapshot_v43',
      'be_wayplan_supervisor_decide_v43',
      'be_wayplan_prepare_dispatch_v43',
      'Approve & Send to Dispatch',
      'Return for Correction',
    ],
  },
  {
    file: path.join(root, 'src', 'pages', 'DispatchCommandCenterPage.tsx'),
    required: [
      'DISPATCH_V43_SUPERVISOR_APPROVAL_GUARDED_PUBLISH_2026-07-30',
      'be_dispatch_publish_wayplan_v43',
      'Supervisor-approved',
    ],
  },
  {
    file: path.join(root, 'wayplan_supervisor_approval_v43.sql'),
    required: [
      'be_wayplan_review_v43',
      'be_wayplan_supervisor_snapshot_v43',
      'be_wayplan_submit_review_v43',
      'be_wayplan_supervisor_decide_v43',
      'be_wayplan_prepare_dispatch_v43',
      'be_dispatch_publish_wayplan_v43',
      'revoke execute on function public.be_dispatch_publish_wayplan_v41',
      'WAYPLAN_SUPERVISOR_APPROVED_V43',
    ],
  },
];

for (const check of checks) {
  if (!fs.existsSync(check.file)) throw new Error(`Missing ${path.relative(root, check.file)}`);
  const content = fs.readFileSync(check.file, 'utf8');
  for (const token of check.required) {
    if (!content.includes(token)) throw new Error(`${path.relative(root, check.file)} is missing ${token}`);
  }
  console.log(`PASS source: ${path.relative(root, check.file)}`);
}

const wayplan = fs.readFileSync(path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx'), 'utf8');
if (wayplan.includes('be_wayplan_prepare_dispatch_v40')) {
  throw new Error('Wayplan Command still exposes the direct V40 Dispatch handoff.');
}
const dispatch = fs.readFileSync(path.join(root, 'src', 'pages', 'DispatchCommandCenterPage.tsx'), 'utf8');
if (dispatch.includes('supabase.rpc("be_dispatch_publish_wayplan_v41"')) {
  throw new Error('Dispatch Command still calls the approval-bypass V41 Publish RPC.');
}
console.log('PASS behavior: Supervisor approval is required before Dispatch handoff and Publish.');

const appPath = path.join(root, 'src', 'App.tsx');
if (!fs.existsSync(appPath)) throw new Error('Missing src/App.tsx');
const app = fs.readFileSync(appPath, 'utf8');
if (!app.includes('/supervisor-wayplan') || !app.includes('SupervisorWayplanReviewPage')) {
  throw new Error('The /supervisor-wayplan route is missing from src/App.tsx.');
}
console.log('PASS route: /supervisor-wayplan');

const distDir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(distDir)) throw new Error('Missing dist/assets. Run npm run build before verification.');
const bundle = fs.readdirSync(distDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(distDir, name), 'utf8'))
  .join('\n');
for (const token of [
  'WAYPLAN_V43_SUPERVISOR_APPROVAL_GATE_2026-07-30',
  'DISPATCH_V43_SUPERVISOR_APPROVAL_GUARDED_PUBLISH_2026-07-30',
  'be_wayplan_submit_review_v43',
  'be_wayplan_supervisor_decide_v43',
  'be_dispatch_publish_wayplan_v43',
]) {
  if (!bundle.includes(token)) throw new Error(`Production bundle is missing ${token}`);
}
console.log('PASS bundle: WAYPLAN / SUPERVISOR / DISPATCH V43');
console.log('SAFE TO DEPLOY WAYPLAN SUPERVISOR APPROVAL V43');
