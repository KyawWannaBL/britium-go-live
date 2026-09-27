const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const wp=fs.readFileSync(path.join(__dirname,"../src/pages/WayplanCommandCenterPage.tsx"),"utf8");
const wh=fs.readFileSync(path.join(__dirname,"../src/pages/WarehousePage.tsx"),"utf8");
const extract=(src,start,end)=>ts.transpile(src.slice(src.indexOf(start),src.indexOf(end,src.indexOf(start))),{target:ts.ScriptTarget.ES2020});
let calls=0,region="",error="";
const focus=new Function("selectedRegion","loadAll","setSelectedRegion","setError",extract(wp,"  function focusRegion(","  function toggleOne(")+";return focusRegion;")("YANGON",()=>calls++,x=>region=x,x=>error=x);
focus({region_code:"YANGON",is_active:true});assert.equal(calls,1);
focus({region_code:"MANDALAY",is_active:true});assert.equal(region,"MANDALAY");assert.equal(calls,1);
focus({region_code:"NAYPYITAW",display_name:"Naypyitaw",is_active:false});assert.match(error,/disabled/);
(async()=>{
let rpcCalls=0,refresh=0,message="",confirm=false;
const fn=new Function("loading","scanBusy","window","setLoading","supabase","loadAll","setMessage",extract(wh,"  const markReady =","  const closeDispatchDay =")+";return markReady;")(false,{current:false},{confirm:()=>confirm},()=>{}, {rpc:async(name,p)=>{assert.equal(name,"be_warehouse_mark_scanned_ready_v36");assert.equal(p.p_pickup_id,"P0911-BLK-289");rpcCalls++;return {data:{ok:true,ready_count:278}};}},async()=>refresh++,x=>message=x);
await fn("P0911-BLK-289");assert.equal(rpcCalls,0);
confirm=true;await fn("P0911-BLK-289");assert.equal(rpcCalls,1);assert.equal(refresh,1);assert.match(message,/278 parcels marked ready/);
let batchRpcCalls=0,batchRefresh=0,batchMessage="",batchConfirm=true,batchLoading=[];
const batchFn=new Function("loading","scanBusy","readyPickups","window","setLoading","supabase","loadAll","setMessage",extract(wh,"  const markAllReady =","  const closeDispatchDay =")+";return markAllReady;")(
  false,{current:false},["P1","P2","P3"],{confirm:()=>batchConfirm},x=>batchLoading.push(x),
  {rpc:async(name,p)=>{assert.equal(name,"be_warehouse_mark_scanned_ready_v36");batchRpcCalls++;if(p.p_pickup_id==="P2") return {data:{ok:false,message:"held exception"}};return {data:{ok:true,ready_count:p.p_pickup_id==="P1"?2:3}};}},
  async()=>batchRefresh++,x=>batchMessage=x
);
await batchFn();
assert.equal(batchRpcCalls,3);
assert.equal(batchRefresh,1);
assert.match(batchMessage,/2 of 3 pickup\(s\) marked ready/);
assert.match(batchMessage,/5 parcel\(s\)/);
assert.match(batchMessage,/P2/);
assert.deepEqual(batchLoading,[true,false]);
console.log("Queue refresh, disabled-region guard, readiness confirmation, individual RPC handoff and consolidated mark-all readiness passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
