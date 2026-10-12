import assert from "node:assert/strict";
import fs from "node:fs";

const service=fs.readFileSync("src/lib/deliveryLocationService.ts","utf8");
const page=fs.readFileSync("src/pages/DataEntryFinancialV2Page.tsx","utf8");
const editor=fs.readFileSync("src/components/workflow/DataEntryLocationEditor.tsx","utf8");
const migration=fs.readFileSync("supabase/migrations/20260906193000_location_alias_learning_v28.sql","utf8");
const remediation=fs.readFileSync("supabase/migrations/20260906213642_location_review_permission_identity_v29.sql","utf8");

assert.match(migration,/create table if not exists public\.be_location_aliases/);
assert.match(migration,/enable row level security/);
assert.match(migration,/grant select on table public\.be_location_aliases to authenticated/);
assert.match(migration,/create policy be_location_alias_read_v28/);
assert.match(migration,/be_location_alias_resolve_v28/);
assert.match(migration,/create trigger be_delivery_location_learn_alias_v28/);
assert.match(migration,/on conflict \(alias_key,township_key,merchant_id\)/);
assert.match(service,/be_location_alias_resolve_v28/);
assert.match(service,/matchLevel: aliasMatch/);
assert.match(service,/coordinateSource: aliasSource/);
assert.match(page,/resolveDeliveryLocation/);
assert.match(page,/const LOCATION_VALIDATION_BATCH_SIZE = 4;[\s\S]*jobs\.slice\(offset,offset\+LOCATION_VALIDATION_BATCH_SIZE\)/);
assert.match(page,/resolveDeliveryLocation\([^;]+client:\s*supabase/s);
assert.match(editor,/resolveDeliveryLocation\([^;]+client:\s*supabase/s);
assert.match(page,/be_delivery_location_review_batch_v23/g);
assert.match(page,/Location validation failed/);
assert.match(editor,/be_delivery_location_review_batch_v29/);
assert.match(remediation,/be_data_entry_actor_access_v57\('update',false\)/);
assert.match(remediation,/address_original=excluded\.address_original/);
assert.match(remediation,/township=excluded\.township/);
assert.match(remediation,/identity_reconciled/);
assert.match(remediation,/select public\.be_delivery_location_review_batch_v29\(p_payload\)/);
assert.match(remediation,/revoke all on function public\.be_delivery_location_review_batch_v29\(jsonb\) from public,anon,authenticated,service_role/);
assert.match(remediation,/grant execute on function public\.be_delivery_location_review_batch_v29\(jsonb\) to authenticated,service_role/);

console.log("PASS V29 location aliases, resilient bulk review, access control, and identity reconciliation");

await import("./verify-learned-location-alias.mjs");
