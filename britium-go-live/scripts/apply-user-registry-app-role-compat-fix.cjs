
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const fixPath = path.join(root, "supabase", "sql", "98-user-registry-app-role-compatibility-fix.sql");
const runAllPath = path.join(root, "supabase", "sql", "99-run-all-clean-enterprise-portal.sql");

if (!fs.existsSync(fixPath)) {
  console.error("Missing fix SQL:", fixPath);
  process.exit(1);
}

if (!fs.existsSync(runAllPath)) {
  console.warn("99-run-all-clean-enterprise-portal.sql not found. You can still run the 98 SQL manually in Supabase.");
  process.exit(0);
}

const marker = "-- BEGIN BRITIUM APP_ROLE COMPATIBILITY FIX";
const endMarker = "-- END BRITIUM APP_ROLE COMPATIBILITY FIX";
const fixSql = fs.readFileSync(fixPath, "utf8");
let runAll = fs.readFileSync(runAllPath, "utf8");

if (runAll.includes(marker)) {
  console.log("App role compatibility fix is already injected into 99-run-all-clean-enterprise-portal.sql");
  process.exit(0);
}

runAll = `${marker}\n${fixSql}\n${endMarker}\n\n${runAll}`;
fs.writeFileSync(runAllPath, runAll, "utf8");

console.log("Injected app_role compatibility fix into supabase/sql/99-run-all-clean-enterprise-portal.sql");
