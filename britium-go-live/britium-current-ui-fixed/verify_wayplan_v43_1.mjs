import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const activePath = path.join(root, 'src', 'pages', 'WayplanCommandCenterPage.tsx');
const requiredSource = [
  'WAYPLAN_V43_1_MASTER_DROPDOWN_ACTIVATION_2026-07-30',
  'be_wayplan_assignment_options_v42',
  'Vehicle Master Data / Manual',
  'Rider Master Data / Manual',
  'Driver Master Data / Manual',
  'Helper Master Data / Manual',
  '— Blank / type manually —',
  'MASTER DATA DROPDOWNS ACTIVE',
  'be_wayplan_submit_review_v43',
  '#/supervisor-wayplan?wayplan=',
];
if (!fs.existsSync(activePath)) throw new Error('Missing src/pages/WayplanCommandCenterPage.tsx');
const source = fs.readFileSync(activePath, 'utf8');
for (const token of requiredSource) {
  if (!source.includes(token)) throw new Error(`Active Wayplan source is missing ${token}`);
}
if (source.includes('const BUILD_MARKER = "WAYPLAN_V40_') || source.includes('const BUILD_MARKER = "WAYPLAN_V41_')) {
  throw new Error('The active Wayplan source is still an older V40/V41 page.');
}
console.log('PASS source: active /wayplan-command page has Vehicle, Rider, Driver and Helper dropdowns.');

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
  if (content.includes('WAYPLAN_V43_1_MASTER_DROPDOWN_ACTIVATION_2026-07-30')) {
    matchedBundle = name;
    matchedContent = content;
    break;
  }
}
if (!matchedBundle) throw new Error('Production bundle is stale: V43.1 marker was not found. Clear dist and rebuild.');
for (const token of [
  'be_wayplan_assignment_options_v42',
  'Vehicle Master Data / Manual',
  'Rider Master Data / Manual',
  'Driver Master Data / Manual',
  'Helper Master Data / Manual',
  'MASTER DATA DROPDOWNS ACTIVE',
  'be_wayplan_submit_review_v43',
]) {
  if (!matchedContent.includes(token)) throw new Error(`Wayplan production bundle ${matchedBundle} is missing ${token}`);
}
console.log(`PASS bundle: ${matchedBundle} contains the live V43.1 dropdown UI and backend RPC.`);

const sourceMtime = fs.statSync(activePath).mtimeMs;
const bundleMtime = fs.statSync(path.join(distDir, matchedBundle)).mtimeMs;
if (bundleMtime + 1000 < sourceMtime) throw new Error('Production bundle is older than the active Wayplan source. Rebuild before deployment.');

console.log('SAFE TO DEPLOY WAYPLAN V43.1 MASTER DROPDOWN ACTIVATION');
