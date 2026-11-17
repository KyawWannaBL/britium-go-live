-- CI ONLY: retained V33 allocator predecessor, original name reconstructed before V33 migration.
CREATE OR REPLACE FUNCTION public.be_allocate_delivery_way_id(p_pickup_id text, p_parcel_sequence integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_pickup text:=upper(nullif(btrim(p_pickup_id),''));
 v_stem text;
 v_day text;
 v_existing text;
 v_next integer;
 v_id text;
BEGIN
 IF v_pickup IS NULL OR coalesce(p_parcel_sequence,0)<1 THEN
   RAISE EXCEPTION 'pickup_id and a positive parcel_sequence are required';
 END IF;
 SELECT delivery_way_id INTO v_existing FROM public.be_delivery_way_id_registry
  WHERE pickup_id=v_pickup AND parcel_sequence=p_parcel_sequence;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 v_stem:=public.be_delivery_way_stem(v_pickup);
 v_day:=substring(v_stem FROM '^D[0-9]{4}');
 IF v_day IS NULL THEN RAISE EXCEPTION 'Invalid pickup date stem: %',v_stem; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('BE_DELIVERY_DAILY:'||v_day,0));
 SELECT delivery_way_id INTO v_existing FROM public.be_delivery_way_id_registry
  WHERE pickup_id=v_pickup AND parcel_sequence=p_parcel_sequence;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 SELECT upper(btrim(v.delivery_way_id)) INTO v_existing
 FROM public.be_pickup_parcel_verifications v
 WHERE upper(v.pickup_id)=v_pickup AND v.parcel_sequence=p_parcel_sequence
   AND v.delivery_way_id IS NOT NULL
 ORDER BY v.updated_at DESC NULLS LAST,v.created_at DESC NULLS LAST,v.id LIMIT 1;
 IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
 SELECT coalesce(max(right(q.way_id,4)::integer),0)+1 INTO v_next
 FROM (
    SELECT upper(btrim(delivery_way_id)) way_id FROM public.be_delivery_way_id_registry
    UNION ALL SELECT upper(btrim(canonical_way_id)) FROM public.be_delivery_way_id_aliases_v33
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_pickup_parcel_verifications
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_data_entry_register_rows
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_data_entry_parcel_details
    UNION ALL SELECT upper(btrim(delivery_way_id)) FROM public.be_portal_cargo_events
    UNION ALL SELECT upper(btrim(deliver_way_id)) FROM public.be_portal_cargo_events
 ) q WHERE q.way_id ~ ('^'||v_day||'-[A-Z0-9]+-[0-9]{3,4}$');
 LOOP
   IF v_next>9999 THEN RAISE EXCEPTION 'DAILY_DELIVERY_ID_CAPACITY_REACHED: %',v_day USING errcode='54000'; END IF;
   v_id:=v_stem||lpad(v_next::text,4,'0');
   IF NOT EXISTS (
    SELECT 1 FROM public.be_delivery_way_id_registry WHERE delivery_way_id=v_id
    UNION ALL SELECT 1 FROM public.be_delivery_way_id_aliases_v33 WHERE upper(btrim(canonical_way_id))=v_id
    UNION ALL SELECT 1 FROM public.be_pickup_parcel_verifications WHERE upper(btrim(delivery_way_id))=v_id
    UNION ALL SELECT 1 FROM public.be_data_entry_register_rows WHERE upper(btrim(delivery_way_id))=v_id
    UNION ALL SELECT 1 FROM public.be_data_entry_parcel_details WHERE upper(btrim(delivery_way_id))=v_id
   ) THEN
    INSERT INTO public.be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence)
    VALUES (v_id,v_pickup,p_parcel_sequence) ON CONFLICT DO NOTHING;
    IF FOUND THEN RETURN v_id; END IF;
   END IF;
   SELECT delivery_way_id INTO v_existing FROM public.be_delivery_way_id_registry WHERE pickup_id=v_pickup AND parcel_sequence=p_parcel_sequence;
   IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
   v_next:=v_next+1;
 END LOOP;
END;
$function$;
