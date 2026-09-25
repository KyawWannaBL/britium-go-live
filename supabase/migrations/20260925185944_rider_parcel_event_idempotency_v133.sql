-- Make Rider parcel proof saves repeatable without inserting a second cargo event for the same tracking number.
create or replace function public.be_pickup_parcel_capture_save(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity jsonb:=public.be_current_field_team_identity();
  v_pickup text:=nullif(btrim(coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id','')),'');
  v_seq integer:=coalesce(nullif(p_payload->>'line_no','')::integer,nullif(p_payload->>'row_no','')::integer,0);
  v_weight numeric:=coalesce(nullif(p_payload->>'parcel_weight','')::numeric,nullif(p_payload->>'actual_weight_kg','')::numeric,0);
  v_delivery text:=nullif(upper(btrim(coalesce(p_payload->>'delivery_way_id',''))),'');
  v_waybill text:=nullif(btrim(coalesce(p_payload->>'waybill_no','')),'');
  v_proof text:=nullif(btrim(coalesce(p_payload->>'cargo_photo_url',p_payload->>'proof_url','')),'');
  v_result jsonb;
begin
  if v_pickup is null then raise exception 'pickup_id is required'; end if;
  perform public.be_rider_assert_assigned_pickup(v_pickup);

  if v_seq<1 then raise exception 'parcel line number is required'; end if;
  if v_weight<=0 then raise exception 'Actual parcel weight must be greater than zero'; end if;
  if v_proof is null then raise exception 'Approved cargo photo upload is required'; end if;

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
    and (
      v_delivery is null
      or upper(coalesce(e.delivery_way_id,e.deliver_way_id,e.tracking_no,e.tracking_number,''))=v_delivery
    );

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

  return v_result||jsonb_build_object(
    'photo_status',coalesce((
      select pv.proof_check_status from public.be_pickup_parcel_verifications pv
      where pv.pickup_id=v_pickup and pv.parcel_sequence=v_seq
      order by pv.updated_at desc nulls last limit 1
    ),'PENDING_REVIEW'),
    'enterprise_event_synced',true,
    'worker_code',v_identity->>'worker_code'
  );
end;
$$;

revoke all on function public.be_pickup_parcel_capture_save(jsonb) from public,anon;
grant execute on function public.be_pickup_parcel_capture_save(jsonb) to authenticated;
