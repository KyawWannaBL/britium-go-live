import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const migration=path.join(root,"supabase/migrations/20260925043000_helper_parcel_save_v142.sql");

assert.ok(fs.existsSync(migration),"V142 helper parcel-save migration must exist");
const sql=fs.readFileSync(migration,"utf8");

assert.match(sql,/be_field_pickup_request_options_v95/i,
  "V142 must patch the field pickup options gate used by the active helper workflow");
assert.match(sql,/v_role\s*=\s*'helper'/i,
  "V142 must distinguish helper evidence capture from primary-worker finalization");
assert.match(sql,/CAPTURE_EVIDENCE/i,
  "Accepted assigned helpers must receive an evidence-capture next action");
assert.match(sql,/can_capture/i,
  "V142 must explicitly repair the can_capture contract");
assert.match(sql,/WAIT_FOR_TEAM_ACCEPTANCE/i,
  "Primary-worker team readiness behavior must remain represented");
assert.match(sql,/be_field_team_verify_and_release_v140/i,
  "V142 must preserve the Rider/Driver-only final release boundary");
assert.match(sql,/PRIMARY_FIELD_WORKER_REQUIRED/i,
  "V142 must regression-check that helpers cannot final-verify/release");

console.log("Helper parcel save V142 contract PASS");
