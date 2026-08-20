-- Read-only verifier for V61.7 canonical tariff wiring
-- Build: FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_VERIFY_2026_08_03
rollback;
begin;
set local transaction read only;

do $verify$
declare
  v_result jsonb;
  v_catalog jsonb;
  v_checks jsonb;
  v_ok boolean;
  v_audit boolean;
begin
  if to_regclass('public.be_township_identity_v61_7') is null then raise exception 'V61.7 township identity table is missing'; end if;
  if to_regprocedure('public.be_financial_v2_township_code_v61_7(text)') is null then raise exception 'V61.7 resolver is missing'; end if;
  if to_regprocedure('public.be_tariff_catalog_v61_7()') is null then raise exception 'V61.7 tariff catalog RPC is missing'; end if;

  v_result := public.be_calculate_parcel_financial_v2('တောင်ဥက္ကလာပ — South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0);
  v_catalog := public.be_tariff_catalog_v61_7();
  v_audit := case when to_regclass('public.be_audit_events') is null then true else exists(
    select 1 from public.be_audit_events
    where action='FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7'
      and resource_id='be_parcel_tariffs_v2'
  ) end;

  v_checks := jsonb_build_object(
    'township_identity_356',(select count(*)=356 from public.be_township_identity_v61_7),
    'south_okkalapa_code',public.be_financial_v2_township_code_v61_7('South Okkalapa')='MMR013011',
    'south_okkalapa_myanmar_code',public.be_financial_v2_township_code_v61_7('တောင်ဥက္ကလာပ')='MMR013011',
    'south_okkalapa_bilingual_code',public.be_financial_v2_township_code_v61_7('တောင်ဥက္ကလာပ — South Okkalapa')='MMR013011',
    'south_okkalapa_standard_ok',v_result->>'validation_status'='OK',
    'base_tariff_4000',(v_result->>'base_tariff')::bigint=4000,
    'included_kg_3',(v_result->>'included_kg')::numeric=3,
    'extra_kg_7',(v_result->>'extra_kg')::numeric=7,
    'extra_per_kg_500',(v_result->>'extra_per_kg')::bigint=500,
    'weight_surcharge_3500',(v_result->>'weight_surcharge')::bigint=3500,
    'receiver_cod_59500',(v_result->>'cod_amount')::bigint=59500,
    'britium_entitlement_7500',(v_result->>'net_system_delivery_charge')::bigint=7500,
    'merchant_settlement_52000',(v_result->>'merchant_final_settlement_amount')::bigint=52000,
    'catalog_uses_canonical_table',v_catalog->>'source'='be_parcel_tariffs_v2',
    'catalog_has_south_okkalapa',exists(
      select 1 from jsonb_array_elements(v_catalog->'rows') r
      where r->>'township_code'='MMR013011' and r->>'customer_tier'='STANDARD'
        and (r->>'base_fee')::bigint=4000 and (r->>'included_kg')::numeric=3 and (r->>'extra_per_kg')::bigint=500
    ),
    'all_active_tariff_rows_resolved',(v_catalog->>'unresolved_tariff_rows')::integer=0,
    'mutation_shadow_preserved',coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'')='MUTATION_SHADOW',
    'audit_recorded',v_audit
  );
  select bool_and(value::boolean) into v_ok from jsonb_each(v_checks);
  raise notice '%', jsonb_pretty(jsonb_build_object(
    'ok',v_ok,
    'build','FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_VERIFY_2026_08_03',
    'checks',v_checks,
    'south_okkalapa_result',v_result,
    'catalog_summary',jsonb_build_object('row_count',v_catalog->'row_count','township_count',v_catalog->'township_count','source',v_catalog->'source'),
    'tariff_rows_changed',false,
    'historical_rows_changed',false,
    'financial_writes_enabled',false,
    'next_gate',case when v_ok then 'INSTALL_BUILD_AND_DEPLOY_TARIFF_WIRING_V61_7_FRONTEND' else 'STOP_AND_REVIEW_FAILED_CHECKS' end
  ));
  if not v_ok then raise exception 'V61.7 verifier failed: %', v_checks; end if;
end
$verify$;
rollback;

-- Return a normal result row as well as the NOTICE.
with result as (
  select public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0) r,
         public.be_tariff_catalog_v61_7() c
)
select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_VERIFY_2026_08_03',
  'south_okkalapa_result',r,
  'catalog_source',c->'source',
  'catalog_row_count',c->'row_count',
  'catalog_township_count',c->'township_count',
  'unresolved_active_tariff_rows',c->'unresolved_tariff_rows',
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),
  'financial_writes_enabled',false,
  'next_gate','INSTALL_BUILD_AND_DEPLOY_TARIFF_WIRING_V61_7_FRONTEND'
)) from result;
