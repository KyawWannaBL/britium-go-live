const fs = require("fs");
const path = require("path");

const mustExist = [
  "supabase/sql/95-tariff-function-ambiguity-fix.sql",
];

for (const file of mustExist) {
  if (!fs.existsSync(path.resolve(process.cwd(), file))) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

const files = [
  "supabase/sql/71-create-delivery-go-live.sql",
  "supabase/sql/99-run-all-clean-enterprise-portal.sql",
].filter((f) => fs.existsSync(path.resolve(process.cwd(), f)));

for (const file of files) {
  const txt = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  if (/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+authenticated\s*;/i.test(txt)) {
    console.error(`Still has ambiguous tariff GRANT: ${file}`);
    process.exit(1);
  }
}

console.log("Britium tariff function ambiguity fix verified.");
