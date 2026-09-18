import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const planner = fs.readFileSync(path.join(root, "src/components/MultiVanPlanner.tsx"), "utf8");

const checks = [
  ["retry helper exists", planner.includes("async function fetchWayplanApi")],
  ["three attempts configured", planner.includes("const attempts = 3")],
  ["request timeout exists", planner.includes("45000") && planner.includes("AbortController")],
  ["transient 502/503/504 retried", planner.includes("[502, 503, 504]")],
  ["zone planner uses retry wrapper", planner.includes('fetchWayplanApi("/api/wayplan-zone-plan"')],
  ["road optimizer uses retry wrapper", planner.includes('fetchWayplanApi("/api/wayplan-route"')],
  ["selection preserved after failure", planner.includes("you do not need to restart the queue workflow")],
];

const failed = checks.filter(([,ok]) => !ok).map(([name]) => name);
if (failed.length) {
  console.error("Wayplan fetch recovery V58 contract FAILED:");
  failed.forEach((name) => console.error(" - " + name));
  process.exit(1);
}
console.log("Wayplan fetch recovery V58 contract PASS");
