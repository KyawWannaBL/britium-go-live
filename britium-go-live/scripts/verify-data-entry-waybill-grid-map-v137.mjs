import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const pagePath = path.join(root, "src/pages/DataEntryFinancialV2Page.tsx");
const editorPath = path.join(root, "src/components/workflow/DataEntryLocationEditor.tsx");
const cssPath = path.join(root, "src/index.css");
const migrationPath = path.join(root, "supabase/migrations/20260924050500_data_entry_waybill_readiness_v137.sql");

const page = fs.readFileSync(pagePath, "utf8");
const editor = fs.readFileSync(editorPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");

assert.ok(fs.existsSync(migrationPath), "V137 readiness migration must exist");
const migration = fs.readFileSync(migrationPath, "utf8");

const readinessStart = page.indexOf("async function authoritativeReadySequences");
const readinessEnd = page.indexOf("function currentReadinessSummary", readinessStart);
assert.ok(readinessStart >= 0 && readinessEnd > readinessStart, "authoritativeReadySequences must exist");
const readinessBlock = page.slice(readinessStart, readinessEnd);

assert.match(readinessBlock, /\.rpc\(["']be_data_entry_financial_v2_ready_sequences_v137["']/, "readiness must use the SECURITY DEFINER RPC so RLS cannot silently hide valid rows");
assert.doesNotMatch(readinessBlock, /\.from\(["']be_data_entry_parcel_details["']\)/, "readiness must not query RLS-filtered detail rows directly");
assert.doesNotMatch(readinessBlock, /\.from\(["']parcels["']\)/, "readiness must not query RLS-filtered parcel rows directly");

assert.match(migration, /create or replace function public\.be_data_entry_financial_v2_ready_sequences_v137\(p_pickup_id text\)/i, "V137 readiness RPC must be created");
assert.match(migration, /security definer/i, "readiness RPC must be SECURITY DEFINER");
assert.match(migration, /set search_path\s*=\s*''/i, "SECURITY DEFINER RPC must use an empty search_path");
assert.match(migration, /public\.be_data_entry_require_access_v57\('update',\s*true\)/i, "readiness RPC must enforce the same access gate as waybill creation");
assert.match(migration, /financial_validation_status/i, "readiness RPC must verify Financial V2 validation");
assert.match(migration, /public\.parcels/i, "readiness RPC must verify the canonical parcel row");
assert.match(migration, /grant execute on function public\.be_data_entry_financial_v2_ready_sequences_v137\(text\) to authenticated/i, "authenticated users must receive explicit execute permission");
assert.match(migration, /revoke execute on function public\.be_data_entry_financial_v2_ready_sequences_v137\(text\) from public, anon/i, "public and anon execution must be revoked");

assert.match(page, /data-registration-grid-v137="true"/, "registration grid must expose a scoped contrast hook");
assert.match(css, /\[data-registration-grid-v137="true"\][\s\S]{0,1200}tbody\s+td[\s\S]{0,250}color:\s*#0f172a\s*!important/i, "registration-grid body cells must force dark readable text on light rows");
assert.match(css, /\[data-registration-grid-v137="true"\][\s\S]{0,1400}tbody\s+tr[\s\S]{0,300}background/i, "registration-grid light row backgrounds must be scoped against global dark-theme overrides");

const deferredStart = editor.indexOf("if (deferAutomaticResolution && !manualOpen)");
const deferredEnd = editor.indexOf("return <div data-location-details", deferredStart + 1);
assert.ok(deferredStart >= 0, "deferred location branch must exist");
const deferredBlock = editor.slice(deferredStart, deferredEnd > deferredStart ? deferredEnd : deferredStart + 5000);
assert.match(deferredBlock, /externallySynced/, "deferred UI must distinguish synchronized rows");
assert.match(deferredBlock, /openRelocationMap\(\)/, "synchronized deferred rows must still expose the editable Google pin workflow");
assert.match(deferredBlock, /EDIT|MOVE|MAP/i, "manual pin control must be visibly labeled");

assert.match(editor, /draggable:\s*true/, "Google pin must remain draggable");
assert.match(editor, /map\.addListener\(["']click["']/, "Google map click must continue moving the pin");
assert.match(editor, /setManualMapCoordinate\(point\.lat\(\),\s*point\.lng\(\),\s*["']clicked["']\)/, "map clicks must copy coordinates into the Data Entry location state");

console.log("Data Entry waybill/grid/map V137 contract PASS");
