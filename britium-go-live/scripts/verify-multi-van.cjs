const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'multi-van-'));
try {
 const source=fs.existsSync(path.join(__dirname,'multiVanPlanner.ts'))?__dirname:path.join(__dirname,'../src/lib');
 for(const name of ['multiVanPlanner','myanmarAddressConverter']){
   const result=ts.transpileModule(fs.readFileSync(path.join(source,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
   assert.equal(result.diagnostics.filter(d=>d.category===1).length,0);
   fs.writeFileSync(path.join(temp,name+'.js'),result.outputText);
 }
 const {allocateVans,assignCrews}=require(path.join(temp,'multiVanPlanner.js'));
 const {convertMyanmarTownshipToEnglish:normalize}=require(path.join(temp,'myanmarAddressConverter.js'));
 const vehicles=Array.from({length:7},(_,i)=>({id:'V'+i,name:'Van'+i,capacity_kg:800}));
 const rows=n=>Array.from({length:n},(_,i)=>({delivery_way_id:'D'+i,township:['မြောက်ဒဂုံ','တောင်ဒဂုံ','ဒဂုံ','အရှေ့ဒဂုံ'][i%4],latitude:16.8+i%4/100,longitude:96.1+i%7/100,parcel_weight_kg:1}));
 for(const n of [1,49,50,99,100,149,150,191,216,289,500]){
   const p=allocateVans(rows(n),vehicles);
   assert.equal(p.flatMap(x=>x.rows).length,n);
   assert.equal(new Set(p.flatMap(x=>x.rows.map(r=>r.delivery_way_id))).size,n);
   assert.equal(p.length,Math.min(7,Math.max(1,Math.floor(n/50))));
   assert.ok(p.filter(x=>x.rows.length<50).length<=1);
 }
 assert.deepEqual(allocateVans(rows(216),vehicles,5).map(p=>p.rows.length),[50,50,50,50,16]);
 assert.throws(()=>allocateVans(rows(216),vehicles,6),/more than one/);
 assert.throws(()=>allocateVans([{delivery_way_id:'D',township:'ဒဂုံ'}],vehicles),/validated location/);
 assert.throws(()=>allocateVans(rows(2).concat(rows(1)),vehicles),/Duplicate/);
 assert.throws(()=>allocateVans(rows(10),[{id:'X',name:'X',capacity_kg:1}]),/capacities/);
 const p=[{vehicle_code:'V0',rows:rows(1),driver_code:'',helper_code:''}];
 const crew=assignCrews(p,[{id:'A',name:'A',zone:'South Dagon'},{id:'B',name:'B',zone:'North Dagon'}],[],normalize);
 assert.equal(crew[0].driver_code,'B');
 const disabled=allocateVans(rows(50),[{id:'X',name:'X',available:false},...vehicles]);assert.notEqual(disabled[0].vehicle_code,'X');
 console.log('PASS: minimum, one-short-van allocation, all parcels preserved, distinct townships, territory crew selection, unavailable vehicles and capacity.');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
