import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const service=readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8");
const editor=readFileSync(resolve(root,"src/components/workflow/DataEntryLocationEditor.tsx"),"utf8");
const page=readFileSync(resolve(root,"src/pages/DataEntryFinancialV2Page.tsx"),"utf8");
const migration=readFileSync(resolve(root,"supabase/migrations/20260903130606_data_entry_google_location_contract_v18.sql"),"utf8");

const checks=[
  ["exact township lineage is explicit",/TOWNSHIP_EXACT_VALIDATED/.test(service)&&/exactGoogleMatch/.test(service)],
  ["only exact address or POI results receive exact lineage",/\["ADDRESS_EXACT", "POI_EXACT"\]\.includes\(best\.matchLevel\)/.test(service)&&/best\.reviewStatus === "ACCEPTED"/.test(service)],
  ["database accepts legacy and V18 exact Google lineage",/GOOGLE_\(PLACES\|GEOCODING\)_TOWNSHIP\(_EXACT\)\?_VALIDATED_/.test(migration)],
  ["database requires high confidence and complete address context",/v_confidence >= 0\.95/.test(migration)&&/v_address <> ''/.test(migration)&&/v_township <> ''/.test(migration)],
  ["automatic source suffix must match precision",/v_source like '%' \|\| v_match/.test(migration)],
  ["ward approximations remain review-only",/v_match = 'WARD_APPROXIMATE' and v_review <> 'MANUAL_REVIEW'/.test(migration)],
  ["street approximations retain exact postal guard",/v_match = 'STREET_APPROXIMATE'[\s\S]*v_postal_match <> 'EXACT_QUARTER'/.test(migration)],
  ["manual corrections remain supported",/v_match <> 'MANUAL'/.test(migration)&&/DATA_ENTRY_MANUAL_COORDINATE/.test(editor)],
  ["RPC remains invoker-security and role restricted",/security invoker[\s\S]*set search_path = public, pg_temp/.test(migration)&&/revoke all on function public\.be_delivery_location_upsert_v11\(jsonb\) from public, anon/.test(migration)&&/grant execute[\s\S]*authenticated, service_role/.test(migration)],
  ["bulk screen exposes readiness counts",/data-bulk-location-readiness-v18/.test(page)&&/synchronized/.test(page)&&/RETRY LOCATION SYNC/.test(page)],
  ["retry token restarts unresolved editor checks",/reloadToken\?: number/.test(editor)&&/deliveryWayId, address, township, reloadToken/.test(editor)&&/locationReloadToken/.test(page)],
  ["save boundary still requires synchronized imports",/row\.importedFromOs\s*&&\s*row\.locationStatus\s*!==\s*"SYNCED"/.test(page)&&/Location sync incomplete/.test(page)],
  ["waybill errors render as errors",/waybillMessageKind==="ERROR"/.test(page)&&/role=\{waybillMessageKind==="ERROR"\?"alert":"status"\}/.test(page)],
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`Contract check failed: ${name}`);
  console.log(`PASS ${name}`);
}

console.log(`PASS ${checks.length} Data Entry Google location/save V18 contract checks`);
