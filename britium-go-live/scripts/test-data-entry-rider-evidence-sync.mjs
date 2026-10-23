import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import test from 'node:test';

const page=fs.readFileSync(new URL('../src/pages/DataEntryFinancialV2Page.tsx',import.meta.url),'utf8');
const photoPage=fs.readFileSync(new URL('../src/pages/DataEntryPhotoCheckPage.tsx',import.meta.url),'utf8');
function parse(source){return ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);}
function transpile(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS}}).outputText;}
function findFunction(name,source=page){let found;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n;ts.forEachChild(n,walk);}walk(parse(source));assert.ok(found,`Actual production function ${name}`);return transpile(found.getText());}
function production(name,env,source=page){return Function(...Object.keys(env),findFunction(name,source)+`;return ${name};`)(...Object.values(env));}
function effectContaining(fragment){let found;function walk(n){if(ts.isCallExpression(n)&&n.expression.getText()==='useEffect'&&n.getText().includes(fragment))found=n;ts.forEachChild(n,walk);}walk(parse(page));assert.ok(found);return transpile(found.getText());}
const bufferedModule={exports:{}};
Function('require','module','exports',ts.transpileModule(fs.readFileSync(new URL('../src/components/BufferedDataEntryInput.tsx',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText)(createRequire(import.meta.url),bufferedModule,bufferedModule.exports);
const BufferedInput=bufferedModule.exports.default;
const text=v=>String(v??'').trim(),positiveInt=v=>Math.max(0,parseInt(v)||0);
const fresh={id:'verification-uuid',pickup_id:'P',parcel_sequence:1,actual_weight_kg:5,parcel_weight_kg:5,proof_photo_url:'new-photo',proof_check_status:'PENDING_REVIEW',verification_status:'PENDING_REVIEW'};
function workspaceEnv(draft,authoritative=fresh,otherSources={}){
 const env={text,positiveInt,num:v=>Number(v)||0,AMOUNT_TYPES:['ITEM_PRICE_PLUS_DECLARED_DELIVERY'],defaultAmountEntryType:()=> 'ITEM_PRICE_PLUS_DECLARED_DELIVERY',requestedParcelCount:()=>1,authorizedParcelCount:()=>1,canonicalWayId:(p,n)=>`${p}-${n}`,displayPhotoUrl:async s=>s,money:String,tariffOptions:[],resolveDataEntryServiceProvider:()=>({providerCode:''}),routeForRow:()=>({}),routingPatch:()=>({}),validMyanmarCoordinate:()=>false,console:{info(){},warn(){}},supabase:{rpc:async name=>({data:name==='be_delivery_location_batch_v10'?[]:{registered:false},error:null}),from:name=>{const q={select(){return q},eq(){return q},order(){return q},then(resolve){return Promise.resolve({error:null,data:name==='be_pickup_parcel_verifications'?[authoritative]:name==='be_data_entry_pending_drafts'&&draft?[draft]:(otherSources[name]||[])}).then(resolve);}};return q;}}};
 for(const name of ['proofUrl','parcelRowFromProof','mergePickupEvidence']) {try{env[name]=production(name,env);}catch(e){if(name!=='mergePickupEvidence')throw e;}}
 return env;
}
const pickup={pickup_id:'P',merchant_id:'M'};
test('latest Rider evidence supersedes cached draft approval/photo and unedited weight',async()=>{
 const env=workspaceEnv({parcel_sequence:1,skipped:false,snapshot:{proof_url:'old-photo',proof_ref:'old-photo',weight_kg:1,photoReviewStatus:'APPROVED',photoReviewed:true,recipient_name:'Unsaved receiver',item_price:123}});
 const result=await production('fetchPickupWorkspace',env)(pickup);
 assert.equal(result.rows[0].proof_url,'new-photo');assert.equal(result.rows[0].photoReviewed,false);assert.equal(result.rows[0].photoReviewStatus,'PENDING_REVIEW');assert.equal(result.rows[0].weight_kg,5);
 assert.equal(result.rows[0].recipient_name,'Unsaved receiver');assert.equal(result.rows[0].item_price,123);
});
test('an explicit operator weight edit is preserved while refreshed Rider evidence replaces review fields',async()=>{
 const env=workspaceEnv({parcel_sequence:1,skipped:false,snapshot:{proof_url:'old-photo',weight_kg:3,evidenceWeightKg:1,photoReviewed:true,photoReviewStatus:'APPROVED',recipient_name:'Unsaved receiver'}});
 const result=await production('fetchPickupWorkspace',env)(pickup);
 assert.equal(result.rows[0].proof_url,'new-photo');assert.equal(result.rows[0].photoReviewed,false);assert.equal(result.rows[0].weight_kg,3);assert.equal(result.rows[0].evidenceWeightKg,5);
});

// Execute the real selected-workspace effect and startup handler in a small React host.
// Mock only data boundaries and presentation; React decides whether the effect reruns.
async function workspaceHost(){
 let refresh,emit,loads=0,active='P',rows=[],held,pageResets=0;
 const env=workspaceEnv();
 const channel={on(event,filter,callback){if(filter.table==='be_pickup_parcel_verifications')emit=callback;return channel;},subscribe(){return channel;}};
 const base={...env,normalizePickup:r=>r,envelope:data=>({ok:true,raw:data,data}),envelopeMessage:()=>'',BULK_UPLOAD_PICKUP_ID:'BULK',bulkImportDrafts:{},setMessage(){},setLoading(){},setTariffOptions(){},setProviderOptions(){},setMutationMode(){},setPickups(){},setPageIndex(){pageResets++;},setTierAccess(){},setRowsPickupId(){},setLoadingRows(){},loadStaffProgress(){},progressDate:'2026-10-20',window:{setTimeout:fn=>{fn();return 1;},clearTimeout(){}},console:{warn(){},error(){}}};
 const rpc=async name=>({error:null,data:name==='be_data_entry_pickup_list_web_v16'?[pickup]:{}});
 base.supabase={...env.supabase,rpc,channel:()=>channel,removeChannel(){},from:()=>{const q={select(){return q},not(){return q},in(){return q},order(){return q},range(){return Promise.resolve({data:[],error:null});}};return q;}};
 function Host(){
  const workspaceLoadRevision=React.useRef(0);const [loadingRows,setLoadingRows]=React.useState(false);const [id,setId]=React.useState('P');const [token,setToken]=React.useState(0);const [state,setState]=React.useState([]);rows=state;active=id;
  const current={...base,workspaceLoadRevision,setLoadingRows,selectedPickupId:id,selectedPickup:pickup,bulkUploadSelected:false,rows:state,rowsPickupId:'P',setRows:setState,setSelectedPickupId:setId,setEvidenceReloadToken:setToken,evidenceReloadToken:token,fetchPickupWorkspace:async()=>{loads++;if(held)return held.promise;return{tierAccess:{},rows:[{pickup_id:'P',parcel_sequence:1,recipient_name:'Existing',proof_url:`photo-${loads}`,weight_kg:loads}]};}};
  current.loadPickupRows=production('loadPickupRows',current);
  refresh=production('loadStartup',current);
  Function(...Object.keys(current),'useEffect',effectContaining('setPageIndex(0)'))(...Object.values(current),React.useEffect);
  Function(...Object.keys(current),'useEffect',effectContaining('const draft=bulkImportDrafts[selectedPickupId]'))(...Object.values(current),React.useEffect);
  Function(...Object.keys(current),'useEffect',effectContaining('data-entry-staff-progress-v98'))(...Object.values(current),React.useEffect);
  return loadingRows?React.createElement('span',null,'Loading'):React.createElement(BufferedInput,{value:state[0]?.recipient_name||'Existing',onCommit:value=>setState(current=>current.map(row=>({...row,recipient_name:value})))});
 }
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(Host));});
 return{refresh:()=>act(async()=>{await refresh();}),emit:()=>act(async()=>{assert.ok(emit,'Rider verification changes must be subscribed');emit({new:{pickup_id:'P'}});}),type:value=>act(()=>view.root.findByType('input').props.onChange({target:{value}})),field:()=>view.root.findByType('input').props.value,holdNext:()=>{held=pending();},release:()=>act(async()=>{held.resolve({tierAccess:{},rows:[{pickup_id:'P',parcel_sequence:1,recipient_name:'Existing',proof_url:'latest',weight_kg:5}]});}),pageResets:()=>pageResets,loads:()=>loads,rows:()=>rows,active:()=>active,close:()=>act(()=>view.unmount())};
}
test('manual Refresh reloads evidence when the selected pickup remains unchanged',async()=>{const ui=await workspaceHost();assert.equal(ui.loads(),1);await ui.refresh();assert.equal(ui.active(),'P');assert.equal(ui.loads(),2);ui.close();});
test('Rider verification changes reload the selected workspace',async()=>{const ui=await workspaceHost();await ui.emit();assert.equal(ui.loads(),2);ui.close();});

