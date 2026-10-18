import assert from 'node:assert/strict';

// Regression contract: these examples must be reproduced by authenticated
// be_data_entry_financial_v2_calculate and by the persistence/finance flow.
// This script intentionally does not claim to exercise the live RPC.
const cases = [
  { name:'COD + declared delivery, excess weight', type:'ITEM_PRICE_PLUS_DECLARED_DELIVERY', item:620000, delivery:4000, weight:3500, expected:627500 },
  { name:'COD + declared delivery, included weight', type:'ITEM_PRICE_PLUS_DECLARED_DELIVERY', item:620000, delivery:4000, weight:0, expected:624000 },
  { name:'Delivery only, excess weight', type:'DELIVERY_CHARGE_ONLY', item:620000, delivery:4000, weight:3500, expected:7500 },
  { name:'COD plus CBM surcharge', type:'ITEM_PRICE_PLUS_DECLARED_DELIVERY', item:50000, delivery:4000, weight:0, cbm:1000, expected:55000 },
  { name:'COD plus multiple surcharges exactly once', type:'ITEM_PRICE_PLUS_DECLARED_DELIVERY', item:50000, delivery:4000, weight:3500, cbm:1000, other:200, expected:58700 },
];
for (const c of cases) {
  const payableDelivery = c.delivery + c.weight + (c.cbm ?? 0) + (c.other ?? 0);
  const total = (c.type === 'DELIVERY_CHARGE_ONLY' ? 0 : c.item) + payableDelivery;
  assert.equal(total,c.expected,c.name);
  console.log('PASS',c.name,total);
}
console.log('NOTICE: arithmetic contract only. Authenticated RPC, tariff resolution, saved rows, rider, and finance must still be tested.');
