do $$
declare
  v_def text;
  v_old text := $old$
  if v_way is null then raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023'; end if;

  if v_wayplan is null then
$old$;
  v_new text := $new$
  if v_way is null then raise exception 'DELIVERY_WAY_ID_REQUIRED' using errcode='22023'; end if;

  if v_action in ('deliver','delivered','verify_delivery','delivery_verified','exception','delivery_failed')
     and (
       exists(
         select 1
         from public.be_wayplan_dispatch_stops s
         where upper(s.delivery_way_id)=v_way
           and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
       )
       or exists(
         select 1
         from public.be_delivery_attempt_state_v39 a
         where upper(a.delivery_way_id)=v_way
           and upper(coalesce(a.last_status,''))='DELIVERED'
       )
     )
  then
    return jsonb_build_object(
      'ok',true,
      'delivery_way_id',v_way,
      'mobile_status','DELIVERED',
      'authoritative_success',true,
      'already_applied',true,
      'ignored_stale_action',v_action not in ('deliver','delivered','verify_delivery','delivery_verified'),
      'build','FIELD_DELIVERY_ACTION_V175B_IDEMPOTENT'
    );
  end if;

  if v_wayplan is null then
$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_field_team_delivery_action_v77'
  limit 1;

  if position(v_old in v_def)=0 then
    raise exception 'V77 guard anchor not found';
  end if;

  execute replace(v_def,v_old,v_new);
end $$;

update public.be_data_entry_parcel_details
set parcel_status='DELIVERED',
    warehouse_status='DELIVERED',
    way_management_status='DELIVERED',
    updated_at=now()
where delivery_way_id='D0927-BCC-001'
  and exists(
    select 1 from public.be_delivery_attempt_state_v39 a
    where a.delivery_way_id='D0927-BCC-001' and a.last_status='DELIVERED'
  );

update public.be_wayplan_items
set warehouse_scan_status='DELIVERED',
    exception_status=null,
    last_exception_code=null,
    last_exception_reason=null,
    next_attempt_priority=false,
    rto_at=null,
    rto_reason=null,
    updated_at=now()
where upper(coalesce(tracking_no,delivery_way_id,''))='D0927-BCC-001';

update public.be_dispatch_job_assignments
set exception_status=null,
    last_exception_code=null,
    last_exception_reason=null,
    next_attempt_priority=false,
    rto_at=null,
    updated_at=now()
where upper(tracking_no)='D0927-BCC-001';