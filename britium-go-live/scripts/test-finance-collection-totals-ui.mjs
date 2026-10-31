import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import React from 'react';import Renderer,{act} from 'react-test-renderer';import ts from 'typescript';
const require=createRequire(import.meta.url),file='src/components/finance/FinanceCollectionTotals.tsx',calls=[];
const helper={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/paymentAllocations.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:helper,exports:helper.exports});
let groundFails=false;
const rpc=async(name,args)=>{
 calls.push({name,args});
 if(name==='be_finance_ground_reconciliation_queue_v1')return groundFails?{error:{message:'Queue unavailable'},data:null}:{data:{ok:true,rows:[{sheet_date:'2026-10-20',delivery_way_id:'GROUND-ONLY',reported_final_cod:999999,reported_cash:null,reported_kpay:null,ledger_recorded_cod:null,review_state:'REVIEW_HOLD'}]},error:null};
 if(name==='be_finance_ground_reported_totals_v1')return {data:{ok:true,days:[],third_party_schedules:[]},error:null};
 assert.equal(name,'be_finance_collection_totals_v215','unknown or mutation RPC is forbidden');
 return {data:{ok:true,rows:[
  {service_date:'2026-10-20',unknown_count:0,collector_code:'R1',collector_name:'Rider 1',vehicle_code:'V1',vehicle_name:'Van 1',waybill_count:2,total_collected:50000,cash_collected:30000,digital_collected:20000,unclassified_collected:0,confirmed_total:0,pending_total:50000,by_method:{CASH:30000,KBZ_PAY:20000}},
  {service_date:null,unknown_count:148,collector_code:'UNKNOWN',collector_name:'Missing evidence',vehicle_code:'UNKNOWN',vehicle_name:'Missing evidence',waybill_count:148,total_collected:null,cash_collected:null,digital_collected:null,unclassified_collected:null,confirmed_total:null,pending_total:null,by_method:{}}
 ]},error:null};
};
const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>id==='@/integrations/supabase/client'?{supabase:{rpc}}:id==='@/lib/paymentAllocations'?helper.exports:require(id)});
const totalsCalls=()=>calls.filter(c=>c.name==='be_finance_collection_totals_v215');
const text=n=>typeof n==='string'||typeof n==='number'?String(n):(n.children||[]).map(text).join(' ');
const totalsTable=view=>view.root.findAllByType('table').find(t=>t.findAllByType('th').some(h=>text(h)==='Total (MMK)'));
let view;await act(async()=>{view=Renderer.create(React.createElement(module.exports.default,{refreshKey:0}));});
assert.deepEqual(totalsCalls().map(c=>({...c.args})),[{p_from:'2026-11-01',p_to:null,p_group:'PERSON'}]);
assert.equal(view.root.findAllByType('input')[0].props.value,'2026-11-01','current collections start at the November service opening');
assert.match(text(view.root.findByType('summary')),/Historical reconciliation evidence/);
assert.ok(!view.root.findByType('details').props.open,'historical reconciliation stays separate and collapsed');
let table=totalsTable(view),output=text(table);
for(const value of ['Unknown collection ways','148','Not recorded','KBZ Pay','Rider 1','30,000','50,000'])assert.ok(output.includes(value),value);
assert.ok(!output.includes('GROUND-ONLY')&&!output.includes('999,999'),'unverified ground schedules must not become recorded collection totals');
const dataRows=table.findByType('tbody').findAllByType('tr');
assert.equal(text(dataRows[0].findAllByType('td')[8]),'0','a recorded confirmed zero remains zero');
assert.equal(text(dataRows[1].findAllByType('td')[4]),'Not recorded','missing total remains unknown');
await act(async()=>view.root.findByType('select').props.onChange({target:{value:'VAN'}}));
assert.equal(totalsCalls().at(-1).args.p_group,'VAN');assert.match(text(totalsTable(view)),/Van 1/);
const dates=view.root.findAllByType('input');
await act(async()=>dates[0].props.onChange({target:{value:'2026-10-20'}}));
await act(async()=>dates[1].props.onChange({target:{value:'2026-10-22'}}));
assert.deepEqual({...totalsCalls().at(-1).args},{p_from:'2026-10-20',p_to:'2026-10-22',p_group:'VAN'});
const before=Object.fromEntries([...new Set(calls.map(c=>c.name))].map(name=>[name,calls.filter(c=>c.name===name).length]));
groundFails=true;await act(async()=>view.update(React.createElement(module.exports.default,{refreshKey:1})));
for(const name of Object.keys(before))assert.equal(calls.filter(c=>c.name===name).length,before[name]+1,'confirmation refreshes each independent read');
assert.match(text(view.root),/Queue unavailable/);assert.match(text(totalsTable(view)),/50,000/,'ground queue failure does not discard valid recorded totals');
const count=totalsCalls().length;
await act(async()=>dates[1].props.onChange({target:{value:'2026-10-19'}}));
assert.equal(totalsCalls().length,count,'invalid date range must not fetch totals');assert.match(text(view.root),/Start date must be on or before end date/);
await act(async()=>view.unmount());
console.log('PASS collection totals UI: independent read RPCs, person/van/date filters, unknown versus zero, ground separation, refresh and queue error isolation');
