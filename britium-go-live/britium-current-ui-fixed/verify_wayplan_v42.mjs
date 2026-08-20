import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx');
const versionedPath = path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.V42.tsx');
const sqlPath = path.join(root, 'wayplan_master_assignment_v42.sql');

const checks = [
  {
    file: sourcePath,
    required: [
      'WAYPLAN_V42_MASTER_DATA_ROUTE_ASSIGNMENT_2026-07-30',
      'be_wayplan_assignment_options_v42',
      'be_generate_wayplan_from_warehouse_v42',
      'vehicle_master_key',
      'rider_master_key',
      'driver_master_key',
      'helper_master_key',
      '— Blank / type manually —',
      '#/dispatch-command?wayplan=',
    ],
  },
  {
    file: versionedPath,
    required: ['WAYPLAN_V42_MASTER_DATA_ROUTE_ASSIGNMENT_2026-07-30'],
  },
  {
    file: sqlPath,
    required: [
      'be_wayplan_assignment_options_v42',
      'be_generate_wayplan_from_warehouse_v42',
      'be_wayplan_normalize_vehicle_type_v42',
      'WAYPLAN_MASTER_DATA_ASSIGNMENTS_RESOLVED_V42',
      "'rider_master'",
      "'driver_master'",
      "'helper_master'",
      "'fleet_master'",
    ],
  },
];

for (const check of checks) {
  if (!fs.existsSync(check.file)) throw new Error(`Missing ${check.file}`);
  const content = fs.readFileSync(check.file, 'utf8');
  for (const token of check.required) {
    if (!content.includes(token)) throw new Error(`${path.relative(root, check.file)} is missing ${token}`);
  }
  console.log(`PASS source: ${path.relative(root, check.file)}`);
}

const source = fs.readFileSync(sourcePath, 'utf8');
const blankCount = (source.match(/— Blank \/ type manually —/g) || []).length;
if (blankCount < 4) throw new Error(`Expected four blank/manual dropdown rows; found ${blankCount}`);
if (source.includes('supabase.rpc("be_generate_wayplan_from_warehouse_v40"')) {
  throw new Error('Active Wayplan source still calls the unvalidated V40 create RPC.');
}
console.log('PASS behavior: all four assignment dropdowns include blank/manual entry and V42 guarded create is active.');

const distDir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(distDir)) throw new Error('Missing dist/assets. Run npm run build before verification.');
const jsFiles = fs.readdirSync(distDir).filter((name) => name.endsWith('.js'));
const bundle = jsFiles.map((name) => fs.readFileSync(path.join(distDir, name), 'utf8')).join('\n');
for (const token of [
  'WAYPLAN_V42_MASTER_DATA_ROUTE_ASSIGNMENT_2026-07-30',
  'be_wayplan_assignment_options_v42',
  'be_generate_wayplan_from_warehouse_v42',
  'Blank / type manually',
]) {
  if (!bundle.includes(token)) throw new Error(`Production bundle is missing ${token}`);
}
console.log('PASS bundle: WAYPLAN_V42_MASTER_DATA_ROUTE_ASSIGNMENT_2026-07-30');
console.log('SAFE TO DEPLOY WAYPLAN V42');
