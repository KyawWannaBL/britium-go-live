const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function check(path){
 const source=fs.readFileSync(path,'utf8');
 const out=ts.transpileModule(source,{fileName:path,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
 assert.equal((out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,path+' TSX parser error');
 return source;
}
const r=check('src/pages/WarehouseRtoReportPage.tsx');
const d=check('src/pages/DashboardPage.tsx');
const c=check('src/pages/CustomerServicePortalPage.tsx');
for(const marker of ['data-rto-scroll','rto-print-document','@page { size: A4 portrait','return_scan_1_at','return_scan_2_at','return_scan_3_at','reason_1_name','reason_2_name','reason_3_name','remark_1','remark_2','remark_3','final_failed_reason','dateFrom','dateTo','reasonFilter','attemptFilter','p_merchant','be_warehouse_rto_report_v199','exportCsv']){
 assert.ok(r.includes(marker),'Missing RTO control: '+marker);
}
assert.ok(r.includes('max-h-[65vh]')&&r.includes('overflow-auto'),'RTO screen must scroll in both directions');
assert.ok(r.includes('break-inside:avoid'),'RTO print must paginate parcel entries without clipping');
assert.ok(!r.includes('min-w-[1500px]'),'Print must not reuse the wide screen table');
for(const marker of ['be_role_dashboard_v1','COD Collections Settled','COD Collections Pending','Ready to Settle Merchant','Merchant queue reconciliation','Warehouse inventory check','Not available','Projected Merchant Payable','Snapshot age']){
 assert.ok(d.includes(marker),'Missing dashboard source guard: '+marker);
}
for(const marker of ['Filter parcel status','Filter current owner','Show only parcels with open voices','visibleRows.map']){
 assert.ok(c.includes(marker),'Missing customer service filter: '+marker);
}
console.log('Dashboard/RTO/Customer Service verification PASS: parser, screen filters, source labels and detailed A4 print fields');
