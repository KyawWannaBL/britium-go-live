import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceBuild = 'FIELD_TEAM_V51_DRIVER_WAYPLAN_VISIBILITY_2026-07-30';
const hostBuild = 'FIELD_PORTAL_HOST_ACTIVATION_V51_1_2026-07-30';

function requireText(file, items, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} missing: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  for (const item of items) {
    if (!text.includes(item)) throw new Error(`${label} is missing ${item}`);
  }
  console.log(`PASS ${label}: ${path.relative(root, file)}`);
}

requireText(path.join(root, 'src/pages/RiderFieldPortalApp.tsx'), [
  sourceBuild,
  'be_field_team_wayplan_snapshot_v51',
  'Open Assigned Route',
  'RiderRouteExecutionV46',
], 'active Field Command Wall source');

requireText(path.join(root, 'src/main.tsx'), [
  hostBuild,
  'uat.britiumexpress.app',
  'www.britiumexpress.app',
  'RiderFieldPortalApp',
  'shouldRenderFieldPortal',
], 'field portal host router');

requireText(path.join(root, 'rider_driver_wayplan_visibility_v51.sql'), [
  'be_field_team_code_from_login_v51',
  'be_field_team_wayplan_snapshot_v51',
  'be_rider_route_operator_v46',
], 'V51 SQL');

const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) throw new Error('dist is missing. Run npm run build first.');
const jsFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
  }
}
walk(dist);
const merged = jsFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const item of [sourceBuild, hostBuild, 'be_field_team_wayplan_snapshot_v51', 'Open Assigned Route']) {
  if (!merged.includes(item)) throw new Error(`Production bundle is missing ${item}`);
}

const fieldChunk = jsFiles.find((file) => fs.readFileSync(file, 'utf8').includes(sourceBuild));
if (!fieldChunk) throw new Error('No production chunk contains the V51 Field Command Wall');
console.log(`PASS production field chunk: ${path.relative(root, fieldChunk)}`);
console.log('PASS production bundle: dedicated field portal host includes V51 source');
console.log('SAFE TO DEPLOY RIDER / DRIVER V51.1 HOST ACTIVATION');
