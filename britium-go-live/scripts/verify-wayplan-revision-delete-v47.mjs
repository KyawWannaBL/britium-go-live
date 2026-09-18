import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pagePath = path.join(root, "src", "pages", "WayplanCommandCenterPage.tsx");
const migrationPath = path.join(root, "supabase", "migrations", "20260917204500_wayplan_revision_delete_v47.sql");
const page = fs.readFileSync(pagePath, "utf8");

const beginStart = page.indexOf("async function beginRevision()");
const beginEnd = page.indexOf("function addSelectedToRevision()", beginStart);
assert.ok(beginStart >= 0 && beginEnd > beginStart, "V47 must retain the beginRevision flow");
const beginRevisionSource = page.slice(beginStart, beginEnd);
assert.ok(!beginRevisionSource.includes("setSelected({});"), "Starting a revision must preserve already-selected READY ways");

assert.ok(page.includes('data-wayplan-revision-actions-v47="true"'), "Revision Add/Remove controls must be visible beside Generated Wayplans");
assert.ok(page.includes("Add Selected ("), "V47 must expose Add Selected in the visible revision actions");
assert.ok(page.includes("Delete Generated Wayplan"), "V47 must expose a pre-dispatch delete action");
assert.ok(page.includes("be_delete_created_wayplan_v55") || page.includes("be_delete_created_wayplan_v47"), "Delete action must use the guarded V47/V55 RPC chain");
assert.ok(page.includes("Permanently delete ${activeWayplan.wayplan_id}") || page.includes("Delete ${activeWayplan.wayplan_id} and return its ways to READY?"), "Delete must require explicit operator confirmation");
assert.ok(page.includes('activeWayplan?.wayplan_status === "CREATED"'), "Delete must be gated to CREATED Wayplans in the UI");

assert.ok(fs.existsSync(migrationPath), "V47 delete migration must exist");
const migration = fs.readFileSync(migrationPath, "utf8");
assert.ok(migration.includes("be_delete_created_wayplan_v47"), "V47 migration must define the guarded delete RPC");
assert.ok(migration.includes("Only a CREATED Wayplan can be deleted before dispatch"), "Delete RPC must hard-block non-CREATED Wayplans");
assert.ok(migration.includes("WAYPLAN_DELETED_V47"), "Delete must write an audit event");
assert.ok(migration.includes("membership_status='CANCELLED'"), "Delete must release active Wayplan membership");
assert.ok(migration.includes("wayplan_id=null"), "Delete must detach released parcels from the deleted Wayplan");
assert.ok(migration.includes("READY_FOR_DISPATCH"), "Delete must return eligible parcels to dispatch-ready state");
assert.ok(migration.includes("READY_FOR_WAYPLAN"), "Delete must return eligible parcels to wayplan-ready state");
assert.ok(!migration.includes("delete from public.be_wayplan_route_versions_v1"), "Delete must preserve historical route versions");
assert.ok(!migration.includes("delete from public.be_wayplan_warehouse_loading_snapshots_v1"), "Delete must preserve historical LIFO snapshots");

console.log("Wayplan V47 revision visibility + operational delete contract PASS");
