const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const base=require('path').resolve(__dirname,'../src/pages')+'/';
const source=fs.readFileSync(base+'WarehousePage.tsx','utf8');
for(const file of ['WarehousePage.tsx','WaybillStudioPage.tsx','WarehouseOperationPage.tsx','WarehouseOperations.tsx']){
 const result=ts.transpileModule(fs.readFileSync(base+file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}});
 assert.equal(result.diagnostics.filter(d=>d.category===1).length,0,file);
}
const block=source.slice(source.indexOf('  const doScan ='),source.indexOf('  const closeDispatchDay'));
const js=ts.transpileModule(block,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function test(matches,kind='inbound',chosen){
 let calls=[],messages=[],choices; const busy={current:false};
 const rpc=async(name,args)=>{calls.push({name,args});return name==='be_warehouse_resolve_scan_v3'?{data:{matches}}:{data:{ok:true,attempt_count:2,rto:false}}};
 const fn=new Function('supabase','scanBusy','normalizeWarehouseScan','scanCode','setMessage','setLoading','actor','setScanChoices','reason','remark','setScanCode','loadAll',js+';return doScan;')({rpc},busy,s=>s,'D0909-KAL-172',s=>messages.push(s),()=>{},async()=> 'warehouse@example.test',s=>choices=s,'FAILED','',()=>{},async()=>{});
 await fn(kind,undefined,chosen);assert.equal(busy.current,false);return {calls,messages,choices};
}
(async()=>{
 const match={canonical_id:'P0911-BLK-289-289',waybill_no:'D0909-KAL-172',pickup_id:'P0911-BLK-289'};
 for(const kind of ['inbound','dispatch','return']){const r=await test([match],kind);assert.equal(r.calls[1].name,'be_warehouse_'+kind+'_scan');assert.equal(r.calls[1].args.p_tracking_no,match.canonical_id);assert.ok(r.messages.at(-1).includes(match.waybill_no));}
 const multi=await test([match,{...match,canonical_id:'another',pickup_id:'other'}]);assert.equal(multi.calls.length,1);assert.equal(multi.choices.matches.length,2);
 const selected=await test([],'dispatch',match);assert.equal(selected.calls.length,1);assert.equal(selected.calls[0].args.p_tracking_no,match.canonical_id);
 const absent=await test([]);assert.equal(absent.calls.length,1);assert.ok(absent.messages[0].includes('not found'));
 console.log('PASS: four TSX modules; original-ID resolution for inbound/dispatch/return; duplicate choice; missing-ID rejection; busy cleanup.');
})();
