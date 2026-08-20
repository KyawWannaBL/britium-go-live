-- Read-only verifier for Financial V2 V61.3.
-- Does not mutate business rows or runtime mode.

with function_state as (
  select
    p.oid,
    p.prosecdef,
    p.provolatile,
    p.proconfig,
    pg_get_functiondef(p.oid) as definition,
    md5(pg_get_functiondef(p.oid)) as definition_md5
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.oid='public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure
),
item_plus_delivery as (
  select public.be_calculate_parcel_financial_v2(
    'Insein','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    50000,6000,56000,0,0,0,0,0,10,0
  ) as result
),
delivery_only as (
  select public.be_calculate_parcel_financial_v2(
    'Insein','STANDARD','DELIVERY_CHARGE_ONLY',
    0,6000,6000,0,0,0,0,0,10,0
  ) as result
),
merchant_pays_delivery as (
  select public.be_calculate_parcel_financial_v2(
    'Insein','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',
    50000,0,50000,0,0,0,0,0,10,0
  ) as result
),
checks as (
  select
    (select count(*) from function_state)=1 as function_exists,
    coalesce((select not prosecdef from function_state),false) as not_security_definer,
    coalesce((select provolatile='s' from function_state),false) as stable_volatility,
    coalesce((select proconfig @> array['search_path=public, pg_temp']::text[] from function_state),false) as fixed_search_path,
    coalesce((select definition like '%PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3%' from function_state),false) as version_marker_present,
    coalesce((select definition like '%v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;%' from function_state),false) as pass_through_source_present,
    coalesce((select mutation_mode='MUTATION_SHADOW' from public.be_data_entry_financial_v2_runtime_v58 where singleton),false) as mutation_shadow_preserved,

    coalesce(((select result from item_plus_delivery)->>'validation_status')='OK',false) as item_plus_delivery_ok,
    coalesce((((select result from item_plus_delivery)->>'base_tariff')::bigint)=4500,false) as base_tariff_4500,
    coalesce((((select result from item_plus_delivery)->>'included_kg')::numeric)=3,false) as included_kg_3,
    coalesce((((select result from item_plus_delivery)->>'extra_kg')::numeric)=7,false) as extra_kg_7,
    coalesce((((select result from item_plus_delivery)->>'extra_per_kg')::bigint)=500,false) as extra_per_kg_500,
    coalesce((((select result from item_plus_delivery)->>'weight_surcharge')::bigint)=3500,false) as weight_surcharge_3500,
    coalesce((((select result from item_plus_delivery)->>'effective_declared_delivery_charge')::bigint)=9500,false) as customer_delivery_component_9500,
    coalesce((((select result from item_plus_delivery)->>'cod_amount')::bigint)=59500,false) as receiver_cod_59500,
    coalesce((((select result from item_plus_delivery)->>'net_system_delivery_charge')::bigint)=8000,false) as britium_entitlement_8000,
    coalesce((((select result from item_plus_delivery)->>'delivery_difference')::bigint)=1500,false) as merchant_delivery_margin_1500,
    coalesce(((select result from item_plus_delivery)->>'settlement_direction')='CREDIT_TO_MERCHANT',false) as settlement_direction_credit,
    coalesce((((select result from item_plus_delivery)->>'merchant_final_settlement_amount')::bigint)=51500,false) as merchant_settlement_51500,
    coalesce(((select result from item_plus_delivery)->>'calculation_version')='PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3',false) as calculation_version_correct,

    coalesce((((select result from delivery_only)->>'cod_amount')::bigint)=9500,false) as delivery_only_cod_9500,
    coalesce((((select result from delivery_only)->>'merchant_final_settlement_amount')::bigint)=1500,false) as delivery_only_merchant_margin_1500,

    coalesce((((select result from merchant_pays_delivery)->>'cod_amount')::bigint)=50000,false) as merchant_pays_delivery_receiver_cod_50000,
    coalesce((((select result from merchant_pays_delivery)->>'net_system_delivery_charge')::bigint)=8000,false) as merchant_pays_delivery_britium_8000,
    coalesce((((select result from merchant_pays_delivery)->>'merchant_final_settlement_amount')::bigint)=42000,false) as merchant_pays_delivery_settlement_42000,

    exists(
      select 1 from public.be_audit_events a
      where a.upload_code='FINANCIAL-V2-WEIGHT-PASS-THROUGH-20260802'
        and a.action='FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_DEPLOYED'
    ) as audit_recorded
)
select jsonb_pretty(jsonb_build_object(
  'ok', (
    function_exists and not_security_definer and stable_volatility and fixed_search_path
    and version_marker_present and pass_through_source_present and mutation_shadow_preserved
    and item_plus_delivery_ok and base_tariff_4500 and included_kg_3 and extra_kg_7
    and extra_per_kg_500 and weight_surcharge_3500 and customer_delivery_component_9500
    and receiver_cod_59500 and britium_entitlement_8000 and merchant_delivery_margin_1500
    and settlement_direction_credit and merchant_settlement_51500 and calculation_version_correct
    and delivery_only_cod_9500 and delivery_only_merchant_margin_1500
    and merchant_pays_delivery_receiver_cod_50000 and merchant_pays_delivery_britium_8000
    and merchant_pays_delivery_settlement_42000 and audit_recorded
  ),
  'build','FINANCIAL_V2_WEIGHT_SURCHARGE_PASS_THROUGH_V61_3_VERIFY_2026_08_02',
  'function_definition_md5',(select definition_md5 from function_state),
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'confirmed_item_plus_delivery_example',(select result from item_plus_delivery),
  'confirmed_delivery_only_example',(select result from delivery_only),
  'confirmed_merchant_pays_delivery_example',(select result from merchant_pays_delivery),
  'checks',to_jsonb(checks),
  'financial_writes_enabled',false,
  'historical_rows_changed',false,
  'next_gate','INSTALL_AND_BUILD_V61_3_FRONTEND'
))
from checks;
