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
const locationReviewMigration=readFileSync(resolve(root,"supabase/migrations/20260904053000_location_review_roundtrip_v23.sql"),"utf8");
const locationAliasMigration=readFileSync(resolve(root,"supabase/migrations/20260906003014_location_alias_dictionary_v28.sql"),"utf8");
const osImportSource=readFileSync(resolve(root,"src/components/workflow/DataEntryOsBulkImport.tsx"),"utf8");
const postalResolverSource=readFileSync(resolve(root,"src/lib/postalCodeResolver.ts"),"utf8");

const checks=[
  ["all 15 bilingual OS columns",/Way ID \/ Pickup ID[\s\S]*Merchant Name \/ Merchant ID[\s\S]*Receiver Name[\s\S]*Receiver Phone[\s\S]*City \/ Region[\s\S]*Township \/ Service Provider[\s\S]*Ward \/ Village Tract[\s\S]*Postal Code[\s\S]*Actual Weight[\s\S]*Receiver Address[\s\S]*Service Type[\s\S]*Payment Type[\s\S]*Item Price[\s\S]*OS Set Price[\s\S]*Merchant Tier/.test(importer)],
  ["City and Township use the canonical postal master and must match",/POSTAL_CODE_REGIONS/.test(importer)&&/POSTAL_CODE_TOWNSHIPS/.test(importer)&&/canonicalLocationPair/.test(importer)&&/Township does not belong to the selected City/.test(importer)],
  ["Ward and Postal Code are validated against their City and Township",/POSTAL_CODE_ROWS/.test(importer)&&/canonicalWardPostal/.test(importer)&&/Ward and Postal Code do not match/.test(importer)&&/sourcePostalCode/.test(page)],
  ["downloaded XLSX is the controlled dropdown template",/templates\/Britium_Data_Entry_Formregistration_Template\.xlsx/.test(importer)&&/cache: "no-store"/.test(importer)],
  ["alias lookup runs before external geocoding",/be_location_alias_lookup_v28/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))&&/MERCHANT_LOCATION_ALIAS_V28/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))],
  ["manual accepted coordinates securely teach merchant aliases",/create table if not exists public\.be_location_aliases/.test(locationAliasMigration)&&/enable row level security/.test(locationAliasMigration)&&/be_delivery_location_alias_learn_v28/.test(locationAliasMigration)&&/MANUAL_CORRECTION/.test(locationAliasMigration)],
  ["blank township is recovered from explicit address evidence",/const addressRows = rowsMentionedInAddress\(addressKey\)/.test(postalResolverSource)&&/postalEvidence = resolvePostalCode/.test(osImportSource)],
  ["Google candidates are searched concurrently within the row deadline",/Promise\.allSettled\(queries\.map/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))&&/6500/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))],
  ["Google queries use the postal region instead of hard-coded Yangon",/postalRegion/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))&&/Mandalay/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))&&/Naypyitaw/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))],
  ["Google request bursts and reverse checks are bounded",/\.slice\(0, 3\)/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))&&/Promise\.allSettled\(finalists\.map/.test(readFileSync(resolve(root,"src/lib/deliveryLocationService.ts"),"utf8"))&&/Math\.min\(4,jobs\.length\)/.test(page)],
  ["Yangon provider selection does not wait for tariff loading",/YANGON_BRITIUM_CORE_SERVICE_AREA/.test(readFileSync(resolve(root,"src/lib/dataEntryServiceProviderRouting.ts"),"utf8"))],
  ["legacy 10-column sheets remain valid for a selected pickup",/REGISTRATION_COLUMN_KEYS/.test(importer)&&/missingBulkRoutingHeaders/.test(importer)&&/bulkMode && missingBulkRoutingHeaders/.test(importer)],
  ["header discovery scans first 25 rows",/matrix\.slice\(0, 25\)/.test(importer)],
  ["CSV and Excel use the same parser",/\.\(xlsx\|xls\|csv\)/.test(importer)&&/import\("xlsx"\)/.test(importer)&&/parseOsImportMatrix/.test(importer)],
  ["Inbound Manifest converter recognizes the operational source columns",/convertInboundManifestMatrix/.test(importer)&&/recipient town/.test(importer)&&/final cod/.test(importer)&&/No parcel rows were found below the Inbound Manifest header/.test(importer)],
  ["converted workbook is emitted as a real XLSX byte array",/XLSX\.write\(outputWorkbook, \{ type: "array", bookType: "xlsx", compression: true \}\)/.test(importer)&&/application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/.test(importer)],
  ["PENING and PENDING RTO filenames become inboundlist A",/convertedInboundFilename/.test(importer)&&/\(\?:pening\|pending\)/.test(importer)&&/_inboundlist_A\.xlsx/.test(importer)],
  ["converter enriches postal fields and assigns the provider",/resolvePostalCode\(address, recipientTown\)/.test(importer)&&/resolveDataEntryServiceProvider/.test(importer)&&/providerDisplayName/.test(importer)],
  ["Hlaingtharya East and West collapse into Britium Hlaingtharya",/normalizedHlaingtharyaTownship/.test(importer)&&/Hlaingtharya Township/.test(importer)&&/လှိုင်သာယာ မြို့နယ်/.test(importer)],
  ["All OS and Dedicated OS filters",/ALL_OS/.test(importer)&&/DEDICATED_OS/.test(importer)&&/merchantFilter/.test(importer)],
  ["timeline and complete-partial filters",/fromDate/.test(importer)&&/toDate/.test(importer)&&/pickupStatus/.test(importer)&&/rowStatus/.test(importer)],
  ["spreadsheet fills existing registration state",/async function applyOsImport/.test(page)&&/fillImportedPickupRows/.test(page)&&/setRows\(firstDraft\.rows\)/.test(page)],
  ["main pickup selector includes explicit Bulk upload mode",/BULK_UPLOAD_PICKUP_ID/.test(page)&&/Bulk upload · Way ID \+ Merchant Name/.test(page)],
  ["bulk rows route by Way ID and verify merchant",/function buildOsImportPlan/.test(importer)&&/does not belong to pickup/.test(importer)&&/Duplicate parcel sequence/.test(importer)],
  ["single eligible dated pickup accepts consolidated parcel references",/function parcelReferenceDateToken/.test(importer)&&/\^\[DP\]/.test(importer)&&/function pickupDateToken/.test(importer)&&/isConsolidatedDeliverySheet/.test(importer)&&/rows\.length <= solePickupCapacity/.test(importer)&&/targetSequence: solePickupFloor \+ index \+ 1/.test(importer)],
  ["multi-pickup drafts remain separated for review",/Bulk upload pickup queue/.test(page)&&/bulkImportDrafts/.test(page)&&/bulkImportOrder/.test(page)],
  ["each source file accepts up to 500 rows",/MAX_BULK_UPLOAD_ROWS = 500/.test(importer)&&/rows\.length > MAX_BULK_UPLOAD_ROWS/.test(importer)],
  ["consecutive uploads continue after the saved sequence",/sequenceFloorByPickup/.test(importer)&&/nextSequence = Math\.max\(0, Number\(sequenceFloorByPickup\[pickupId\]/.test(importer)&&/maximumSavedSequence/.test(page)],
  ["parcel sequence can continue beyond 200",/if \(\/\^\\d\+\$\/\.test\(suffix\)\)/.test(importer)&&!/explicitSequence > 200/.test(importer)],
  ["unsaved batches cannot be replaced by a later upload",/still has an unsaved upload batch/.test(page)&&/Calculate and Save All before uploading its next batch/.test(page)],
  ["bulk staging keeps each batch limited to imported rows",/filled\.filter\(\(row\)=>sourceBySequence\.has\(row\.parcel_sequence\)\)/.test(page)],
  ["continuous batches use the V22 atomic save RPC",/be_data_entry_financial_v2_save_batch_v22/.test(page)&&/create or replace function public\.be_data_entry_financial_v2_save_batch_v22/.test(continuousBatchMigration)],
  ["500-row Save All uses consecutive 200-row transactions",/SAFE_TRANSACTION_ROWS = 200/.test(importer)&&/offset\+=SAFE_TRANSACTION_ROWS/.test(page)&&/pendingRows\.slice\(offset,offset\+SAFE_TRANSACTION_ROWS\)/.test(page)&&/Retry Save All to continue with unsaved rows only/.test(page)],
  ["V22 accepts only 1-200 contiguous rows inside the authorized range",/v_row_count<1 or v_row_count>200/.test(continuousBatchMigration)&&/SAVE_BATCH_NOT_CONTIGUOUS/.test(continuousBatchMigration)&&/v_last_sequence>v_authorized_count/.test(continuousBatchMigration)],
  ["V22 batch saves are idempotent audited and rollback on failure",/SAVE_BATCH_V22/.test(continuousBatchMigration)&&/SAVE_BATCH_ROLLED_BACK/.test(continuousBatchMigration)&&/DATA_ENTRY_FINANCIAL_V2_BATCH_SAVED/.test(continuousBatchMigration)],
  ["canonical delivery IDs exist before location checks",/delivery_way_id:canonicalWayId\(pickup\.pickup_id,sequence\)/.test(page)],
  ["core imports require synchronized locations while external routes bypass maps",/route\.mapRequired\s*&&\s*row\.locationStatus!=="SYNCED"/.test(page)&&/CORE_LOCATION_NOT_SYNCED/.test(migration)&&/MAP_NOT_REQUIRED/.test(migration)],
  ["stale address pins are rejected",/saved pin belongs to an older address/.test(location)&&/addressKey\(row\.address_original\) !== addressKey\(address\)/.test(location)],
  ["manual coordinates only sync after Apply",/reportResolution\("REVIEW_REQUIRED"\)/.test(location)&&/reportResolution\("SYNCED"\)/.test(location)&&/Apply coordinates/.test(location)],
  ["Google Map click copies relocation coordinates into Data Entry",/map\.addListener\("click"/.test(location)&&/setLat\(nextLat\.toFixed\(6\)\)/.test(location)&&/setLng\(nextLng\.toFixed\(6\)\)/.test(location)&&/Coordinates copied from the/.test(location)],
  ["Data Entry exposes an explicit Google Map relocation control",/Relocate directly on Google Map/.test(location)&&/COORDINATES COPY AUTOMATICALLY/.test(location)],
  ["relocation creates a same-screen editable pin without a prior candidate",/async function openRelocationMap/.test(location)&&/new maps\.Geocoder\(\)/.test(location)&&/Show pin and select location on this map/.test(location)&&/without opening another tab/.test(location)],
  ["operator can explicitly skip visual location review",/async function skipReview/.test(location)&&/SKIP REVIEW/.test(location)&&/be_delivery_location_review_batch_v23/.test(location)&&/DATA_ENTRY_MANUAL_REVIEW_SKIPPED/.test(locationReviewMigration)],
  ["bulk operator can skip all currently suggested review pins",/async function skipAllLocationReviews/.test(page)&&/SKIP ALL REVIEWS/.test(page)&&/LOCATION_REVIEW_SKIP_ALL/.test(page)],
  ["review locations round-trip through one consolidated XLSX",/downloadConsolidatedLocationReview/.test(page)&&/uploadConsolidatedLocationReview/.test(page)&&/Britium_Consolidated_Location_Review/.test(page)&&/Location Review/.test(page)],
  ["bulk locations are validated before entering the review queue",/locationStatus:\(destination\.mapRequired\?"PENDING":"NOT_REQUIRED"\)/.test(page)&&/validateImportedLocations/.test(page)&&/reviewRequired=found\.reviewStatus==="MANUAL_REVIEW"\|\|found\.matchLevel==="WARD_APPROXIMATE"/.test(page)],
  ["background location validation is concurrency limited",/Math\.min\(4,jobs\.length\)/.test(page)&&/await validateImportedLocation\(job\)/.test(page)&&/genuinely need review/.test(page)],
  ["background validation times out instead of hanging",/Location validation timed out after 20 seconds/.test(page)&&/Promise\.race/.test(page)],
  ["stale background results cannot overwrite corrected coordinates",/expectedStatuses\?:DataEntryLocationResolution\[\]/.test(page)&&/\["PENDING","SEARCHING"\]/.test(page)&&/manualLocationCorrectionsRef\.current\.has/.test(page)&&/manualLocationCorrectionsRef\.current\.set/.test(page)&&/locationStatus:"SYNCED" as const/.test(page)],
  ["interrupted location validation can be retried",/async function retryImportedLocationSync/.test(page)&&/RETRY LOCATION SYNC/.test(page)&&/interrupted and retryable/.test(page)],
  ["bulk rows do not mount Google Maps until individually opened",/deferAutomaticResolution/.test(page)&&/data-bulk-location-deferred-v24/.test(location)&&/OPEN MAP FOR THIS PARCEL/.test(location)&&/if \(deferAutomaticResolution \|\|/.test(location)],
  ["large parcel forms render in responsive 20-row pages",/visibleRowCount/.test(page)&&/rows\.slice\(0,visibleRowCount\)/.test(page)&&/SHOW NEXT/.test(page)&&/contentVisibility:"auto"/.test(page)],
  ["large review workbooks apply in consecutive 200-row batches",/offset\+=200/.test(page)&&/slice\(offset,offset\+200\)/.test(page)&&/jsonb_array_length\(v_rows\)>200/.test(locationReviewMigration)],
  ["location review changes are permission checked and audited",/be_data_entry_require_access_v57\('update',false\)/.test(locationReviewMigration)&&/DATA_ENTRY_LOCATION_REVIEW_SKIPPED/.test(locationReviewMigration)&&/DATA_ENTRY_LOCATION_BULK_CORRECTED/.test(locationReviewMigration)&&/revoke all on function public\.be_delivery_location_review_batch_v23\(jsonb\) from public,anon/.test(locationReviewMigration)],
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
