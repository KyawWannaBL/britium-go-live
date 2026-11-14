-- The allocator may already have saved the original source identity.
-- Reconcile only when a legacy temporary identity was actually created.
DO $migration$
DECLARE f text;
BEGIN
 f:=pg_get_functiondef('public.be_data_entry_financial_v2_save(jsonb)'::regprocedure);
 f:=replace(f,'IF EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_source)',
 'IF public.be_allocate_delivery_way_id(v_pickup,v_sequence) IS DISTINCT FROM v_source AND EXISTS (SELECT 1 FROM public.be_delivery_location_registry WHERE upper(delivery_way_id)=v_source)');
 IF position('IF v_result->>''canonical_way_id'' IS DISTINCT FROM v_source THEN' in f)=0 THEN
 IF position('PERFORM public.be_reconcile_original_way_id_v33(v_pickup,v_sequence,v_temp,v_source,v_merchant);' in f)=0 THEN RAISE EXCEPTION 'Unexpected save wrapper'; END IF;
 f:=replace(f,'PERFORM public.be_reconcile_original_way_id_v33(v_pickup,v_sequence,v_temp,v_source,v_merchant);',
 'IF v_result->>''canonical_way_id'' IS DISTINCT FROM v_source THEN
    PERFORM public.be_reconcile_original_way_id_v33(v_pickup,v_sequence,v_temp,v_source,v_merchant);
  ELSIF v_moved_location>0 THEN
    UPDATE public.be_delivery_location_registry SET delivery_way_id=v_source,updated_at=now() WHERE upper(delivery_way_id)=v_temp;
  END IF;');
 END IF;
 EXECUTE f;
END
$migration$;
