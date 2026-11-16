/** CI-only COD regression inputs taken from read-only source catalog/query.
 * No production parcels or identity/recipient fields are copied.
 * The historical surcharge patch and exact COD assertions remain unchanged.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
assert.equal(process.env.DO_NOT_CONNECT_REMOTE, '1', 'No remote DB connections permitted');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Only disposable GitHub Actions');
const file=path.resolve('supabase/migrations/20261103205504_fix_progressive_standard_weight_bands_20261104.sql');
const original=fs.readFileSync(file,'utf8');
assert.ok(!original.includes('CI_ONLY_COD_SOURCE_INPUTS'),'Already patched');
const old006=`SELECT public.be_calculate_parcel_financial_v2(
 township,customer_tier,amount_entry_type,item_price::bigint,delivery_charges,
 merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,
 merchant_payable_charges,other_merchant_credits,16,
 coalesce(nullif(financial_quote->>'monthly_ways','')::integer,0))
 INTO q006 FROM public.be_data_entry_parcel_details WHERE delivery_way_id='D1031-YDC-006' LIMIT 1;`;
const old008=`SELECT public.be_calculate_parcel_financial_v2(
 township,customer_tier,amount_entry_type,item_price::bigint,delivery_charges,
 merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,
 merchant_payable_charges,other_merchant_credits,21,
 coalesce(nullif(financial_quote->>'monthly_ways','')::integer,0))
 INTO q008 FROM public.be_data_entry_parcel_details WHERE delivery_way_id='D1031-YDC-008' LIMIT 1;`;
assert.equal(original.split(old006).length,2,'Exact original 006 regression query required');
assert.equal(original.split(old008).length,2,'Exact original 008 regression query required');
assert.ok(original.includes("(q006->>'cod_amount')::bigint<>2022500")&&original.includes("(q008->>'cod_amount')::bigint<>3002800"),'Original exact expected COD amounts required');
const numeric006=`-- CI_ONLY_COD_SOURCE_INPUTS: read-only verified historical inputs; original assertion retained
 SELECT public.be_calculate_parcel_financial_v2(
 'အင်းစိန်','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',2009000::bigint,4000,
 null,0,0,0,0,0,16,5)
 INTO q006;`;
const numeric008=`SELECT public.be_calculate_parcel_financial_v2(
 'အင်းစိန်','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',2983800::bigint,4000,
 null,0,0,0,0,0,21,5)
 INTO q008;`;
const staged=original.replace(old006,numeric006).replace(old008,numeric008);
assert.ok(staged.includes("THEN RAISE EXCEPTION 'COD regression: 006 %, 008 %'"),'Real COD assertion cannot be bypassed');
assert.ok(staged.includes("Weight band regression"),'Weight surcharge assertions cannot be bypassed');
assert.ok(!staged.includes('FROM public.be_data_entry_parcel_details WHERE delivery_way_id=\'D1031-YDC-006\''),'Synthetic source test must not read missing history');
fs.writeFileSync(file,staged);
console.log('CI-only: run original calculation with verified non-personal regression inputs; preserve all expected values and error conditions.');
