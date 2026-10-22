import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/pages/AccountingMasterWorkspacePage.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const rows = [
  { id: 'saved-a', journal_reference: 'ACC-20261022-YGN-000001', transaction_date: '2026-10-22', journal_type: 'ACC', description: 'Fuel Charges for 7K-1890', branch_code: 'YGN', status: 'DRAFT', created_by:'maker', created_at: '2026-10-22T09:30:10Z', posted_at: null, lines: [{ account_code: '121003', debit: 200000, credit: 0, description: 'Fuel Charges' }, { account_code: '121003', debit: 0, credit: 200000, description: 'Fuel offset' }] },
  { id: 'saved-b', journal_reference: 'ACC-20261022-YGN-000002', transaction_date: '2026-10-22', journal_type: 'ACC', description: 'Other entry', branch_code: 'YGN', status: 'POSTED', created_at: '2026-10-22T10:00:00Z', posted_at: '2026-10-22T10:30:00Z', lines: [{ account_code: 'EX-002', debit: 200, credit: 0, description: 'Second debit' }, { account_code: 'EX-003', debit: 350, credit: 0, description: 'Third debit' }, { account_code: 'CA-002', debit: 0, credit: 550, description: 'Second credit' }] },
];
async function mount(initial = { data: { ok: true, rows }, error: null }, role = 'finance', userId = 'checker') {
  const posts=[]; const postResponses=[]; const scrolls=[];
  const responses = [initial];
  const rpc = async (name,args) => {
    if(name==='be_accounting_manual_journal_post_v1'){posts.push(args);return postResponses.shift()||{data:{ok:true,status:'POSTED',journal_reference:rows[0].journal_reference}};}
    if (name === 'be_accounting_master_search_v1') return { data: { ok: true, rows: [] }, error: null };
    assert.equal(name, 'be_accounting_manual_journal_snapshot_v1', 'viewing journals must never save or post them');
    const next = responses.shift() || { data: { ok: true, rows }, error: null };
    if (next instanceof Error) throw next;
    return next;
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: id => id === '@/integrations/supabase/client' ? { supabase: { rpc } } : id === '@/contexts/AuthContext' ? { useAuth: () => ({ profile: { role }, user: { id: userId } }) } : id === 'lucide-react' ? new Proxy({}, { get: (_, name) => name }) : require(id) });
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(module.exports.default),{createNodeMock:element=>element.props.id==='journal-register-detail'?{scrollIntoView:options=>scrolls.push(options),focus:()=>{}}:null}); });
  const button = label => view.root.findAllByType('button').find(b => b.children.includes(label));
  await act(async () => button('Journal Register').props.onClick());
  return { view, responses, posts, postResponses, scrolls, button, text: () => JSON.stringify(view.toJSON()), close: () => act(() => view.unmount()) };
}

test('saved reference opens persisted debit and credit lines after a fresh page load', async () => {
  const ui = await mount();
  try {
    assert.ok(ui.button(rows[0].journal_reference), 'saved journal reference must be an open-details button');
    await act(async () => ui.button(rows[0].journal_reference).props.onClick());
    const detail = ui.view.root.findByProps({ id: 'journal-register-detail' });
    const text = JSON.stringify(detail.toJSON ? detail.toJSON() : detail.findAllByType('td').map(n => n.children));
    assert.match(text, /121003/); assert.match(text, /Fuel offset/); assert.match(text, /200,000 MMK/);
    assert.match(ui.text(), /Draft.*not posted/i);
    await act(async () => ui.button(rows[1].journal_reference).props.onClick());
    const cells = ui.view.root.findByProps({ id: 'journal-register-detail' }).findAllByType('td').map(n => n.children.join('')).join('|');
    assert.match(cells, /EX-002/); assert.match(cells, /CA-002/); assert.match(cells, /550 MMK/); assert.doesNotMatch(cells, /121003/);
    const totals = ui.view.root.findByProps({ id: 'journal-register-detail' }).findByType('tfoot').findAllByType('td').map(n => n.children.join(''));
    assert.deepEqual(totals, ['550 MMK', '550 MMK']);
    await act(async () => ui.button('Close details').props.onClick());
    assert.equal(ui.view.root.findAllByProps({ id: 'journal-register-detail' }).length, 0);
  } finally { ui.close(); }
});

for (const failure of [{ data: { ok: false, error: 'Journal access denied' }, error: null }, { error: { message: 'Journal access denied' } }, new Error('Journal access denied')]) {
  test(`failed register read reports its error instead of an empty register (${failure instanceof Error ? 'rejection' : failure.data ? 'application' : 'transport'})`, async () => {
    const ui = await mount(failure);
    try { assert.match(ui.text(), /Journal access denied/); assert.doesNotMatch(ui.text(), /No manual journal records/); }
    finally { ui.close(); }
  });
}

