import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const route = fs.readFileSync(path.join(root, "api/wayplan-route.mjs"), "utf8");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");
const revision = fs.readFileSync(path.join(root, "src/components/CreatedWayplanRevisionPlanner.tsx"), "utf8");

const checks = [
  ["billing-safe default exists", route.includes('DEFAULT_PROVIDER_MODE = "MAPBOX_PREFERRED_BILLING_HOLD"')],
  ["provider mode can be overridden", route.includes('WAYPLAN_ROAD_PROVIDER_MODE')],
  ["Mapbox is tried first in billing-safe mode", route.includes("if (mapboxPreferred)") && route.indexOf("const mapboxResult = await useMapbox()") < route.indexOf("const googleResult = await useGoogle()")],
  ["normal Wayplans can skip Google billing hold", route.includes("normal_wayplans_skip_google_billing_hold")],
  ["Google remains recovery secondary", route.includes('provider_role: mapboxPreferred ? "RECOVERY_SECONDARY" : "PRIMARY"')],
  ["straight-line fallback remains disabled", route.includes("Straight-line geographic fallback is disabled")],
  ["UI explains temporary Mapbox-first mode", planner.includes("Temporary billing-safe mode uses Mapbox road routing first")],
  ["revision UI explains temporary routing mode", revision.includes("temporary Mapbox-first billing-safe mode")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan billing-safe routing V53 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan billing-safe routing V53 contract PASS");
