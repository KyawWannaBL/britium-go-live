import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const page=fs.readFileSync(path.join(root,'src/pages/DataEntryFinancialV2Page.tsx'),'utf8');
const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function extract(name){
  let found;
  function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,walk);}
  walk(ast);assert.ok(found,`Production function ${name} exists`);
  return ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
function production(name,env){return Function(...Object.keys(env),extract(name)+`;return ${name};`)(...Object.values(env));}
const text=v=>String(v??'').trim();
const row={pickup_id:'P1020-TEST-001',parcel_sequence:1,photoTemporaryWaiver:true,photoTemporaryWaiverReason:'None',photoReviewed:true,proof_ref:'',proof_url:'',calculation:{},recipient_name:'A',recipient_phone:'09123456789',delivery_address:'Address',photoBypassReason:''};
let calls=[],patches=[];
const env={rows:[row],selectedPickup:{pickup_id:row.pickup_id},tariffOptions:[],receiverQuoteMismatch:()=>null,updateRow:(i,p)=>patches.push(p),routeForRow:()=>({providerCode:'BRITIUM'}),handoffStationReady:()=>true,supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,persisted:true}};}},payload:r=>({pickup_id:r.pickup_id,parcel_sequence:r.parcel_sequence}),requestId:()=> 'test',envelope:v=>({ok:v.ok,data:{}}),envelopeMessage:()=>'',text,setPickups:()=>{}};
assert.equal(await production('saveRow',env)(0),true,'An audited skip must save without a stored photo reference');
assert.equal(calls[0]?.name,'be_data_entry_financial_v2_save','Skipped-photo save reaches server validation');
calls=[];patches=[];
assert.equal(await production('saveRow',{...env,rows:[{...row,photoTemporaryWaiver:false,photoReviewed:false}]})(0),false,'Missing photo without an audited reason is blocked');
assert.equal(calls.length,0);
calls=[];patches=[];
const toggle=production('togglePhotoWaiver',{rows:[row],updateRow:(i,p)=>patches.push(p),supabase:env.supabase,canonicalWayId:()=> 'D1020-TEST-001'});
await toggle(0,true);
assert.equal(calls.length,1,'A non-empty reason is sufficient, without an arbitrary minimum length');
assert.equal(calls[0].args.p_payload.reason,'None');
assert.equal(patches.at(-1).photoReviewStatus,'PHOTO_SKIPPED');
assert.doesNotMatch(patches.at(-1).message,/restore|temporary/i);
assert.match(patches.at(-1).message,/No photo upload is required later/);
calls=[];patches=[];
await production('togglePhotoWaiver',{rows:[{...row,photoTemporaryWaiverReason:'  '}],updateRow:(i,p)=>patches.push(p),supabase:env.supabase})(0,true);
assert.equal(calls.length,0,'Whitespace-only reasons never reach the server');
const proofEnv={text,num:v=>Number(v||0),positiveInt:v=>Math.max(0,parseInt(v)||0),AMOUNT_TYPES:['EXACT_COLLECTION_AMOUNT'],defaultAmountEntryType:()=> 'EXACT_COLLECTION_AMOUNT',canonicalWayId:()=> 'D1020-TEST-001',requestedParcelCount:()=>1};
const proofRow=production('parcelRowFromProof',proofEnv)({pickup_id:row.pickup_id},{},{raw_payload:{photo_skipped:true,photo_skip_reason:'None'},proof_check_status:'APPROVED'},1);
assert.equal(proofRow.photoTemporaryWaiver,true,'Permanent reason-only skip survives reopening from database');
assert.equal(proofRow.photoTemporaryWaiverReason,'None');
assert.equal(proofRow.photoReviewStatus,'PHOTO_SKIPPED');
assert.doesNotMatch(page,/Temporarily Skip Photo Verification|Temporary photo-verification waiver active|restore normal verification when order pickers are available/i);
assert.match(page,/No photo upload is required later/);
console.log('PASS: reason-only photo skip save, required reason, and reload regression checks');
