import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import Renderer, {act} from 'react-test-renderer';
const require=createRequire(import.meta.url);
const text=n=>typeof n==='string'?n:(n?.children||[]).map(text).join('');
async function mount(page,type='RIDER'){
  const row={workforce_type:type,workforce_code:'LEGACY-01',workforce_name:'Original',status:'ACTIVE',phone:'0999',branch_code:'YGN',employee_id:'INTERNAL-01',employee_code:'STAFF-01',employee_name:'Original',display_name:'Original',phone_primary:'0999',is_active:true};
  const mutations=[];let nextRead=null;
  const rpc=async(name,args)=>{
    if(name==='be_supervisor_workforce_master_center_v1'||name==='be_hr_dashboard'){
      if(nextRead){const r=nextRead;nextRead=null;return r;}
      return {data:{ok:true,rows:[row],employees:[row]},error:null};
    }
    if(name==='be_hr_document_snapshot_v1')return {data:{ok:true,rows:[]},error:null};
    let resolve;const promise=new Promise(r=>resolve=r);mutations.push({name,args,resolve});return promise;
  };
  const source=readFileSync(new URL(`../src/pages/${page}.tsx`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,window:{confirm:()=>true},require:id=>id==='@/integrations/supabase/client'?{supabase:{rpc,auth:{getUser:async()=>({data:{user:{email:'admin@example.test'}}})}}}:id==='@/components/accounts/AccountAccessPanel'?{__esModule:true,default:()=>null}:id==='@/contexts/LanguageContext'?{useLanguage:()=>({t:x=>x})}:id==='lucide-react'?new Proxy({},{get:(_,k)=>k}):require(id)});
  let view;await act(async()=>{view=Renderer.create(React.createElement(module.exports.default));});
  const button=label=>view.root.findAllByType('button').find(n=>text(n)===label);
  return {view,mutations,button,text:()=>text(view.toJSON()),edit:(placeholder,value)=>act(()=>view.root.findAllByType('input').find(n=>n.props.placeholder===placeholder).props.onChange({target:{value}})),click:label=>act(async()=>button(label).props.onClick()),settle:(data={ok:true,workforce_code:row.workforce_code},error=null)=>act(async()=>mutations.at(-1).resolve({data,error})),offline:()=>{nextRead={error:{message:'refresh offline'}}},close:()=>act(()=>view.unmount())};
}
for(const [page,type,codePlaceholder,namePlaceholder] of [['RiderPage','RIDER','Rider Code','Rider Name'],['DriverPage','DRIVER','Code','Name'],['DriverPage','HELPER','Code','Name']]){
  const setup=async()=>{const ui=await mount(page,type);if(type==='HELPER')await ui.click('Helpers');return ui;};
  test(`${type}: editing locks identity and preserves success after refresh`,async()=>{
    const ui=await setup();await ui.click('Edit');
    assert.equal(ui.view.root.findAllByType('input').find(n=>n.props.placeholder===codePlaceholder).props.disabled,true);
    await ui.edit(namePlaceholder,'Changed');await ui.click('Save + Sync');
    assert.equal(ui.mutations[0].args.p_payload.record_action,'UPDATE');
    assert.equal(ui.mutations[0].args.p_payload.workforce_type,type);
    await ui.settle();assert.match(ui.text(),/synchronized/);ui.close();
  });
  test(`${type}: duplicate save callback sends one mutation and failure keeps editor`,async()=>{
    const ui=await setup();await ui.click('Edit');
    await act(async()=>{const click=ui.button('Save + Sync').props.onClick;click();click();});
    assert.equal(ui.mutations.length,1);await ui.settle({ok:false,code:'UNAUTHORIZED'});
    assert.match(ui.text(),/UNAUTHORIZED/);assert.ok(ui.button('Save + Sync'));ui.close();
  });
  test(`${type}: add validates whitespace and normalizes create payload`,async()=>{
    const ui=await setup();await ui.click(`Add ${type==='RIDER'?'Rider':type==='DRIVER'?'Driver':'Helper'}`);
    await ui.edit(codePlaceholder,'   ');await ui.edit(namePlaceholder,'   ');await ui.click('Save + Sync');assert.equal(ui.mutations.length,0);
    await ui.edit(codePlaceholder,' new-01 ');await ui.edit(namePlaceholder,' New Name ');await ui.click('Save + Sync');
    assert.equal(ui.mutations[0].args.p_payload.workforce_code,'NEW-01');assert.equal(ui.mutations[0].args.p_payload.workforce_name,'New Name');assert.equal(ui.mutations[0].args.p_payload.record_action,'CREATE');
    await ui.settle();ui.close();
  });
  test(`${type}: deactivate uses existing identity and keeps prior rows on refresh failure`,async()=>{
    const ui=await setup();await ui.click('Deactivate');
    assert.equal(ui.mutations[0].args.p_payload.status,'INACTIVE');assert.equal(ui.mutations[0].args.p_payload.workforce_code,'LEGACY-01');
    ui.offline();await ui.settle();assert.match(ui.text(),/deactivated/);assert.match(ui.text(),/refresh offline/);assert.match(ui.text(),/Original/);ui.close();
  });
}
test('HR: Add Employee creates normalized record with phone and active status',async()=>{
  const ui=await mount('AdminHRPage');await ui.click('Add Employee');
  const field=label=>ui.view.root.findAllByType('label').find(n=>text(n).startsWith(label)).findByType('input');
  for(const [label,value]of [['Employee Code',' OPS-01 '],['Employee Name',' Operator '],['Phone','09123']])await act(()=>field(label).props.onChange({target:{value}}));
  await ui.click('Save Employee');assert.equal(ui.mutations[0].args.p_record.employee_id,'OPS-01');assert.equal(ui.mutations[0].args.p_record.display_name,'Operator');assert.equal(ui.mutations[0].args.p_record.phone_e164,'09123');assert.equal(ui.mutations[0].args.p_record.is_active,true);
  await ui.settle();assert.match(ui.text(),/saved/);ui.close();
});
test('HR: existing employee ID is retained; inactive status changes is_active and phone mapping',async()=>{
  const ui=await mount('AdminHRPage');await ui.click('Edit');
  const fields=ui.view.root.findAllByType('label');const field=label=>fields.find(n=>text(n).startsWith(label)).findByType('input');
  assert.equal(field('Employee Code').props.disabled,true);
  await act(()=>field('Status').props.onChange({target:{value:'INACTIVE'}}));
  await ui.click('Save Employee');assert.equal(ui.mutations[0].args.p_record.employee_id,'INTERNAL-01');assert.equal(ui.mutations[0].args.p_record.is_active,false);assert.equal(ui.mutations[0].args.p_record.phone_e164,'0999');await ui.settle();ui.close();
});
test('HR: deactivation uses employee_id rather than display code; zero affected is failure',async()=>{
  const ui=await mount('AdminHRPage');await ui.click('Deactivate');assert.equal(ui.mutations[0].args.p_employee_id,'INTERNAL-01');await ui.settle({ok:true,deleted_rows:0});assert.match(ui.text(),/not found/i);ui.close();
});
