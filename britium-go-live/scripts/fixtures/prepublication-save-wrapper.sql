CREATE OR REPLACE FUNCTION public.be_data_entry_financial_v2_save(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_pickup text := upper(nullif(btrim(v_payload->>'pickup_id'),''));
  v_sequence integer := CASE WHEN coalesce(v_payload->>'parcel_sequence','') ~ '^[1-9][0-9]*$' THEN (v_payload->>'parcel_sequence')::integer ELSE NULL END;
  v_temp text;
  v_source text := upper(nullif(btrim(v_payload->>'source_way_id'),''));
  v_match text[];
  v_result jsonb;
  v_moved_location integer := 0;
  v_merchant text := upper(nullif(btrim(coalesce(v_payload->>'merchant_id',v_payload->>'source_merchant_code','')),''));
BEGIN
  IF v_source IS NULL THEN
    v_match := regexp_match(coalesce(v_payload->>'remarks',''),'Way ID ([A-Za-z0-9-]+)','i');
    IF v_match IS NOT NULL THEN v_source := upper(v_match[1]); END IF;
  END IF;

  IF v_pickup IS NOT NULL AND v_sequence IS NOT NULL THEN
    v_temp := v_pickup||'-'||lpad(v_sequence::text,3,'0');
  END IF;

  IF v_pickup ~ '-(BBB|BLK)-' AND v_source ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' AND v_temp IS NOT NULL AND v_source<>v_temp THEN
    INSERT INTO public.be_delivery_way_id_aliases_v33(alias_way_id,canonical_way_id,pickup_id,parcel_sequence,merchant_code,source_kind,updated_at)
    VALUES(v_temp,v_source,v_pickup,v_sequence,v_merchant,'CONSOLIDATED_OS_IMPORT',now())
    ON CONFLICT (alias_way_id) DO UPDATE SET canonical_way_id=excluded.canonical_way_id,pickup_id=excluded.pickup_id,parcel_sequence=excluded.parcel_sequence,merchant_code=coalesce(excluded.merchant_code,public.be_delivery_way_id_aliases_v33.merchant_code),updated_at=now();

    -- If the UI validated a canonical source WayID before Save, temporarily expose
    -- that accepted location under the legacy generated ID inside this transaction.
    IF EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_source)
       AND NOT EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_temp) THEN
      UPDATE public.be_delivery_location_registry SET delivery_way_id=v_temp,updated_at=now() WHERE upper(delivery_way_id)=v_source;
      GET DIAGNOSTICS v_moved_location=ROW_COUNT;
    END IF;
  END IF;

  v_result := public.be_data_entry_financial_v2_save_legacy_v33(v_payload);

  IF coalesce((v_result->>'ok')::boolean,false) AND coalesce((v_result->>'persisted')::boolean,false)
     AND v_pickup ~ '-(BBB|BLK)-' AND v_source ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' AND v_temp IS NOT NULL AND v_source<>v_temp THEN
    PERFORM public.be_reconcile_original_way_id_v33(v_pickup,v_sequence,v_temp,v_source,v_merchant);
    RETURN public.be_rewrite_delivery_way_aliases_jsonb(v_result)
      || jsonb_build_object(
           'canonical_way_id',v_source,
           'way_id',v_source,
           'server_resolution',coalesce(v_result->'server_resolution','{}'::jsonb)||jsonb_build_object(
             'canonical_way_id_source','original merchant/source WayID',
             'client_way_id_ignored',false,
             'container_pickup_id',v_pickup
           )
         );
  END IF;

  IF v_moved_location>0 THEN
    UPDATE public.be_delivery_location_registry SET delivery_way_id=v_source,updated_at=now() WHERE upper(delivery_way_id)=v_temp;
  END IF;
  RETURN public.be_rewrite_delivery_way_aliases_jsonb(v_result);
END;
$function$