test('failed refresh retains previously loaded journal details', async () => {
  const ui = await mount();
  try {
    assert.ok(ui.button(rows[0].journal_reference));
    await act(async () => ui.button(rows[0].journal_reference).props.onClick());
    ui.responses.push({ error: { message: 'Refresh unavailable' } });
    await act(async () => ui.button('Refresh').props.onClick());
    assert.match(ui.text(), /Refresh unavailable/);
    assert.match(JSON.stringify(ui.view.root.findByProps({ id: 'journal-register-detail' }).findAllByType('td').map(n => n.children)), /Fuel offset/);
  } finally { ui.close(); }
});


test('approver reviews a persisted draft and posts its selected ID, never the new-entry form',async()=>{
 const ui=await mount(undefined,'accountant');
 try{
 await act(async()=>ui.button(rows[0].journal_reference).props.onClick());
 const detail=ui.view.root.findByProps({id:'journal-register-detail'});
 const approve=detail.findAllByType('button').find(b=>b.children.includes('Approve & Post journal'));
 assert.ok(approve,'saved journal detail needs an approval action');
 assert.equal(approve.props.disabled,false);
 assert.equal(ui.posts.length,0,'opening a journal must not approve it');
 ui.responses.push({data:{ok:true,rows:[{...rows[0],status:'POSTED'},rows[1]]}});
 await act(async()=>approve.props.onClick());
 assert.equal(ui.posts.length,0,'approval needs a separate confirmation');
 await act(async()=>ui.button('Confirm posting').props.onClick());
 assert.deepEqual(JSON.parse(JSON.stringify(ui.posts)),[{p_draft_id:'saved-a'}]);
 assert.match(ui.text(),/Journal POSTED/);
 assert.equal(ui.button('Approve & Post journal'),undefined);
 }finally{ui.close();}
});
for(const [role,id] of [['finance','checker'],['accountant','maker'],['director','checker']]){
 test(`register approval respects ${role}/${id} authority`,async()=>{
 const ui=await mount(undefined,role,id);
 try{await act(async()=>ui.button(rows[0].journal_reference).props.onClick());assert.equal(ui.button('Approve & Post journal'),undefined);assert.equal(ui.posts.length,0);}finally{ui.close();}
 });
}
test('posting failure remains visible in the journal detail and allows a retry',async()=>{
 const ui=await mount(undefined,'accountant');
 try{
 await act(async()=>ui.button(rows[0].journal_reference).props.onClick());
 assert.ok(ui.button('Approve & Post journal'));
 await act(async()=>ui.button('Approve & Post journal').props.onClick());
 ui.postResponses.push({error:{message:'MAKER_CHECKER_REQUIRED_DIFFERENT_POSTER'}});
 await act(async()=>ui.button('Confirm posting').props.onClick());
 const detail=ui.view.root.findByProps({id:'journal-register-detail'});
 assert.match(JSON.stringify(detail.findAllByProps({role:'alert'}).map(n=>n.children)),/MAKER_CHECKER/);
 assert.equal(ui.button('Approve & Post journal').props.disabled,false);
 }finally{ui.close();}
});


test('touch review action opens the same saved detail and brings it into view',async()=>{
 const ui=await mount(undefined,'accountant');
 try{
 const cards=ui.view.root.findByProps({'aria-label':'Journal register cards'});
 assert.match(cards.props.className,/lg:hidden/);
 const review=cards.findAllByType('button').find(b=>b.children.includes('Review journal'));
 assert.ok(review);assert.match(review.props.className,/min-h-11/);
 await act(async()=>review.props.onClick());
 assert.equal(ui.scrolls.length,1);
 assert.match(JSON.stringify(ui.view.root.findByProps({id:'journal-register-detail'}).findAllByType('td').map(n=>n.children)),/Fuel offset/);
 assert.equal(ui.posts.length,0);
 }finally{ui.close();}
});
test('cancelled approval does not post; already posted journals have no approval action',async()=>{
 const ui=await mount(undefined,'superadmin','maker');
 try{
 await act(async()=>ui.button(rows[0].journal_reference).props.onClick());
 await act(async()=>ui.button('Approve & Post journal').props.onClick());
 await act(async()=>ui.button('Cancel').props.onClick());
 assert.equal(ui.posts.length,0);assert.equal(ui.button('Confirm posting'),undefined);
 await act(async()=>ui.button(rows[1].journal_reference).props.onClick());
 assert.equal(ui.button('Approve & Post journal'),undefined);
 }finally{ui.close();}
});
