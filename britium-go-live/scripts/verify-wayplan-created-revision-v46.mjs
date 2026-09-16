import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const page = fs.readFileSync(path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx"), "utf8");
const planner = fs.readFileSync(path.join(root, "src", "components", "MultiVanPlanner.tsx"), "utf8");
const migrationPath = path.join(root, "supabase", "migrations", "20260917193000_wayplan_created_revision_v46.sql");

assert.ok(page.includes("Edit CREATED Wayplan"), "V46 must expose a CREATED-only Wayplan edit action");
assert.ok(page.includes("Add Selected"), "V46 must allow filtered READY ways to be added to the revision");
assert.ok(page.includes("Remove Selected"), "V46 must allow current Wayplan ways to be removed before dispatch");
assert.ok(page.includes("Re-optimize & Save Revision"), "V46 must expose the reviewed replacement save action");
assert.ok(page.includes("wayplan_status === \"CREATED\""), "V46 UI must gate revision to CREATED Wayplans");
assert.ok(page.includes("be_replace_created_wayplan_v46"), "V46 UI must call the transactional replacement RPC");
assert.ok(page.includes("replaces_wayplan_id"), "V46 must surface replacement lineage after save");
assert.ok(page.includes("rows={revisionPlannerRows}"), "V46 must send only the revised membership to road planning");

assert.ok(planner.includes("saveOverride"), "V46 planner must support a caller-controlled replacement save hook");
assert.ok(planner.includes("saveLabel"), "V46 planner must support revision-specific save copy");
assert.ok(planner.includes('fetch("/api/wayplan-route"'), "V46 revision must reuse authenticated road optimization");
assert.ok(planner.includes("assignCrews(strategic, drivers, riders, helpers"), "V46 revision must reuse roster assignment");

assert.ok(fs.existsSync(migrationPath), "V46 migration must exist");
const migration = fs.readFileSync(migrationPath, "utf8");
assert.ok(migration.includes("be_replace_created_wayplan_v46"), "V46 migration must define replacement RPC");
assert.ok(migration.includes("Only a CREATED Wayplan can be revised before dispatch"), "V46 RPC must hard-block dispatched/non-CREATED revisions");
assert.ok(migration.includes("replaced_by_wayplan_id"), "V46 must link original to replacement");
assert.ok(migration.includes("replaces_wayplan_id"), "V46 must link replacement to original");
assert.ok(migration.includes("OPERATOR_RECALCULATION"), "V46 must save a replacement route version, not rewrite generated history");
assert.ok(migration.includes("WAYPLAN_REVISED_V46"), "V46 must write an audit event");
assert.ok(!migration.includes("delete from public.be_wayplan_route_versions_v1"), "V46 must never delete historical route versions");
assert.ok(!migration.includes("delete from public.be_wayplan_warehouse_loading_snapshots_v1"), "V46 must never delete historical LIFO snapshots");

console.log("Wayplan V46 CREATED revision contract PASS");
