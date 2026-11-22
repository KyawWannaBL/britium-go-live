import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const page=read("src/pages/FinancePortalPage.tsx");
const live=read("src/pages/EnterpriseLiveCenterPages.tsx");
const cashier=read("src/components/finance/DailyCashierSettlementPanel.tsx");
const events=read("src/components/finance/FinanceSettlementDayEvents.tsx");
for(const tab of ["overview","cashier","field","cod","reports","branches","controls"]){
 assert.match(page,new RegExp('id:"'+tab+'"'),"Missing guided finance tab: "+tab);
 assert.match(page,new RegExp('active==="'+tab+'"'),"Finance tab must render its own content: "+tab);
}
for(const x of ["role=\"tablist\"","role=\"tab\"","aria-selected","aria-controls","onTabKey","ArrowLeft","ArrowRight","Home","End"]){
 assert.ok(page.includes(x),"Accessible tab bar missing "+x);
}
assert.match(page,/setParams\(/,"Tab location must be shareable via URL");
assert.match(page,/DailyCashierSettlementPanel mode="finance"/,"Live cashier intake retained");
assert.match(page,/DailyCashierSettlementPanel mode="finance" readOnly/,"Reports must not add duplicate cashier submission");
assert.match(page,/FinanceSettlementDayEvents/,"Finance SETTLED-date report retained");
assert.match(page,/BranchFinanceOversight/,"Branch finance retained");
assert.match(page,/RiderWeightAmendmentReviews/,"Weight amendment review retained");
assert.match(page,/CorporateFinanceReviewPanel/,"Corporate tariff finance retained");
for(const section of ["overview","wayplans","cod"]){
 assert.ok(live.includes('section==="'+section+'"'),"Finance legacy section not isolated: "+section);
}
for(const x of ["Finance Sign","Clear Settlement","CodSettlementReview","FinanceCollectionTotals","LiveTable"]){
 assert.ok(live.includes(x),"Legacy operational function lost: "+x);
}
assert.match(cashier,/readOnly=false/,"Cashier needs reporting readOnly prop");
assert.match(cashier,/!readOnly&&mode==="finance"/,"Read-only reports cannot record cash");
for(const text of ["Today","Yesterday","Last 7 days","This month"]){
 assert.ok(cashier.includes(text)&&events.includes(text),"Report quick period missing: "+text);
}
assert.match(events,/renderParcelPdf/);
assert.match(events,/downloadParcelXlsx/);
console.log("PASS: Finance seven-tab accessible workflows, legacy actions, read-only reports, periods and exports");
