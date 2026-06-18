/*
  apply-tariff-function-ambiguity-hardfix.cjs

  This patches SQL files so they do not contain ambiguous statements such as:
    GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO authenticated;

  It replaces only ambiguous references that omit the argument list.
*/

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");

if (!fs.existsSync(sqlDir)) {
  console.error("Missing supabase/sql directory. Run this from the Enterprise Portal project root.");
  process.exit(1);
}

const hardfixRel = "supabase/sql/95-tariff-function-ambiguity-hardfix.sql";
const hardfixPath = path.join(root, hardfixRel);
if (!fs.existsSync(hardfixPath)) {
  console.error(`Missing ${hardfixRel}. Extract the patch ZIP first.`);
  process.exit(1);
}

function tariffGrantBlock() {
  return `
-- Britium hardfix: grant all be_calculate_tariff overloads without ambiguous function-name syntax.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.signature);
  END LOOP;
END $$;
`;
}

function tariffOwnerBlock() {
  return `
-- Britium hardfix: alter owner for all be_calculate_tariff overloads without ambiguity.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres', r.signature);
  END LOOP;
END $$;
`;
}

function patchContent(content) {
  let updated = content;
  let changed = false;

  const original = updated;

  // Replace ambiguous GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO ...
  updated = updated.replace(
    /^\s*GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+[^;]+;\s*$/gim,
    tariffGrantBlock().trim()
  );

  // Replace ambiguous REVOKE statements with a comment. Grants are re-applied by hardfix.
  updated = updated.replace(
    /^\s*REVOKE\s+[^;]*ON\s+FUNCTION\s+public\.be_calculate_tariff\s+FROM\s+[^;]+;\s*$/gim,
    "-- Britium hardfix: removed ambiguous REVOKE on public.be_calculate_tariff; overload-specific grants are handled by 95-tariff-function-ambiguity-hardfix.sql."
  );

  // Replace ambiguous ALTER OWNER statements.
  updated = updated.replace(
    /^\s*ALTER\s+FUNCTION\s+public\.be_calculate_tariff\s+OWNER\s+TO\s+[^;]+;\s*$/gim,
    tariffOwnerBlock().trim()
  );

  // Comment out ambiguous COMMENT ON FUNCTION public.be_calculate_tariff IS ...
  updated = updated.replace(
    /^\s*COMMENT\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+IS\s+[^;]+;\s*$/gim,
    "-- Britium hardfix: removed ambiguous COMMENT ON FUNCTION public.be_calculate_tariff. Use an exact argument list if needed."
  );

  // Replace ambiguous DROP FUNCTION public.be_calculate_tariff; only if exactly no argument list is used.
  // This avoids deleting overloads accidentally inside the run-all SQL.
  updated = updated.replace(
    /^\s*DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?public\.be_calculate_tariff\s*;\s*$/gim,
    "-- Britium hardfix: removed ambiguous DROP FUNCTION public.be_calculate_tariff. Do not drop overloaded tariff functions by bare name."
  );

  changed = updated !== original;
  return { updated, changed };
}

const sqlFiles = fs.readdirSync(sqlDir)
  .filter(name => name.toLowerCase().endsWith(".sql"))
  .map(name => path.join(sqlDir, name));

let changedFiles = [];
for (const file of sqlFiles) {
  const before = fs.readFileSync(file, "utf8");
  const { updated, changed } = patchContent(before);
  if (changed) {
    fs.writeFileSync(file, updated, "utf8");
    changedFiles.push(path.relative(root, file).replace(/\\/g, "/"));
  }
}

// Ensure run-all file invokes the hardfix before any tariff grants.
const runAll = path.join(sqlDir, "99-run-all-clean-enterprise-portal.sql");
if (fs.existsSync(runAll)) {
  let content = fs.readFileSync(runAll, "utf8");
  if (!content.includes("95-tariff-function-ambiguity-hardfix.sql") &&
      !content.includes("be_tariff_function_ambiguity_hardfix_verification")) {
    const insertBlock = `
-- Britium hardfix: define and grant tariff overloads without ambiguous syntax.
-- If your SQL runner supports \\i, run supabase/sql/95-tariff-function-ambiguity-hardfix.sql before this file.
-- Supabase SQL Editor users should run 95-tariff-function-ambiguity-hardfix.sql manually first.
`;
    content = insertBlock + "\n" + content;
    fs.writeFileSync(runAll, content, "utf8");
    if (!changedFiles.includes("supabase/sql/99-run-all-clean-enterprise-portal.sql")) {
      changedFiles.push("supabase/sql/99-run-all-clean-enterprise-portal.sql");
    }
  }
}

console.log("Britium tariff ambiguity hardfix applied.");
if (changedFiles.length) {
  console.log("Patched SQL files:");
  for (const f of changedFiles) console.log(" - " + f);
} else {
  console.log("No ambiguous tariff statements found in SQL files.");
}
console.log("Run supabase/sql/95-tariff-function-ambiguity-hardfix.sql first, then rerun your full SQL.");
