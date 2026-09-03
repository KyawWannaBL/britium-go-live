import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const page=readFileSync(resolve(root,"src/pages/DataEntryFinancialV2Page.tsx"),"utf8");
const importer=readFileSync(resolve(root,"src/components/workflow/DataEntryOsBulkImport.tsx"),"utf8");
const location=readFileSync(resolve(root,"src/components/workflow/DataEntryLocationEditor.tsx"),"utf8");
const migration=readFileSync(resolve(root,"supabase/migrations/20260903155405_data_entry_delivery_routing_wayplan_regions_v19.sql"),"utf8");
const runtimeMigration=readFileSync(resolve(root,"supabase/migrations/20260903102052_data_entry_runtime_state_v16.sql"),"utf8");
const continuousBatchMigration=readFileSync(resolve(root,"supabase/migrations/20260904043000_continuous_data_entry_bulk_batches_v22.sql"),"utf8");

const checks=[
  ["all 12 bilingual OS columns",/Way ID \/ Pickup ID[\s\S]*Merchant Name \/ Merchant ID[\s\S]*Receiver Name[\s\S]*Receiver Phone[\s\S]*Township \/ Service Provider[\s\S]*Actual Weight[\s\S]*Receiver Address[\s\S]*Service Type[\s\S]*Payment Type[\s\S]*Item Price[\s\S]*OS Set Price[\s\S]*Merchant Tier/.test(importer)],
  ["legacy 10-column sheets remain valid for a selected pickup",/REGISTRATION_COLUMN_KEYS/.test(importer)&&/missingBulkRoutingHeaders/.test(importer)&&/bulkMode && missingBulkRoutingHeaders/.test(importer)],
  ["header discovery scans first 25 rows",/matrix\.slice\(0, 25\)/.test(importer)],
  ["CSV and Excel use the same parser",/\.\(xlsx\|xls\|csv\)/.test(importer)&&/import\("xlsx"\)/.test(importer)&&/parseOsImportMatrix/.test(importer)],
  ["All OS and Dedicated OS filters",/ALL_OS/.test(importer)&&/DEDICATED_OS/.test(importer)&&/merchantFilter/.test(importer)],
  ["timeline and complete-partial filters",/fromDate/.test(importer)&&/toDate/.test(importer)&&/pickupStatus/.test(importer)&&/rowStatus/.test(importer)],
  ["spreadsheet fills existing registration state",/async function applyOsImport/.test(page)&&/fillImportedPickupRows/.test(page)&&/setRows\(firstDraft\.rows\)/.test(page)],
  ["main pickup selector includes explicit Bulk upload mode",/BULK_UPLOAD_PICKUP_ID/.test(page)&&/Bulk upload · Way ID \+ Merchant Name/.test(page)],
  ["bulk rows route by Way ID and verify merchant",/function buildOsImportPlan/.test(importer)&&/does not belong to pickup/.test(importer)&&/Duplicate parcel sequence/.test(importer)],
  ["multi-pickup drafts remain separated for review",/Bulk upload pickup queue/.test(page)&&/bulkImportDrafts/.test(page)&&/bulkImportOrder/.test(page)],
  ["each source file remains capped at 200 rows",/rows\.length > 200/.test(importer)&&/Import no more than 200 rows in one spreadsheet/.test(importer)],
  ["consecutive uploads continue after the saved sequence",/sequenceFloorByPickup/.test(importer)&&/nextSequence = Math\.max\(0, Number\(sequenceFloorByPickup\[pickupId\]/.test(importer)&&/maximumSavedSequence/.test(page)],
  ["parcel sequence can continue beyond 200",/if \(\/\^\\d\+\$\/\.test\(suffix\)\)/.test(importer)&&!/explicitSequence > 200/.test(importer)],
  ["unsaved batches cannot be replaced by a later upload",/still has an unsaved upload batch/.test(page)&&/Calculate and Save All before uploading its next batch/.test(page)],
  ["bulk staging keeps each batch limited to imported rows",/filled\.filter\(\(row\)=>sourceBySequence\.has\(row\.parcel_sequence\)\)/.test(page)],
  ["continuous batches use the V22 atomic save RPC",/be_data_entry_financial_v2_save_batch_v22/.test(page)&&/create or replace function public\.be_data_entry_financial_v2_save_batch_v22/.test(continuousBatchMigration)],
  ["V22 accepts only 1-200 contiguous rows inside the authorized range",/v_row_count<1 or v_row_count>200/.test(continuousBatchMigration)&&/SAVE_BATCH_NOT_CONTIGUOUS/.test(continuousBatchMigration)&&/v_last_sequence>v_authorized_count/.test(continuousBatchMigration)],
  ["V22 batch saves are idempotent audited and rollback on failure",/SAVE_BATCH_V22/.test(continuousBatchMigration)&&/SAVE_BATCH_ROLLED_BACK/.test(continuousBatchMigration)&&/DATA_ENTRY_FINANCIAL_V2_BATCH_SAVED/.test(continuousBatchMigration)],
  ["canonical delivery IDs exist before location checks",/delivery_way_id:canonicalWayId\(pickup\.pickup_id,sequence\)/.test(page)],
  ["core imports require synchronized locations while external routes bypass maps",/route\.mapRequired\s*&&\s*row\.locationStatus!=="SYNCED"/.test(page)&&/CORE_LOCATION_NOT_SYNCED/.test(migration)&&/MAP_NOT_REQUIRED/.test(migration)],
  ["stale address pins are rejected",/saved pin belongs to an older address/.test(location)&&/addressKey\(row\.address_original\) !== addressKey\(address\)/.test(location)],
  ["manual coordinates only sync after Apply",/reportResolution\("REVIEW_REQUIRED"\)/.test(location)&&/reportResolution\("SYNCED"\)/.test(location)&&/Apply coordinates/.test(location)],
  ["Google Map click copies relocation coordinates into Data Entry",/map\.addListener\("click"/.test(location)&&/setLat\(nextLat\.toFixed\(6\)\)/.test(location)&&/setLng\(nextLng\.toFixed\(6\)\)/.test(location)&&/Coordinates copied from the/.test(location)],
  ["Data Entry exposes an explicit Google Map relocation control",/Relocate directly on Google Map/.test(location)&&/COORDINATES COPY AUTOMATICALLY/.test(location)],
  ["relocation creates a same-screen editable pin without a prior candidate",/async function openRelocationMap/.test(location)&&/new maps\.Geocoder\(\)/.test(location)&&/Show pin and select location on this map/.test(location)&&/without opening another tab/.test(location)],
  ["reliable automatic coordinates synchronize",/saved automatically and shared with Wayplan/.test(location)&&/deliveryWayId \? "SYNCED"/.test(location)],
  ["photo bypass is explicit and reasoned",/skipPhotoReview/.test(importer)&&/at least 10 characters/.test(importer)&&/PHOTO_BYPASS_REASON_REQUIRED/.test(migration)],
  ["OS import requires upload permission",/be_data_entry_require_access_v57\('upload',false\)/.test(migration)],
  ["source lineage is persisted",/source_file_name/.test(migration)&&/source_row_number/.test(migration)&&/source_row_count/.test(migration)&&/os_imported_by/.test(migration)],
  ["OS import and photo bypass are audited",/DATA_ENTRY_OS_SOFTCOPY_IMPORTED/.test(migration)&&/DATA_ENTRY_OS_SOFTCOPY_PHOTO_BYPASS_AUTHORIZED/.test(migration)],
  ["security-definer RPC is role restricted",/security definer[\s\S]*set search_path to 'public','auth','pg_temp'/.test(migration)&&/revoke all on function public\.be_data_entry_financial_v2_save\(jsonb\) from public, anon/.test(migration)&&/grant execute[\s\S]*authenticated, service_role/.test(migration)],
  ["extra OS registrations are authorized in chunks",/authorizeImportedRows/.test(page)&&/Math\.min\(50,remaining\)/.test(page)&&/be_data_entry_financial_v2_add_registrations/.test(page)],
  ["bulk calculate-save-waybill workflow remains",/CALCULATE ALL/.test(page)&&/SAVE ALL/.test(page)&&/CREATE & GENERATE WAYBILL/.test(page)],
  ["timeline export contains OS metadata",/OS Softcopy Source File/.test(page)&&/Photo Evidence Mode/.test(page)&&/OS Imported At/.test(page)],
  ["legacy generic uploader was removed from Data Entry",!/ActiveScreenBulkImport/.test(page)&&/UPLOAD OS DATA/.test(importer)],
  ["runtime mutation mode comes from an authenticated RPC",/be_data_entry_financial_v2_runtime_state/.test(page)&&/setMutationMode\(resolvedMutationMode/.test(page)&&/be_data_entry_require_access_v57\('create',false\)/.test(runtimeMigration)],
  ["runtime-state RPC is security-definer and role restricted",/security definer[\s\S]*set search_path to 'public','auth','pg_temp'/.test(runtimeMigration)&&/revoke all on function public\.be_data_entry_financial_v2_runtime_state\(\) from public, anon/.test(runtimeMigration)&&/grant execute[\s\S]*authenticated, service_role/.test(runtimeMigration)],
];

for(const [name,ok] of checks){
  assert.equal(ok,true,`Contract check failed: ${name}`);
  console.log(`PASS ${name}`);
}
console.log(`PASS ${checks.length} Data Entry OS Import V19 contract checks`);
