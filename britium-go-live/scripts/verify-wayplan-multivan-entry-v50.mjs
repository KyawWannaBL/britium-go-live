import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sourcePath = path.join(root, "src/pages/WayplanCommandCenterPage.tsx");
const source = fs.readFileSync(sourcePath, "utf8");

const failures = [];
if (!source.includes("<MultiVanPlanner")) failures.push("MultiVanPlanner is not mounted in Wayplan Command");
if (!source.includes("be_generate_multi_van_v43") && !fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8").includes("be_generate_multi_van_v43")) {
  failures.push("multi-van generation RPC is not wired");
}
if (/async function generateWayplan\s*\(/.test(source)) failures.push("legacy single-wayplan generator is still present");
if (/supabase\.rpc\(["']be_generate_wayplan["']/.test(source)) failures.push("Wayplan Command still calls the legacy single-wayplan RPC directly");
if (/Generate from \{selectedRows\.length\} selected/.test(source)) failures.push("legacy single-wayplan button is still visible");
if (/useState\(["']FLT001["']\)/.test(source) || /useState\(["']6H-7397["']\)/.test(source)) failures.push("hard-coded single delivery van is still present in Wayplan Command");

if (failures.length) {
  console.error("Wayplan Multi-Van Entry V50 contract FAILED:");
  for (const failure of failures) console.error(" - " + failure);
  process.exit(1);
}
console.log("Wayplan Multi-Van Entry V50 contract PASS");
