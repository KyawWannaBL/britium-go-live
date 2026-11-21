const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
for(const file of ["src/components/warehouse/WarehouseCustodyMonitor.tsx","src/pages/WarehousePage.tsx"]){
 const s=fs.readFileSync(file,"utf8");
 const r=ts.transpileModule(s,{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
 const failures=(r.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
 assert.equal(failures.length,0,file+" TSX parse failures: "+failures.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")).join("; "));
}
const monitor=fs.readFileSync("src/components/warehouse/WarehouseCustodyMonitor.tsx","utf8");
const wh=fs.readFileSync("src/pages/WarehousePage.tsx","utf8");
const sql=fs.readFileSync("supabase/migrations/20261122120000_warehouse_custody_monitor_v1.sql","utf8");
for(const x of ["PROVIDER_RECEIPT_MISSING","RETURN_CUSTODY_REVIEW","DISPATCH_NO_FINANCE_TRACE","WAREHOUSE_DWELL","COD_COLLECTION_TRACKED","THIRD_PARTY_TRACKED","data-warehouse-custody-monitor","p_limit:size","p_offset:page*size","Export current page CSV","Custody proof"])assert.ok(monitor.includes(x),"Missing monitor: "+x);
assert.ok(wh.includes('data-open-custody-monitor="true"')&&wh.includes("<WarehouseCustodyMonitor/>"),"Monitor not accessible from warehouse");
assert.ok(sql.includes("if auth.uid() is null")&&sql.includes("WAREHOUSE_CUSTODY_MONITOR_ROLE_REQUIRED"),"RPC must enforce auth + cross-ledger role");
assert.ok(sql.includes("revoke all on function")&&sql.includes("grant execute on function"),"RPC must limit privileges");
assert.ok(!/\b(update|delete from|insert into|truncate)\b/i.test(sql),"Monitor may not change parcel state");
console.log("Warehouse custody monitor regression PASS");
