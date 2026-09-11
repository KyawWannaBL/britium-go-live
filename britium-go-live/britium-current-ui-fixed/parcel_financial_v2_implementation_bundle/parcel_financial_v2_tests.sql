-- PARCEL_FINANCIAL_V2 required test cases.
-- Run after parcel_financial_v2_backend.sql.

do $$
declare r jsonb;
begin
  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',25000,6000,null,0,0,0,0,0,1,0);
  if (r->>'cod_amount')::bigint <> 31000 or (r->>'delivery_difference')::bigint <> 1500 or r->>'settlement_direction' <> 'CREDIT_TO_MERCHANT' or (r->>'merchant_final_settlement_amount')::bigint <> 26500 then raise exception 'Test 1 failed: %',r; end if;

  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',25000,3000,null,0,0,0,0,0,1,0);
  if (r->>'cod_amount')::bigint <> 28000 or (r->>'delivery_difference')::bigint <> -1500 or r->>'settlement_direction' <> 'DEDUCT_FROM_MERCHANT' or (r->>'merchant_final_settlement_amount')::bigint <> 23500 then raise exception 'Test 2 failed: %',r; end if;

  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',25000,4500,null,0,0,0,0,0,1,0);
  if (r->>'cod_amount')::bigint <> 29500 or (r->>'delivery_difference')::bigint <> 0 or r->>'settlement_direction' <> 'NO_ADJUSTMENT' or (r->>'merchant_final_settlement_amount')::bigint <> 25000 then raise exception 'Test 3 failed: %',r; end if;

  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','TOTAL_AMOUNT_INCLUDING_DELIVERY',25000,null,31000,0,0,0,0,0,1,0);
  if (r->>'cod_amount')::bigint <> 31000 or (r->>'effective_declared_delivery_charge')::bigint <> 6000 or (r->>'delivery_difference')::bigint <> 1500 or (r->>'merchant_final_settlement_amount')::bigint <> 26500 then raise exception 'Test 4 failed: %',r; end if;

  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT',25000,0,null,0,0,0,0,0,1,0);
  if (r->>'cod_amount')::bigint <> 25000 or (r->>'delivery_difference')::bigint <> -4500 or r->>'settlement_direction' <> 'DEDUCT_FROM_MERCHANT' or (r->>'merchant_final_settlement_amount')::bigint <> 20500 then raise exception 'Test 5 failed: %',r; end if;

  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',25000,6000,null,0,0,0,0,0,4.2,0);
  if (r->>'chargeable_weight_kg')::numeric <> 5 or (r->>'extra_kg')::numeric <> 2 or (r->>'weight_surcharge')::bigint <> 1000 or (r->>'net_system_delivery_charge')::bigint <> 5500 or (r->>'delivery_difference')::bigint <> 500 then raise exception 'Test 6 failed: %',r; end if;

  r := public.be_calculate_parcel_financial_v2('မြောက်ဥက္ကလာပ','STANDARD','EXACT_COLLECTION_AMOUNT',null,null,31000,0,0,0,0,0,1,0);
  if (r->>'cod_amount')::bigint <> 31000 or r->>'settlement_direction' <> 'BREAKDOWN_REQUIRED' or r->>'validation_status' <> 'REVIEW' or r->>'merchant_final_settlement_amount' is not null then raise exception 'Test 7 failed: %',r; end if;

  raise notice 'PARCEL_FINANCIAL_V2: all 7 required tests passed';
end
$$;
