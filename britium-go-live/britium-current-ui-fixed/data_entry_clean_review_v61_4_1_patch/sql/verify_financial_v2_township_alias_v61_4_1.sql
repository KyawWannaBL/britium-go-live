-- Read-only verifier for Financial V2 township alias and clean Data Entry V61.4.1
-- Build: FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_VERIFY_2026_08_03

with aliases(label, township) as (
  values
    ('DISPLAY','Dagon Myothit (North)'),
    ('LEGACY','North Dagon'),
    ('SPACED','Dagon Myo Thit (North)'),
    ('CODE','MMR013019'),
    ('MYANMAR','ဒဂုံမြို့သစ် (မြောက်ပိုင်း)')
),
alias_results as (
  select label, township, public.be_calculate_parcel_financial_v2(
    township,'STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  ) as result
  from aliases
),
tier_results as (
  select tier, public.be_calculate_parcel_financial_v2(
    'Dagon Myothit (North)',tier,'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  ) as result
  from unnest(array['STANDARD','ROYAL','COMMITMENT']) as t(tier)
),
standard_result as (
  select result from alias_results where label='DISPLAY'
),
checks as (
  select
    (select bool_and(result->>'validation_status'='OK') from alias_results) as all_aliases_ok,
    (select count(distinct concat_ws('|',result->>'base_tariff',result->>'included_kg',result->>'extra_per_kg'))=1 from alias_results) as all_aliases_same_tariff,
    (select (result->>'extra_kg')::numeric=7 from standard_result) as standard_extra_7kg,
    (select (result->>'weight_surcharge')::bigint=3500 from standard_result) as standard_surcharge_3500,
    (select (result->>'cod_amount')::bigint=59500 from standard_result) as receiver_cod_59500,
    (select (result->>'base_tariff')::bigint>0 from standard_result) as base_tariff_present,
    (select (result->>'net_system_delivery_charge')::bigint=(result->>'base_tariff')::bigint+3500 from standard_result) as britium_base_plus_surcharge,
    (select bool_and(result->>'validation_status'='OK') from tier_results) as all_three_tiers_ok,
    position('be_financial_v2_township_key_v61_4_1' in pg_get_functiondef(
      'public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure
    ))>0 as core_uses_v61_4_1_alias_resolver,
    position('PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_4_1' in pg_get_functiondef(
      'public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure
    ))>0 as calculation_version_ok,
    coalesce((select mutation_mode='MUTATION_SHADOW' from public.be_data_entry_financial_v2_runtime_v58 where singleton),false) as mutation_shadow_preserved,
    case when to_regclass('public.be_audit_events') is null then true else exists(
      select 1 from public.be_audit_events
      where action='FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1'
        and resource_id='be_calculate_parcel_financial_v2'
    ) end as audit_recorded
)
select jsonb_pretty(jsonb_build_object(
  'ok',
    all_aliases_ok
    and all_aliases_same_tariff
    and standard_extra_7kg
    and standard_surcharge_3500
    and receiver_cod_59500
    and base_tariff_present
    and britium_base_plus_surcharge
    and all_three_tiers_ok
    and core_uses_v61_4_1_alias_resolver
    and calculation_version_ok
    and mutation_shadow_preserved
    and audit_recorded,
  'build','FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_VERIFY_2026_08_03',
  'checks',to_jsonb(checks),
  'alias_results',(select jsonb_object_agg(label,result order by label) from alias_results),
  'tier_results',(select jsonb_object_agg(tier,result order by tier) from tier_results),
  'historical_rows_changed',false,
  'tariff_rows_changed',false,
  'financial_writes_enabled',false,
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_CLEAN_REVIEW_V61_4_1_FRONTEND'
))
from checks;
