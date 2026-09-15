do $$
declare
  v_oid oid;
  v_def text;
  v_old text := $old$
  if v_detail_count=0 or v_detail_count<>cardinality(v_sequences) or v_detail_count>v_expected
     or exists (select 1 from unnest(v_sequences) s where s<1 or s>v_expected)
     or exists (select 1 from public.be_data_entry_parcel_details d
       where d.pickup_id=v_pickup_id and d.parcel_sequence=any(v_sequences)
       and (d.saved_at is null or nullif(btrim(d.recipient_name),'') is null or nullif(btrim(d.contact_no_1),'') is null
         or nullif(btrim(d.recipient_address),'') is null or nullif(btrim(d.township),'') is null
         or lower(btrim(d.township))='unknown'
         or (coalesce(d.location_required,true) and not exists (
           select 1 from public.be_delivery_location_registry l where l.delivery_way_id=d.delivery_way_id
             and l.review_status='ACCEPTED' and l.latitude is not null and l.longitude is not null
             and l.address_original=d.recipient_address and l.township=d.township))))
     or v_bad_financial<>0 or v_bad_way_ids<>0 or v_missing_parcels<>0 then
$old$;
  v_new text := $new$
  if v_detail_count=0 or v_detail_count<>cardinality(v_sequences) or v_detail_count>v_expected
     or exists (select 1 from unnest(v_sequences) s where s<1 or s>v_expected)
     or exists (select 1 from public.be_data_entry_parcel_details d
       where d.pickup_id=v_pickup_id and d.parcel_sequence=any(v_sequences)
       and (nullif(btrim(d.recipient_name),'') is null or nullif(btrim(d.contact_no_1),'') is null
         or nullif(btrim(d.recipient_address),'') is null or nullif(btrim(d.township),'') is null
         or lower(btrim(d.township))='unknown'))
     or v_bad_way_ids<>0 or v_missing_parcels<>0 then
$new$;
  v_old_message text := $$'message','Selected parcels must have saved, valid financial details and approved delivery locations. Incomplete parcels remain pending.'$$;
  v_new_message text := $$'message','Selected parcels must exist with canonical Way IDs and required recipient, phone, township, and address details.'$$;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_data_entry_financial_v2_create_ready_waybill'
    and pg_get_function_identity_arguments(p.oid)='p_payload jsonb';

  if v_oid is null then
    raise exception 'be_data_entry_financial_v2_create_ready_waybill(jsonb) was not found';
  end if;
  if position(v_old in v_def)=0 then
    raise exception 'Expected readiness block was not found; refusing to alter an unexpected function definition';
  end if;
  if position(v_old_message in v_def)=0 then
    raise exception 'Expected readiness message was not found; refusing to alter an unexpected function definition';
  end if;

  v_def := replace(v_def, v_old, v_new);
  v_def := replace(v_def, v_old_message, v_new_message);
  execute v_def;
end
$$;

comment on function public.be_data_entry_financial_v2_create_ready_waybill(jsonb) is
'Selected-waybill creation no longer requires saved_at, financial OK status, or an accepted delivery-location registry record. Authentication, parcel existence, canonical Way IDs, required recipient fields, audit lineage, and downstream locking remain enforced.';