test('photo queue includes modern Rider rows even when legacy review rows exist',async()=>{
 let rows;
 const sources={be_parcel_photo_reviews:[{id:'legacy',pickup_id:'OLD',parcel_sequence:1,current_photo_url:'old',review_status:'APPROVED'},{id:'stale',pickup_id:'P',parcel_sequence:1,current_photo_url:'stale',review_status:'APPROVED'}],be_pickup_parcel_verifications:[fresh]};
 const env={setLoading(){},setLoadFailed(){},setMessage(){},setRows:v=>{rows=v;},t:v=>v,parcelNo:production('parcelNo',{},photoPage),getPhoto:production('getPhoto',{},photoPage),supabase:{from:name=>{const q={select(){return q},order(){return q},limit:async()=>({data:sources[name]||[],error:null})};return q;}}};
 await production('load',env,photoPage)();
 const current=rows.find(r=>r.pickup_id==='P');assert.ok(current);assert.equal(current.current_photo_url||current.proof_photo_url,'new-photo');assert.equal(current.review_status||current.proof_check_status,'PENDING_REVIEW');assert.equal(rows.length,2);
});

function pending(){let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise};}
test('late workspace response cannot replace a newer selected pickup',async()=>{
 const a=pending(),b=pending();let rows=[],rowsPickupId;
 const env={workspaceLoadRevision:{current:0},setLoadingRows(){},setMessage(){},setTierAccess(){},setRows:update=>{rows=typeof update==='function'?update(rows):update;},setRowsPickupId:id=>rowsPickupId=id,fetchPickupWorkspace:p=>p.pickup_id==='A'?a.promise:b.promise,mergePickupEvidence:production('mergePickupEvidence',{})};
 const load=production('loadPickupRows',env);const first=load({pickup_id:'A'}),second=load({pickup_id:'B'});
 b.resolve({tierAccess:{},rows:[{pickup_id:'B',parcel_sequence:1,proof_url:'B'}]});await second;
 a.resolve({tierAccess:{},rows:[{pickup_id:'A',parcel_sequence:1,proof_url:'A'}]});await first;
 assert.equal(rows[0].pickup_id,'B');assert.equal(rowsPickupId,'B');
});
test('failed refresh preserves the current unsaved workspace',async()=>{
 let rows=[{pickup_id:'P',recipient_name:'Unsaved receiver'}],message;
 const load=production('loadPickupRows',{workspaceLoadRevision:{current:0},setLoadingRows(){},setMessage:v=>message=v,setTierAccess(){},setRows:update=>{rows=typeof update==='function'?update(rows):update;},setRowsPickupId(){},fetchPickupWorkspace:async()=>{throw new Error('offline');}});
 await load(pickup);assert.equal(rows[0].recipient_name,'Unsaved receiver');assert.equal(message,'offline');
});
test('in-memory refresh updates evidence while preserving unsaved recipient and explicit weight edits',async()=>{
 let rows=[{pickup_id:'P',parcel_sequence:1,recipient_name:'Unsaved receiver',weight_kg:3,evidenceWeightKg:1,proof_url:'old-photo',photoReviewed:true,saved:false}];
 const load=production('loadPickupRows',{workspaceLoadRevision:{current:0},setLoadingRows(){},setMessage(){},setTierAccess(){},setRows:update=>{rows=typeof update==='function'?update(rows):update;},setRowsPickupId(){},fetchPickupWorkspace:async()=>({tierAccess:{},rows:[{...fresh,weight_kg:5,evidenceWeightKg:5,proof_url:'new-photo',photoReviewed:false,saved:false}]}),mergePickupEvidence:production('mergePickupEvidence',{})});
 await load(pickup);assert.equal(rows[0].recipient_name,'Unsaved receiver');assert.equal(rows[0].weight_kg,3);assert.equal(rows[0].proof_url,'new-photo');assert.equal(rows[0].photoReviewed,false);
});
test('photo decision application failure cannot announce success or fall back to unsynchronized table writes',async()=>{
 let messages=[],updates=0,reloads=0;
 const decide=production('decide',{parcelNo:production('parcelNo',{},photoPage),reason:'BLURRY_IMAGE',note:'Unreadable',localStorage:{getItem:()=> 'reviewer'},setLoading(){},setMessage:v=>messages.push(v),setRejecting(){},setNote(){},setReason(){},load:async()=>{reloads++;},supabase:{rpc:async()=>({data:{ok:false,error:'verification missing'},error:null}),from(){updates++;return{update(){return{eq:async()=>({error:null})}}};}}},photoPage);
 await decide({id:'row',pickup_id:'P',parcel_sequence:1},'REJECT');assert.equal(reloads,0);assert.equal(updates,0);assert.match(messages.at(-1),/Photo decision failed: verification missing/);
});
test('failed photo decision RPC cannot create a divergent legacy-only rejection',async()=>{
 let updates=0,message;
 const decide=production('decide',{parcelNo:production('parcelNo',{},photoPage),reason:'BLURRY_IMAGE',note:'',localStorage:{getItem:()=> 'reviewer'},setLoading(){},setMessage:v=>message=v,setRejecting(){},setNote(){},setReason(){},load:async()=>{},supabase:{rpc:async()=>({error:{message:'review service unavailable'}}),from(){updates++;return{update(){return{eq:async()=>({error:null})}}};}}},photoPage);
 await decide({id:'legacy',pickup_id:'P',parcel_sequence:1},'REJECT');assert.equal(updates,0);assert.match(message,/Photo decision failed: review service unavailable/);
});

