const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'routing-check-'));
try {
 for(const name of ['postalCodeData','postalCodeResolver','myanmarAddressConverter','dataEntryServiceProviderRouting']){
  const input=fs.readFileSync(path.resolve(__dirname,'../src/lib',name+'.ts'),'utf8').replaceAll('@/lib/','./');
  const result=ts.transpileModule(input,{fileName:name+'.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  assert.equal(result.diagnostics.filter(d=>d.category===1).length,0);
  fs.writeFileSync(path.join(temp,name+'.js'),result.outputText);
 }
 const {resolveDataEntryServiceProvider:route}=require(path.join(temp,'dataEntryServiceProviderRouting.js'));
 const cases=[
  ['', '[Sender: Shop] 82 Street၊ မန္တလေး','DK DELIVERY'],
  ['', 'အမှတ် (၉၀)၊ မင်္ဂလာဒုံမြို့နယ်','BRITIUM'],
  ['', 'ကျေးရွာ၊ ဧရာဝတီတိုင်း','ROYAL EXPRESS'],
  ['', 'No 90, Mingaladon Township','BRITIUM'],
  ['Unknown','မန္တလေး',''],
  ['', '[Sender: Mandalay] unknown address',''],
  ['', 'Insein Road',''],
  ['', 'မန္တလေးတိုင်းဒေသကြီး',''],
  ['မင်္ဂလာဒုံ','မန္တလေး','BRITIUM']
 ];
 for(const [town,address,provider] of cases) assert.equal(route(town,address,[],{itemPrice:0}).providerCode,provider,address);
 assert.equal(route('','ဧရာဝတီတိုင်း',[],{}).township,'ဧရာဝတီတိုင်း');
 assert.equal(route('','မန္တလေး',[],{}).township,'မန္တလေး');
 console.log('PASS: address routing, explicit overrides, sender/road exclusion and region fallback.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
