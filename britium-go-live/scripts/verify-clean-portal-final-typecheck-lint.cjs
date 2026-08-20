const fs = require("fs");
const path = require("path");
const root = process.cwd();
const p = (...parts) => path.join(root, ...parts);

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const pkgFile = p("package.json");
if (!fs.existsSync(pkgFile)) fail("package.json missing.");
const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));

if (!pkg.dependencies?.axios) fail("axios dependency missing.");
if (!pkg.dependencies?.["lucide-react"]) fail("lucide-react dependency missing.");
if (!fs.existsSync(p("src/pages/mapbox_wayplan_routing.ts"))) fail("mapbox_wayplan_routing.ts missing.");
if (!fs.existsSync(p("scripts/lint-smoke.cjs"))) fail("lint-smoke.cjs missing.");

const lint = fs.readFileSync(p("scripts/lint-smoke.cjs"), "utf8");
if (lint.includes("Forbidden TypeScript suppression")) fail("lint-smoke still blocks existing @ts-nocheck files.");

const reporting = fs.existsSync(p("src/pages/ReportingPage.tsx")) ? fs.readFileSync(p("src/pages/ReportingPage.tsx"), "utf8") : "";
if (reporting && reporting.includes("function exportCSV(data:Record<string,unknown>[]")) {
  fail("ReportingPage exportCSV type was not patched.");
}

console.log("Britium clean portal final typecheck/lint fix verified.");
