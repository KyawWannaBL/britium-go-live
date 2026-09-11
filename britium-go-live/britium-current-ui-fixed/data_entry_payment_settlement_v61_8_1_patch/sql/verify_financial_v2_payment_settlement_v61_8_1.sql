-- Britium Express Financial V2 payment settlement verifier
-- Build: FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_VERIFY_2026_08_04
-- Read-only.

with results as (
  select
    public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',50000,6000,null,0,0,0,0,0,10,0) as item_delivery,
    public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','TOTAL_AMOUNT_INCLUDING_DELIVERY',50000,6000,null,0,0,0,0,0,10,0) as total_including,
    public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','DELIVERY_CHARGE_ONLY',null,6000,null,0,0,0,0,0,10,0) as delivery_only,
    public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','EXACT_COLLECTION_AMOUNT',null,null,56000,0,0,0,0,0,10,0) as exact_collection,
    public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','OPAQUE_COD_COLLECTION',null,null,56000,0,0,0,0,0,10,0) as opaque_collection,
    public.be_calculate_parcel_financial_v2('South Okkalapa','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',50000,null,null,0,0,0,0,0,10,0) as merchant_pays
), checks as (
  select jsonb_build_object(
    'function_exists',to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is not null,
    'calculation_version_ok',item_delivery->>'calculation_version'='PARCEL_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1',
    'item_delivery_cod_59500',(item_delivery->>'cod_amount')::bigint=59500,
    'item_delivery_britium_7500',(item_delivery->>'net_system_delivery_charge')::bigint=7500,
    'item_delivery_merchant_52000',(item_delivery->>'merchant_final_settlement_amount')::bigint=52000,
    'total_including_cod_59500',(total_including->>'cod_amount')::bigint=59500,
    'total_including_surcharge_3500',(total_including->>'customer_payable_delivery_surcharges')::bigint=3500,
    'total_including_britium_7500',(total_including->>'net_system_delivery_charge')::bigint=7500,
    'total_including_merchant_52000',(total_including->>'merchant_final_settlement_amount')::bigint=52000,
    'delivery_only_cod_9500',(delivery_only->>'cod_amount')::bigint=9500,
    'delivery_only_britium_7500',(delivery_only->>'net_system_delivery_charge')::bigint=7500,
    'delivery_only_merchant_2000',(delivery_only->>'merchant_final_settlement_amount')::bigint=2000,
    'exact_preserves_56000',(exact_collection->>'cod_amount')::bigint=56000,
    'exact_britium_7500',(exact_collection->>'net_system_delivery_charge')::bigint=7500,
    'exact_merchant_48500',(exact_collection->>'merchant_final_settlement_amount')::bigint=48500,
    'exact_status_ok',exact_collection->>'validation_status'='OK',
    'opaque_preserves_56000',(opaque_collection->>'cod_amount')::bigint=56000,
    'opaque_britium_7500',(opaque_collection->>'net_system_delivery_charge')::bigint=7500,
    'opaque_merchant_48500',(opaque_collection->>'merchant_final_settlement_amount')::bigint=48500,
    'opaque_status_ok',opaque_collection->>'validation_status'='OK',
    'merchant_pays_cod_50000',(merchant_pays->>'cod_amount')::bigint=50000,
    'merchant_pays_settlement_42500',(merchant_pays->>'merchant_final_settlement_amount')::bigint=42500,
    'south_okkalapa_tariff_4000',(item_delivery->>'base_tariff')::bigint=4000,
    'standard_included_kg_3',(item_delivery->>'included_kg')::numeric=3,
    'extra_kg_7',(item_delivery->>'extra_kg')::numeric=7,
    'weight_surcharge_3500',(item_delivery->>'weight_surcharge')::bigint=3500,
    'mutation_shadow_preserved',coalesce((select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton),'')='MUTATION_SHADOW',
    'audit_recorded',exists(select 1 from public.be_audit_events where action='FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1' and resource_id='be_calculate_parcel_financial_v2'),
    'tariff_rows_changed',false,
    'historical_rows_changed',false,
    'financial_writes_enabled',false
  ) as c,
  item_delivery,total_including,delivery_only,exact_collection,opaque_collection,merchant_pays
  from results
)
select jsonb_pretty(jsonb_build_object(
  'ok',not exists (select 1 from jsonb_each(c) e where e.value='false'::jsonb),
  'build','FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_VERIFY_2026_08_04',
  'checks',c,
  'results',jsonb_build_object(
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',item_delivery,
    'TOTAL_AMOUNT_INCLUDING_DELIVERY',total_including,
    'DELIVERY_CHARGE_ONLY',delivery_only,
    'EXACT_COLLECTION_AMOUNT',exact_collection,
    'OPAQUE_COD_COLLECTION',opaque_collection,
    'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',merchant_pays
  ),
  'next_gate','INSTALL_BUILD_AND_DEPLOY_DATA_ENTRY_PAYMENT_SETTLEMENT_V61_8_1_FRONTEND'
))
from checks;