test('empty authoritative photo and cleared review fields cannot revive stale legacy proof',async()=>{
 const env=workspaceEnv(null,{...fresh,proof_photo_url:null,proof_photo_path:null,review_note:null}, {be_v_data_entry_parcel_proofs:[{pickup_id:'P',parcel_sequence:1,proof_photo_url:'obsolete-photo',review_note:'obsolete rejection',review_status:'APPROVED'}]});
 const result=await production('fetchPickupWorkspace',env)(pickup);
 assert.equal(result.rows[0].proof_url,'');assert.equal(result.rows[0].photo_status,'PENDING_REVIEW');assert.equal(result.rows[0].photoRejectionNote,'');
});

test('typing into the actual buffered editor survives pending realtime evidence refresh without resetting page',async()=>{
 const ui=await workspaceHost();await ui.type('Uncommitted typing');ui.holdNext();await ui.emit();
 assert.equal(ui.field(),'Uncommitted typing');assert.equal(ui.pageResets(),1);
 await ui.release();assert.equal(ui.field(),'Uncommitted typing');ui.close();
});

const warehousePage=fs.readFileSync(new URL('../src/pages/WarehouseLifecyclePage.tsx',import.meta.url),'utf8');
async function warehouseHost(modern=true){
 let latest={...fresh,proof_check_status:'REUPLOAD_REQUIRED',review_note:'BLURRY_IMAGE: label unclear'},rpcCalls=0;
 const require=createRequire(import.meta.url),module={exports:{}};
 const supabase={rpc:async()=>{rpcCalls++;return{data:{ok:true}};},from:name=>{const q={select(){return q},in(){return q},order(){return q},limit:async()=>({data:name==='be_pickup_parcel_verifications'?(modern?[latest]:[]):[{id:'legacy-review-uuid',pickup_id:'P',parcel_sequence:1,current_photo_url:'stale',review_status:'REUPLOAD_REQUIRED'}],error:null})};return q;}};
 const compiled=ts.transpileModule(warehousePage,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 Function('require','module','exports',compiled)(id=>id==='@/integrations/supabase/client'?{supabase}:id==='./WarehouseWayplanCenterPage'?{default:()=>null}:require(id),module,module.exports);
 let view;await act(async()=>{view=TestRenderer.create(React.createElement(module.exports.default));});
 return{view,text:()=>JSON.stringify(view.toJSON()),rpcCalls:()=>rpcCalls,pending:()=>{latest={...latest,proof_check_status:'PENDING_REVIEW',verification_status:'PENDING_REVIEW',proof_photo_url:'replacement'};},refresh:()=>act(async()=>{await view.root.findAllByType('button').find(b=>b.children.includes('Refresh')).props.onClick();}),close:()=>act(()=>view.unmount())};
}
test('Warehouse displays modern rejection with Rider action and cannot send a verification UUID to legacy reupload RPC',async()=>{
 const ui=await warehouseHost();assert.match(ui.text(),/label unclear/);assert.match(ui.text(),/assigned Rider/i);
 assert.equal(ui.view.root.findAllByType('input').filter(n=>n.props.type==='file').length,0);assert.equal(ui.rpcCalls(),0);ui.close();
});
test('Rider replacement pending review removes Warehouse rework despite stale rejected legacy review',async()=>{
 const ui=await warehouseHost();ui.pending();await ui.refresh();assert.equal(ui.view.root.findAllByType('article').length,0);assert.match(ui.text(),/No rejected parcel-photo rework is waiting/);ui.close();
});
test('cached drafts cannot restore obsolete delivery identifiers over current Rider allocation',()=>{
 const merge=production('mergePickupEvidence',{});
 const row=merge({delivery_way_id:'old-synthetic',recipient_name:'Unsaved receiver'},{delivery_way_id:'D-CANONICAL',pickup_id:'P',parcel_sequence:1,weight_kg:5,evidenceWeightKg:5});
 assert.equal(row.delivery_way_id,'D-CANONICAL');assert.equal(row.recipient_name,'Unsaved receiver');
});

test('Warehouse legacy-only rejection retains its replacement file control',async()=>{
 const ui=await warehouseHost(false);assert.equal(ui.view.root.findAllByType('input').filter(n=>n.props.type==='file').length,1);assert.match(ui.text(),/Upload for Data Entry Review/);ui.close();
});
test('committed unsaved edits to a registered parcel survive fresh saved server row',async()=>{
 let rows=[{pickup_id:'P',parcel_sequence:1,delivery_way_id:'D-OLD',recipient_name:'Operator correction after blur',item_price:123,weight_kg:3,evidenceWeightKg:1,proof_url:'old-photo',photoReviewed:true,saved:false}];
 const load=production('loadPickupRows',{workspaceLoadRevision:{current:0},setLoadingRows(){},setMessage(){},setTierAccess(){},setRows:update=>{rows=typeof update==='function'?update(rows):update;},setRowsPickupId(){},fetchPickupWorkspace:async()=>({tierAccess:{},rows:[{...fresh,delivery_way_id:'D-CANONICAL',recipient_name:'Saved server recipient',item_price:99,weight_kg:5,evidenceWeightKg:5,proof_url:'new-photo',photoReviewed:false,saved:true}]}),mergePickupEvidence:production('mergePickupEvidence',{})});
 await load(pickup,true);assert.equal(rows[0].recipient_name,'Operator correction after blur');assert.equal(rows[0].item_price,123);assert.equal(rows[0].weight_kg,3);assert.equal(rows[0].saved,false);assert.equal(rows[0].delivery_way_id,'D-CANONICAL');assert.equal(rows[0].proof_url,'new-photo');assert.equal(rows[0].photoReviewed,false);
});
test('photo review cannot approve a modern row without current photo evidence',async()=>{
 let calls=0,message;
 const decide=production('decide',{getPhoto:production('getPhoto',{},photoPage),parcelNo:production('parcelNo',{},photoPage),reason:'',note:'',localStorage:{getItem:()=> 'reviewer'},setLoading(){},setMessage:v=>message=v,setRejecting(){},setNote(){},setReason(){},load:async()=>{},supabase:{rpc:async()=>{calls++;return{data:{ok:true}};}}},photoPage);
 await decide({id:'verification-uuid',pickup_id:'P',parcel_sequence:1,review_source:'VERIFICATION'},'APPROVE');assert.equal(calls,0);assert.match(message,/photo.*required/i);
});
