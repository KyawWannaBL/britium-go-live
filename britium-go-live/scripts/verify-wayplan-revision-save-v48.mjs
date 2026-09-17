import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const plannerPath = path.join(root, "src", "components", "CreatedWayplanRevisionPlanner.tsx");
const source = fs.readFileSync(plannerPath, "utf8");

const saveStart = source.indexOf("async function saveRevision()");
const saveEnd = source.indexOf("const short =", saveStart);
if (saveStart < 0 || saveEnd < 0) {
  throw new Error("Could not locate saveRevision contract section.");
}

const saveSource = source.slice(saveStart, saveEnd);

if (saveSource.includes("await optimizeOne(plan)")) {
  throw new Error("V48 save contract FAILED: Save must not silently re-run road optimization after operator review.");
}

const requiredMarkers = [
  'const reviewed = plan;',
  'supabase.rpc("be_replace_created_wayplan_v46"',
  'Saving the reviewed route and replacement CREATED Wayplan',
  'onClick={prepareRevision}>Re-optimize road route again',
];

const missing = requiredMarkers.filter((marker) => !source.includes(marker));
if (missing.length) {
  console.error("V48 reviewed-route save contract FAILED:");
  for (const marker of missing) console.error(` - missing: ${marker}`);
  process.exit(1);
}

console.log("Wayplan V48 reviewed-route save contract PASS");
