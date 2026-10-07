// Removing validation, saving an expiring URL, or swallowing failures must fail these tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const path='src/lib/merchantSettlementReceipt.ts';
assert.ok(fs.existsSync(path),'receipt upload service is missing');
let uploads=[],uploadError=null,signError=null;
const client={auth:{getUser:async()=>({data:{user:{id:'USER1'}},error:null})},storage:{from:bucket=>({upload:async(path,file,options)=>{uploads.push({bucket,path,file,options});return {data:{path},error:uploadError};},getPublicUrl:path=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/'+bucket+'/'+path}}),createSignedUrl:async(path,expires)=>({data:signError?null:{signedUrl:'https://example.supabase.co/signed/'+path+'?token=temporary'},error:signError})})}};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod.exports,require:n=>n==='@/integrations/supabase/client'?{supabase:client}:require(n),URL,crypto:require('node:crypto').webcrypto});
const {uploadSettlementReceipt,resolveSettlementReceipt}=mod.exports;
(async()=>{
 await assert.rejects(()=>uploadSettlementReceipt({name:'bad.html',type:'text/html',size:10}),/JPG|PNG|PDF/);assert.equal(uploads.length,0);
 await assert.rejects(()=>uploadSettlementReceipt({name:'big.pdf',type:'application/pdf',size:10485761}),/10 MB/);assert.equal(uploads.length,0);
 await assert.rejects(()=>uploadSettlementReceipt({name:'empty.png',type:'image/png',size:0}),/empty/);
 const receipt=await uploadSettlementReceipt({name:'KBZ receipt.png',type:'image/png',size:300});
 assert.match(receipt.url,/^https:\/\/example.supabase.co\/storage\/v1\/object\/authenticated\/merchant-settlement-receipts\/USER1\/[a-f0-9-]+\.png$/);
 assert.ok(!receipt.url.includes('token='),'audit URL must not expire');assert.equal(receipt.filename,'KBZ receipt.png');assert.equal(uploads[0].options.upsert,false,'receipt cannot overwrite existing evidence');
 assert.match(await resolveSettlementReceipt(receipt.url),/token=temporary/);
 assert.equal(await resolveSettlementReceipt('https://external.test/receipt.pdf'),'https://external.test/receipt.pdf');
 uploadError={message:'Storage denied'};await assert.rejects(()=>uploadSettlementReceipt({name:'test.pdf',type:'application/pdf',size:10}),/Storage denied/);
 signError={message:'Access denied'};await assert.rejects(()=>resolveSettlementReceipt(receipt.url),/Access denied/);
 console.log('Receipt service PASS: file validation, immutable upload, permanent audit reference, private viewing and failures');
})().catch(e=>{console.error(e);process.exitCode=1});
