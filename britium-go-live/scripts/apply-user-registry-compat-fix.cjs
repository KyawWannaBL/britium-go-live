const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlPath = path.join(root, "supabase", "sql", "99-run-all-clean-enterprise-portal.sql");
const fixPath = path.join(root, "supabase", "sql", "97-user-account-registry-schema-compatibility-fix.sql");

if (!fs.existsSync(fixPath)) {
  console.error("Missing supabase/sql/97-user-account-registry-schema-compatibility-fix.sql");
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.log("99-run-all-clean-enterprise-portal.sql not found. Run 97 SQL manually before your full SQL.");
  process.exit(0);
}

let fullSql = fs.readFileSync(sqlPath, "utf8");
const fixSql = fs.readFileSync(fixPath, "utf8");

if (fullSql.includes("97-user-account-registry-schema-compatibility-fix.sql")) {
  console.log("99-run-all already contains the user registry compatibility fix.");
  process.exit(0);
}

const banner = `
-- ============================================================
-- Injected: 97-user-account-registry-schema-compatibility-fix.sql
-- This must run before any be_user_account_registry seed insert.
-- ============================================================

${fixSql}

-- ============================================================
-- End injected user registry compatibility fix
-- ============================================================

`;

fullSql = banner + fullSql;
fs.writeFileSync(sqlPath, fullSql, "utf8");
console.log("Injected user registry compatibility fix into supabase/sql/99-run-all-clean-enterprise-portal.sql");
