create or replace function public.be_warehouse_return_scan_v39(
  p_way_id text,
  p_actor_email text default null,
  p_warehouse_code text default 'YGN-MAIN',
  p_staging_zone text default 'FAILED_RETURN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  v_actor text;
  v_result jsonb;
  v_way_id text := nullif(btrim(coalesce(p_way_id,'')),'');
  v_pickup_id text;
  v_attempt integer := 0;
  v_status text;
  v_reason text;
  v_reason_name text;
  v_inserted integer := 0;
begin
  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();

  if v_way_id is null then
    raise exception 'Way ID is required';
  end if;

  v_result := public.be_warehouse_return_scan_v39_legacy_20260823(
    v_way_id,v_actor,p_warehouse_code,p_staging_zone
  );

  select d.pickup_id
    into v_pickup_id
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id=v_way_id
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  select coalesce(s.consecutive_failures,0), s.last_status, s.last_failure_reason
    into v_attempt,v_status,v_reason
  from public.be_delivery_attempt_state_v39 s
  where s.delivery_way_id=v_way_id;

  if coalesce(v_attempt,0) between 1 and 3
     and coalesce(v_status,'') in ('ATTEMPTED_FAILED','RTO') then

    select coalesce(
             nullif(r.exception_name_mm,''),
             nullif(r.exception_name_en,''),
             nullif(v_reason,''),
             'Delivery failed'
           )
      into v_reason_name
    from (select 1) seed
    left join public.be_exception_rules r
      on upper(coalesce(r.exception_code,''))=upper(coalesce(v_reason,''))
     and upper(coalesce(r.process_type,''))='DELIVERY'
     and coalesce(r.active,true)
    limit 1;

    insert into public.be_warehouse_return_scans_v39(
      delivery_way_id,pickup_id,attempt_number,reason_code,reason_name,
      remark,actor_email,warehouse_code,scanned_at,created_at,updated_at
    ) values (
      v_way_id,v_pickup_id,v_attempt,
      coalesce(nullif(v_reason,''),'DELIVERY_FAILED'),
      coalesce(v_reason_name,nullif(v_reason,''),'Delivery failed'),
      format('Physical warehouse return scan after delivery attempt %s',v_attempt),
      v_actor,coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
      now(),now(),now()
    )
    on conflict (delivery_way_id,attempt_number) do nothing;

    get diagnostics v_inserted = row_count;
  end if;

  return v_result || jsonb_build_object(
    'authorized_role',v_role,
    'actor_email',v_actor,
    'auth_enforced',true,
    'return_history_recorded',v_inserted=1,
    'duplicate_return_scan',coalesce(v_attempt,0) between 1 and 3 and v_inserted=0,
    'attempt_number',coalesce(v_attempt,0),
    'reason_code',v_reason,
    'reason_name',v_reason_name
  );
end;
$$;

create or replace function public.be_warehouse_scan_lifecycle_snapshot()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_role text;
  v_rows jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
begin
  v_role := public.be_warehouse_assert_internal();

  with enriched as (
    select
      w.*,
      case
        when upper(coalesce(w.item_status,'')) in ('RTO','RETURN_TO_SENDER') then 'RTO'
        when coalesce(w.dispatch_scanned,false) then 'DISPATCH_SCANNED'
        when w.warehouse_entered_at is not null then 'RECEIVED'
        else 'PENDING'
      end as warehouse_scan_status,
      w.warehouse_entered_at as inbound_scan_at,
      w.dispatch_scanned_at as dispatch_scan_at,
      coalesce(st.consecutive_failures,w.delivery_attempts,0) as return_attempt_count,
      case
        when coalesce(st.consecutive_failures,w.delivery_attempts,0) between 1 and 2
         and upper(coalesce(st.last_status,''))='ATTEMPTED_FAILED'
         and rs.latest_return_attempt is not null
        then true else false
      end as next_attempt_priority,
      st.rto_at,
      st.last_status as delivery_attempt_status,
      st.last_failure_reason,
      rs.return_scan_1_at,
      rs.return_reason_1,
      rs.return_reason_1_name,
      rs.return_scan_2_at,
      rs.return_reason_2,
      rs.return_reason_2_name,
      rs.return_scan_3_at,
      rs.return_reason_3,
      rs.return_reason_3_name
    from public.be_v_warehouse_lifecycle_v39 w
    left join public.be_delivery_attempt_state_v39 st
      on st.delivery_way_id=w.delivery_way_id
    left join lateral (
      select
        max(r.scanned_at) filter (where r.attempt_number=1) as return_scan_1_at,
        max(r.reason_code) filter (where r.attempt_number=1) as return_reason_1,
        max(r.reason_name) filter (where r.attempt_number=1) as return_reason_1_name,
        max(r.scanned_at) filter (where r.attempt_number=2) as return_scan_2_at,
        max(r.reason_code) filter (where r.attempt_number=2) as return_reason_2,
        max(r.reason_name) filter (where r.attempt_number=2) as return_reason_2_name,
        max(r.scanned_at) filter (where r.attempt_number=3) as return_scan_3_at,
        max(r.reason_code) filter (where r.attempt_number=3) as return_reason_3,
        max(r.reason_name) filter (where r.attempt_number=3) as return_reason_3_name,
        max(r.attempt_number) as latest_return_attempt
      from public.be_warehouse_return_scans_v39 r
      where r.delivery_way_id=w.delivery_way_id
    ) rs on true
  )
  select coalesce(jsonb_agg(to_jsonb(e) order by e.updated_at desc nulls last,e.delivery_way_id),'[]'::jsonb)
    into v_rows
  from enriched e;

  with enriched as (
    select
      w.delivery_way_id,
      w.warehouse_entered_at,
      w.dispatch_scanned,
      upper(coalesce(w.item_status,'')) as item_status,
      coalesce(st.consecutive_failures,w.delivery_attempts,0) as attempts,
      st.last_status,
      st.rto_at,
      exists(
        select 1
        from public.be_warehouse_return_scans_v39 r
        where r.delivery_way_id=w.delivery_way_id
      ) as has_return
    from public.be_v_warehouse_lifecycle_v39 w
    left join public.be_delivery_attempt_state_v39 st
      on st.delivery_way_id=w.delivery_way_id
  )
  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter (where warehouse_entered_at is not null),
    'dispatch_scanned',count(*) filter (where coalesce(dispatch_scanned,false)),
    'returns',count(*) filter (where has_return),
    'priority',count(*) filter (
      where attempts between 1 and 2
        and upper(coalesce(last_status,''))='ATTEMPTED_FAILED'
        and has_return
    ),
    'rto',count(*) filter (
      where rto_at is not null
         or upper(coalesce(last_status,''))='RTO'
         or item_status in ('RTO','RETURN_TO_SENDER')
    )
  ) into v_stats
  from enriched;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.process_type,r.exception_code),'[]'::jsonb)
    into v_reasons
  from public.be_exception_rules r
  where coalesce(r.active,true)
    and upper(coalesce(r.process_type,'')) in ('DELIVERY','WAREHOUSE');

  return jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_CANONICAL_LIFECYCLE_2026_09_26',
    'authorized_role',v_role,
    'stats',v_stats,
    'rows',v_rows,
    'reasons',v_reasons
  );
end;
$$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated,service_role;

revoke all on function public.be_warehouse_receive_scan_v39_legacy_20260823(text,text,text,text,text,text,numeric,text,text,text)
  from public,anon,authenticated;
revoke all on function public.be_warehouse_return_scan_v39_legacy_20260823(text,text,text,text)
  from public,anon,authenticated;
revoke all on function public.be_dispatch_scan_parcel_v39_legacy_20260823(text,text,text)
  from public,anon,authenticated;

revoke all on function public.be_warehouse_return_scan_v39(text,text,text,text) from public,anon;
grant execute on function public.be_warehouse_return_scan_v39(text,text,text,text) to authenticated,service_role;

notify pgrst,'reload schema';