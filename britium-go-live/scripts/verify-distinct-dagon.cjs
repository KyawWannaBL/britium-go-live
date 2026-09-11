const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'routing-check-'));
try {
 for(const name of ['distinctDagonTownship','postalCodeData','postalCodeResolver','myanmarAddressConverter','dataEntryServiceProviderRouting']){
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
 for(const [input,expected] of [
 ['ဒဂုံမြို့နယ်','ဒဂုံ'],['ဒဂုံမြို့သစ် (မြောက်ပိုင်း) မြို့နယ်','မြောက်ဒဂုံ'],
 ['ဒဂုံမြို့သစ် (တောင်ပိုင်း) မြို့နယ်','တောင်ဒဂုံ'],['ဒဂုံမြို့သစ် (အရှေ့ပိုင်း)မြို့နယ်','အရှေ့ဒဂုံ'],
 ['မြောက်ဒဂုံ','မြောက်ဒဂုံ'],['တောင်ဒဂုံ','တောင်ဒဂုံ'],['East Dagon','အရှေ့ဒဂုံ'],
 ['Dagon Myothit (Seikkan)','ဒဂုံဆိပ်ကမ်း']]) {
 const result=route(input,'',[],{}); assert.equal(result.township,expected,input); assert.equal(result.providerCode,'BRITIUM',input);
 }
 const helper=require(path.join(temp,'distinctDagonTownship.js')).distinctDagonTownship;
 assert.equal(helper('ဒဂုံ','မြောက်ဒဂုံမြို့နယ်'),'မြောက်ဒဂုံ');
 assert.equal(helper('','North Dagon Road'),null);
 console.log('PASS: address routing, explicit overrides, sender/road exclusion and region fallback.');
} finally {fs.rmSync(temp,{recursive:true,force:true});}

