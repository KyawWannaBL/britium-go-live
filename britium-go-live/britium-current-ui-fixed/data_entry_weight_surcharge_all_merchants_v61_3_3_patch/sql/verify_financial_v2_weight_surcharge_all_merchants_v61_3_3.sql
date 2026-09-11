-- Read-only verifier for Financial V2 V61.3.3.
-- Paste the CONTENTS of this file into Supabase SQL Editor.
-- SQL Editor has no end-user JWT, so use a transaction-local service_role claim
-- only for authenticated RPC verification. No data mutation is committed.
rollback;
begin;
do $jwt$ begin
  perform set_config('request.jwt.claim.role','service_role',true);
end $jwt$;

with function_state as (
  select p.proname,p.prosecdef,p.provolatile,p.proconfig,pg_get_functiondef(p.oid) definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'be_calculate_parcel_financial_v2','be_data_entry_financial_v2_schema','be_data_entry_financial_v2_calculate'
  )
), tariff_state as (
  select customer_tier,count(*) active_rows,min(base_tariff) min_base,max(base_tariff) max_base
  from public.be_parcel_tariffs_v2 t
  where public.be_financial_v2_township_key_v61_3_3(t.township)='insein'
    and t.status='ACTIVE' and t.effective_from<=public.be_business_date()
    and (t.effective_to is null or t.effective_to>=public.be_business_date())
  group by customer_tier
), tiers(tier) as (values('STANDARD'),('ROYAL'),('COMMITMENT')),
tier_results as (
  select tier,public.be_calculate_parcel_financial_v2(
    'Insein',tier,'ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,56000,0,0,0,0,0,10,0
  ) result from tiers
), schema_call as (
  select public.be_data_entry_financial_v2_schema() result
), unregistered_call as (
  select public.be_data_entry_financial_v2_calculate(jsonb_build_object(
    'merchant_id','UNREGISTERED_V61_3_3_VERIFY','customer_tier','STANDARD','township','Insein',
    'amount_entry_type','ITEM_PRICE_PLUS_DECLARED_DELIVERY','item_price',50000,'delivery_charges',6000,
    'merchant_stated_total_amount',56000,'additional_customer_charge',0,'cbm_surcharge',0,'other_surcharge',0,
    'merchant_payable_charges',0,'other_merchant_credits',0,'weight_kg',10
  )) result
), checks as (
  select
    (select count(*) from function_state)=3 as functions_exist,
    (select count(*) from tariff_state where active_rows=1)=3 as all_three_insein_tiers_active,
    coalesce((select active_rows=1 and min_base=4500 and max_base=4500 from tariff_state where customer_tier='STANDARD'),false) as standard_insein_base_confirmed,
    (select count(*) from tier_results where result->>'validation_status'='OK')=3 as all_three_tiers_ok,
    (select count(*) from tier_results where result->>'calculation_version'='PARCEL_FINANCIAL_V2_WEIGHT_PASS_THROUGH_V61_3_3')=3 as version_ok,
    (select result #>> '{data,field_count}' from schema_call)::integer=50 as schema_50,
    exists(select 1 from schema_call, lateral jsonb_array_elements(result #> '{data,fields}') f where f->>'name'='customer_tier' and (f->>'editable')::boolean and f->>'ownership'='INPUT') as tier_selector_exposed,
    coalesce((select (result->>'ok')::boolean from unregistered_call),false) as unregistered_ok,
    (select result #>> '{server_resolution,merchant_registration_status}' from unregistered_call)='UNREGISTERED' as unregistered_status_ok,
    (select result #>> '{server_resolution,resolved_customer_tier}' from unregistered_call)='STANDARD' as unregistered_tier_ok,
    exists(select 1 from function_state where proname='be_data_entry_financial_v2_calculate' and definition like '%MERCHANT_PROFILE_INACTIVE_OR_BLOCKED%') as blocked_profile_guard_present,
    exists(select 1 from public.be_audit_events where upload_code='FINANCIAL-V2-ALL-MERCHANTS-V61-3-3-20260802') as audit_recorded,
    coalesce((select mutation_mode='MUTATION_SHADOW' from public.be_data_entry_financial_v2_runtime_v58 where singleton),false) as mutation_shadow_preserved
)
select jsonb_pretty(jsonb_build_object(
  'ok',functions_exist and all_three_insein_tiers_active and standard_insein_base_confirmed and all_three_tiers_ok and version_ok and schema_50 and tier_selector_exposed and unregistered_ok and unregistered_status_ok and unregistered_tier_ok and blocked_profile_guard_present and audit_recorded and mutation_shadow_preserved,
  'build','FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_VERIFY_2026_08_02',
  'insein_tariff_state',(select jsonb_object_agg(customer_tier,jsonb_build_object('active_rows',active_rows,'base_tariff',min_base)) from tariff_state),
  'tier_results',(select jsonb_object_agg(tier,result) from tier_results),
  'unregistered_result',(select result from unregistered_call),
  'checks',to_jsonb(checks),
  'financial_writes_enabled',false,
  'historical_rows_changed',false,
  'next_gate','INSTALL_BUILD_AND_DEPLOY_V61_3_3_FRONTEND'
)) from checks;

rollback;
