import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

// Execute the actual page and its handlers, replacing only the RPC/browser boundaries.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/pages/FinanceDataEntryReviewPage.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const initialRows = [
  { delivery_way_id: 'A', item_price: 100, customer_total_collection: 100 },
  { delivery_way_id: 'B', item_price: 200, customer_total_collection: 200 },
];
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function mount() {
  const financial = [], snapshots = [];
  const rpc = (name, args) => {
    if (name === 'be_finance_settlement_snapshot_v3') return snapshots.length ? snapshots.shift() : Promise.resolve({ data: { rows: initialRows, audit: [{ id: 'audit-A', action: 'DATA_ENTRY_CONFIRMED', entity_id: 'A', actor_email: 'reviewer@example.test' }], scope: { role: 'finance' } }, error: null });
    assert.equal(name, 'be_finance_confirm_data_entry_financial_v4');
    const pending = deferred(); financial.push({ args, ...pending }); return pending.promise;
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module,
    require: id => id === '@/integrations/supabase/client' ? { supabase: { rpc } } : id === 'lucide-react' ? new Proxy({}, { get: (_, name) => name }) : require(id),
    localStorage: { getItem: () => 'test-device' }, navigator: { userAgent: 'test-agent' }, Intl,
  }, { filename: 'FinanceDataEntryReviewPage.cjs' });
  let view;
  await act(async () => { view = TestRenderer.create(React.createElement(module.exports.default)); });
  const button = text => view.root.findAllByType('button').find(b => b.children.includes(text));
  const ui = {
    view, financial, snapshots,
    text: () => JSON.stringify(view.toJSON()),
    preview: () => view.root.findAllByType('b').map(b => b.children.join('')).includes('9,876 MMK'),
    select: value => act(() => view.root.findAllByType('select')[0].props.onChange({ target: { value } })),
    edit: value => act(() => view.root.findAllByType('input')[0].props.onChange({ target: { value } })),
    dry: () => act(() => button('အကြိုတွက်ချက်ရန်').props.onClick()),
    confirmTwice: () => act(() => { const click = button('Finance အတည်ပြုရန်').props.onClick; click(); click(); }),
    confirm: () => act(() => button('Finance အတည်ပြုရန်').props.onClick()),
    refresh: () => act(() => button('ပြန်ဖတ်ရန်').props.onClick()),
    settle: (i, result) => act(async () => { financial[i].resolve(result); }),
    close: () => act(() => view.unmount()),
  };
  return ui;
}
const ok = { data: { ok: true, data: { cod_amount: 9876, net_system_delivery_charge: 1, merchant_final_settlement_amount: 9875 } }, error: null };

test('current dry-run renders its preview with original RPC values', async () => {
  const ui = await mount(); await ui.dry();
  assert.equal(ui.financial[0].args.p_way_id, 'A'); assert.equal(ui.financial[0].args.p_changes.item_price, 100);
  await ui.settle(0, ok); assert.equal(ui.preview(), true); ui.close();
});
for (const [name, change] of [['way selection', ui => ui.select('B')], ['form edit', ui => ui.edit('555')], ['way away and back', ui => { ui.select('B'); ui.select('A'); }]]) {
  test(`pending dry-run cannot publish after ${name}`, async () => {
    const ui = await mount(); await ui.dry(); await change(ui); await ui.settle(0, ok);
    assert.equal(ui.preview(), false, 'stale financial preview must stay hidden');
    assert.equal(ui.text().includes('အကြိုတွက်ချက်မှု အောင်မြင်ပါသည်။'), false); ui.close();
  });
}
test('editing invalidates an already displayed preview', async () => {
  const ui = await mount(); await ui.dry(); await ui.settle(0, ok); await ui.edit('555');
  assert.equal(ui.preview(), false); ui.close();
});
test('stale rejected dry-run cannot publish its error preview or message', async () => {
  const ui = await mount(); await ui.dry(); await ui.select('B');
  await ui.settle(0, { data: { ok: false, preview: ok.data.data, message: 'A validation rejected' }, error: null });
  assert.equal(ui.preview(), false); assert.equal(ui.text().includes('A validation rejected'), false); ui.close();
});
test('duplicate confirmation callbacks in the same turn send only one financial RPC', async () => {
  const ui = await mount(); await ui.confirmTwice(); assert.equal(ui.financial.length, 1);
  await ui.settle(0, ok); ui.close();
});
test('successful confirmation retains an explicit success after refresh', async () => {
  const ui = await mount(); await ui.confirm(); await ui.settle(0, ok);
  assert.match(ui.text(), /Finance အတည်ပြုမှု အောင်မြင်ပါသည်။/); assert.match(ui.text(), /A/); ui.close();
});
test('successful mutation followed by failed refresh reports both and preserves rows', async () => {
  const ui = await mount(); ui.snapshots.push(Promise.resolve({ error: { message: 'snapshot offline' } }));
  await ui.confirm(); await ui.settle(0, ok);
  assert.match(ui.text(), /Finance အတည်ပြုမှု အောင်မြင်ပါသည်။/); assert.match(ui.text(), /snapshot offline/);
  assert.deepEqual(ui.view.root.findAllByType('option').slice(0, 2).map(o => o.props.value), ['A', 'B']); ui.close();
});
test('confirmation switched to another way reports original way without its preview', async () => {
  const ui = await mount(); await ui.confirm(); await ui.select('B'); await ui.settle(0, ok);
  assert.equal(ui.preview(), false); assert.match(ui.text(), /A.*Finance အတည်ပြုမှု အောင်မြင်ပါသည်။/);
  assert.equal(ui.view.root.findAllByType('select')[0].props.value, 'B'); ui.close();
});
test('failed manual refresh retains the previous snapshot', async () => {
  const ui = await mount(); ui.snapshots.push(Promise.resolve({ error: { message: 'snapshot offline' } }));
  await ui.refresh(); assert.match(ui.text(), /snapshot offline/);
  assert.deepEqual(ui.view.root.findAllByType('option').slice(0, 2).map(o => o.props.value), ['A', 'B']); ui.close();
});

function assertPreviousSnapshot(ui) {
  assert.deepEqual(ui.view.root.findAllByType('option').slice(0, 2).map(o => o.props.value), ['A', 'B']);
  assert.match(ui.text(), /reviewer@example.test/, 'previous audit remains visible');
  assert.match(ui.text(), /"finance"/, 'previous role scope remains visible');
}
test('application-level failed manual snapshot preserves rows, audit, and scope', async () => {
  const ui = await mount();
  ui.snapshots.push(Promise.resolve({ data: { ok: false, error: 'snapshot denied' }, error: null }));
  await ui.refresh();
  assertPreviousSnapshot(ui); assert.match(ui.text(), /snapshot denied/); ui.close();
});
test('successful confirmation with application-level failed refresh retains snapshot and reports both outcomes', async () => {
  const ui = await mount();
  ui.snapshots.push(Promise.resolve({ data: { ok: false, error: 'snapshot denied' }, error: null }));
  await ui.confirm(); await ui.settle(0, ok);
  assertPreviousSnapshot(ui);
  assert.match(ui.text(), /A: Finance အတည်ပြုမှု အောင်မြင်ပါသည်။/);
  assert.match(ui.text(), /စာရင်းပြန်ဖတ်မှု မအောင်မြင်ပါ။ snapshot denied/); ui.close();
});
