import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const build = 'FIELD_TEAM_V51_DRIVER_WAYPLAN_VISIBILITY_2026-07-30';

const copies = [
  ['src/pages/RiderFieldPortalApp.V51.tsx', 'src/pages/RiderFieldPortalApp.tsx'],
  ['src/pages/RiderFieldPortalApp.V51.tsx', 'src/pages/RiderFieldPortalApp.V51.tsx'],
  ['src/components/wayplan/RiderRouteExecutionV46.tsx', 'src/components/wayplan/RiderRouteExecutionV46.tsx'],
  ['src/components/wayplan/RiderMapboxRouteV45.tsx', 'src/components/wayplan/RiderMapboxRouteV45.tsx'],
];

function assertFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`);
}

for (const [sourceRel, targetRel] of copies) {
  const source = path.join(packageDir, sourceRel);
  const target = path.join(root, targetRel);
  assertFile(source, 'Package source');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target) && sourceRel !== targetRel) {
    const backup = `${target}.bak-v51-${new Date().toISOString().replaceAll(':', '-')}`;
    fs.copyFileSync(target, backup);
    console.log(`Backup ${path.relative(root, backup)}`);
  }
  fs.copyFileSync(source, target);
  console.log(`Installed V51 into ${path.relative(root, target)}`);
}

const active = fs.readFileSync(path.join(root, 'src/pages/RiderFieldPortalApp.tsx'), 'utf8');
for (const required of [
  build,
  'be_field_team_wayplan_snapshot_v51',
  'driver_ygn_0001@... -> DRV001',
  'RiderRouteExecutionV46',
  'Open Assigned Route',
]) {
  if (!active.includes(required)) throw new Error(`Active Rider Field Portal is missing ${required}`);
}
console.log(`PASS installer ${build}`);
console.log('Next: run rider_driver_wayplan_visibility_v51.sql, clear dist/node_modules/.vite, build, then verify.');
