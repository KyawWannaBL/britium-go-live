DO $mig$
DECLARE fn text; before text := 'or coalesce(v_stop.cod_collected,0)>0 or v_stop.cod_collected_at is not null'; after text := 'or coalesce(v_stop.cod_collected,0)>0 or v_stop.cod_collected_at is not null or coalesce(v_detail.actual_collect,0)>0';
BEGIN
 SELECT pg_get_functiondef(oid) INTO fn FROM pg_proc WHERE proname='be_finance_weight_review_quote_v2' LIMIT 1;
 IF fn IS NULL OR strpos(fn,before)=0 THEN RAISE EXCEPTION 'Finance quote version mismatch';END IF;
 EXECUTE replace(fn,before,after);
END $mig$;