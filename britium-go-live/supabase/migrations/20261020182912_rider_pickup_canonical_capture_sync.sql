-- Resolve canonical IDs before cargo writes. Never rename historic rows or change ACLs.
CREATE OR REPLACE FUNCTION public.be_allocate_delivery_way_id_legacy_v33(p_pickup_id text, p_parcel_sequence integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pickup_id text := upper(nullif(btrim(p_pickup_id), ''));
  v_sequence integer := p_parcel_sequence;
  v_stem text;
  v_candidate text;
  v_existing text;
  v_next integer;
begin
  if v_pickup_id is null or coalesce(v_sequence, 0) < 1 then
    raise exception 'pickup_id and a positive parcel_sequence are required.';
  end if;

  select r.delivery_way_id into v_existing
  from public.be_delivery_way_id_registry r
  where r.pickup_id=v_pickup_id and r.parcel_sequence=v_sequence;
  if v_existing is not null then return v_existing; end if;

  v_stem := public.be_delivery_way_stem(v_pickup_id);
  -- Use the established shared-stem lock and retain historic assignments.
  perform pg_advisory_xact_lock(hashtext(v_stem));
  select r.delivery_way_id into v_existing
  from public.be_delivery_way_id_registry r
  where r.pickup_id=v_pickup_id and r.parcel_sequence=v_sequence;
  if v_existing is not null then return v_existing; end if;

  select nullif(upper(btrim(v.delivery_way_id)),'') into v_existing
  from public.be_pickup_parcel_verifications v
  where upper(v.pickup_id)=v_pickup_id and v.parcel_sequence=v_sequence
    and upper(v.delivery_way_id) like 'D%'
  order by v.updated_at desc nulls last,v.created_at desc nulls last,v.id limit 1;
  if v_existing is not null then return v_existing; end if;

  v_next:=v_sequence;
  loop
    -- The established suffix has three digits. Fail rather than truncate/reuse an ID.
    if v_next>999 then
      raise exception 'DELIVERY_WAY_ID_NAMESPACE_EXHAUSTED: %',v_stem using errcode='54000';
    end if;
    v_candidate:=v_stem||lpad(v_next::text,3,'0');
    -- Pre-registry saves in either canonical store also occupy their D IDs.
    if not exists (
      select 1 from public.be_pickup_parcel_verifications v
      where upper(btrim(v.delivery_way_id))=v_candidate
      union all
      select 1 from public.be_delivery_way_id_aliases_v33 a
      where upper(btrim(a.canonical_way_id))=v_candidate
      union all
      select 1 from public.be_portal_cargo_events e
      where v_candidate in (
        upper(btrim(e.delivery_way_id)),upper(btrim(e.deliver_way_id)),
        upper(btrim(e.tracking_no)),upper(btrim(e.tracking_number))
      )
    ) then
      insert into public.be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence)
      values(v_candidate,v_pickup_id,v_sequence) on conflict do nothing;
      if found then return v_candidate; end if;
    end if;

    select r.delivery_way_id into v_existing
    from public.be_delivery_way_id_registry r
    where r.pickup_id=v_pickup_id and r.parcel_sequence=v_sequence;
    if v_existing is not null then return v_existing; end if;

    select greatest(v_next+1,coalesce(max(
      case when r.delivery_way_id ~ ('^'||v_stem||'[0-9]+$')
        then substring(r.delivery_way_id from '([0-9]+)$')::integer else 0 end
    ),0)+1) into v_next
    from (
      select delivery_way_id from public.be_delivery_way_id_registry
      union all
      select upper(btrim(canonical_way_id)) from public.be_delivery_way_id_aliases_v33
      union all
      select upper(btrim(delivery_way_id)) from public.be_pickup_parcel_verifications
      union all
      select upper(btrim(ids.delivery_way_id))
      from public.be_portal_cargo_events e
      cross join lateral unnest(array[e.delivery_way_id,e.deliver_way_id,e.tracking_no,e.tracking_number]) ids(delivery_way_id)
    ) r
    where r.delivery_way_id like v_stem||'%';
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.be_pickup_parcel_capture_save(p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_pickup text:=nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id','')),'');
  v_seq integer:=coalesce(nullif(p_payload->>'line_no','')::integer,nullif(p_payload->>'row_no','')::integer,0);
  v_weight numeric:=coalesce(nullif(p_payload->>'parcel_weight','')::numeric,nullif(p_payload->>'actual_weight_kg','')::numeric,0);
  v_delivery text:=nullif(upper(btrim(coalesce(p_payload->>'delivery_way_id',''))),'');
  v_waybill text:=nullif(btrim(coalesce(p_payload->>'waybill_no','')),'');
  v_proof text:=nullif(btrim(coalesce(p_payload->>'cargo_photo_url',p_payload->>'proof_url','')),'');
  v_result jsonb;
  v_requested_delivery text:=v_delivery;
  v_existing_delivery text;
  v_existing_waybill text;
  v_parcel jsonb;
begin
  if v_pickup is null then raise exception 'pickup_id is required'; end if;
  perform public.be_rider_assert_assigned_pickup(v_pickup);

  if v_seq<1 then raise exception 'parcel line number is required'; end if;
  if v_weight<=0 then raise exception 'Actual parcel weight must be greater than zero'; end if;
  if v_proof is null then raise exception 'Approved cargo photo upload is required'; end if;

  -- Existing verification IDs are authoritative, including pre-registry saves.
  select nullif(upper(btrim(v.delivery_way_id)),''),nullif(btrim(v.waybill_no),'')
  into v_existing_delivery,v_existing_waybill
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup and v.parcel_sequence=v_seq
  order by v.updated_at desc nulls last,v.created_at desc nulls last,v.id
  limit 1
  for update;

  if v_existing_delivery is not null then
    v_delivery:=v_existing_delivery;
    v_waybill:=coalesce(v_existing_waybill,
      case when v_requested_delivery=v_delivery then v_waybill else null end);
  else
    -- Caller-generated D IDs are only provisional. Keep the established allocator.
    v_delivery:=public.be_allocate_delivery_way_id(v_pickup,v_seq);
    if v_requested_delivery is distinct from v_delivery then v_waybill:=null; end if;
  end if;

  v_result:=public.be_rider_upsert_parcel_proof(
    v_pickup,
    v_seq,
    v_weight,
    v_proof,
    v_delivery,
    coalesce(v_delivery,v_waybill),
    v_waybill,
    nullif(btrim(coalesce(p_payload->>'remarks','')),''),
    nullif(btrim(coalesce(p_payload->>'cargo_photo_name',p_payload->>'proof_file_name','')),''),
    null
  );

  -- Use the child's confirmed ID before touching any cargo event.
  v_delivery:=nullif(upper(btrim(v_result->>'delivery_way_id')),'');
  if v_delivery is null then raise exception 'CANONICAL_DELIVERY_WAY_ID_REQUIRED'; end if;

  select jsonb_build_object(
    'delivery_way_id',v.delivery_way_id,
    'waybill_no',v.waybill_no,
    'temp_qr_code',coalesce(nullif(v.qr_payload,''),'TQR-'||upper(v_pickup)||'-'||lpad(v_seq::text,3,'0')),
    'parcel_weight',coalesce(v.actual_weight_kg,v.parcel_weight_kg),
    'cargo_photo_url',coalesce(v.proof_photo_url,v.proof_photo_path),
    'cargo_photo_name',v.proof_file_name
  ) into v_parcel
  from public.be_pickup_parcel_verifications v
  where v.pickup_id=v_pickup and v.parcel_sequence=v_seq
  order by v.updated_at desc nulls last,v.created_at desc nulls last,v.id limit 1;
  v_waybill:=v_parcel->>'waybill_no';

  update public.be_portal_cargo_events e
  set field_pickup_checked=true,
      field_pickup_checked_at=now(),
      field_pickup_checked_by=v_identity->>'worker_code',
      field_pickup_photo_url=v_proof,
      field_pickup_weight_kg=v_weight,
      pickup_verification_status=case
        when e.field_pickup_photo_url is not distinct from v_proof
          and upper(coalesce(e.pickup_verification_status,'')) in ('APPROVED','VERIFIED')
        then e.pickup_verification_status
        else 'PENDING_REVIEW'
      end,
      pickup_verification_note=nullif(btrim(coalesce(p_payload->>'remarks','')),''),
      updated_at=now()
  where e.pickup_id=v_pickup
    and upper(coalesce(e.delivery_way_id,e.deliver_way_id,e.tracking_no,e.tracking_number,''))=v_delivery;

  insert into public.be_portal_cargo_events(
    pickup_id,delivery_way_id,tracking_no,event_type,event_status,event_note,
    actor_role,actor_type,actor_code,actor_email,source_module,source_table,source_key,
    proof_url,weight_kg,field_pickup_checked,field_pickup_checked_at,field_pickup_checked_by,
    field_pickup_photo_url,field_pickup_weight_kg,pickup_verification_status,pickup_verification_note,
    metadata,created_at,updated_at
  ) values (
    v_pickup,v_delivery,coalesce(v_delivery,v_waybill),
    'PICKUP_PARCEL_VERIFIED','PENDING_REVIEW','Rider submitted parcel proof for Enterprise review.',
    coalesce(v_identity->>'role','rider'),coalesce(v_identity->>'role','rider'),
    v_identity->>'worker_code',v_identity->>'email','RIDER_APP','be_pickup_parcel_verifications',
    v_pickup||':'||v_seq::text,v_proof,v_weight,true,now(),v_identity->>'worker_code',
    v_proof,v_weight,'PENDING_REVIEW',nullif(btrim(coalesce(p_payload->>'remarks','')),''),
    jsonb_build_object('parcel_sequence',v_seq,'waybill_no',v_waybill,'source','RIDER_ENTERPRISE_V89'),
    now(),now()
  )
  on conflict (tracking_no) do update set
    field_pickup_checked=true,
    field_pickup_checked_at=excluded.field_pickup_checked_at,
    field_pickup_checked_by=excluded.field_pickup_checked_by,
    field_pickup_photo_url=excluded.field_pickup_photo_url,
    field_pickup_weight_kg=excluded.field_pickup_weight_kg,
    proof_url=excluded.proof_url,
    weight_kg=excluded.weight_kg,
    pickup_verification_status=case
      when public.be_portal_cargo_events.field_pickup_photo_url is not distinct from excluded.field_pickup_photo_url
        and upper(coalesce(public.be_portal_cargo_events.pickup_verification_status,'')) in ('APPROVED','VERIFIED')
      then public.be_portal_cargo_events.pickup_verification_status
      else excluded.pickup_verification_status
    end,
    pickup_verification_note=excluded.pickup_verification_note,
    metadata=coalesce(public.be_portal_cargo_events.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now()
  where public.be_portal_cargo_events.pickup_id=excluded.pickup_id;

  if not found then
    raise exception 'TRACKING_NO_BELONGS_TO_ANOTHER_PICKUP: %',coalesce(v_delivery,v_waybill) using errcode='23505';
  end if;

  return v_result||coalesce(v_parcel,'{}'::jsonb)||jsonb_build_object(
    'photo_status',coalesce((
      select pv.proof_check_status from public.be_pickup_parcel_verifications pv
      where pv.pickup_id=v_pickup and pv.parcel_sequence=v_seq
      order by pv.updated_at desc nulls last limit 1
    ),'PENDING_REVIEW'),
    'enterprise_event_synced',true,
    'worker_code',v_identity->>'worker_code'
  );
end;
$function$;
