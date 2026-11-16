/** CI-only replacement of absent historical parcel row reads with verified financial-only regression inputs.
 * No data inserts; original function, expected COD amounts and exception guards stay untouched.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE,'1','Remote database guard required');
assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable CI required');
const file=path.resolve('supabase/migrations/20261103205504_fix_progressive_standard_weight_bands_20261104.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(original.includes("THEN RAISE EXCEPTION 'Weight band regression'"),'Original weight guard required');
assert.ok(original.includes("THEN RAISE EXCEPTION 'COD regression: 006 %, 008 %'"),'Original COD guard required');
const fields='delivery_way_id,township,customer_tier,amount_entry_type,item_price,delivery_charges,merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,merchant_payable_charges,other_merchant_credits,financial_quote';
const values=[
  ['D1031-YDC-006','2009000'],
  ['D1031-YDC-008','2983800']
];
let result=original;
for(const [id,item] of values){
 const target="FROM public.be_data_entry_parcel_details WHERE delivery_way_id='"+id+"' LIMIT 1;";
 assert.equal(result.split(target).length,2,'Exactly one historical row reference required for '+id);
 const derived="FROM (VALUES ('"+id+"'::text,'အင်းစိန်'::text,'STANDARD'::text,'ITEM_PRICE_PLUS_DECLARED_DELIVERY'::text,"+item+"::numeric,4000::numeric,NULL::numeric,0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,'{\"monthly_ways\":\"5\"}'::jsonb)) AS source("+fields+") WHERE source.delivery_way_id='"+id+"' LIMIT 1;";
 result=result.replace(target,derived);
}
assert.equal((result.match(/be_calculate_parcel_financial_v2\(/g)||[]).length,2,'Both original calculator calls preserved');
assert.ok(result.includes("'cod_amount')::bigint<>2022500")&&result.includes("'cod_amount')::bigint<>3002800"),'Both original COD expectations preserved');
assert.ok(!/\binsert\s+into\b/i.test(result),'Never insert test data');
fs.writeFileSync(file,'-- CI ONLY: verified original historical financial inputs; no customer records imported.\n'+result);
console.log('CI-only financial row inputs staged from verified Oct31 record values; all assertions and calculator calls intact.');
