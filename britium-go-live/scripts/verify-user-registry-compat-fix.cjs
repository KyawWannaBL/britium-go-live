const fs = require("fs");
const path = require("path");

const required = [
  "supabase/sql/97-user-account-registry-schema-compatibility-fix.sql",
  "scripts/apply-user-registry-compat-fix.cjs",
  "scripts/verify-user-registry-compat-fix.cjs"
];

let ok = true;
for (const rel of required) {
  if (!fs.existsSync(path.join(process.cwd(), rel))) {
    console.error("Missing:", rel);
    ok = false;
  }
}

const sqlFile = path.join(process.cwd(), "supabase/sql/97-user-account-registry-schema-compatibility-fix.sql");
if (fs.existsSync(sqlFile)) {
  const sql = fs.readFileSync(sqlFile, "utf8");
  for (const token of [
    "add column if not exists user_id",
    "be_user_account_registry_compat_before_write",
    "be_user_registry_compat_verification",
    "notify pgrst, 'reload schema'"
  ]) {
    if (!sql.includes(token)) {
      console.error("SQL missing token:", token);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log("Britium user registry compatibility fix verified.");
