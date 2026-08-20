const fs = require("fs");

const required = [
  "supabase/sql/00-bootstrap-core-schema.sql",
  "supabase/sql/10-seed-masterdata-from-authoritative-template.sql",
  "supabase/sql/95-mobile-workforce-code-compatibility-fix.sql",
  "supabase/sql/99-run-all-clean-enterprise-portal.sql"
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`Missing ${file}`);
    process.exit(1);
  }
}

const seed = fs.readFileSync("supabase/sql/10-seed-masterdata-from-authoritative-template.sql", "utf8");
const all = fs.readFileSync("supabase/sql/99-run-all-clean-enterprise-portal.sql", "utf8");
const hotfix = fs.readFileSync("supabase/sql/95-mobile-workforce-code-compatibility-fix.sql", "utf8");

for (const [name, text] of [["seed", seed], ["all", all], ["hotfix", hotfix]]) {
  if (!text.includes("workforce_code")) {
    console.error(`${name} SQL does not include workforce_code`);
    process.exit(1);
  }
  if (text.includes("be_mobile_workforce_accounts(worker_id, full_name")) {
    console.error(`${name} SQL still has the old workforce insert without workforce_code`);
    process.exit(1);
  }
}

console.log("Britium workforce_code SQL fix verified.");
