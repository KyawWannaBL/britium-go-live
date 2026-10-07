// Run with: node scripts/verify-merchant-settlement-v200.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {create, act} = require('react-test-renderer');
let calls = [], snapshot;
const source = fs.readFileSync('src/pages/MerchantSettlementPage.tsx', 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2020}}).outputText;
let uploadReply, uploadPending;
const client={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='be_finance_settlement_snapshot_v3'?snapshot:{ok:true},error:null};},auth:{getUser:async()=>({data:{user:{id:'USER1'}},error:null})},storage:{from:bucket=>({upload:async()=>uploadPending||uploadReply||{data:{path:'receipt.png'},error:null},getPublicUrl:path=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/'+bucket+'/'+path}}),createSignedUrl:async()=>({data:{signedUrl:'https://example.supabase.co/signed'},error:null})})}};
function loadLocal(path){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m.exports,require:localRequire,URL,crypto:require('node:crypto').webcrypto,console});return m.exports;}
function localRequire(name){if(name==='@/integrations/supabase/client')return {supabase:client};if(name.startsWith('@/lib/'))return loadLocal('src/lib/'+name.slice(6)+'.ts');if(name.startsWith('@/components/'))return loadLocal('src/components/'+name.slice(13)+'.tsx');return require(name);}
const mod = {exports:{}};
vm.runInNewContext(compiled, {exports:mod.exports, require:localRequire, crypto:require('node:crypto').webcrypto, console, URL, setTimeout, clearTimeout});
const Page = mod.exports.default;
const text = n => typeof n==='string'?n:(n?.children||[]).map(text).join('');
function fixture(role='SUPERADMIN') { return {scope:{role},wallet:{britium_owes:30000,paid_amount:20000,owes_britium:0},rows:[{parcel_id:'P1',delivery_way_id:'WAY1',merchant_id:'TSW',status:'DELIVERED',validation_status:'OK',settlement_eligible:true,merchant_final_settlement_amount:50000},{parcel_id:'P2',delivery_way_id:'WAY2',merchant_id:'TSW',status:'DELIVERED',validation_status:'OK',settlement_eligible:false,settlement_state:'WAITING_COD_REMITTANCE'}],batches:[{id:'B1',batch_number:'BATCH1',merchant_id:'TSW',status:'PARTIALLY_PAID',batch_net_payable:50000,paid_amount:20000,outstanding_amount:30000}],payments:[]}; }
async function render(role) { calls=[];snapshot=fixture(role);let tree;await act(async()=>{tree=create(React.createElement(Page));});return tree; }
const button = (tree,prefix)=>tree.root.findAllByType('button').find(n=>text(n).startsWith(prefix));
const input = (tree,label)=>tree.root.findAllByType('label').find(n=>text(n).startsWith(label)).findByType('input');
async function change(node,value) { await act(async()=>node.props.onChange({target:{value}})); }
(async()=>{
 let tree=await render();
 assert.equal(tree.root.findByProps({'aria-label':'Select WAY1'}).props.disabled,false);
 assert.equal(tree.root.findByProps({'aria-label':'Select WAY2'}).props.disabled,true);
 await act(async()=>tree.root.findByProps({'aria-label':'Select WAY1'}).props.onChange());
 await act(async()=>button(tree,'Create draft batch').props.onClick());
 assert.deepEqual(JSON.parse(JSON.stringify(calls.find(c=>c.name==='be_finance_create_settlement_batch_v3').args.p_parcel_ids)),['P1']);
 await change(tree.root.findByProps({'aria-label':'Payment amount BATCH1'}),'30001');
 await change(input(tree,'Transfer / receipt reference'),'REF1');
 await change(input(tree,'Beneficiary bank'),'Merchant bank');
 await change(input(tree,'Receipt / evidence'),'https://example.test/receipt');
 assert.equal(button(tree,'Record ').props.disabled,true,'overpayment blocked');
 await change(tree.root.findByProps({'aria-label':'Payment amount BATCH1'}),'10000');
 await change(input(tree,'Receipt / evidence'),'http://example.test/receipt');
 assert.equal(button(tree,'Record ').props.disabled,true,'HTTPS evidence required');
 await change(input(tree,'Receipt / evidence'),'https://example.test/receipt');
 assert.equal(button(tree,'Record ').props.disabled,false);
 const send=button(tree,'Record ').props.onClick;
 await act(async()=>{send();send();});
 const payments=calls.filter(c=>c.name==='be_finance_record_bulk_payment_v200');
 assert.equal(payments.length,1,'double click must submit once');
 assert.deepEqual(JSON.parse(JSON.stringify(payments[0].args)),{p_payments:[{batch_id:'B1',amount:10000}],p_reference:'REF1',p_method:'BANK_TRANSFER',p_account:'Merchant bank',p_evidence_url:'https://example.test/receipt'});
 tree.unmount();tree=await render('FINANCE_MANAGER');
 await change(tree.root.findByProps({'aria-label':'Payment amount BATCH1'}),'20000');
 await change(input(tree,'Transfer / receipt reference'),'F09-UPLOAD');
 await change(input(tree,'Beneficiary bank'),'KBZ merchant');
 const receiptInput=tree.root.findAllByType('input').find(n=>n.props.type==='file');
 assert.ok(receiptInput,'Finance needs a receipt file picker');
 let finish;uploadPending=new Promise(resolve=>{finish=resolve});
 let request;
 await act(async()=>{request=receiptInput.props.onChange({target:{files:[{name:'kbz.png',type:'image/png',size:30}],value:'kbz.png'}});});
 assert.equal(button(tree,'Record ').props.disabled,true,'payment blocked during receipt upload');
 await act(async()=>{finish({data:{path:'receipt.png'},error:null});await request});uploadPending=null;
 assert.equal(button(tree,'Record ').props.disabled,false,'successful upload supplies required evidence');
 await act(async()=>button(tree,'Record ').props.onClick());
 const uploadedPayment=calls.find(c=>c.name==='be_finance_record_bulk_payment_v200');
 assert.equal(uploadedPayment.args.p_payments[0].amount,20000);
 assert.match(uploadedPayment.args.p_evidence_url,/object\/authenticated\/merchant-settlement-receipts\/USER1\//);
 assert.ok(!uploadedPayment.args.p_evidence_url.includes('token='));
 assert.equal(input(tree,'Receipt / evidence').props.value,'','successful payment clears receipt for next transfer');
 uploadReply={data:null,error:{message:'Upload denied'}};
 await act(async()=>receiptInput.props.onChange({target:{files:[{name:'kbz.png',type:'image/png',size:30}],value:'kbz.png'}}));
 assert.ok(tree.root.findAllByProps({role:'alert'}).some(n=>text(n).includes('Upload denied')));
 assert.equal(button(tree,'Record ').props.disabled,true,'failed upload must not enable payment');
 tree.unmount();tree=await render('FINANCE_CREATOR');
 assert.equal(button(tree,'Record ').props.disabled,true,'creator cannot record payment');
 tree.unmount();
 console.log('Merchant settlement V200 UI PASS: COD eligibility, batch selection, partial allocation, overpayment/evidence validation, role gate and double-click guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
