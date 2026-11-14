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

  with lifecycle as (
    select
      v.waybill_no,
      v.delivery_way_id,
      v.pickup_id,
      v.batch_waybill_no,
      v.merchant_name,
      wi.merchant_code,
      v.recipient_name,
      v.recipient_phone,
      v.recipient_phone as phone_number,
      v.delivery_township,
      v.recipient_address,
      v.cod_amount,
      v.weight_kg,
      v.item_status,
      v.delivery_attempts,
      v.receipt_method,
      v.receiving_scan_skipped,
      v.warehouse_entered_at,
      v.dwell_hours,
      v.dwell_alert,
      v.dispatch_scanned,
      v.dispatch_scanned_at,
      v.updated_at,
      v.created_at,
      coalesce(
        nullif(upper(dja.delivery_status),''),
        nullif(upper(st.last_status),''),
        case
          when v.item_status='RETURN_TO_SENDER' then 'RTO'
          when v.item_status='DELIVERY_FAILED' then 'ATTEMPTED_FAILED'
          else null
        end
      ) as delivery_status,
      case
        when coalesce(dja.rto_at,st.rto_at) is not null
          or upper(coalesce(dja.delivery_status,st.last_status,''))='RTO'
          or v.item_status='RETURN_TO_SENDER'
          then 'RTO'
        when rh.return_scan_3_at is not null
          or rh.return_scan_2_at is not null
          or rh.return_scan_1_at is not null
          then 'RETURN_SCANNED'
        when coalesce(v.dispatch_scanned,false)
          or v.dispatch_scanned_at is not null
          or dja.dispatch_scan_at is not null
          then 'DISPATCH_SCANNED'
        when v.warehouse_entered_at is not null
          then 'RECEIVED'
        else coalesce(v.item_status,'SUBMITTED')
      end as warehouse_scan_status,
      v.warehouse_entered_at as inbound_scan_at,
      coalesce(v.dispatch_scanned_at,dja.dispatch_scan_at) as dispatch_scan_at,
      rh.return_scan_1_at,
      rh.return_reason_1,
      rh.return_reason_1_name,
      rh.return_remark_1,
      rh.return_scan_2_at,
      rh.return_reason_2,
      rh.return_reason_2_name,
      rh.return_remark_2,
      rh.return_scan_3_at,
      rh.return_reason_3,
      rh.return_reason_3_name,
      rh.return_remark_3,
      greatest(
        coalesce(v.delivery_attempts,0),
        coalesce(dja.return_attempt_count,0),
        coalesce(st.consecutive_failures,0)
      ) as return_attempt_count,
      coalesce(
        dja.next_attempt_priority,
        (
          coalesce(st.consecutive_failures,0) between 1 and 2
          and upper(coalesce(st.last_status,''))='ATTEMPTED_FAILED'
          and coalesce(rh.max_return_attempt,0) >= coalesce(st.consecutive_failures,0)
        ),
        false
      ) as next_attempt_priority,
      coalesce(dja.rto_at,st.rto_at) as rto_at,
      coalesce(dja.last_exception_code,rh.latest_reason_code,st.last_failure_reason) as last_exception_code,
      coalesce(dja.last_exception_reason,rh.latest_reason_name,st.last_failure_reason) as last_exception_reason,
      dja.wayplan_code,
      dja.rider_email,
      dja.driver_email,
      dja.helper_email
    from public.be_v_warehouse_lifecycle_v39 v
    left join lateral (
      select
        i.merchant_code
      from public.be_wayplan_items i
      where i.delivery_way_id=v.delivery_way_id
         or i.tracking_no=v.delivery_way_id
      order by i.updated_at desc nulls last, i.created_at desc nulls last
      limit 1
    ) wi on true
    left join lateral (
      select a.*
      from public.be_dispatch_job_assignments a
      where a.tracking_no=v.delivery_way_id
      order by a.updated_at desc nulls last
      limit 1
    ) dja on true
    left join public.be_delivery_attempt_state_v39 st
      on st.delivery_way_id=v.delivery_way_id
    left join lateral (
      select
        max(scanned_at) filter (where attempt_number=1) as return_scan_1_at,
        max(reason_code) filter (where attempt_number=1) as return_reason_1,
        max(reason_name) filter (where attempt_number=1) as return_reason_1_name,
        max(remark) filter (where attempt_number=1) as return_remark_1,
        max(scanned_at) filter (where attempt_number=2) as return_scan_2_at,
        max(reason_code) filter (where attempt_number=2) as return_reason_2,
        max(reason_name) filter (where attempt_number=2) as return_reason_2_name,
        max(remark) filter (where attempt_number=2) as return_remark_2,
        max(scanned_at) filter (where attempt_number=3) as return_scan_3_at,
        max(reason_code) filter (where attempt_number=3) as return_reason_3,
        max(reason_name) filter (where attempt_number=3) as return_reason_3_name,
        max(remark) filter (where attempt_number=3) as return_remark_3,
        max(attempt_number) as max_return_attempt,
        (array_agg(reason_code order by attempt_number desc, updated_at desc))[1] as latest_reason_code,
        (array_agg(reason_name order by attempt_number desc, updated_at desc))[1] as latest_reason_name
      from public.be_warehouse_return_scans_v39 r
      where r.delivery_way_id=v.delivery_way_id
    ) rh on true
  )
  select coalesce(jsonb_agg(to_jsonb(l) order by
    l.rto_at desc nulls last,
    l.next_attempt_priority desc,
    l.warehouse_entered_at desc nulls last,
    l.updated_at desc nulls last,
    l.delivery_way_id
  ),'[]'::jsonb)
  into v_rows
  from lifecycle l;

  with lifecycle as (
    select
      v.delivery_way_id,
      v.warehouse_entered_at,
      coalesce(v.dispatch_scanned,false) as dispatch_scanned,
      v.dispatch_scanned_at,
      coalesce(dja.dispatch_scan_at,v.dispatch_scanned_at) as dispatch_scan_at,
      coalesce(dja.return_attempt_count,0) as assignment_return_attempts,
      coalesce(st.consecutive_failures,0) as consecutive_failures,
      upper(coalesce(dja.delivery_status,st.last_status,'')) as delivery_status,
      coalesce(dja.next_attempt_priority,false) as assignment_priority,
      coalesce(dja.rto_at,st.rto_at) as rto_at,
      coalesce(rh.return_count,0) as return_count,
      coalesce(rh.max_return_attempt,0) as max_return_attempt
    from public.be_v_warehouse_lifecycle_v39 v
    left join lateral (
      select a.*
      from public.be_dispatch_job_assignments a
      where a.tracking_no=v.delivery_way_id
      order by a.updated_at desc nulls last
      limit 1
    ) dja on true
    left join public.be_delivery_attempt_state_v39 st
      on st.delivery_way_id=v.delivery_way_id
    left join lateral (
      select count(*)::integer as return_count, max(attempt_number) as max_return_attempt
      from public.be_warehouse_return_scans_v39 r
      where r.delivery_way_id=v.delivery_way_id
    ) rh on true
  )
  select jsonb_build_object(
    'rows',count(*),
    'received',count(*) filter (where warehouse_entered_at is not null),
    'dispatch_scanned',count(*) filter (
      where dispatch_scanned or dispatch_scan_at is not null
    ),
    'returns',count(*) filter (where return_count>0),
    'priority',count(*) filter (
      where assignment_priority
         or (
           consecutive_failures between 1 and 2
           and delivery_status='ATTEMPTED_FAILED'
           and max_return_attempt>=consecutive_failures
         )
    ),
    'rto',count(*) filter (
      where rto_at is not null or delivery_status='RTO'
    )
  )
  into v_stats
  from lifecycle;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.process_type,x.exception_code),'[]'::jsonb)
    into v_reasons
  from (
    select r.*
    from public.be_exception_rules r
    where coalesce(r.active,true)
      and upper(coalesce(r.process_type,'')) in ('DELIVERY','WAREHOUSE')
    union all
    select
      null::bigint as id,
      'DELIVERY'::text as process_type,
      'OTHER_MANUAL'::text as exception_code,
      'Other / Manual reason'::text as exception_name_en,
      'အခြား / ကိုယ်တိုင်ရေးသားရန်'::text as exception_name_mm,
      true as active,
      999::integer as sort_order,
      now() as created_at,
      now() as updated_at
    where not exists (
      select 1 from public.be_exception_rules e
      where upper(coalesce(e.exception_code,''))='OTHER_MANUAL'
        and coalesce(e.active,true)
    )
  ) x;

  return jsonb_build_object(
    'ok',true,
    'build','WAREHOUSE_CANONICAL_SNAPSHOT_2026_08_23',
    'authorized_role',v_role,
    'stats',v_stats,
    'rows',v_rows,
    'reasons',v_reasons
  );
end;
$$;

revoke all on function public.be_warehouse_scan_lifecycle_snapshot() from public,anon;
grant execute on function public.be_warehouse_scan_lifecycle_snapshot() to authenticated,service_role;
notify pgrst,'reload schema';