create or replace function public.be_warehouse_mark_scanned_ready_v36(
  p_pickup_id text,
  p_staging_zone text default 'READY_FOR_DISPATCH',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text := public.be_warehouse_assert_internal();
  v_actor text := public.be_warehouse_actor_email();
  v_count integer := 0;
  v_received integer := 0;
  v_exceptions integer := 0;
begin
  if nullif(btrim(coalesce(p_pickup_id,'')),'') is null then
    raise exception 'Pickup ID is required' using errcode='22023';
  end if;

  select count(*) filter (where warehouse_status='RECEIVED')::integer,
         count(*) filter (where warehouse_status='WAREHOUSE_EXCEPTION')::integer
    into v_received,v_exceptions
  from public.be_warehouse_receipts_v36
  where pickup_id=p_pickup_id;

  if v_received=0 then
    return jsonb_build_object(
      'ok',false,'pickup_id',p_pickup_id,'ready_count',0,
      'error','NO_SCANNED_RECEIVED_PARCELS',
      'message','Warehouse READY requires a successful receiving scan first.',
      'exceptions_left_on_hold',v_exceptions,
      'authorized_role',v_role,'actor_email',v_actor
    );
  end if;

  insert into public.be_warehouse_receipt_events_v36(
    pickup_id,parcel_sequence,delivery_way_id,action,
    previous_status,new_status,warehouse_code,staging_zone,actor_email
  )
  select r.pickup_id,r.parcel_sequence,r.delivery_way_id,'BATCH_READY',
         r.warehouse_status,'WAREHOUSE_READY',r.warehouse_code,
         coalesce(nullif(p_staging_zone,''),r.staging_zone,'READY_FOR_DISPATCH'),v_actor
  from public.be_warehouse_receipts_v36 r
  where r.pickup_id=p_pickup_id and r.warehouse_status='RECEIVED';

  update public.be_warehouse_receipts_v36
  set warehouse_status='WAREHOUSE_READY',
      parcel_condition=case when parcel_condition='UNINSPECTED' then 'GOOD' else parcel_condition end,
      staging_zone=coalesce(nullif(p_staging_zone,''),staging_zone,'READY_FOR_DISPATCH'),
      ready_at=now(),ready_by=v_actor,updated_at=now()
  where pickup_id=p_pickup_id and warehouse_status='RECEIVED';
  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'ok',true,'pickup_id',p_pickup_id,'ready_count',v_count,
    'exceptions_left_on_hold',(select count(*)::integer from public.be_warehouse_receipts_v36 where pickup_id=p_pickup_id and warehouse_status='WAREHOUSE_EXCEPTION'),
    'authorized_role',v_role,'actor_email',v_actor,'auth_enforced',true,
    'canonical_warehouse_ready',true
  );
end;
$$;

create or replace function public.be_warehouse_scan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text := public.be_warehouse_assert_internal();
  v_actor text := public.be_warehouse_actor_email();
  pid text := coalesce(p_payload->>'pickup_id',p_payload->>'pickup_way_id');
  scan text := lower(coalesce(p_payload->>'scan_type','inbound'));
  st text;
  r record;
begin
  select * into r from public.be_portal_pickup_requests where pickup_id=pid or pickup_way_id=pid limit 1;
  if not found then raise exception 'Pickup % not found',pid; end if;

  st := case when scan in ('inbound','received','receive') then 'received'
             when scan in ('warehouse','in_warehouse') then 'in_warehouse'
             when scan in ('sort','sorting') then 'sorting'
             when scan in ('bag','bagged') then 'bagged'
             when scan in ('dispatch','dispatched') then 'dispatch_scan_required'
             else scan end;

  if scan in ('dispatch','dispatched') then
    raise exception 'Use the canonical parcel Delivery Way ID dispatch scan after Wayplan approval; pickup-level legacy dispatch is disabled.' using errcode='22023';
  end if;

  insert into public.be_warehouse_scans(
    pickup_id,waybill_no,scan_type,warehouse_branch,operator_code,bag_code,route_zone,
    expected_parcel_count,scanned_parcel_count,status,metadata,created_at
  ) values(
    r.pickup_id,r.waybill_no,scan,coalesce(p_payload->>'warehouse_branch',r.assigned_branch),
    v_actor,p_payload->>'bag_code',coalesce(p_payload->>'route_zone',r.route_zone),
    r.parcel_count,coalesce(nullif(p_payload->>'scanned_parcel_count','')::int,r.parcel_count),st,
    coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('authenticated_actor',v_actor,'authorized_role',v_role),now()
  );

  update public.be_portal_pickup_requests set status=st,warehouse_status=st,updated_at=now() where id=r.id;
  update public.be_waybill_ledger set status=st,updated_at=now() where waybill_no=r.waybill_no;
  perform public.be30_event(r.pickup_id,'warehouse_scan',st,'warehouse',v_actor,coalesce(p_payload,'{}'::jsonb));

  return jsonb_build_object('ok',true,'pickup_id',r.pickup_id,'warehouse_status',st,'authorized_role',v_role,'actor_email',v_actor,'auth_enforced',true,'legacy_pickup_scan',true);
