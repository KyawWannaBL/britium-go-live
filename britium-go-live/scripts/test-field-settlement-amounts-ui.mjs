import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
import React from 'react';import Renderer,{act} from 'react-test-renderer';import ts from 'typescript';
const require=createRequire(import.meta.url);
const rows=[1970500,1135000,937000,427500].map((amount,index)=>({id:`row-${index}`,wayplan_id:`WP-${index}`,opening_cod_amount:amount,expected_cod:0,actual_collected:0,cash_collected:0,digital_collected:0,variance_amount:0,total_ways:[20,20,11,9][index],delivered_ways:0,failed_ways:0,remaining_ways:[20,20,11,9][index],status:'OPEN'}));
const calls=[],cache=new Map();let responseRows=rows;
const rpc=async(name,args)=>{calls.push({name,args});assert.ok(!/sign_v1|clear_v1/.test(name),'rendering amounts must not sign or clear money');return {data:{ok:true,rows:name==='be_finance_field_settlement_center_v1'?responseRows:[]},error:null};};
function load(file){
 const resolved=path.resolve(file);if(cache.has(resolved))return cache.get(resolved).exports;
 const module={exports:{}};cache.set(resolved,module);
 const code=ts.transpileModule(fs.readFileSync(resolved,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:id=>{
  if(id==='@/integrations/supabase/client')return {supabase:{rpc}};
  if(id==='@/contexts/AuthContext')return {useAuth:()=>({role:'finance'})};
  if(id==='react-router-dom')return {Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)};
  if(id.startsWith('@/')||id.startsWith('.')){const base=id.startsWith('@/')?path.resolve('src',id.slice(2)):path.resolve(path.dirname(resolved),id);return load(['','.tsx','.ts','.mjs'].map(ext=>base+ext).find(p=>fs.existsSync(p)&&fs.statSync(p).isFile()));}
  return require(id);
 },Intl,Date,console,setTimeout,clearTimeout});return module.exports;
}
const finance=load('src/pages/EnterpriseLiveCenterPages.tsx').FinancePortalLivePage;
const field=load('src/pages/RiderSettlementPage.tsx').default;
function text(node){if(typeof node==='string'||typeof node==='number')return String(node);return (node.children||[]).map(text).join(' ');}
for(const Page of [finance,field]){
 let view;await act(async()=>{view=Renderer.create(React.createElement(Page));});
 const section=Page===finance?view.root.findAllByType('section').find(s=>s.findAllByType('h2').some(h=>h.props.id==='financial-settlement')):view.root;
 const output=text(section);
 for(const amount of ['1,970,500','1,135,000','937,000','427,500'])assert.ok(output.includes(amount),`Every settlement must show its expected amount (${amount}) while actual collection is zero`);
 assert.match(output,/Expected collection/);assert.match(output,/Awaiting delivery/);assert.match(output,/Pending delivery completion/);
 await act(async()=>view.unmount());
}
// A completed split collection displays recorded receipt values, not the route opening amount.
responseRows=[{...rows[0],wayplan_id:'WP-SPLIT',opening_cod_amount:100000,expected_cod:100000,actual_collected:100000,cash_collected:60000,digital_collected:40000,variance_amount:0,delivered_ways:20,remaining_ways:0,status:'READY_TO_SETTLE'}];
for(const Page of [finance,field]){
 let view;await act(async()=>{view=Renderer.create(React.createElement(Page));});const output=text(view.root);
 assert.match(output,/60,000/);assert.match(output,/40,000/);assert.match(output,/Recorded collection/);assert.doesNotMatch(output,/Awaiting delivery|Pending delivery completion|Delivery exceptions remain/);
 await act(async()=>view.unmount());
}
// Partial completion must not mistake the whole route amount for delivered COD due.
responseRows=[{...rows[0],opening_cod_amount:100000,expected_cod:25000,actual_collected:20000,cash_collected:12000,digital_collected:5000,variance_amount:-5000,delivered_ways:1,remaining_ways:3}];
for(const Page of [finance,field]){
 let view;await act(async()=>{view=Renderer.create(React.createElement(Page));});
 const output=text(view.root.find(n=>n.props['aria-label']==='Settlement amounts'));
 for(const value of ['100,000','25,000','20,000','12,000','5,000','Unclassified 3,000'])assert.ok(output.includes(value),value);
 assert.match(output,/Delivery exceptions remain/);assert.match(output,/collection reconciliation pending/);await act(async()=>view.unmount());
}
// Missing evidence stays unknown; a genuine zero-collection delivery stays zero.
for(const fixture of [
 {...rows[0],opening_cod_amount:null,expected_cod:null,actual_collected:null,cash_collected:null,digital_collected:null,variance_amount:null,delivered_ways:1,remaining_ways:0},
 {...rows[0],opening_cod_amount:0,expected_cod:0,actual_collected:0,cash_collected:0,digital_collected:0,variance_amount:0,delivered_ways:1,remaining_ways:0}
]){
 responseRows=[fixture];let view;await act(async()=>{view=Renderer.create(React.createElement(finance));});
 const output=text(view.root.find(n=>n.props['aria-label']==='Settlement amounts'));
 if(fixture.actual_collected===null){assert.match(output,/Not recorded/);assert.doesNotMatch(output,/0 MMK/);}
 else {assert.match(output,/0 MMK/);assert.doesNotMatch(output,/Not recorded|Awaiting delivery|Pending delivery completion|Pending Finance handover|awaiting rider/);}
 await act(async()=>view.unmount());
}
// Zero/missing collection with a positive amount due still needs reconciliation.
for(const collected of [0,null]){
 responseRows=[{...rows[0],opening_cod_amount:25000,expected_cod:25000,actual_collected:collected,cash_collected:collected,digital_collected:collected,delivered_ways:1,remaining_ways:0}];
 for(const Page of [finance,field]){
  let view;await act(async()=>{view=Renderer.create(React.createElement(Page));});
  const output=text(view.root.find(n=>n.props['aria-label']==='Settlement amounts'));
  assert.match(output,/25,000/);assert.match(output,/Pending Finance handover/);assert.match(output,/awaiting rider/);
  if(collected===null)assert.match(output,/Not recorded/);
  await act(async()=>view.unmount());
 }
}
console.log('PASS field settlement amounts: pending deliveries, split receipts, unknown amounts, genuine zero due and positive-due handover warnings on both real pages');
