const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'multi-van-'));
try {
 const source=fs.existsSync(path.join(__dirname,'multiVanPlanner.ts'))?__dirname:path.join(__dirname,'../src/lib');
 for(const name of ['multiVanPlanner','myanmarAddressConverter']){
   const result=ts.transpileModule(fs.readFileSync(path.join(source,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
   assert.equal(result.diagnostics.filter(d=>d.category===1).length,0);
   fs.writeFileSync(path.join(temp,name+'.js'),result.outputText);
 }
 const {allocateVans,assignCrews,sortStopsNearestFirst,distanceKm,PRACTICAL_MAX_PARCELS_PER_VAN}=require(path.join(temp,'multiVanPlanner.js'));
 const {convertMyanmarTownshipToEnglish:normalize}=require(path.join(temp,'myanmarAddressConverter.js'));
 const vehicles=Array.from({length:7},(_,i)=>({id:'V'+i,name:'Van'+i,capacity_kg:800}));
 const rows=n=>Array.from({length:n},(_,i)=>({delivery_way_id:'D'+i,township:['မြောက်ဒဂုံ','တောင်ဒဂုံ','ဒဂုံ','အရှေ့ဒဂုံ'][i%4],latitude:16.8+i%4/100,longitude:96.1+i%7/100,parcel_weight_kg:1}));
 for(const n of [1,49,50,75,76,99,100,149,150,152,191,216,289,500]){
   const p=allocateVans(rows(n),vehicles);
   assert.equal(p.flatMap(x=>x.rows).length,n);
   assert.equal(new Set(p.flatMap(x=>x.rows.map(r=>r.delivery_way_id))).size,n);
   assert.equal(p.length,Math.min(7,Math.max(1,Math.ceil(n/PRACTICAL_MAX_PARCELS_PER_VAN))));
   assert.ok(p.filter(x=>x.rows.length<50).length<=1);
   assert.ok(p.every(x=>x.rows.length<=PRACTICAL_MAX_PARCELS_PER_VAN));
 }
 assert.deepEqual(allocateVans(rows(152),vehicles).map(p=>p.rows.length),[51,51,50]);
 assert.throws(()=>allocateVans(rows(152),vehicles,1),/practical maximum/);
 assert.deepEqual(allocateVans(rows(216),vehicles,5).map(p=>p.rows.length),[50,50,50,50,16]);
 assert.throws(()=>allocateVans(rows(216),vehicles,6),/more than one/);
 assert.throws(()=>allocateVans([{delivery_way_id:'D',township:'ဒဂုံ'}],vehicles),/validated location/);
 assert.throws(()=>allocateVans(rows(2).concat(rows(1)),vehicles),/Duplicate/);
 assert.throws(()=>allocateVans(rows(10),[{id:'X',name:'X',capacity_kg:1}]),/capacities/);
 const p=[{vehicle_code:'V0',rows:rows(1),driver_code:'',helper_code:''}];
 const crew=assignCrews(p,[{id:'A',name:'A',zone:'South Dagon'},{id:'B',name:'B',zone:'North Dagon'}],[],normalize);
 assert.equal(crew[0].driver_code,'B');
 const disabled=allocateVans(rows(50),[{id:'X',name:'X',available:false},...vehicles]);assert.notEqual(disabled[0].vehicle_code,'X');
 const hq={latitude:16.8409,longitude:96.1735,label:'Yangon Head Office'};
 const near=[
  {delivery_way_id:'FAR',township:'A',latitude:17.05,longitude:96.30,parcel_weight_kg:1},
  {delivery_way_id:'NEAR',township:'A',latitude:16.842,longitude:96.175,parcel_weight_kg:1},
  {delivery_way_id:'MID',township:'A',latitude:16.90,longitude:96.20,parcel_weight_kg:1},
 ];
 assert.deepEqual(sortStopsNearestFirst(near,hq).map(x=>x.delivery_way_id),['NEAR','MID','FAR']);
 const hqPlan=allocateVans(rows(150),vehicles,3,hq);
 for(const plan of hqPlan){
   const d=plan.rows.map(r=>distanceKm(hq,{latitude:Number(r.latitude),longitude:Number(r.longitude)}));
   for(let i=1;i<d.length;i++) assert.ok(d[i]>=d[i-1]-1e-9,'HQ delivery order must be nearest-first within each van');
   const lifo=[...plan.rows].reverse();
   assert.equal(lifo[0].delivery_way_id,plan.rows[plan.rows.length-1].delivery_way_id);
   assert.equal(lifo[lifo.length-1].delivery_way_id,plan.rows[0].delivery_way_id);
 }
 assert.throws(()=>sortStopsNearestFirst(near,{latitude:NaN,longitude:96.1}),/origin/);
 console.log('PASS: pragmatic 50-75 parcel van band, 152=>51/51/50, one-short-van exception, all parcels preserved, territory crews, capacity, Yangon HQ nearest-first route and LIFO reversal.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
