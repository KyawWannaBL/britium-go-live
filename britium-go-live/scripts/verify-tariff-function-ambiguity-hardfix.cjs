const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");
const hardfix = path.join(sqlDir, "95-tariff-function-ambiguity-hardfix.sql");

if (!fs.existsSync(hardfix)) {
  console.error("Missing supabase/sql/95-tariff-function-ambiguity-hardfix.sql");
  process.exit(1);
}

let failures = [];
for (const file of fs.readdirSync(sqlDir).filter(f => f.endsWith(".sql"))) {
  const full = path.join(sqlDir, file);
  const content = fs.readFileSync(full, "utf8");

  const ambiguousPatterns = [
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+[^;]+;/i,
    /REVOKE\s+[^;]*ON\s+FUNCTION\s+public\.be_calculate_tariff\s+FROM\s+[^;]+;/i,
    /ALTER\s+FUNCTION\s+public\.be_calculate_tariff\s+OWNER\s+TO\s+[^;]+;/i,
    /COMMENT\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+IS\s+[^;]+;/i,
    /DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?public\.be_calculate_tariff\s*;/i
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(content)) {
      failures.push(`${file}: still contains ambiguous tariff function statement matching ${pattern}`);
    }
  }
}

if (failures.length) {
  console.error("Tariff hardfix verification failed:");
  failures.forEach(f => console.error(" - " + f));
  process.exit(1);
}

console.log("Britium tariff function ambiguity hardfix verified.");
