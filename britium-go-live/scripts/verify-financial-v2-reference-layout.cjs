// UI preservation contract: the reference layout must not remove live Data Entry operations.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const page=fs.readFileSync('src/pages/DataEntryFinancialV2Page.tsx','utf8');
const settlement=fs.readFileSync('src/pages/MerchantSettlementPage.tsx','utf8');
const output=ts.transpileModule(page,{fileName:'DataEntryFinancialV2Page.tsx',reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
assert.ok(!(output.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error),'Data Entry TSX must parse successfully');
for(const name of ['loadStaffProgress','calculateAll','saveAll','calculateRow','saveRow','saveAndNextRow','saveDraftRow','toggleSkip','reviewPhoto','togglePhotoWaiver','deleteRegistration','applyOsImport','addRegistrations','retryImportedLocationSync','skipAllLocationReviews','downloadConsolidatedLocationReview','uploadConsolidatedLocationReview','createAndGenerateWaybill','downloadDataEntryRegistration','loadPickupRows']){
  assert.match(page,new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\('),name+' handler missing');
}
assert.ok(page.includes('const lookupPhoneHistory='),'phone historical autofill handler missing');
for(const component of ['DataEntryOsBulkImport','CorporateDataEntryBinding','DeliveryAddressHistory','DataEntryLocationEditor','BufferedDataEntryInput','ParcelEditor']){
  assert.ok(page.includes('<'+component),component+' component removed');
}
for(const label of ['data-financial-v2-command-bar','data-financial-v2-tool-drawer','data-data-entry-reference-layout','data-registration-grid-v137','data-full-review-sheet','data-full-registration-layout-v85','data-extra-registration-v14','data-bulk-location-readiness-v19','data-data-entry-staff-progress-v96','data-data-entry-registration-export-v12-9','data-operator-workflow-v86']){
  assert.ok(page.includes(label),label+' workflow or layout marker missing');
}
for(const control of ['Parcel Registration','Staff Progress','Reconciliation','Data Tools','Batch &amp; Excel','Contract &amp; Qty','SAVE ALL','CALCULATE ALL','DOWNLOAD REVIEW EXCEL','DOWNLOAD REGISTRATION EXCEL','GENERATE COMPLETED WAYBILLS','ADD REGISTRATION']){
  assert.ok(page.includes(control),control+' operator action removed');
}
assert.ok(settlement.includes('source("merchant_master","merchant_code,merchant_name,business_name")'),'canonical merchant master lookup missing');
assert.ok(settlement.includes('merchantLabel(m)'),'merchant name dropdown must be human-readable');
console.log('Financial V2 reference layout PASS: live business handlers, all preserved controls, master merchant names, and TSX parsing');
