/* scripts/apply-warehouse-sort-scan-overload-hardfix.cjs
   Patches SQL files so overloaded public.be_warehouse_sort_scan is never
   referenced by bare function name.
*/
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");
const preflightPath = path.join(sqlDir, "93-warehouse-sort-scan-overload-hardfix.sql");
const safeGrantsPath = path.join(sqlDir, "96-warehouse-sort-scan-safe-grants.sql");
const runAllPath = path.join(sqlDir, "99-run-all-clean-enterprise-portal.sql");

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function write(file, text) {
  fs.writeFileSync(file, text, "utf8");
}

function safeGrantBlock(role) {
  return `
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_warehouse_sort_scan'
  loop
    execute format('grant execute on function %s to ${role}', fn.signature);
  end loop;
end $$;`;
}

function dropAllBlock() {
  return `
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'be_warehouse_sort_scan'
  loop
    execute format('drop function if exists %s cascade', fn.signature);
  end loop;
end $$;`;
}

if (!fs.existsSync(sqlDir)) {
  console.error("Missing supabase/sql folder. Run this from the project root.");
  process.exit(1);
}

const sqlFiles = fs.readdirSync(sqlDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => path.join(sqlDir, name));

let patchedCount = 0;

for (const file of sqlFiles) {
  const name = path.basename(file);
  if (name === "93-warehouse-sort-scan-overload-hardfix.sql" ||
      name === "96-warehouse-sort-scan-safe-grants.sql") {
    continue;
  }

  let src = readIfExists(file);
  const before = src;

  // Replace ambiguous DROP FUNCTION references.
  src = src.replace(
    /drop\s+function\s+(?:if\s+exists\s+)?public\.be_warehouse_sort_scan\s*;/gi,
    dropAllBlock()
  );

  // Replace ambiguous GRANT EXECUTE statements for any role/list until semicolon.
  src = src.replace(
    /grant\s+execute\s+on\s+function\s+public\.be_warehouse_sort_scan\s+to\s+authenticated\s*;/gi,
    safeGrantBlock("authenticated")
  );
  src = src.replace(
    /grant\s+execute\s+on\s+function\s+public\.be_warehouse_sort_scan\s+to\s+anon\s*;/gi,
    safeGrantBlock("anon")
  );
  src = src.replace(
    /grant\s+execute\s+on\s+function\s+public\.be_warehouse_sort_scan\s+to\s+public\s*;/gi,
    safeGrantBlock("public")
  );

  // Generic fallback for comma-separated roles. This avoids ambiguous function refs.
  src = src.replace(
    /grant\s+execute\s+on\s+function\s+public\.be_warehouse_sort_scan\s+to\s+([^;]+);/gi,
    (match, roles) => {
      return String(roles)
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean)
        .map((role) => safeGrantBlock(role.replace(/"/g, '\\"')))
        .join("\n");
    }
  );

  // Remove ambiguous comments/owner changes. They are non-functional deployment metadata.
  src = src.replace(
    /comment\s+on\s+function\s+public\.be_warehouse_sort_scan\s+is\s+[^;]+;/gis,
    "-- Removed ambiguous COMMENT ON FUNCTION public.be_warehouse_sort_scan by warehouse sort scan overload hardfix."
  );
  src = src.replace(
    /alter\s+function\s+public\.be_warehouse_sort_scan\s+owner\s+to\s+[^;]+;/gis,
    "-- Removed ambiguous ALTER FUNCTION public.be_warehouse_sort_scan OWNER by warehouse sort scan overload hardfix."
  );

  if (src !== before) {
    write(file, src);
    patchedCount++;
  }
}

// Make the run-all file self-contained for manual SQL Editor reruns.
if (fs.existsSync(runAllPath)) {
  let runAll = readIfExists(runAllPath);
  const preflight = readIfExists(preflightPath);
  const grants = readIfExists(safeGrantsPath);

  if (!runAll.includes("93-warehouse-sort-scan-overload-hardfix.sql")) {
    runAll = `\n-- BEGIN injected by warehouse-sort-scan-overload-hardfix: 93-warehouse-sort-scan-overload-hardfix.sql\n${preflight}\n-- END injected by warehouse-sort-scan-overload-hardfix\n\n` + runAll;
  }
  if (!runAll.includes("96-warehouse-sort-scan-safe-grants.sql")) {
    runAll = runAll + `\n\n-- BEGIN injected by warehouse-sort-scan-overload-hardfix: 96-warehouse-sort-scan-safe-grants.sql\n${grants}\n-- END injected by warehouse-sort-scan-overload-hardfix\n`;
  }
  write(runAllPath, runAll);
}

console.log(`Warehouse sort scan overload hardfix applied. SQL files patched: ${patchedCount}.`);
