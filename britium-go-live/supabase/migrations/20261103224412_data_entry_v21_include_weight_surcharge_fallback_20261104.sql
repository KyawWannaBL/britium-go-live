DO $fix$
DECLARE fn text; needle text := 'coalesce(nullif(v_data->>''backend_calculated_delivery_surcharges'','''')::bigint,0),';
replacement text := 'greatest(coalesce(nullif(v_data->>''backend_calculated_delivery_surcharges'','''')::bigint,0),coalesce(nullif(v_data->>''weight_surcharge'','''')::bigint,0)),';
BEGIN
 SELECT pg_get_functiondef(oid) INTO fn FROM pg_proc WHERE proname='be_data_entry_financial_v2_calculate_v21_legacy' LIMIT 1;
 IF fn IS NULL OR strpos(fn,needle)=0 THEN
  RAISE EXCEPTION 'Financial V21 reconciliation source changed; manual review required';
 END IF;
 EXECUTE replace(fn,needle,replacement);
END $fix$;