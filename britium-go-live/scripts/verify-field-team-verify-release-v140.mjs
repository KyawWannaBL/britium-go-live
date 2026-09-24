import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const riderPath = path.join(root, "src/pages/RiderFieldPortalApp.tsx");
const migrationPath = path.join(root, "supabase/migrations/20260925024500_field_team_verify_release_v140.sql");

const rider = fs.readFileSync(riderPath, "utf8");
assert.ok(fs.existsSync(migrationPath), "V140 field-team verify/release migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /create or replace function public\.be_field_team_verify_and_release_v140\(/i,
  "V140 must expose an authenticated Rider/Driver verify-and-release RPC");
assert.match(sql, /be_current_field_team_identity\(\)/i,
  "V140 must derive field identity from the authenticated session");
assert.match(sql, /role[^\n]{0,160}(rider|driver)/i,
  "V140 finalization must be limited to Rider/Driver");
assert.match(sql, /be_field_team_assert_assigned_pickup/i,
  "V140 must require assignment ownership");
assert.match(sql, /be_field_team_submit_partial_pickup_verification/i,
  "V140 must reuse the authoritative parcel verification logic");
assert.match(sql, /be_field_team_pickup_action/i,
  "V140 must reuse the canonical collection transition");
assert.match(sql, /driver_status\s*=\s*case/i,
  "V140 must synchronize Driver role status during verify/collect");
assert.match(sql, /rider_status\s*=\s*case/i,
  "V140 must synchronize Rider role status during verify/collect");
assert.match(sql, /READY_FOR_DATA_ENTRY/i,
  "V140 collection must release verified pickup to Data Entry");
assert.match(sql, /pickup_verified_at/i,
  "V140 success must require canonical verification timestamp");
assert.match(sql, /pickup_collected_at/i,
  "V140 success must require canonical collection timestamp");

assert.match(rider, /be_field_team_verify_and_release_v140/i,
  "Rider App must call the V140 backend finalizer");
assert.match(rider, /VERIFY & RELEASE TO DATA ENTRY/i,
  "Rider App must expose a one-tap verify/release action for the primary field worker");
assert.match(rider, /Helper evidence is ready|helper evidence/i,
  "Rider App must explain that helper evidence can be finalized by Rider/Driver");
assert.match(rider, /RELEASE TO DATA ENTRY/i,
  "Rider App must retain the explicit release action after verification");
assert.match(rider, /WAYBILL READY/i,
  "Rider App must visibly confirm waybill readiness after release");

console.log("Field-team verify/release V140 contract PASS");
