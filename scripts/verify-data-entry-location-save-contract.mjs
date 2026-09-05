import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const service=readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8");
const editor=readFileSync(resolve(root,"src/components/workflow/DataEntryLocationEditor.tsx"),"utf8");
const page=readFileSync(resolve(root,"src/pages/DataEntryFinancialV2Page.tsx"),"utf8");
const migration=readFileSync(resolve(root,"supabase/migrations/20260903130606_data_entry_google_location_contract_v18.sql"),"utf8");
const routingMigration=readFileSync(resolve(root,"supabase/migrations/20260903155405_data_entry_delivery_routing_wayplan_regions_v19.sql"),"utf8");

const checks=[
  ["exact township lineage is explicit",/TOWNSHIP_EXACT_VALIDATED/.test(service)&&/exactGoogleMatch/.test(service)],
  ["only exact address or POI results receive exact lineage",/\["ADDRESS_EXACT", "POI_EXACT"\]\.includes\(best\.matchLevel\)/.test(service)&&/best\.reviewStatus === "ACCEPTED"/.test(service)],
  ["database accepts legacy and V18 exact Google lineage",/GOOGLE_\(PLACES\|GEOCODING\)_TOWNSHIP\(_EXACT\)\?_VALIDATED_/.test(migration)],
  ["database requires high confidence and complete address context",/v_confidence >= 0\.95/.test(migration)&&/v_address <> ''/.test(migration)&&/v_township <> ''/.test(migration)],
  ["automatic source suffix must match precision",/v_source like '%' \|\| v_match/.test(migration)],
  ["ward approximations remain review-only",/v_match = 'WARD_APPROXIMATE' and v_review <> 'MANUAL_REVIEW'/.test(migration)],
  ["street approximations retain exact postal guard",/v_match = 'STREET_APPROXIMATE'[\s\S]*v_postal_match <> 'EXACT_QUARTER'/.test(migration)],
  ["precise Myanmar street results accept only with exact audited postal evidence",/candidate\.matchLevel === "STREET_APPROXIMATE"[\s\S]*postal\.matchLevel === "EXACT_QUARTER"[\s\S]*score >= 0\.96/.test(service)],
  ["location agreement requires distinct providers within 200 metres",/other\.provider !== candidate\.provider/.test(service)&&/distanceMetres\(candidate, other\) <= 200/.test(service)],
  ["manual corrections remain supported",/v_match <> 'MANUAL'/.test(migration)&&/DATA_ENTRY_MANUAL_COORDINATE/.test(editor)],
  ["embedded coordinates accept Myanmar and full-width commas",/\[,၊，\\s\]/.test(service)&&/Treat Myanmar\/full-width commas/.test(service)],
  ["review export reports the actual pending reason",/NO_RELIABLE_COORDINATE_FOUND/.test(page)&&/AUTOMATIC_LOCATION_REQUIRES_REVIEW/.test(page)&&/locationCandidate\?\.reviewReason/.test(page)],
  ["RPC remains invoker-security and role restricted",/security invoker[\s\S]*set search_path = public, pg_temp/.test(migration)&&/revoke all on function public\.be_delivery_location_upsert_v11\(jsonb\) from public, anon/.test(migration)&&/grant execute[\s\S]*authenticated, service_role/.test(migration)],
  ["bulk screen separates synchronized and map-not-required rows",/data-bulk-location-readiness-v19/.test(page)&&/map not required/.test(page)&&/RETRY LOCATION SYNC/.test(page)],
  ["retry token restarts unresolved editor checks",/reloadToken\?: number/.test(editor)&&/deliveryWayId, address, township,[^\]]*reloadToken/.test(editor)&&/locationReloadToken/.test(page)],
  ["save boundary requires sync only for core map routes",/route\.mapRequired\s*&&\s*row\.locationStatus!=="SYNCED"/.test(page)&&/Core-region location sync incomplete/.test(page)],
  ["outside-core routes explicitly bypass map resolution",/data-location-not-required-v19/.test(editor)&&/reportResolution\("NOT_REQUIRED"\)/.test(editor)&&/MAP_NOT_REQUIRED/.test(routingMigration)],
  ["database requires accepted coordinates for core regional saves and queues",/if v_map_required then/.test(routingMigration)&&/CORE_LOCATION_NOT_SYNCED/.test(routingMigration)&&/be_delivery_location_registry location/.test(routingMigration)],
  ["waybill errors render as errors",/waybillMessageKind==="ERROR"/.test(page)&&/role=\{waybillMessageKind==="ERROR"\?"alert":"status"\}/.test(page)],
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`Contract check failed: ${name}`);
  console.log(`PASS ${name}`);
}

console.log(`PASS ${checks.length} Data Entry Google location/save V18 contract checks`);
