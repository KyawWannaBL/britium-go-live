import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageRoot = path.dirname(new URL(import.meta.url).pathname);
const requiredRootFiles = ["package.json", "src"];
for (const item of requiredRootFiles) {
  if (!fs.existsSync(path.join(root, item))) {
    throw new Error(`Run this installer beside package.json and src. Missing: ${item}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (!packageJson.dependencies?.["mapbox-gl"]) {
  throw new Error("package.json is missing mapbox-gl. Install mapbox-gl before deploying V45.");
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
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

for (const [sourceRelative, destinationRelative] of mappings) {
  const source = path.join(packageRoot, sourceRelative);
  const destination = path.join(root, destinationRelative);
  if (!fs.existsSync(source)) throw new Error(`Package source missing: ${sourceRelative}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (fs.existsSync(destination) && !destinationRelative.endsWith(".V45.tsx")) {
    fs.copyFileSync(destination, `${destination}.before-v45-${timestamp}`);
  }
  fs.copyFileSync(source, destination);
  console.log(`Installed V45 into ${destinationRelative}`);
}

console.log("PASS: installed WAYPLAN_V45_MAPBOX_HEAD_OFFICE_ROUTE_2026-07-30");
console.log("Next: configure VITE_MAPBOX_ACCESS_TOKEN, run the V45 SQL, clear dist/node_modules/.vite, build, and run verify_wayplan_mapbox_v45.mjs.");
