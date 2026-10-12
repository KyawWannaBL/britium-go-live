const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {create,act}=require('react-test-renderer');
const source=fs.readFileSync('src/components/CreatedWayplanRevisionPlanner.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const stops=[{delivery_way_id:'TEST-1',latitude:16.85,longitude:96.19},{delivery_way_id:'TEST-2',latitude:16.86,longitude:96.20}];
async function scenario(vehicle='VAN1',routeSource='MAPBOX_FALLBACK',rows=stops,orderedRows=rows){
 let roadCalls=0,saved,autoCrews=0;
 const context={vehicles:[{id:vehicle,name:vehicle,operation_type:'DELIVERY',available:true}],drivers:[{id:'D1',name:'Driver',branch_code:'YGN'}],riders:[{id:'R1',name:'Rider',branch_code:'YGN'}],helpers:[{id:'H1',name:'Helper',branch_code:'YGN'}],busy:[],route_origins:{YANGON:{latitude:16.84,longitude:96.17}}};
 const client={auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},rpc:async(name,args)=>{
   if(name==='be_multi_van_context')return{data:context,error:null};
   assert.equal(name,'be_replace_created_wayplan_v46');saved=args.p_payload;return{data:{ok:true,replacement_wayplan_id:'REPLACEMENT',replaces_wayplan_id:'SOURCE'},error:null};
 }};
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,React,crypto:require('node:crypto').webcrypto,console,fetch:async()=>{roadCalls++;return{ok:true,json:async()=>({ok:true,source:routeSource,ordered_stops:orderedRows,estimated:routeSource==='DEFERRED_PROVIDER',distance_m:1000,duration_s:100,warning:routeSource==='DEFERRED_PROVIDER'?'Approximate budget fallback':null})};},require(name){
   if(name==='react'||name==='react/jsx-runtime')return require(name);
   if(name==='@/integrations/supabase/client')return{supabase:client};
   if(name==='@/lib/multiVanPlanner')return{assignCrews:plans=>{autoCrews++;return plans.map(p=>({...p,driver_code:'D1',rider_code:'R1',helper_code:'H1'}));}};
   if(name==='@/lib/myanmarAddressConverter')return{convertMyanmarTownshipToEnglish:v=>v};
   if(name==='@/components/FullVanRouteMap')return{__esModule:true,default:()=>null};
   throw Error(name);
 }});
 let tree;await act(async()=>{tree=create(React.createElement(module.exports.default,{sourceWayplan:{wayplan_id:'SOURCE',vehicle_code:vehicle,driver_code:'D1',rider_code:'R1',helper_code:'H1'},rows,region:'YANGON',onSaved:()=>{}}));});
 const text=x=>Array.isArray(x)?x.map(text).join(''):typeof x==='object'&&x?text(x.children):String(x??'');
 const button=predicate=>tree.root.findAllByType('button').find(b=>predicate(text(b.props.children)));
 await act(async()=>{await button(t=>t.includes('Optimize revised route')).props.onClick();});
 const approval=tree.root.findAllByType('input').find(n=>n.props.type==='checkbox');
 const reason=tree.root.findAllByType('input').find(n=>n.props.placeholder==='Mandatory operational reason');
 if(approval)await act(async()=>{approval.props.onChange({target:{checked:true}});reason.props.onChange({target:{value:'Approved low-volume review'}});});
 return{tree,button,text,get roadCalls(){return roadCalls;},get autoCrews(){return autoCrews;},get saved(){return saved;}};
}
(async()=>{
 let s=await scenario();let save=s.button(t=>t.includes('Save Revision'));
 assert.equal(save.props.disabled,false,'A valid Driver/Helper van revision can be saved');
 await act(async()=>{await save.props.onClick();});
 assert.equal(s.roadCalls,1,'Saving a reviewed route must not make a second paid routing request');
 assert.equal(s.saved.plan.driver_code,'D1');assert.equal(s.saved.plan.rider_code,null,'Van revisions must not require or submit a Rider');assert.equal(s.saved.plan.helper_code,'H1');assert.equal(s.autoCrews,0);
 await act(async()=>s.tree.unmount());
 s=await scenario('MOTORBIKE');save=s.button(t=>t.includes('Save Revision'));
 assert.equal(save.props.disabled,false,'Rider routes below 50 do not require van minimum approval');
 await act(async()=>{await save.props.onClick();});assert.equal(s.saved.plan.rider_code,'R1');assert.equal(s.saved.plan.driver_code,null);assert.equal(s.saved.plan.helper_code,null);
 await act(async()=>s.tree.unmount());
 s=await scenario('VAN1','DEFERRED_PROVIDER');save=s.button(t=>t.includes('Save Revision'));assert.equal(save.props.disabled,false,'The labelled budget estimate is a supported deferred route state');assert.match(s.text(s.tree.toJSON()),/Approximate budget fallback/);await act(async()=>{await save.props.onClick();});assert.equal(s.saved.plan.route.estimated,true);await act(async()=>s.tree.unmount());
 s=await scenario('VAN1','MAPBOX_FALLBACK',stops,[stops[0],stops[0]]);assert.equal(s.button(t=>t.includes('Save Revision')).props.disabled,true,'Duplicate optimizer stops must not become a saveable reviewed plan');assert.match(s.text(s.tree.toJSON()),/exactly once/);await act(async()=>s.tree.unmount());
 s=await scenario('VAN1','MAPBOX_FALLBACK',[{delivery_way_id:'MISSING',latitude:null,longitude:96.2}]);assert.equal(s.roadCalls,0,'Missing coordinates must not consume routing fees');await act(async()=>s.tree.unmount());
 console.log('PASS: reviewed revisions save without rerouting, vehicle-specific crew, Rider minimum exemption, labelled estimate and coordinate guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
