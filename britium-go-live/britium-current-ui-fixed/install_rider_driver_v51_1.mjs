import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const packageDir = path.dirname(fileURLToPath(import.meta.url));
const sourceBuild = 'FIELD_TEAM_V51_DRIVER_WAYPLAN_VISIBILITY_2026-07-30';
const hostBuild = 'FIELD_PORTAL_HOST_ACTIVATION_V51_1_2026-07-30';

function requireFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`);
}

function backup(file, suffix) {
  if (!fs.existsSync(file)) return;
  const target = `${file}.bak-${suffix}-${new Date().toISOString().replaceAll(':', '-')}`;
  fs.copyFileSync(file, target);
  console.log(`Backup ${path.relative(root, target)}`);
}

const copies = [
  ['src/pages/RiderFieldPortalApp.V51.tsx', 'src/pages/RiderFieldPortalApp.tsx'],
  ['src/pages/RiderFieldPortalApp.V51.tsx', 'src/pages/RiderFieldPortalApp.V51.tsx'],
  ['src/components/wayplan/RiderRouteExecutionV46.tsx', 'src/components/wayplan/RiderRouteExecutionV46.tsx'],
  ['src/components/wayplan/RiderMapboxRouteV45.tsx', 'src/components/wayplan/RiderMapboxRouteV45.tsx'],
];

for (const [sourceRel, targetRel] of copies) {
  const source = path.join(packageDir, sourceRel);
  const target = path.join(root, targetRel);
  requireFile(source, 'Package source');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (sourceRel !== targetRel) backup(target, 'v51-1');
  fs.copyFileSync(source, target);
  console.log(`Installed ${path.relative(root, target)}`);
}

const mainFile = path.join(root, 'src/main.tsx');
requireFile(mainFile, 'Application entrypoint');
let main = fs.readFileSync(mainFile, 'utf8');
backup(mainFile, 'v51-1-host-router');

if (!main.includes(hostBuild)) {
  const appImport = /import\s+App\s+from\s+["']\.\/App["'];?/;
  if (!appImport.test(main)) throw new Error('Unable to locate import App from "./App" in src/main.tsx');

  main = main.replace(appImport, (match) => `${match}\n\nconst RiderFieldPortalApp = React.lazy(() => import("./pages/RiderFieldPortalApp"));\nconst FIELD_PORTAL_HOST_ACTIVATION_BUILD = "${hostBuild}";\n\nfunction shouldRenderFieldPortal(): boolean {\n  if (typeof window === "undefined") return false;\n  const host = window.location.hostname.toLowerCase();\n  const dedicatedHosts = new Set([\n    "uat.britiumexpress.app",\n    "britiumexpress.app",\n    "www.britiumexpress.app",\n    "rider.britiumexpress.app",\n  ]);\n  const forced = new URLSearchParams(window.location.search).get("field_portal") === "1";\n  return dedicatedHosts.has(host) || forced;\n}\n`);

  const renderStart = main.lastIndexOf('ReactDOM.createRoot');
  if (renderStart < 0) throw new Error('Unable to locate ReactDOM.createRoot in src/main.tsx');
  const prefix = main.slice(0, renderStart).trimEnd();
  const replacement = `\n\nif (typeof document !== "undefined") {\n  document.documentElement.dataset.beFieldPortalHostBuild = FIELD_PORTAL_HOST_ACTIVATION_BUILD;\n}\n\nconst application = shouldRenderFieldPortal() ? (\n  <React.StrictMode>\n    <React.Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#061524", color: "#f6b84b", fontFamily: "Poppins, sans-serif" }}>Loading Britium Field Command Wall...</div>}>\n      <RiderFieldPortalApp />\n    </React.Suspense>\n  </React.StrictMode>\n) : (\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n\nReactDOM.createRoot(document.getElementById('root')!).render(application);\n`;
  main = prefix + replacement;
}

fs.writeFileSync(mainFile, main, 'utf8');

const active = fs.readFileSync(path.join(root, 'src/pages/RiderFieldPortalApp.tsx'), 'utf8');
for (const item of [sourceBuild, 'be_field_team_wayplan_snapshot_v51', 'Open Assigned Route']) {
  if (!active.includes(item)) throw new Error(`Active Rider Field Portal is missing ${item}`);
}
for (const item of [hostBuild, 'uat.britiumexpress.app', 'RiderFieldPortalApp']) {
  if (!main.includes(item)) throw new Error(`src/main.tsx is missing ${item}`);
}

console.log(`PASS active source ${sourceBuild}`);
console.log(`PASS host router ${hostBuild}`);
console.log('Next: clear dist/node_modules/.vite, run npm run build, then node verify_rider_driver_v51_1.mjs.');
