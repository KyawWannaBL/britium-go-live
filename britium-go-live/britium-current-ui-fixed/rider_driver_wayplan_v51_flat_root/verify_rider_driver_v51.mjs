import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const build = 'FIELD_TEAM_V51_DRIVER_WAYPLAN_VISIBILITY_2026-07-30';

function requireText(file, items, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} missing: ${file}`);
  const content = fs.readFileSync(file, 'utf8');
  for (const item of items) {
    if (!content.includes(item)) throw new Error(`${label} is missing ${item}`);
  }
  console.log(`PASS ${label}: ${path.relative(root, file)}`);
}

requireText(path.join(root, 'src/pages/RiderFieldPortalApp.tsx'), [
  build,
  'be_field_team_wayplan_snapshot_v51',
  'driver_ygn_0001@... -> DRV001',
  'RiderRouteExecutionV46',
  'Open Assigned Route',
], 'active Field Command Wall source');

requireText(path.join(root, 'src/components/wayplan/RiderRouteExecutionV46.tsx'), [
  'be_rider_route_snapshot_v46',
  'be_rider_accept_route_v46',
  'Start at Head Office',
], 'V46 route execution source');

requireText(path.join(root, 'rider_driver_wayplan_visibility_v51.sql'), [
  'be_field_team_code_from_login_v51',
  'be_field_team_wayplan_snapshot_v51',
  'be_rider_route_operator_v46',
  "'DISPATCHED','COMPLETED','RTO'",
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
for (const item of [build, 'be_field_team_wayplan_snapshot_v51', 'Open Assigned Route']) {
  if (!merged.includes(item)) throw new Error(`Production bundle is missing ${item}`);
}
console.log('PASS production bundle: Field Command Wall V51 markers and RPC');
console.log('SAFE TO DEPLOY RIDER / DRIVER WAYPLAN VISIBILITY V51');
