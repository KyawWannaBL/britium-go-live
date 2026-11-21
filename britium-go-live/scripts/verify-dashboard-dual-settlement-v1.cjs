const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
const ui=fs.readFileSync('src/pages/DashboardPage.tsx','utf8');
const sql=fs.readFileSync('supabase/migrations/20261122035000_dashboard_dual_settlement_reconciliation.sql','utf8');
const out=ts.transpileModule(ui,{fileName:'DashboardPage.tsx',reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
assert.equal((out.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,'Dashboard TSX must parse');
for(const key of ['data-dual-finance-settlement','COD Collection Records','COD Collections Settled','COD Collections Pending','Merchant Queue Records','Waiting Delivery','Waiting COD Remittance','Ready to Settle Merchant','Merchant Settled','Cross-ledger exception','Expected Customer Collections','Projected Merchant Payable','be_dashboard_settlement_reconciliation_v1']){
 assert.ok(ui.includes(key),'Missing dashboard label or handler: '+key);
}
assert.ok(sql.includes('auth.uid() is null')&&sql.includes('FINANCE_ROLE_REQUIRED'),'Restrict finance RPC by authentication and role');
assert.ok(sql.includes('revoke all on function')&&sql.includes('grant execute on function'),'Restrict RPC grants');
assert.ok(sql.includes('count(distinct upper(btrim(c.delivery_way_id)))'),'Count cross-ledger mismatches by distinct Way ID');
assert.ok(!/\b(update|delete from|insert into|truncate)\b/i.test(sql),'Finance dashboard RPC must be read-only');
console.log('Dual source finance dashboard regression PASS');
