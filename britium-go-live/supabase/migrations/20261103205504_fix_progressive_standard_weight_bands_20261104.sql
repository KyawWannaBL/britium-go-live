
DO $migration$
DECLARE
 fn text;
 old_fragment text := 'greatest(0::numeric,least(w,20)-10)*700+greatest(0::numeric,least(w,30)-20)*1000+greatest(0::numeric,w-30)*1500';
 new_fragment text := 'greatest(0::numeric,least(w,20)-10)*1000+greatest(0::numeric,w-20)*1500';
 q006 jsonb;
 q008 jsonb;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO fn FROM pg_proc p
 WHERE p.proname='be_image_tariff_weight_surcharge_v1'
 AND pg_get_function_identity_arguments(p.oid)='p_zone text, p_township text, p_tier text, p_weight numeric, p_included numeric, p_fallback_per_kg bigint'
 LIMIT 1;
 IF fn IS NULL THEN RAISE EXCEPTION 'Expected surcharge function not found'; END IF;
 IF strpos(fn,new_fragment)>0 AND strpos(fn,old_fragment)=0 THEN
  NULL;
 ELSIF strpos(fn,old_fragment)>0 THEN
  EXECUTE replace(fn,old_fragment,new_fragment);
 ELSE
  RAISE EXCEPTION 'Weight surcharge source changed: requires review';
 END IF;
 IF public.be_image_tariff_weight_surcharge_v1('YANGON','အင်းစိန်','STANDARD',16,3,500)<>9500
 OR public.be_image_tariff_weight_surcharge_v1('YANGON','အင်းစိန်','STANDARD',21,3,500)<>15000
 OR public.be_image_tariff_weight_surcharge_v1('YANGON','အင်းစိန်','STANDARD',10,3,500)<>3500
 OR public.be_image_tariff_weight_surcharge_v1('YANGON','အင်းစိန်','STANDARD',20,3,500)<>13500
 OR public.be_image_tariff_weight_surcharge_v1('NPT','နေပြည်တော်','STANDARD',10,3,500)<>10500
 THEN RAISE EXCEPTION 'Weight band regression'; END IF;
 SELECT public.be_calculate_parcel_financial_v2(
 township,customer_tier,amount_entry_type,item_price::bigint,delivery_charges,
 merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,
 merchant_payable_charges,other_merchant_credits,16,
 coalesce(nullif(financial_quote->>'monthly_ways','')::integer,0))
 INTO q006 FROM public.be_data_entry_parcel_details WHERE delivery_way_id='D1031-YDC-006' LIMIT 1;
 SELECT public.be_calculate_parcel_financial_v2(
 township,customer_tier,amount_entry_type,item_price::bigint,delivery_charges,
 merchant_stated_total_amount,additional_customer_charge,cbm_surcharge,other_surcharge,
 merchant_payable_charges,other_merchant_credits,21,
 coalesce(nullif(financial_quote->>'monthly_ways','')::integer,0))
 INTO q008 FROM public.be_data_entry_parcel_details WHERE delivery_way_id='D1031-YDC-008' LIMIT 1;
 IF q006 IS NULL OR q008 IS NULL
 OR (q006->>'cod_amount')::bigint<>2022500
 OR (q008->>'cod_amount')::bigint<>3002800
 THEN RAISE EXCEPTION 'COD regression: 006 %, 008 %',q006->>'cod_amount',q008->>'cod_amount'; END IF;
END $migration$;