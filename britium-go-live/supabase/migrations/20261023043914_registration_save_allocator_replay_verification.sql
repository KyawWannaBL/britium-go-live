-- Use the same allocator as parcel identity triggers and imported source aliases.
-- Keep authentication, published-record locks, and identity mismatch checks intact.
DO $migration$
DECLARE f text; old_assignment text; new_assignment text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['be_data_entry_financial_v2_save_legacy_v33','be_data_entry_financial_v2_save_v13_2_unbounded'] LOOP
    f:=pg_get_functiondef(('public.'||fn||'(jsonb)')::regprocedure);
    IF fn='be_data_entry_financial_v2_save_legacy_v33' THEN
      old_assignment:='v_delivery_way_id := v_pickup_id||''-''||lpad(v_sequence::text,3,''0'');';
      new_assignment:='v_delivery_way_id := public.be_allocate_delivery_way_id(v_pickup_id,v_sequence);';
    ELSE
      old_assignment:='v_way_id := v_pickup_id || ''-'' || lpad(v_sequence::text, 3, ''0'');';
      new_assignment:='v_way_id := public.be_allocate_delivery_way_id(v_pickup_id,v_sequence);';
    END IF;
    IF position(new_assignment in f)>0 THEN CONTINUE; END IF;
    IF position(old_assignment in f)=0 THEN RAISE EXCEPTION 'Unexpected function definition: %',fn; END IF;
    EXECUTE replace(f,old_assignment,new_assignment);
  END LOOP;
END
$migration$;
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
