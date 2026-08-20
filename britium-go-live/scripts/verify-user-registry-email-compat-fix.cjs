const fs = require("fs");
const path = require("path");

const required = [
  "supabase/sql/98-user-registry-email-required-compatibility-fix.sql",
  "scripts/apply-user-registry-email-compat-fix.cjs"
];

let ok = true;
for (const rel of required) {
  if (!fs.existsSync(path.join(process.cwd(), rel))) {
    console.error("Missing:", rel);
    ok = false;
  }
}

const sql = fs.existsSync(path.join(process.cwd(), required[0]))
  ? fs.readFileSync(path.join(process.cwd(), required[0]), "utf8")
  : "";

for (const token of [
  "be_user_registry_required_defaults_trigger",
  "trg_be_user_registry_required_defaults",
  "be_registry_safe_email_from_row",
  "alter column email set not null",
  "notify pgrst"
]) {
  if (!sql.includes(token)) {
    console.error("SQL missing token:", token);
    ok = false;
  }
}

const runAllPath = path.join(process.cwd(), "supabase/sql/99-run-all-clean-enterprise-portal.sql");
if (fs.existsSync(runAllPath)) {
  const runAll = fs.readFileSync(runAllPath, "utf8");
  if (!runAll.includes("BRITIUM USER REGISTRY EMAIL REQUIRED COMPATIBILITY FIX")) {
    console.warn("Warning: 99-run-all-clean-enterprise-portal.sql is not injected yet. Run node scripts/apply-user-registry-email-compat-fix.cjs");
  }
}

if (!ok) process.exit(1);
console.log("Britium user registry email compatibility fix verified.");
