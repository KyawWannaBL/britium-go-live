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
