import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const packageRoot = path.dirname(fileURLToPath(import.meta.url));

function fail(message) {
  throw new Error(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

for (const item of ["package.json", "src"]) {
  if (!fs.existsSync(path.join(root, item))) {
    fail(`Run this installer beside package.json and src. Missing: ${item}`);
  }
}

const packageJson = JSON.parse(readText(path.join(root, "package.json")));
if (!packageJson.dependencies?.["mapbox-gl"]) {
  fail("package.json is missing mapbox-gl. Run npm install mapbox-gl before installing V45.1.");
}

const mappings = [
  ["src/pages/WayplanCommandCenterPage.V45.tsx", "src/pages/WayplanCommandCenterPage.tsx"],
  ["src/pages/WayplanCommandCenterPage.V45.tsx", "src/pages/WayplanCommandCenterPage.V45.tsx"],
  ["src/pages/SupervisorWayplanReviewPage.V45.tsx", "src/pages/SupervisorWayplanReviewPage.tsx"],
  ["src/pages/SupervisorWayplanReviewPage.V45.tsx", "src/pages/SupervisorWayplanReviewPage.V45.tsx"],
  ["src/pages/RiderAppPage.V45.tsx", "src/pages/RiderAppPage.tsx"],
  ["src/pages/RiderAppPage.V45.tsx", "src/pages/RiderAppPage.V45.tsx"],
  ["src/components/wayplan/MapboxWayplanPlannerV45.tsx", "src/components/wayplan/MapboxWayplanPlannerV45.tsx"],
  ["src/components/wayplan/RiderMapboxRouteV45.tsx", "src/components/wayplan/RiderMapboxRouteV45.tsx"],
  ["src/lib/mapboxHeadOfficeRoutingV45.ts", "src/lib/mapboxHeadOfficeRoutingV45.ts"],
];

const sourceRequirements = new Map([
  ["src/pages/WayplanCommandCenterPage.V45.tsx", [
    "WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30",
    "MapboxWayplanPlannerV45",
    "be_wayplan_submit_review_v45",
  ]],
  ["src/pages/SupervisorWayplanReviewPage.V45.tsx", [
    "WAYPLAN_V45_SUPERVISOR_MAPBOX_ROUTE_GATE_2026-07-30",
    "be_wayplan_supervisor_decide_v45",
  ]],
  ["src/pages/RiderAppPage.V45.tsx", ["RiderMapboxRouteV45"]],
  ["src/components/wayplan/MapboxWayplanPlannerV45.tsx", [
    "Optimize from Head Office",
    "be_wayplan_save_mapbox_route_v45",
    "VITE_MAPBOX_ACCESS_TOKEN",
  ]],
  ["src/components/wayplan/RiderMapboxRouteV45.tsx", ["MAPBOX RIDER ROUTE"]],
  ["src/lib/mapboxHeadOfficeRoutingV45.ts", [
    "optimized-trips/v1",
    "source: \"first\"",
    "destination: \"last\"",
  ]],
]);

for (const [sourceRelative, required] of sourceRequirements) {
  const source = path.join(packageRoot, sourceRelative);
  if (!fs.existsSync(source)) fail(`Package source missing: ${sourceRelative}`);
  const content = readText(source);
  for (const token of required) {
    if (!content.includes(token)) fail(`Package source ${sourceRelative} is missing ${token}`);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const [sourceRelative, destinationRelative] of mappings) {
  const source = path.join(packageRoot, sourceRelative);
  const destination = path.join(root, destinationRelative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  const isActivePage = [
    "src/pages/WayplanCommandCenterPage.tsx",
    "src/pages/SupervisorWayplanReviewPage.tsx",
    "src/pages/RiderAppPage.tsx",
  ].includes(destinationRelative);

  if (isActivePage && fs.existsSync(destination)) {
    fs.copyFileSync(destination, `${destination}.before-v45-1-${timestamp}`);
  }

  fs.copyFileSync(source, destination);
  console.log(`Installed V45.1 into ${destinationRelative}`);
}

const destinationChecks = [
  ["src/pages/WayplanCommandCenterPage.tsx", "WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30"],
  ["src/pages/SupervisorWayplanReviewPage.tsx", "WAYPLAN_V45_SUPERVISOR_MAPBOX_ROUTE_GATE_2026-07-30"],
  ["src/pages/RiderAppPage.tsx", "RiderMapboxRouteV45"],
  ["src/components/wayplan/MapboxWayplanPlannerV45.tsx", "be_wayplan_save_mapbox_route_v45"],
  ["src/components/wayplan/RiderMapboxRouteV45.tsx", "MAPBOX RIDER ROUTE"],
  ["src/lib/mapboxHeadOfficeRoutingV45.ts", "optimized-trips/v1"],
];

for (const [relative, token] of destinationChecks) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) fail(`Installation failed: ${relative} was not created`);
  if (!readText(full).includes(token)) fail(`Installation failed: ${relative} is missing ${token}`);
  console.log(`PASS active source: ${relative}`);
}

fs.writeFileSync(
  path.join(root, "WAYPLAN_MAPBOX_V45_1_ACTIVATED.txt"),
  `WAYPLAN_MAPBOX_V45_1_ACTIVATION_FIX_2026-07-30\nInstalled: ${new Date().toISOString()}\n`,
  "utf8",
);

console.log("PASS: active Wayplan, Supervisor, and Rider sources now contain Mapbox V45");
console.log("Next: remove dist/node_modules/.vite, run npm run build, then node verify_wayplan_mapbox_v45_1.mjs");
