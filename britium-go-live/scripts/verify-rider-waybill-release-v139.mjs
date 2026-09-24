import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const riderPath = path.join(root, "src/pages/RiderFieldPortalApp.tsx");
const migrationPath = path.join(root, "supabase/migrations/20260925020000_rider_waybill_release_v139.sql");

const rider = fs.readFileSync(riderPath, "utf8");
assert.ok(fs.existsSync(migrationPath), "V139 rider waybill release migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /create or replace function public\.be_rider_available_pickups_v139\(/i,
  "V139 must expose same-branch unassigned pickup requests to the authenticated rider");
assert.match(sql, /create or replace function public\.be_rider_claim_pickup_v139\(/i,
  "V139 must expose a safe rider self-claim function");
assert.match(sql, /security definer/i, "V139 rider RPCs must be SECURITY DEFINER");
assert.match(sql, /be_current_field_team_identity\(\)/i, "V139 rider RPCs must derive identity from the authenticated session");
assert.match(sql, /role[^\n]{0,120}rider/i, "pickup self-claim must be rider-only");
assert.match(sql, /branch_code/i, "pickup self-claim must enforce rider/pickup branch compatibility");
assert.match(sql, /assigned_rider_id/i, "claim must persist rider ownership");
assert.match(sql, /assignment_status\s*=\s*'ASSIGNED'/i, "claim must create a canonical assignment");
assert.match(sql, /rider_status\s*=\s*'ACCEPTED'/i, "claim itself must count as explicit rider acceptance");
assert.match(sql, /team_acceptance_status\s*=\s*'TEAM_READY'/i, "rider-only self-claim must leave the field team ready");
assert.match(sql, /pickup_status\s*=\s*'RIDER_ACCEPTED'/i, "claim must put the pickup into the next actionable Rider App stage");
assert.match(sql, /revoke execute on function public\.be_rider_claim_pickup_v139/i, "claim RPC must revoke public execution");
assert.match(sql, /grant execute on function public\.be_rider_claim_pickup_v139/i, "claim RPC must grant authenticated execution");

assert.match(sql, /field-team verified and collected before waybill creation/i,
  "waybill gate message must describe canonical field-team verification/collection");
assert.match(sql, /pickup_status/i, "waybill gate must recognize canonical pickup collection state");
assert.match(sql, /workflow_stage/i, "waybill gate must recognize canonical workflow collection state");
assert.match(sql, /driver_status/i, "waybill gate must not be rider-only when a Driver is the primary field worker");

assert.match(rider, /availablePickups/i, "Rider App must keep an available-pickup list");
assert.match(rider, /be_rider_available_pickups_v139/i, "Rider App must load claimable pickup requests");
assert.match(rider, /be_rider_claim_pickup_v139/i, "Rider App must claim a selected pickup through the authenticated backend RPC");
assert.match(rider, /AVAILABLE PICKUP REQUESTS|Available Pickup Requests/i, "Pickup screen must expose the available request selector");
assert.match(rider, /CLAIM PICKUP|Claim Pickup/i, "Pickup screen must expose a claim action");
assert.match(rider, /RELEASE TO DATA ENTRY|Release to Data Entry/i,
  "Verified pickups must expose an explicit collection/release action for Data Entry waybill readiness");
assert.match(rider, /PICKUP_COLLECTED/i,
  "release action must use the canonical pickup-collected transition");
assert.match(rider, /WAYBILL READY|Waybill Ready|waybill generation is unlocked/i,
  "collected pickups must visibly confirm that Data Entry waybill generation is unlocked");

console.log("Rider pickup waybill release V139 contract PASS");
