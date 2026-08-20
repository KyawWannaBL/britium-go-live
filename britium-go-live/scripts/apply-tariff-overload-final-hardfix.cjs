/* scripts/apply-tariff-overload-final-hardfix.cjs */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");

if (!fs.existsSync(sqlDir)) {
  console.error("Missing supabase/sql directory. Run from the Enterprise Portal project root.");
  process.exit(1);
}

const DROP_BLOCK = `
-- BEGIN BRITIUM TARIFF OVERLOAD FINAL PREFLIGHT
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
    ORDER BY p.oid::regprocedure::text
  LOOP
    RAISE NOTICE 'Dropping %', fn.signature;
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', fn.signature);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
-- END BRITIUM TARIFF OVERLOAD FINAL PREFLIGHT
`.trim();

const GRANT_BLOCK = `
-- BEGIN BRITIUM TARIFF OVERLOAD SAFE GRANTS
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
    ORDER BY p.oid::regprocedure::text
  LOOP
    RAISE NOTICE 'Granting execute on %', fn.signature;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn.signature);
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';
-- END BRITIUM TARIFF OVERLOAD SAFE GRANTS
`.trim();

function listSqlFiles(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...listSqlFiles(p));
    else if (item.toLowerCase().endsWith(".sql")) out.push(p);
  }
  return out;
}

function replaceAmbiguousTariffStatements(text) {
  let changed = false;

  // Ambiguous bare grants:
  // GRANT EXECUTE ON FUNCTION public.be_calculate_tariff TO authenticated;
  text = text.replace(
    /^\s*GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+[^;]+;\s*$/gim,
    (m) => {
      changed = true;
      return "-- Removed ambiguous tariff grant; safe grants are applied by BRITIUM TARIFF OVERLOAD SAFE GRANTS.";
    }
  );

  // Ambiguous bare drop:
  // DROP FUNCTION IF EXISTS public.be_calculate_tariff;
  text = text.replace(
    /^\s*DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?public\.be_calculate_tariff\s*(CASCADE|RESTRICT)?\s*;\s*$/gim,
    (m) => {
      changed = true;
      return "-- Removed ambiguous tariff drop; all overloads are dropped by BRITIUM TARIFF OVERLOAD FINAL PREFLIGHT.";
    }
  );

  // Ambiguous bare comment:
  // COMMENT ON FUNCTION public.be_calculate_tariff IS '...';
  text = text.replace(
    /^\s*COMMENT\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+IS\s+[^;]+;\s*$/gim,
    (m) => {
      changed = true;
      return "-- Removed ambiguous tariff comment; function comments can be added per overload after deployment.";
    }
  );

  // Ambiguous bare alter owner:
  // ALTER FUNCTION public.be_calculate_tariff OWNER TO postgres;
  text = text.replace(
    /^\s*ALTER\s+FUNCTION\s+public\.be_calculate_tariff\s+OWNER\s+TO\s+[^;]+;\s*$/gim,
    (m) => {
      changed = true;
      return "-- Removed ambiguous tariff owner statement; specify overload arguments if owner change is required.";
    }
  );

  return { text, changed };
}

let patchedFiles = 0;
for (const file of listSqlFiles(sqlDir)) {
  const original = fs.readFileSync(file, "utf8");
  const { text, changed } = replaceAmbiguousTariffStatements(original);
  if (changed) {
    fs.writeFileSync(file, text, "utf8");
    patchedFiles += 1;
    console.log("Patched ambiguous tariff references:", path.relative(root, file));
  }
}

const fullSql = path.join(sqlDir, "99-run-all-clean-enterprise-portal.sql");
if (fs.existsSync(fullSql)) {
  let text = fs.readFileSync(fullSql, "utf8");

  if (!text.includes("BEGIN BRITIUM TARIFF OVERLOAD FINAL PREFLIGHT")) {
    text = `${DROP_BLOCK}\n\n${text}`;
    console.log("Prepended tariff overload preflight to supabase/sql/99-run-all-clean-enterprise-portal.sql");
  } else {
    console.log("Tariff overload preflight already exists in 99-run-all-clean-enterprise-portal.sql");
  }

  if (!text.includes("BEGIN BRITIUM TARIFF OVERLOAD SAFE GRANTS")) {
    text = `${text.trim()}\n\n${GRANT_BLOCK}\n`;
    console.log("Appended tariff safe grants to supabase/sql/99-run-all-clean-enterprise-portal.sql");
  } else {
    console.log("Tariff safe grants already exist in 99-run-all-clean-enterprise-portal.sql");
  }

  fs.writeFileSync(fullSql, text, "utf8");
} else {
  console.warn("supabase/sql/99-run-all-clean-enterprise-portal.sql was not found; standalone SQL files were still installed.");
}

console.log(`Britium tariff overload final hardfix applied. Patched SQL files: ${patchedFiles}`);
