import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
const pageFile='src/pages/WarehousePendingParcelsPage.tsx';
const alertFile='src/components/WarehousePendingGlobalAlert.tsx';
const base={delivery_way_id:'D-AUDIT-001',inbound_scan_at:new Date(Date.now()-72*3600000).toISOString(),warehouse_scan_status:'WAREHOUSE_RECEIVED',dwell_hours:72};
const flatten=node=>node==null?'':typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(flatten).join(''):flatten(node.children);
async function mount(file,rows){
 let result={data:{ok:true,rows},error:null},interval;
 const module={exports:{}};
 const mockRequire=name=>{
  if(name.includes('supabase/client'))return {supabase:{rpc:async()=>{if(result instanceof Error)throw result;return result;},from:()=>({select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})})}};
  if(name==='@/contexts/AuthContext')return {useAuth:()=>({profile:{role:'warehouse'}})};
  if(name==='@/lib/portalRegistry')return {normalizeRole:v=>v};
  if(name==='@/components/parcel/ProviderTerritoryReview'||name==='@/components/parcel/ProviderTransferPanel')return {default:()=>null};
  if(name==='@/lib/providerTerritory')return {loadTerritoryLookup:async()=>new Map(),territoryProvider:()=>({code:'ROYAL EXPRESS',reason:'OUTSIDE_CORE_ROYAL',region:'Other',needsReview:false}),DEFAULT_PROVIDER_CODES:['BRITIUM','NPT BRANCH','MDY BRANCH','DK DELIVERY','ROYAL EXPRESS','H.TERMINAL DROP-OFF']};
  if(name==='@/lib/parcelReportExport')return {downloadParcelXlsx:async()=>{},openParcelPrintWindow:()=>null,renderParcelPdf:()=>{},fromMyanmarDay:()=>null,untilMyanmarDay:()=>null};
  if(name==='react-router-dom')return {Link:({children,...props})=>React.createElement('a',props,children)};
  if(name==='lucide-react')return new Proxy({},{get:()=>()=>null});
  return require(name);
 };
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:mockRequire,console,Date,window:{setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{}}},{filename:file});
 let renderer;await act(async()=>{renderer=Renderer.create(React.createElement(module.exports.default));});
 return {text:()=>flatten(renderer.toJSON()),refresh:async(next)=>{result=next;await act(async()=>{if(file===alertFile)await interval();else await renderer.root.findAllByType('button')[0].props.onClick();});},close:async()=>act(async()=>renderer.unmount())};
}
for(const dwell_hours of [null,'',-1]){
 test(`Warehouse page derives overdue age from inbound scan when dwell_hours=${JSON.stringify(dwell_hours)}`,async()=>{
  const view=await mount(pageFile,[{...base,dwell_hours}]);try{assert.match(view.text(),/48\+ HOURS OVERDUE/);}finally{await view.close();}
 });
 test(`Global Warehouse alert derives overdue age when dwell_hours=${JSON.stringify(dwell_hours)}`,async()=>{
  const view=await mount(alertFile,[{...base,dwell_hours}]);try{assert.match(view.text(),/WAREHOUSE ALERT: 1 pending parcel/);}finally{await view.close();}
 });
}
test('Global Warehouse alert excludes parcels already dispatched to the field',async()=>{
 const row={...base,dispatch_workflow_stage:'DISPATCHED_TO_FIELD',return_attempt_count:1};
 const alert=await mount(alertFile,[row]),page=await mount(pageFile,[row]);
 try{assert.doesNotMatch(page.text(),/D-AUDIT-001/);assert.equal(alert.text(),'');}finally{await alert.close();await page.close();}
});
for(const file of [pageFile,alertFile]){
 test(`${file} retains existing pending rows after an application failure`,async()=>{
  const view=await mount(file,[base]);
  try{await view.refresh({data:{ok:false,error:'Warehouse temporarily unavailable'},error:null});assert.match(view.text(),file===pageFile?/D-AUDIT-001/:/WAREHOUSE ALERT: 1 pending parcel/);if(file===pageFile)assert.match(view.text(),/Warehouse temporarily unavailable/);}finally{await view.close();}
 });
}

for(const file of [pageFile,alertFile]){
 test(`${file} retains overdue rows after a rejected transport request`,async()=>{
  const view=await mount(file,[base]);
  try{await view.refresh(new Error('Warehouse network disconnected'));assert.match(view.text(),file===pageFile?/D-AUDIT-001/:/WAREHOUSE ALERT: 1 pending parcel/);}finally{await view.close();}
 });
}

test('territory provider defaults classify all three direct territories, Royal and gate without manual review',()=>{
 const module={exports:{}};
 const source=fs.readFileSync('src/lib/providerTerritory.ts','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:(name)=>{
  if(name==='@/integrations/supabase/client')return {supabase:{}};
  return require(name);
 },console});
 const {territoryProvider,normalizeTownship}=module.exports;
 const lookup=new Map([
  [normalizeTownship('လှိုင်'),'Yangon'],
  [normalizeTownship('ချမ်းမြသာစည်'),'Mandalay'],
  [normalizeTownship('လယ်ဝေး'),'Naypyitaw'],
  [normalizeTownship('တပ်ကုန်း'),'Naypyitaw'],
  [normalizeTownship('မော်လမြိုင်'),'Mon'],
 ]);
 for(const [value,expected] of [
  ['လှိုင်','BRITIUM'],
  ['ချမ်းမြသာစည်','MDY BRANCH'],
  ['မန္တလေး','MDY BRANCH'],
  ['လယ်ဝေး','NPT BRANCH'],
  ['တပ်ကုန်း','NPT BRANCH'],
  ['နေပြည်တော်','NPT BRANCH'],
  ['မော်လမြိုင်','ROYAL EXPRESS'],
  ['မုံရွာ (Royal)','ROYAL EXPRESS'],
  ['ဂိတ်ချ','H.TERMINAL DROP-OFF'],
  ['MDY-L01-A1 · ထုံးဘို · 8000 MMK','MDY BRANCH']
 ]){
  const got=territoryProvider(value,null,lookup);
  assert.equal(got.code,expected,value+' provider auto classification');
  assert.equal(got.needsReview,false,value+' should not need review');
 }
});
