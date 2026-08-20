const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlPath = path.join(root, "supabase", "sql", "98-user-registry-email-required-compatibility-fix.sql");
const runAllPath = path.join(root, "supabase", "sql", "99-run-all-clean-enterprise-portal.sql");

if (!fs.existsSync(sqlPath)) {
  console.error("Missing SQL file:", sqlPath);
  process.exit(1);
}

if (!fs.existsSync(runAllPath)) {
  console.warn("99-run-all-clean-enterprise-portal.sql not found. You can still run 98-user-registry-email-required-compatibility-fix.sql manually before your seed SQL.");
  process.exit(0);
}

const markerStart = "-- >>> BRITIUM USER REGISTRY EMAIL REQUIRED COMPATIBILITY FIX";
const markerEnd = "-- <<< BRITIUM USER REGISTRY EMAIL REQUIRED COMPATIBILITY FIX";

const fixSql = fs.readFileSync(sqlPath, "utf8").trim();
let runAll = fs.readFileSync(runAllPath, "utf8");

if (runAll.includes(markerStart)) {
  console.log("User registry email compatibility fix already injected into 99-run-all-clean-enterprise-portal.sql.");
  process.exit(0);
}

const block = `\n\n${markerStart}\n${fixSql}\n${markerEnd}\n\n`;

const seedMarker = "-- 10-seed-masterdata-from-authoritative-template.sql";
const seedIndex = runAll.indexOf(seedMarker);

if (seedIndex >= 0) {
  const lineStart = runAll.lastIndexOf("\n", seedIndex);
  runAll = runAll.slice(0, lineStart + 1) + block + runAll.slice(lineStart + 1);
  fs.writeFileSync(runAllPath, runAll);
  console.log("Injected email compatibility trigger before master-data seed block in 99-run-all-clean-enterprise-portal.sql.");
} else {
  runAll = runAll + block;
  fs.writeFileSync(runAllPath, runAll);
  console.log("Seed marker not found. Appended email compatibility trigger to 99-run-all-clean-enterprise-portal.sql.");
}
