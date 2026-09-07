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
assert.match(service,/LEARNED_ADDRESS_ALIAS_V28/);
assert.match(service,/cachedGoogleGeocode/);
assert.match(service,/GOOGLE_QUERY_CACHE_LIMIT = 1500/);
assert.match(page,/importedLocationPatchQueueRef/);
assert.match(page,/setTimeout\(flushImportedLocationPatches,80\)/);
assert.match(page,/resolveDeliveryLocation\([^;]+,supabase\)/s);
assert.match(editor,/resolveDeliveryLocation\([^;]+,supabase\)/s);
assert.match(page,/be_delivery_location_review_batch_v29/g);
assert.match(page,/LOCATION_SAVE_FAILED/);
assert.match(editor,/be_delivery_location_review_batch_v29/);
assert.match(remediation,/be_data_entry_actor_access_v57\('update',false\)/);
assert.match(remediation,/address_original=excluded\.address_original/);
assert.match(remediation,/township=excluded\.township/);
assert.match(remediation,/identity_reconciled/);
assert.match(remediation,/select public\.be_delivery_location_review_batch_v29\(p_payload\)/);
assert.match(remediation,/revoke all on function public\.be_delivery_location_review_batch_v29\(jsonb\) from public,anon,authenticated,service_role/);
assert.match(remediation,/grant execute on function public\.be_delivery_location_review_batch_v29\(jsonb\) to authenticated,service_role/);

console.log("PASS V29 location aliases, resilient bulk review, access control, and identity reconciliation");
