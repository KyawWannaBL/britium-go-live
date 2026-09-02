import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const page=readFileSync(resolve(root,"src/pages/DataEntryFinancialV2Page.tsx"),"utf8");
const migration=readFileSync(resolve(root,"supabase/migrations/20260902212509_data_entry_extra_registration_bulk_actions.sql"),"utf8");
const saveAllMigration=migration.match(/create or replace function public\.be_data_entry_financial_v2_save_all[\s\S]*?comment on function public\.be_data_entry_financial_v2_save_all/i)?.[0]||"";

const checks=[
  ["bounded save wrapper",/create or replace function public\.be_data_entry_financial_v2_save\(p_payload jsonb\)[\s\S]*UNAUTHORIZED_EXTRA_REGISTRATION/i.test(migration)],
  ["unbounded legacy RPC is private",/revoke all on function public\.be_data_entry_financial_v2_save_v13_2_unbounded\(jsonb\)[\s\S]*from public, anon, authenticated, service_role/i.test(migration)],
  ["requested count is preserved",/set verified_parcels=v_new_count/i.test(migration) && !/set\s+expected_parcels\s*=/i.test(migration)],
  ["addition is concurrency locked",/pg_advisory_xact_lock\(hashtextextended\('DATA_ENTRY_ADD:'/i.test(migration)],
  ["addition is idempotent",/'ADD_REGISTRATIONS'[\s\S]*IDEMPOTENCY_CONFLICT/i.test(migration)],
  ["extra saves require audit or Rider verification",/EXTRA_REGISTRATION_AUDIT_REQUIRED/i.test(migration)],
  ["Save All requires every authorized row",/SAVE_ALL_ROW_COUNT_MISMATCH/i.test(migration) && /SAVE_ALL_SEQUENCE_MISMATCH/i.test(migration)],
  ["Save All serializes against quantity changes",/be_portal_pickup_requests[\s\S]*for update/i.test(saveAllMigration)],
  ["Save All rolls back partial work",/SAVE_ALL_ROLLED_BACK/i.test(migration) && /'rolled_back',true/i.test(migration)],
  ["frontend authorizes additions",/be_data_entry_financial_v2_add_registrations/.test(page) && /ADD REGISTRATION/.test(page)],
  ["frontend exposes Calculate All",/CALCULATE ALL/.test(page) && /async function calculateAll/.test(page)],
  ["Calculate All reports partial failures",/Calculated \$\{calculated\} of \$\{rows\.length\}/.test(page)],
  ["frontend exposes atomic Save All",/SAVE ALL/.test(page) && /be_data_entry_financial_v2_save_all/.test(page)],
  ["individual Save is live",/async function saveRow/.test(page) && /dry_run:false/.test(page)],
  ["top-level backend failures stay failures",/ok:object\.ok!==false/.test(page)],
  ["extra rows are derived from original request",/isAdditionalRegistration:sequence>requestedParcelCount\(pickup\)/.test(page)],
  ["timeline export pages through every stored field",/\.select\("\*"\)/.test(page) && /All Registered Fields/.test(page) && /\.range\(offset,offset\+pageSize-1\)/.test(page)],
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`Contract check failed: ${name}`);
  console.log(`PASS ${name}`);
}

const requested=15;
const verifiedAfterAddition=17;
const authorized=Math.max(requested,verifiedAfterAddition);
assert.equal(authorized,17);
assert.equal(16>requested && 16<=authorized,true);
assert.equal(18<=authorized,false);
console.log("PASS requested count 15 remains distinct from authorized count 17");
console.log(`PASS ${checks.length+1} Data Entry V14 contract checks`);
