/* scripts/verify-warehouse-sort-scan-overload-hardfix.cjs */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");
const required = [
  path.join(sqlDir, "93-warehouse-sort-scan-overload-hardfix.sql"),
  path.join(sqlDir, "96-warehouse-sort-scan-safe-grants.sql")
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${path.relative(root, file)}`);
    process.exit(1);
  }
}

const offenderLines = [];
if (fs.existsSync(sqlDir)) {
  for (const name of fs.readdirSync(sqlDir).filter((n) => n.endsWith(".sql"))) {
    if (name === "93-warehouse-sort-scan-overload-hardfix.sql" ||
        name === "96-warehouse-sort-scan-safe-grants.sql") {
      continue;
    }
    const file = path.join(sqlDir, name);
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const normalized = line.toLowerCase();
      const hasBare =
        normalized.includes("on function public.be_warehouse_sort_scan to") ||
        normalized.match(/drop\s+function\s+(if\s+exists\s+)?public\.be_warehouse_sort_scan\s*;/) ||
        normalized.includes("comment on function public.be_warehouse_sort_scan") ||
        normalized.includes("alter function public.be_warehouse_sort_scan owner");
      if (hasBare) offenderLines.push(`${name}:${idx + 1}: ${line.trim()}`);
    });
  }
}

if (offenderLines.length) {
  console.error("Ambiguous be_warehouse_sort_scan SQL references still found:");
  console.error(offenderLines.join("\n"));
  process.exit(1);
}

console.log("Warehouse sort scan overload hardfix verified.");
