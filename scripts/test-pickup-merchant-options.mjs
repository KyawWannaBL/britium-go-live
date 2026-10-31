import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../britium-go-live/package.json',import.meta.url));
const {PGlite}=require('@electric-sql/pglite');
const React=require('react'),{act,create}=require('react-test-renderer'),ts=require('typescript');
const base=new URL('../',import.meta.url);
const db=new PGlite();
const fixtureOptions=[
 {value:'HMS',label:'HMS - Hla Mynttar Shin',merchant_name:'Hla Mynttar Shin',business_name:'လှမေတ္တာရှင်',sender_name:'လှမေတ္တာရှင်',search_names:['Hla Mynttar Shin','လှမေတ္တာရှင်'],address:'Master pickup address',phone:'099999999',township:'Thingangyun'},
 {value:'NEW',label:'NEW - Newly Created Merchant',merchant_name:'Newly Created Merchant',search_names:['Newly Created Merchant'],address:'New address'}
];
function text(n){return typeof n==='string'?n:(n?.children||[]).map(text).join('');}
async function harness(options=fixtureOptions){
 const calls=[],alerts=[];let available=options,loadError=null;
 const client={rpc:async(name,args)=>{calls.push({name,args});if(name==='be_get_merchants_dropdown'&&loadError){const error=loadError;loadError=null;return {error,data:null};}return {error:null,data:name==='be_get_merchants_dropdown'?{options:available}:{ok:true,pickup_id:'P1031-HMS-001'}};}};
 const compiled=ts.transpileModule(fs.readFileSync(new URL('britium-go-live/src/pages/PickupFormPage.tsx',base),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const exports={};Function('require','exports','alert','setTimeout',compiled)(n=>n==='@/integrations/supabase/client'?{supabase:client}:require(n),exports,s=>alerts.push(s),fn=>{fn();return 1;});
 let tree;await act(async()=>{tree=create(React.createElement(exports.default));});
 return {tree,calls,alerts,setOptions:v=>{available=v;},failOptions:()=>{loadError={message:"Merchant list network error"};},change:async(name,value)=>act(async()=>tree.root.findByProps({name}).props.onChange({target:{name,value}})),click:async(label)=>act(async()=>{const b=tree.root.findAllByType('button').find(n=>text(n).trim()===label);assert.ok(b,`button ${label} exists`);await b.props.onClick();}),close:async()=>act(async()=>tree.unmount())};
}
try{
 if(!process.argv.includes('--ui-only')){
  await db.exec(`create schema if not exists public;create role authenticated;
  create table public.merchant_master(merchant_code text,merchant_id text,merchant_name text,business_name text,sender_name text,business_type text,contact_person text,contact_phone text,default_pickup_phone text,sender_phone text,phone_primary text,phone_secondary text,address_line_2 text,standard_allowance_kg numeric,special_allowance_kg numeric,extra_per_kg_mmk numeric,contract_status text,default_pickup_address text,pickup_address text,sender_address text,address_line_1 text,address_en text,address_mm text,township text,city text,region_state text,region text,city_region text,payment_terms text,status text,merchant_status text,account_status text,customer_tier text,updated_at timestamptz,is_active bool default true,active bool default true,is_deleted bool default false);
  create table public.be_master_merchants(like public.merchant_master including defaults);
  insert into merchant_master(merchant_code,merchant_name,business_name,sender_name,default_pickup_address) values('HMS','Hla Mynttar Shin','လှမေတ္တာရှင်','လှမေတ္တာရှင်','Current address'),('NEW','Newly Created Merchant',null,null,'New address');
  insert into be_master_merchants(merchant_code,merchant_name,status) values('HMS','Old projected name','ACTIVE');
  insert into merchant_master(merchant_code,merchant_name,is_active,active,is_deleted,status) values('OFF','Inactive',false,true,false,'active'),('DEL','Deleted',true,true,true,'active'),('DIS','Disabled',true,true,false,'disabled'),('PAD','Disabled padded status',true,true,false,' inactive '),('DFT','Draft merchant',true,true,false,'draft'),('LEG','Active older record',null,true,false,'ACTIVE'),('ACT','Inactive flag',true,false,false,'active');`);
  const migration=process.env.PICKUP_OPTIONS_SQL?fs.readFileSync(process.env.PICKUP_OPTIONS_SQL,'utf8'):fs.readFileSync(new URL('supabase/migrations/20261031104500_canonical_pickup_merchant_options.sql',base),'utf8');
  await db.exec(migration);
  let result=(await db.query('select public.be_get_merchants_dropdown() result')).rows[0].result;
  assert.deepEqual(result.options.map(o=>o.value).sort(),['HMS','LEG','NEW'],'new canonical merchants appear without copying a projection');
  assert.deepEqual((await db.query('select public.be_customer_service_merchant_options() result')).rows[0].result.map(o=>o.value).sort(),['HMS','LEG','NEW'],'Customer Service includes explicit active records with an empty legacy flag');
  const hms=result.options.find(o=>o.value==='HMS');assert.equal(hms.merchant_name,'Hla Mynttar Shin');assert.ok(hms.search_names.includes('လှမေတ္တာရှင်'));assert.equal(hms.address,'Current address');
  await db.exec("insert into merchant_master(merchant_code,merchant_name)values('LATE','Created after initial load')");
  result=(await db.query('select public.be_get_merchants_dropdown() result')).rows[0].result;assert.ok(result.options.some(o=>o.value==='LATE'));assert.ok((await db.query('select public.be_customer_service_merchant_options() result')).rows[0].result.some(o=>o.value==='LATE'));
 }
 for(const query of ['HMS','Hla Mynttar Shin','လှမေတ္တာရှင်','HMS - Hla Mynttar Shin','Newly Created Merchant']){
  const h=await harness();try{await h.change('merchantSearch',query);await h.click('Submit Request');const sent=h.calls.find(c=>c.name==='be_submit_pickup_request');assert.ok(sent,`merchant ${query} can submit`);assert.equal(sent.args.p_payload.merchant_code,query==='Newly Created Merchant'?'NEW':'HMS');assert.equal(sent.args.p_payload.merchant_name,query==='Newly Created Merchant'?'Newly Created Merchant':'Hla Mynttar Shin');}finally{await h.close();}
 }
 const h=await harness([fixtureOptions[0]]);try{
  await h.change('merchantSearch','HMS');await h.change('address','Staff entered pickup address');h.setOptions(fixtureOptions);await h.click('Refresh merchants');
  assert.equal(h.tree.root.findByProps({name:'address'}).props.value,'Staff entered pickup address','refresh preserves entered details');
  await h.change('merchantSearch','Newly Created Merchant');await h.click('Submit Request');assert.equal(h.calls.find(c=>c.name==='be_submit_pickup_request').args.p_payload.merchant_code,'NEW');
 }finally{await h.close();}
 const failed=await harness();try{await failed.change('merchantSearch','HMS');await failed.change('address','Keep unsaved address');failed.failOptions();await failed.click('Refresh merchants');assert.equal(text(failed.tree.root.findByProps({role:'alert'})),'Merchant list network error');assert.equal(failed.tree.root.findByProps({name:'address'}).props.value,'Keep unsaved address');failed.setOptions([fixtureOptions[1]]);await failed.click('Refresh merchants');await failed.click('Submit Request');assert.equal(failed.calls.filter(c=>c.name==='be_submit_pickup_request').length,0,'removed merchant selection is unlinked after refresh');}finally{await failed.close();}
 const ambiguous=await harness([...fixtureOptions,{...fixtureOptions[0],value:'ALT',merchant_name:'Other merchant',label:'ALT - Other merchant'}]);try{await ambiguous.change('merchantSearch','လှမေတ္တာရှင်');await ambiguous.click('Submit Request');assert.equal(ambiguous.calls.filter(c=>c.name==='be_submit_pickup_request').length,0,'shared aliases never silently select the first merchant');}finally{await ambiguous.close();}
 console.log('PASS pickup merchants: live canonical additions, inactive/deleted exclusion, Myanmar/English/code linking, canonical submission, ambiguity rejection and refresh preserving drafts');
}catch(e){console.error(e);process.exitCode=1;}finally{await db.close();}
