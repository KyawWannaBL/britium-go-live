import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const activePath = path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx');
if (!fs.existsSync(activePath)) throw new Error('Missing src/pages/WayplanCommandCenterPage.tsx');
const source = fs.readFileSync(activePath, 'utf8');
const requiredSource = [
  'WAYPLAN_V44_EXCLUSIVE_ASSIGNMENT_MODES_FULL_FLEET_VISIBILITY_2026-07-30',
  'be_wayplan_assignment_options_v44',
  'be_generate_wayplan_from_warehouse_v44',
  'Rider Delivery — Rider only',
  'Vehicle Crew — Vehicle + Driver + Helper',
  'Vehicle Crew mode requires an authorized Driver.',
  'Vehicle Crew mode requires an assigned Helper.',
  'dispatch_eligible === false',
  'POLICY BLOCKED',
  'V44 ASSIGNMENT MODES ACTIVE',
  'be_wayplan_submit_review_v43',
];
for (const token of requiredSource) {
  if (!source.includes(token)) throw new Error(`Active Wayplan source is missing ${token}`);
}
if (source.includes('be_generate_wayplan_from_warehouse_v42",')) {
  throw new Error('Active Wayplan source still calls the V42 create RPC instead of V44.');
}
console.log('PASS source: exclusive Rider/Vehicle-Crew modes and V44 RPCs are active.');

const sqlPath = path.join(root, 'wayplan_assignment_modes_v44.sql');
if (!fs.existsSync(sqlPath)) throw new Error('Missing wayplan_assignment_modes_v44.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
for (const token of [
  'be_wayplan_assignment_options_v44',
  'be_generate_wayplan_from_warehouse_v44',
  "'RIDER'",
  "'VEHICLE_CREW'",
  'be_wayplan_validate_review_v43',
  'dispatch_eligible',
  'fleet_records',
]) {
  if (!sql.includes(token)) throw new Error(`V44 SQL is missing ${token}`);
}
console.log('PASS SQL structure: assignment modes, full fleet visibility, and V43 review validation are present.');

const appPath = path.join(root, 'src', 'App.tsx');
const app = fs.readFileSync(appPath, 'utf8');
if (!app.includes('/wayplan-command') || !app.includes('WayplanCommandCenterPage')) throw new Error('Missing active /wayplan-command route.');
if (!app.includes('/supervisor-wayplan') || !app.includes('SupervisorWayplanReviewPage')) throw new Error('Missing /supervisor-wayplan route.');
console.log('PASS routes: Wayplan Command and Supervisor Wayplan Review.');

const distDir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(distDir)) throw new Error('Missing dist/assets. Run npm run build after clearing dist.');
const jsFiles = fs.readdirSync(distDir).filter((name) => name.endsWith('.js'));
let matchedBundle = '';
let matchedContent = '';
for (const name of jsFiles) {
  const content = fs.readFileSync(path.join(distDir, name), 'utf8');
  if (content.includes('WAYPLAN_V44_EXCLUSIVE_ASSIGNMENT_MODES_FULL_FLEET_VISIBILITY_2026-07-30')) {
    matchedBundle = name;
    matchedContent = content;
    break;
  }
}
if (!matchedBundle) throw new Error('Production bundle is stale: V44 marker was not found. Clear dist and rebuild.');
for (const token of [
  'be_wayplan_assignment_options_v44',
  'be_generate_wayplan_from_warehouse_v44',
  'Rider Delivery',
  'Vehicle Crew',
  'POLICY BLOCKED',
  'V44 ASSIGNMENT MODES ACTIVE',
]) {
  if (!matchedContent.includes(token)) throw new Error(`Wayplan production bundle ${matchedBundle} is missing ${token}`);
}
console.log(`PASS bundle: ${matchedBundle} contains the live V44 assignment-mode UI and backend RPCs.`);

const sourceMtime = fs.statSync(activePath).mtimeMs;
const bundleMtime = fs.statSync(path.join(distDir, matchedBundle)).mtimeMs;
if (bundleMtime + 1000 < sourceMtime) throw new Error('Production bundle is older than the active Wayplan source. Rebuild before deployment.');

console.log('SAFE TO DEPLOY WAYPLAN V44 EXCLUSIVE ASSIGNMENT MODES');
