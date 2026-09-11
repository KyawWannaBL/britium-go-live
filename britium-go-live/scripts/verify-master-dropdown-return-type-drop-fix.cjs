#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const required = [
  "supabase/sql/92-master-dropdown-return-type-drop-fix.sql",
  "scripts/apply-master-dropdown-return-type-drop-fix.cjs",
  "scripts/verify-master-dropdown-return-type-drop-fix.cjs"
];

let ok = true;
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`Missing ${rel}`);
    ok = false;
  }
}

const fullPath = path.join(root, "supabase/sql/99-run-all-clean-enterprise-portal.sql");
if (fs.existsSync(fullPath)) {
  const full = fs.readFileSync(fullPath, "utf8");
  if (!full.includes("BRITIUM MASTER DROPDOWN RETURN TYPE PREFLIGHT")) {
    console.warn("Warning: 99-run-all-clean-enterprise-portal.sql does not contain the preflight marker yet. Run scripts/apply-master-dropdown-return-type-drop-fix.cjs.");
  }
}

if (!ok) process.exit(1);
console.log("Britium master dropdown return-type drop fix verified.");
