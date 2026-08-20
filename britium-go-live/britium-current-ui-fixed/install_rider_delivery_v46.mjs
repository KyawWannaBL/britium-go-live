import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const marker = "RIDER_V46_HEAD_OFFICE_ROUTE_EXECUTION_2026-07-30";

function fail(message) { throw new Error(message); }
function read(file) { return fs.readFileSync(file, "utf8"); }

for (const item of ["package.json", "src"]) {
  if (!fs.existsSync(path.join(root, item))) fail(`Run this installer beside package.json and src. Missing: ${item}`);
}

const packageJson = JSON.parse(read(path.join(root, "package.json")));
if (!packageJson.dependencies?.["mapbox-gl"]) fail("package.json is missing mapbox-gl. Install V45 dependencies first.");

const mappings = [
  ["src/pages/RiderAppPage.V46.tsx", "src/pages/RiderAppPage.tsx"],
  ["src/pages/RiderAppPage.V46.tsx", "src/pages/RiderAppPage.V46.tsx"],
  ["src/components/wayplan/RiderRouteExecutionV46.tsx", "src/components/wayplan/RiderRouteExecutionV46.tsx"],
  ["src/components/wayplan/RiderMapboxRouteV45.tsx", "src/components/wayplan/RiderMapboxRouteV45.tsx"],
];

for (const [sourceRelative] of mappings) {
  const source = path.join(packageRoot, sourceRelative);
  if (!fs.existsSync(source)) fail(`Package source missing: ${sourceRelative}`);
}

for (const [sourceRelative, token] of [
  ["src/pages/RiderAppPage.V46.tsx", marker],
  ["src/pages/RiderAppPage.V46.tsx", "be_rider_record_stop_result_v46"],
  ["src/components/wayplan/RiderRouteExecutionV46.tsx", "Start at Head Office"],
  ["src/components/wayplan/RiderRouteExecutionV46.tsx", "be_rider_start_route_v46"],
  ["src/components/wayplan/RiderMapboxRouteV45.tsx", "MAPBOX RIDER ROUTE"],
]) {
  if (!read(path.join(packageRoot, sourceRelative)).includes(token)) fail(`Package source ${sourceRelative} is missing ${token}`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const [sourceRelative, destinationRelative] of mappings) {
  const source = path.join(packageRoot, sourceRelative);
  const destination = path.join(root, destinationRelative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (destinationRelative === "src/pages/RiderAppPage.tsx" && fs.existsSync(destination)) {
    fs.copyFileSync(destination, `${destination}.before-v46-${timestamp}`);
  }
  fs.copyFileSync(source, destination);
  console.log(`Installed Rider V46 into ${destinationRelative}`);
}

for (const [relative, token] of [
  ["src/pages/RiderAppPage.tsx", marker],
  ["src/components/wayplan/RiderRouteExecutionV46.tsx", "Accept Route"],
  ["src/components/wayplan/RiderMapboxRouteV45.tsx", "MAPBOX RIDER ROUTE"],
]) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full) || !read(full).includes(token)) fail(`Installation failed: ${relative} is missing ${token}`);
  console.log(`PASS active source: ${relative}`);
}

fs.writeFileSync(
  path.join(root, "RIDER_DELIVERY_V46_INSTALLED.txt"),
  `${marker}\nInstalled: ${new Date().toISOString()}\n`,
  "utf8",
);

console.log("PASS: Rider V46 route acceptance, Head Office start, sequential stops, and result synchronization installed.");
console.log("Next: clear dist/node_modules/.vite, build, then run node verify_rider_delivery_v46.mjs");
