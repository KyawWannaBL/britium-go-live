-- Post-migration read-only calculation acceptance test.
-- Must be run AFTER authorized migration deployment.
do $qa$
declare
  v_quote jsonb;
  v_rate bigint;
  v_surcharge bigint;
begin
  select standard_rate_mmk::bigint into v_rate
  from public.be_data_entry_tariff_catalog
  where provider_code='ROYAL EXPRESS'
    and destination_name='ထန်းတပင်'
    and is_active;
  if v_rate is distinct from 5000 then
    raise exception 'ROYAL_CATALOG_EXPECTED_RATE_CHANGED';
  end if;

  v_quote := public.be_calculate_parcel_financial_v2(
    'ထန်းတပင်', 'STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    20000,5000,null,0,0,0,0,0,2,0
  );
  if v_quote->>'validation_status'<>'OK'
     or (v_quote->>'base_tariff')::bigint<>v_rate then
    raise exception 'ROYAL_BASE_TARIFF_CALCULATION_FAILED: %',v_quote;
  end if;
  if (v_quote->>'cod_amount')::bigint<>25000 then
    raise exception 'ROYAL_RECEIVER_COD_CHANGED';
  end if;
  v_quote := public.be_calculate_parcel_financial_v2(
    'ထန်းတပင်','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    20000,5000,null,0,0,0,0,0,5,0
  );
  v_surcharge := coalesce((v_quote->>'weight_surcharge')::bigint,-1);
  if v_quote->>'validation_status'<>'OK' or v_surcharge<0 then
    raise exception 'ROYAL_WEIGHT_SURCHARGE_INVALID: %',v_quote;
  end if;

  -- Unsupported names should NOT silently inherit another town's 5,000 Ks rate.
  if public.be_approved_tariff_lookup_key('ထန်းခြောက်ပင်') is null then
    v_quote:=public.be_calculate_parcel_financial_v2(
      'ထန်းခြောက်ပင်','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
      20000,5000,null,0,0,0,0,0,2,0
    );
    if v_quote->>'validation_status'<>'ERROR' then
      raise exception 'UNAPPROVED_DESTINATION_WAS_PRICED';
    end if;
  end if;
  raise notice 'PASS Royal approved tariff, COD, KG, and unapproved destination safety';
end $qa$;
