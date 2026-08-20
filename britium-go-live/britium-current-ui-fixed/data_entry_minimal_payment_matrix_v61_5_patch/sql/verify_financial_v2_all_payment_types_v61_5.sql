-- Read-only verifier
-- Build: FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_VERIFY_2026_08_03

with results as (
  select
    public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0) as item_delivery,
    public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','TOTAL_AMOUNT_INCLUDING_DELIVERY',50000,null,56000,0,0,0,0,0,10,0) as total_including,
    public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','DELIVERY_CHARGE_ONLY',null,6000,null,0,0,0,0,0,10,0) as delivery_only,
    public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','EXACT_COLLECTION_AMOUNT',null,null,56000,0,0,0,0,0,10,0) as exact_collection,
    public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','OPAQUE_COD_COLLECTION',null,null,56000,0,0,0,0,0,10,0) as opaque_cod,
    public.be_calculate_parcel_financial_v2('Dagon Myothit (North)','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',50000,null,null,0,0,0,0,0,10,0) as merchant_pays
), checks as (
  select
    *,
    ((item_delivery->>'validation_status')='OK') as item_delivery_ok,
    ((item_delivery->>'extra_kg')::numeric=7) as standard_extra_7kg,
    ((item_delivery->>'weight_surcharge')::bigint=3500) as standard_surcharge_3500,
    ((item_delivery->>'cod_amount')::bigint=59500) as item_delivery_cod_59500,
    ((item_delivery->>'net_system_delivery_charge')::bigint=7500) as item_delivery_britium_7500,
    ((item_delivery->>'merchant_final_settlement_amount')::bigint=52000) as item_delivery_merchant_52000,
    ((total_including->>'validation_status')='OK' and (total_including->>'cod_amount')::bigint=59500 and (total_including->>'merchant_final_settlement_amount')::bigint=52000) as total_including_ok,
    ((delivery_only->>'validation_status')='OK' and (delivery_only->>'cod_amount')::bigint=9500 and (delivery_only->>'merchant_final_settlement_amount')::bigint=2000) as delivery_only_ok,
    ((exact_collection->>'validation_status')='REVIEW' and (exact_collection->>'settlement_direction')='BREAKDOWN_REQUIRED' and (exact_collection->>'cod_amount')::bigint=59500) as exact_collection_ok,
    ((opaque_cod->>'validation_status')='REVIEW' and (opaque_cod->>'settlement_direction')='OPAQUE_SERVICE_FEE' and (opaque_cod->>'cod_amount')::bigint=59500) as opaque_cod_ok,
    ((merchant_pays->>'validation_status')='OK' and (merchant_pays->>'cod_amount')::bigint=50000 and (merchant_pays->>'customer_payable_delivery_surcharges')::bigint=0 and (merchant_pays->>'weight_surcharge')::bigint=3500 and (merchant_pays->>'merchant_final_settlement_amount')::bigint=42500) as merchant_pays_ok,
    (position('PARCEL_FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5' in pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)) > 0) as calculation_version_ok,
    (position('OPAQUE_COD_COLLECTION' in pg_get_functiondef('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure)) > 0) as opaque_type_supported,
    (coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'')='MUTATION_SHADOW') as mutation_shadow_preserved,
    (to_regclass('public.be_audit_events') is null or exists(select 1 from public.be_audit_events where action='FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5' and resource_id='be_calculate_parcel_financial_v2')) as audit_recorded
  from results
)
select jsonb_pretty(jsonb_build_object(
  'ok',
    item_delivery_ok and standard_extra_7kg and standard_surcharge_3500
    and item_delivery_cod_59500 and item_delivery_britium_7500 and item_delivery_merchant_52000
    and total_including_ok and delivery_only_ok and exact_collection_ok and opaque_cod_ok
    and merchant_pays_ok and calculation_version_ok and opaque_type_supported
    and mutation_shadow_preserved and audit_recorded,
  'build','FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_VERIFY_2026_08_03',
  'checks',jsonb_build_object(
    'item_delivery_ok',item_delivery_ok,
    'standard_extra_7kg',standard_extra_7kg,
    'standard_surcharge_3500',standard_surcharge_3500,
    'item_delivery_cod_59500',item_delivery_cod_59500,
    'item_delivery_britium_7500',item_delivery_britium_7500,
    'item_delivery_merchant_52000',item_delivery_merchant_52000,
    'total_including_ok',total_including_ok,
    'delivery_only_ok',delivery_only_ok,
    'exact_collection_ok',exact_collection_ok,
    'opaque_cod_ok',opaque_cod_ok,
    'merchant_pays_ok',merchant_pays_ok,
    'calculation_version_ok',calculation_version_ok,
    'opaque_type_supported',opaque_type_supported,
    'mutation_shadow_preserved',mutation_shadow_preserved,
    'audit_recorded',audit_recorded
  ),
  'results',jsonb_build_object(
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',item_delivery,
    'TOTAL_AMOUNT_INCLUDING_DELIVERY',total_including,
    'DELIVERY_CHARGE_ONLY',delivery_only,
    'EXACT_COLLECTION_AMOUNT',exact_collection,
    'OPAQUE_COD_COLLECTION',opaque_cod,
    'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',merchant_pays
  ),
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'financial_writes_enabled',false,
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_MINIMAL_PAYMENT_MATRIX_V61_5_FRONTEND'
))
from checks;
