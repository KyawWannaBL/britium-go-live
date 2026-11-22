import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const sql=fs.readFileSync(path.resolve(root,"../sql/finance_settlement_date_events_v1_20261123.sql"),"utf8");
const panel=fs.readFileSync(path.join(root,"src/components/finance/FinanceSettlementDayEvents.tsx"),"utf8");
const page=fs.readFileSync(path.join(root,"src/pages/FinancePortalPage.tsx"),"utf8");
for(const [s,re,desc] of [
[sql,/f\.settled_at AT TIME ZONE 'Asia\/Yangon'/,"Myanmar finance settle time"],
[sql,/f\.settlement_status='SETTLED'/,"finance settled state"],
[sql,/be_finance_cashier_way_receipts_v1/,"cashier source"],
[sql,/be_wayplan_dispatch_stops/,"wayplan source"],
[sql,/be_data_entry_parcel_details/,"data entry source"],
[sql,/auth\.uid\(\) IS NULL/,"auth guarded"],
[sql,/('rider','driver','helper')/,"restricted by finance role"],
[sql,/REVOKE ALL ON FUNCTION public\.be_finance_daily_settled_events_v1/,"revoke public rpc"],
[panel,/be_finance_daily_settled_events_v1/,"new daily finance report"],
[panel,/downloadParcelXlsx/,"excel"],
[panel,/renderParcelPdf/,"pdf"],
[panel,/Cashier receipt not registered/,"cashier evidence not payment claim"],
[page,/<FinanceSettlementDayEvents\/>/,"Finance Portal integrated"]
]) assert.match(s,re,desc);
assert.doesNotMatch(sql,/UPDATE\s+(?:public\.)?be_finance_cod_settlements_v48/i,"no finance mutation");
assert.doesNotMatch(sql,/UPDATE\s+(?:public\.)?be_waybill_ledger/i,"no operational status mutation");
console.log("PASS: daily Finance settlement-date evidence report, filtered PDF/Excel and role boundaries");
