import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const migrationPath = path.join(root, "supabase/migrations/20260925031500_rider_proof_sync_orphan_guard_v141.sql");

assert.ok(fs.existsSync(migrationPath), "V141 orphan-proof guard migration must exist");
const sql = fs.readFileSync(migrationPath, "utf8");

assert.match(sql, /be_sync_rider_proofs_to_data_entry/i,
  "V141 must patch the Rider proof -> Data Entry bridge");
assert.match(sql, /be_portal_pickup_requests/i,
  "V141 must validate source proof pickup IDs against the canonical pickup table");
assert.match(sql, /not exists\s*\(/i,
  "V141 must skip orphan proof rows whose pickup no longer exists");
assert.match(sql, /continue;/i,
  "V141 must continue past orphan source rows instead of aborting the entire sync");
assert.match(sql, /PICKUP_NOT_FOUND/i,
  "V141 regression comments/contract must document the failure being prevented");

console.log("Rider proof sync orphan guard V141 contract PASS");
