-- Read-only verifier for Financial V2 township alias and clean Data Entry V61.4
-- Build: FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_VERIFY_2026_08_03

with
standard_display as (
  select public.be_calculate_parcel_financial_v2(
    'Dagon Myothit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  ) as result
),
standard_alias as (
  select public.be_calculate_parcel_financial_v2(
    'North Dagon','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  ) as result
),
tier_results as (
  select tier, public.be_calculate_parcel_financial_v2(
    'Dagon Myothit (North)',tier,'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,null,0,0,0,0,0,10,0
  ) as result
  from unnest(array['STANDARD','ROYAL','COMMITMENT']) as t(tier)
),
checks as (
  select
    (select result->>'validation_status'='OK' from standard_display) as standard_ok,
    (select (result->>'extra_kg')::numeric=7 from standard_display) as standard_extra_7kg,
    (select (result->>'weight_surcharge')::bigint=3500 from standard_display) as standard_surcharge_3500,
    (select (result->>'cod_amount')::bigint=59500 from standard_display) as receiver_cod_59500,
    (select (result->>'base_tariff')::bigint>0 from standard_display) as base_tariff_present,
    (select (result->>'net_system_delivery_charge')::bigint=(result->>'base_tariff')::bigint+3500 from standard_display) as britium_base_plus_surcharge,
    (
      select d.result->>'base_tariff'=a.result->>'base_tariff'
         and d.result->>'included_kg'=a.result->>'included_kg'
         and d.result->>'extra_per_kg'=a.result->>'extra_per_kg'
      from standard_display d cross join standard_alias a
    ) as aliases_same_tariff,
    (select bool_and(result->>'validation_status'='OK') from tier_results) as all_three_tiers_ok,
    (
      select position('be_financial_v2_township_key_v61_4' in
        pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)
      )>0
    ) as core_uses_v61_4_alias_resolver,
    (
      select position('PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_4' in
        pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)
      )>0
    ) as calculation_version_ok,
    coalesce((select mutation_mode='MUTATION_SHADOW' from public.be_data_entry_financial_v2_runtime_v58 where singleton),false) as mutation_shadow_preserved,
    case when to_regclass('public.be_audit_events') is null then true else exists(
      select 1 from public.be_audit_events
      where action='FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4'
        and resource_id='be_calculate_parcel_financial_v2'
    ) end as audit_recorded
)
select jsonb_pretty(jsonb_build_object(
  'ok',
    standard_ok
    and standard_extra_7kg
    and standard_surcharge_3500
    and receiver_cod_59500
    and base_tariff_present
    and britium_base_plus_surcharge
    and aliases_same_tariff
    and all_three_tiers_ok
    and core_uses_v61_4_alias_resolver
    and calculation_version_ok
    and mutation_shadow_preserved
    and audit_recorded,
  'build','FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_VERIFY_2026_08_03',
  'checks',to_jsonb(checks),
  'standard_result',(select result from standard_display),
  'alias_result',(select result from standard_alias),
  'tier_results',(select jsonb_object_agg(tier,result order by tier) from tier_results),
  'historical_rows_changed',false,
  'tariff_rows_changed',false,
  'financial_writes_enabled',false,
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_CLEAN_REVIEW_V61_4_FRONTEND'
))
from checks;
