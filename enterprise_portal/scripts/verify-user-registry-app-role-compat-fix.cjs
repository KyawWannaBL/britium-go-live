
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const required = [
  "supabase/sql/98-user-registry-app-role-compatibility-fix.sql",
  "scripts/apply-user-registry-app-role-compat-fix.cjs",
  "scripts/verify-user-registry-app-role-compat-fix.cjs",
];

let ok = true;
for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error("Missing:", rel);
    ok = false;
  }
}

const sqlPath = path.join(root, "supabase/sql/98-user-registry-app-role-compatibility-fix.sql");
if (fs.existsSync(sqlPath)) {
  const sql = fs.readFileSync(sqlPath, "utf8");
  for (const token of [
    "be_user_registry_fill_required_fields",
    "trg_be_user_registry_fill_required_fields",
    "be_user_registry_app_role_compat_verification",
    "alter column app_role set default"
  ]) {
    if (!sql.includes(token)) {
      console.error("SQL missing token:", token);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log("Britium user registry app_role compatibility fix verified.");
