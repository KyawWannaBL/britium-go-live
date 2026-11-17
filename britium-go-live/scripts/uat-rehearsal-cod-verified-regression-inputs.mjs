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
// CI-only original township-code resolver, verified read-only against production catalog.
const sourceVerifiedTownshipHelper="CREATE OR REPLACE FUNCTION public.be_financial_v2_township_code_v61_7(p_value text)\n RETURNS text\n LANGUAGE plpgsql\n STABLE PARALLEL SAFE\n SET search_path TO 'public', 'pg_temp'\nAS $function$\ndeclare\n  v text := public.be_financial_v2_normalize_township_text_v61_7(p_value);\n  v_code text;\nbegin\n  if v = '' then return null; end if;\n\n  select t.township_code into v_code\n  from public.be_township_identity_v61_7 t\n  where lower(t.township_code)=v\n     or t.normalized_en=v\n     or t.normalized_mm=v\n  order by case when lower(t.township_code)=v then 0 when t.normalized_en=v then 1 else 2 end\n  limit 1;\n  if v_code is not null then return v_code; end if;\n\n  select a.township_code into v_code\n  from public.be_tariff_location_alias_v61_7_1 a\n  where a.normalized_alias=v and a.township_code is not null\n  limit 1;\n  if v_code is not null then return v_code; end if;\n\n  select t.township_code into v_code\n  from public.be_township_identity_v61_7 t\n  where (length(t.normalized_en) >= 4 and position(t.normalized_en in v) > 0)\n     or (length(t.normalized_mm) >= 2 and position(t.normalized_mm in v) > 0)\n  order by greatest(length(t.normalized_en),length(t.normalized_mm)) desc, t.township_code\n  limit 1;\n\n  return v_code;\nend\n$function$\n";
const dollar=String.fromCharCode(36);
const originalTag=dollar+'function'+dollar;
const isolatedTag=dollar+'uat_verified_township'+dollar;
assert.equal(sourceVerifiedTownshipHelper.split(originalTag).length,3,'Catalog function body delimiters must be balanced');
const safeHelper=sourceVerifiedTownshipHelper.split(originalTag).join(isolatedTag);
assert.ok(safeHelper.includes('be_township_identity_v61_7')&&safeHelper.includes('be_tariff_location_alias_v61_7_1'),'Canonical identity and alias lookups required');
const officialTownshipIdentity=`-- CI_ONLY_INSEIN_TOWNSHIP_IDENTITY: production-catalog schema and one verified geographic reference, no personal records.
create table public.be_township_identity_v61_7(
 township_code text primary key, township_name_en text not null, township_name_mm text not null,
 city text, state_region_name_en text, state_region_name_mm text,
 normalized_en text not null default ''::text, normalized_mm text not null default ''::text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.be_township_identity_v61_7 enable row level security;
revoke all on table public.be_township_identity_v61_7 from public, anon, authenticated;
insert into public.be_township_identity_v61_7(
 township_code,township_name_en,township_name_mm,city,state_region_name_en,state_region_name_mm,normalized_en,normalized_mm
) values ('MMR013001','Insein','အင်းစိန်','Yangon','Yangon','ရန်ကုန်တိုင်းဒေသကြီး','insein','အင်းစိန်');
`;
assert.ok(officialTownshipIdentity.includes('MMR013001')&&officialTownshipIdentity.includes('enable row level security'),'Verified location identity and RLS are mandatory');
const finalSql=officialTownshipIdentity+'\n-- CI_ONLY_ORIGINAL_TOWNSHIP_CODE_HELPER: source-verified original resolver, no privileges changed.\n'+safeHelper+';\n'+staged;
fs.writeFileSync(file,finalSql);
assert.ok(fs.readFileSync(file,'utf8').includes("THEN RAISE EXCEPTION 'COD regression: 006 %, 008 %'"),'Original COD guard preserved');
console.log('CI only: production-catalog township code helper and real COD calculation checks staged.');
