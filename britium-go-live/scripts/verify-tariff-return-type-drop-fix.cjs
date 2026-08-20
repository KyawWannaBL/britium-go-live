#!/usr/bin/env node
/**
 * verify-tariff-return-type-drop-fix.cjs
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const required = [
  "supabase/sql/94-tariff-return-type-drop-fix.sql",
  "scripts/apply-tariff-return-type-drop-fix.cjs",
  "scripts/verify-tariff-return-type-drop-fix.cjs",
];

let ok = true;
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`Missing: ${rel}`);
    ok = false;
  }
}

const preflight = fs.existsSync(path.join(root, "supabase/sql/94-tariff-return-type-drop-fix.sql"))
  ? fs.readFileSync(path.join(root, "supabase/sql/94-tariff-return-type-drop-fix.sql"), "utf8")
  : "";

if (!preflight.includes("DROP FUNCTION public.be_calculate_tariff(text, numeric, boolean) CASCADE") &&
    !preflight.includes("drop function public.be_calculate_tariff(text, numeric, boolean) cascade")) {
  console.error("Preflight SQL does not contain the required exact DROP FUNCTION.");
  ok = false;
}

if (!ok) process.exit(1);

console.log("Britium tariff return-type drop fix verified.");
