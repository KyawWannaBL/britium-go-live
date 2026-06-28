#!/usr/bin/env node
/* apply-master-dropdown-return-type-drop-fix.cjs
   Patches SQL files so the master dropdown return-type preflight runs before
   CREATE OR REPLACE FUNCTION public.be_master_dropdown_snapshot(...)
*/
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const sqlDir = path.join(root, "supabase", "sql");
const preflightPath = path.join(sqlDir, "92-master-dropdown-return-type-drop-fix.sql");
const fullPath = path.join(sqlDir, "99-run-all-clean-enterprise-portal.sql");

if (!fs.existsSync(preflightPath)) {
  throw new Error(`Missing ${path.relative(root, preflightPath)}`);
}

const preflight = fs.readFileSync(preflightPath, "utf8");
const markerStart = "-- >>> BRITIUM MASTER DROPDOWN RETURN TYPE PREFLIGHT START";
const markerEnd = "-- <<< BRITIUM MASTER DROPDOWN RETURN TYPE PREFLIGHT END";

function stripMarkedBlock(text) {
  const pattern = new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}\\n?`, "g");
  return text.replace(pattern, "");
}

if (fs.existsSync(fullPath)) {
  let full = fs.readFileSync(fullPath, "utf8");
  full = stripMarkedBlock(full);

  const block = `${markerStart}\n${preflight}\n${markerEnd}\n\n`;
  full = block + full;

  // Remove ambiguous grants/comments that can fail when multiple overloads exist.
  full = full
    .replace(/grant\s+execute\s+on\s+function\s+public\.be_master_dropdown_snapshot\s+to\s+[^;]+;/gi, "-- removed ambiguous grant for public.be_master_dropdown_snapshot; explicit grants are recreated after function creation")
    .replace(/grant\s+execute\s+on\s+function\s+public\.be_master_record_lookup\s+to\s+[^;]+;/gi, "-- removed ambiguous grant for public.be_master_record_lookup; explicit grants are recreated after function creation")
    .replace(/comment\s+on\s+function\s+public\.be_master_dropdown_snapshot\s+is\s+'[^']*';/gi, "-- removed ambiguous comment for public.be_master_dropdown_snapshot")
    .replace(/comment\s+on\s+function\s+public\.be_master_record_lookup\s+is\s+'[^']*';/gi, "-- removed ambiguous comment for public.be_master_record_lookup");

  fs.writeFileSync(fullPath, full, "utf8");
  console.log("Patched supabase/sql/99-run-all-clean-enterprise-portal.sql with master dropdown preflight.");
} else {
  console.warn("supabase/sql/99-run-all-clean-enterprise-portal.sql not found; run 92-master-dropdown-return-type-drop-fix.sql manually before your full SQL.");
}

console.log("Britium master dropdown return-type drop fix applied.");
