#!/usr/bin/env node
/**
 * apply-tariff-return-type-drop-fix.cjs
 *
 * Patches supabase/sql/*.sql so every CREATE OR REPLACE FUNCTION
 * public.be_calculate_tariff(...) is preceded by an exact DROP FUNCTION.
 *
 * This prevents:
 *   ERROR 42P13: cannot change return type of existing function
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");

const dropBlock = `
-- Britium compatibility: drop exact tariff overload before recreation.
-- Required when return type changed between old and clean SQL packages.
DROP FUNCTION IF EXISTS public.be_calculate_tariff(text, numeric, boolean) CASCADE;

`;

if (!fs.existsSync(sqlDir)) {
  console.error(`Missing SQL directory: ${sqlDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(sqlDir)
  .filter((name) => name.toLowerCase().endsWith(".sql"))
  .map((name) => path.join(sqlDir, name));

let patched = 0;

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");

  if (!/be_calculate_tariff\s*\(/i.test(text)) continue;

  // Remove any ambiguous bare GRANT that can trigger "function name is not unique".
  text = text.replace(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.be_calculate_tariff\s+TO\s+authenticated\s*;/gi,
    `DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'be_calculate_tariff'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.fn);
  END LOOP;
END $$;`
  );

  // Insert exact drop before CREATE OR REPLACE FUNCTION if not already nearby.
  const createRe = /(CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.be_calculate_tariff\s*\()/i;
  if (createRe.test(text) && !text.includes("DROP FUNCTION IF EXISTS public.be_calculate_tariff(text, numeric, boolean) CASCADE;")) {
    text = text.replace(createRe, dropBlock + "$1");
    patched++;
  }

  fs.writeFileSync(file, text, "utf8");
}

console.log(`Tariff return-type drop fix applied. SQL files patched: ${patched}`);
console.log("Now run supabase/sql/94-tariff-return-type-drop-fix.sql first, then rerun 99-run-all-clean-enterprise-portal.sql.");