end;
$$;

create or replace function public.be_warehouse_scan_action(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_role text := public.be_warehouse_assert_internal();
  v_actor text := public.be_warehouse_actor_email();
  v_waybill text := nullif(btrim(coalesce(p_payload->>'waybill_no',p_payload->>'tracking_no',p_payload->>'delivery_way_id','')),'');
  v_action text := upper(coalesce(p_payload->>'action','INBOUND'));
  v_reason text := coalesce(p_payload->>'reason','');
  v_note text := coalesce(p_payload->>'note',p_payload->>'remark','');
  v_pickup text;
  v_result jsonb;
begin
  if v_waybill is null then raise exception 'Delivery Way ID / waybill_no is required'; end if;

  select d.pickup_id into v_pickup
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id=v_waybill or d.way_id=v_waybill
  order by d.updated_at desc nulls last limit 1;
  if v_pickup is null then raise exception 'Registered Data Entry parcel % was not found',v_waybill; end if;

  if v_action in ('INBOUND','RECEIVE','RECEIVED') then
    v_result:=public.be_warehouse_receive_scan_v39(
      v_pickup,v_waybill,'RECEIVE','GOOD',null,nullif(v_note,''),null,
      coalesce(nullif(p_payload->>'warehouse_code',''),'YGN-MAIN'),nullif(p_payload->>'staging_zone',''),v_actor
    );
    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('ok',true,'action','INBOUND','authorized_role',v_role,'actor_email',v_actor,'canonical_receiving_scan',true);
  end if;

  if v_action in ('DISPATCH','DISPATCHED','DISPATCH_SCAN') then
    v_result:=public.be_warehouse_dispatch_scan(v_waybill,v_actor,coalesce(nullif(p_payload->>'warehouse_code',''),'YGN-MAIN'));
    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('ok',true,'action','DISPATCH','authorized_role',v_role,'actor_email',v_actor,'canonical_dispatch_scan',true);
  end if;

  if v_action in ('RETURN','RTO','RETURN_SCAN') then
    v_result:=public.be_warehouse_return_scan(
      v_waybill,coalesce(nullif(p_payload->>'reason_code',''),'OTHER'),v_actor,nullif(v_note,''),coalesce(nullif(p_payload->>'warehouse_code',''),'YGN-MAIN')
    );
    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('ok',true,'action','RETURN','authorized_role',v_role,'actor_email',v_actor,'canonical_return_scan',true);
  end if;

  raise exception 'Unsupported legacy warehouse action %. Use INBOUND, DISPATCH, or RETURN.',v_action using errcode='22023';
end;
$$;

revoke all on function public.be_warehouse_scan(jsonb) from public;
revoke all on function public.be_warehouse_scan(jsonb) from anon;
grant execute on function public.be_warehouse_scan(jsonb) to authenticated;

revoke all on function public.be_warehouse_scan_action(jsonb) from public;
revoke all on function public.be_warehouse_scan_action(jsonb) from anon;
grant execute on function public.be_warehouse_scan_action(jsonb) to authenticated;

revoke all on function public.be_warehouse_mark_scanned_ready_v36(text,text,text) from public;
revoke all on function public.be_warehouse_mark_scanned_ready_v36(text,text,text) from anon;
grant execute on function public.be_warehouse_mark_scanned_ready_v36(text,text,text) to authenticated;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot() from public;
revoke all on function public.be_warehouse_scan_lifecycle_snapshot() from anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated;;
