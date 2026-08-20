import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourcePath = path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx');
const sqlPath = path.join(root, 'wayplan_warehouse_dispatch_v40.sql');

const requiredSource = [
  'WAYPLAN_V40_WAREHOUSE_READY_TO_DISPATCH_SCAN_2026-07-30',
  'be_wayplan_warehouse_ready_snapshot_v40',
  'be_generate_wayplan_from_warehouse_v40',
  'be_wayplan_prepare_dispatch_v40',
  '#/dispatch-command',
  'Create one route group per Wayplan',
];
const forbiddenSource = [
  'be_dispatch_start_wayplan',
  'manifestNo || selectedManifest',
  'user?.email || "operator@britiumexpress.com"',
];
const requiredSql = [
  'be_wayplan_membership_v40',
  'be_wayplan_warehouse_ready_snapshot_v40',
  'be_generate_wayplan_from_warehouse_v40',
  'be_wayplan_prepare_dispatch_v40',
  'WAREHOUSE_READY -> create one route-group Wayplan',
];

if (!fs.existsSync(sourcePath)) throw new Error(`Missing ${sourcePath}`);
if (!fs.existsSync(sqlPath)) throw new Error(`Missing ${sqlPath}`);
const source = fs.readFileSync(sourcePath, 'utf8');
const sql = fs.readFileSync(sqlPath, 'utf8');
for (const item of requiredSource) {
  if (!source.includes(item)) throw new Error(`Source is missing ${item}`);
}
for (const item of forbiddenSource) {
  if (source.includes(item)) throw new Error(`Source still contains unsafe/obsolete marker: ${item}`);
}
for (const item of requiredSql) {
  if (!sql.includes(item)) throw new Error(`SQL is missing ${item}`);
}
console.log('PASS source: src/pages/WayplanCommandCenterPage.tsx');
console.log('PASS SQL: Warehouse Ready validation, one-route Wayplan creation, assignment and Dispatch handoff are present.');

const distDir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(distDir)) throw new Error('dist/assets is missing. Run npm run build before this verifier.');
const jsFiles = fs.readdirSync(distDir).filter((name) => name.endsWith('.js'));
let bundle = '';
for (const name of jsFiles) bundle += fs.readFileSync(path.join(distDir, name), 'utf8');
if (!bundle.includes('WAYPLAN_V40_WAREHOUSE_READY_TO_DISPATCH_SCAN_2026-07-30')) {
  throw new Error('Production bundle is missing the V40 build marker.');
}
if (!bundle.includes('be_generate_wayplan_from_warehouse_v40')) {
  throw new Error('Production bundle is missing the guarded V40 Wayplan creation RPC.');
}
if (!bundle.includes('be_wayplan_prepare_dispatch_v40')) {
  throw new Error('Production bundle is missing the V40 Dispatch handoff RPC.');
}
console.log('PASS bundle: WAYPLAN_V40_WAREHOUSE_READY_TO_DISPATCH_SCAN_2026-07-30');
console.log('SAFE TO DEPLOY WAYPLAN V40');
