/* scripts/verify-tariff-overload-final-hardfix.cjs */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const required = [
  "supabase/sql/92-tariff-overload-final-preflight.sql",
  "supabase/sql/95-tariff-overload-safe-grants-final.sql",
  "scripts/apply-tariff-overload-final-hardfix.cjs",
  "scripts/verify-tariff-overload-final-hardfix.cjs",
];

let ok = true;
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error("Missing:", rel);
    ok = false;
  }
}

const fullSql = path.join(root, "supabase/sql/99-run-all-clean-enterprise-portal.sql");
if (fs.existsSync(fullSql)) {
  const text = fs.readFileSync(fullSql, "utf8");
  if (!text.includes("BEGIN BRITIUM TARIFF OVERLOAD FINAL PREFLIGHT")) {
    console.error("99-run-all-clean-enterprise-portal.sql is missing tariff overload preflight block.");
    ok = false;
  }
  if (!text.includes("BEGIN BRITIUM TARIFF OVERLOAD SAFE GRANTS")) {
    console.error("99-run-all-clean-enterprise-portal.sql is missing tariff safe grants block.");
    ok = false;
  }

  const ambiguousPatterns = [
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+[^;]+;/i,
    /DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?public\.be_calculate_tariff\s*(CASCADE|RESTRICT)?\s*;/i,
    /COMMENT\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+IS\s+[^;]+;/i,
    /ALTER\s+FUNCTION\s+public\.be_calculate_tariff\s+OWNER\s+TO\s+[^;]+;/i,
  ];

  for (const rx of ambiguousPatterns) {
    if (rx.test(text)) {
      console.error("99-run-all-clean-enterprise-portal.sql still has an ambiguous be_calculate_tariff statement:", rx);
      ok = false;
    }
  }
}

if (!ok) process.exit(1);
console.log("Britium tariff overload final hardfix verified.");
