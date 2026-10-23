import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import React from 'react';import Renderer,{act} from 'react-test-renderer';import ts from 'typescript';
const require=createRequire(import.meta.url),calls=[];let refreshes=0;let failingId=null;let ambiguousId=null;const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/warehouse/WarehouseReviewedBatch.tsx','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>id==='@/integrations/supabase/client'?{supabase:{rpc:async(name,args)=>{calls.push({name,args});if(name==='be_warehouse_inbound_scan'&&args.p_tracking_no===failingId){failingId=null;return{error:{message:'test failure'}};}return{data:name==='be_warehouse_resolve_scan_v3'?{ok:true,resolved_candidate_count:args.p_scan===ambiguousId?2:1,matches:[{canonical_id:args.p_scan}]}:{ok:true}}}}}:require(id)});
let view;await act(async()=>{view=Renderer.create(React.createElement(module.exports.default,{onChanged:async()=>refreshes++}))});
const buttons=()=>view.root.findAllByType('button');const button=text=>buttons().find(b=>String(b.props.children).includes(text));
assert.equal(buttons().some(b=>String(b.props.children).includes('Review inbound list')),true);
await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'D1022-SKF-013\nD1022-SKF-014\nD1022-SKF-013'}}));
await act(async()=>button('Review inbound list').props.onClick());assert.equal(calls.length,0,'Review must not scan');
assert.equal(button('Receive reviewed parcels').props.disabled,true,'Physical receipt confirmation is required');
await act(async()=>view.root.findByType('input').props.onChange({target:{checked:true}}));
await act(async()=>button('Receive reviewed parcels').props.onClick());
assert.deepEqual(calls.filter(c=>c.name==='be_warehouse_inbound_scan').map(c=>c.args.p_tracking_no),['D1022-SKF-013','D1022-SKF-014']);
assert.ok(calls.every(c=>!('p_actor_email' in c.args)),'Authenticated backend attributes the actor');assert.equal(refreshes,1);
await act(async()=>button('Mark reviewed parcels ready').props.onClick());
assert.deepEqual(calls.filter(c=>c.name==='be_warehouse_mark_delivery_ready_v150').map(c=>c.args.p_delivery_way_id),['D1022-SKF-013','D1022-SKF-014']);assert.equal(refreshes,2);
await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'D1022-SKF-999\nP1023-BBB-072'}}));
await act(async()=>button('Review inbound list').props.onClick());assert.equal(calls.length,6,'Invalid lists cannot send requests');assert.equal(button('Receive reviewed parcels'),undefined);

await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'D1022-SKF-023\nD1022-SKF-024'}}));
await act(async()=>button('Review inbound list').props.onClick());await act(async()=>view.root.findByType('input').props.onChange({target:{checked:true}}));
failingId='D1022-SKF-024';await act(async()=>button('Receive reviewed parcels').props.onClick());
assert.equal(button('Mark reviewed parcels ready').props.disabled,true,'Partial receipt cannot release all reviewed parcels');
const successfulFirst=calls.filter(c=>c.name==='be_warehouse_inbound_scan'&&c.args.p_tracking_no==='D1022-SKF-023').length;
await act(async()=>button('Receive reviewed parcels').props.onClick());assert.equal(calls.filter(c=>c.name==='be_warehouse_inbound_scan'&&c.args.p_tracking_no==='D1022-SKF-023').length,successfulFirst,'Retry skips committed successes');
await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'D1022-SKF-025'}}));await act(async()=>button('Review inbound list').props.onClick());await act(async()=>view.root.findByType('input').props.onChange({target:{checked:true}}));
ambiguousId='D1022-SKF-025';const before=calls.filter(c=>c.name==='be_warehouse_inbound_scan').length;await act(async()=>button('Receive reviewed parcels').props.onClick());assert.equal(calls.filter(c=>c.name==='be_warehouse_inbound_scan').length,before,'Resolver candidate count blocks ambiguity even with one chosen match');

await act(async()=>view.update(React.createElement(module.exports.default,{onChanged:async()=>refreshes++,receivedWayIds:['D1022-SKF-026','D1022-SKF-027']})));
await act(async()=>view.root.findByType('textarea').props.onChange({target:{value:'D1022-SKF-026\nD1022-SKF-027'}}));await act(async()=>button('Review inbound list').props.onClick());await act(async()=>view.root.findByType('input').props.onChange({target:{checked:true}}));
assert.equal(button('Receive reviewed parcels').props.disabled,true,'Reviewed scope uses persisted warehouse receipts after refresh');
assert.equal(button('Mark reviewed parcels ready').props.disabled,false,'Already received reviewed parcels can advance without rescanning');
await act(async()=>view.unmount());

console.log('PASS reviewed warehouse batch: exact scope, deduplication, receipt confirmation, authenticated actor, ready action, invalid-list block');
