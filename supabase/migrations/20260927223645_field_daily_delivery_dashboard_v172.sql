do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_field_team_delivery_action'
  limit 1;

  v_def := replace(
    v_def,
    '''rider_mobile_action'',''DELIVERED'',''worker_code'',v_code,''worker_role'',v_role,''required_cod'',v_required_cod,''cod_collected'',v_collected_cod,''proof_url'',v_proof_url,''signature_url'',v_signature_url,''proof_validation'',v_proof_check,''action_at'',now()',
    '''rider_mobile_action'',''DELIVERED'',''worker_code'',v_code,''worker_role'',v_role,''required_cod'',v_required_cod,''cod_collected'',v_collected_cod,''payment_mode'',upper(coalesce(nullif(btrim(p_payload->>''payment_method''),''''),nullif(btrim(p_payload->>''payment_mode''),''''),''UNKNOWN'')),''payment_reference'',coalesce(nullif(btrim(p_payload->>''transaction_reference''),''''),nullif(btrim(p_payload->>''payment_reference''),'''')),''proof_url'',v_proof_url,''signature_url'',v_signature_url,''proof_validation'',v_proof_check,''action_at'',now()'
  );

  execute v_def;
end $$;

create or replace function public.be_rider_delivery_wayplan_jobs(
  p_rider_code text default null::text,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_code text := upper(v_identity->>'worker_code');
  v_role text := lower(v_identity->>'role');
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.wayplan_created_at desc, x.stop_sequence asc),'[]'::jsonb)
  into v_rows
  from (
    select j.*
    from public.be_v_rider_delivery_wayplan_jobs j
    where case v_role
      when 'driver' then upper(coalesce(j.driver_code,'')) = v_code
      when 'helper' then upper(coalesce(j.helper_code,'')) = v_code
      else upper(coalesce(j.rider_code,'')) = v_code
    end
      and upper(coalesce(j.wayplan_status,'')) not in ('COMPLETED','CANCELLED','REJECTED')
      and upper(coalesce(j.stop_status,j.rider_status,'')) not in (
        'DELIVERED','COMPLETED','FAILED_DELIVERY','DELIVERY_FAILED',
        'ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO','CANCELLED'
      )
      and exists (
        select 1
        from public.be_dispatch_scans_v39 ds
        where upper(ds.delivery_way_id)=upper(j.delivery_way_id)
          and ds.scan_status='SCANNED'
          and ds.scanned_at > coalesce((
            select max(rs.scanned_at)
            from public.be_warehouse_return_scans_v39 rs
            where upper(rs.delivery_way_id)=upper(j.delivery_way_id)
          ),'-infinity'::timestamptz)
      )
    order by j.wayplan_created_at desc, j.stop_sequence asc
    limit least(greatest(coalesce(p_limit,100),1),500)
  ) x;

  return jsonb_build_object(
    'ok',true,
    'source','be_rider_delivery_wayplan_jobs_active_only_v172',
    'identity',v_identity,
    'count',jsonb_array_length(v_rows),
    'jobs',v_rows
  );
end
$function$;

revoke all on function public.be_rider_delivery_wayplan_jobs(text,integer) from public,anon;
grant execute on function public.be_rider_delivery_wayplan_jobs(text,integer) to authenticated,service_role;

create or replace function public.be_field_team_delivery_daily_dashboard_v172(
  p_work_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_identity jsonb := public.be_current_field_team_identity();
  v_code text := upper(coalesce(v_identity->>'worker_code',''));
  v_role text := lower(coalesce(v_identity->>'role',''));
  v_date date := coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
  v_rows jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_channels jsonb := '{}'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok',false,'error','AUTHENTICATED_FIELD_SESSION_REQUIRED');
  end if;
  if v_role not in ('rider','driver','helper') then
    return jsonb_build_object('ok',false,'error','FIELD_ROLE_NOT_RECOGNIZED');
  end if;

  with assigned as materialized (
    select distinct on (m.wayplan_id,m.delivery_way_id)
      m.wayplan_id,m.delivery_way_id,m.rider_code,m.driver_code,m.helper_code,
      w.vehicle_code,w.vehicle_name,w.dispatched_at,w.created_at as wayplan_created_at,
      s.stop_sequence,s.waybill_no,s.recipient_name,s.recipient_phone,s.township,
      upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) as status,
      s.failed_reason,s.cod_collected,s.delivered_at,s.updated_at,
      coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0)::numeric as expected_collect,
      upper(coalesce(
        nullif(s.metadata->>'payment_mode',''),
        nullif(f.payment_mode,''),
        'UNKNOWN'
      )) as payment_mode,
      coalesce(
        nullif(s.metadata->>'payment_reference',''),
        nullif(f.remittance_reference,'')
      ) as payment_reference,
      coalesce(f.reported_collected,s.cod_collected,0)::numeric as finance_reported_collected,
      coalesce(f.variance_amount,0)::numeric as finance_variance,
      f.settlement_status,
      f.proof_status,
      coalesce(
        nullif(er.exception_name_mm,''),
        nullif(er.exception_name_en,''),
        nullif(s.failed_reason,'')
      ) as failed_reason_label
    from public.be_wayplan_membership_v40 m
    join public.be_wayplan_dispatches w on w.wayplan_id=m.wayplan_id
    join public.be_wayplan_dispatch_stops s
      on s.wayplan_id=m.wayplan_id and s.delivery_way_id=m.delivery_way_id
    left join lateral (
      select dd.* from public.be_data_entry_parcel_details dd
      where upper(dd.delivery_way_id)=upper(m.delivery_way_id)
      order by dd.updated_at desc nulls last,dd.saved_at desc nulls last
      limit 1
    ) d on true
    left join public.be_finance_cod_settlements_v48 f
      on upper(f.delivery_way_id)=upper(m.delivery_way_id)
    left join public.be_exception_rules er
      on upper(er.exception_code)=upper(coalesce(s.failed_reason,''))
     and upper(coalesce(er.process_type,''))='DELIVERY'
     and coalesce(er.active,true)
    where case v_role
      when 'driver' then upper(coalesce(m.driver_code,''))=v_code
      when 'helper' then upper(coalesce(m.helper_code,''))=v_code
      else upper(coalesce(m.rider_code,''))=v_code
    end
      and (coalesce(w.dispatched_at,w.created_at) at time zone 'Asia/Yangon')::date=v_date
    order by m.wayplan_id,m.delivery_way_id,m.updated_at desc nulls last
  ),
  classified as (
    select *,
      case
        when status in ('DELIVERED','COMPLETED') then 'SUCCESS'
        when failed_reason is not null
          or status in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO')
          then 'FAILED'
        else 'ACTIVE'
      end as result_class
    from assigned
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'wayplan_id',wayplan_id,
    'delivery_way_id',delivery_way_id,
    'waybill_no',waybill_no,
    'recipient_name',recipient_name,
    'recipient_phone',recipient_phone,
    'township',township,
    'status',status,
    'result',result_class,
    'failed_reason_code',failed_reason,
    'failed_reason',failed_reason_label,
    'expected_collect',expected_collect,
    'actual_collected',coalesce(cod_collected,0),
    'payment_mode',payment_mode,
    'payment_reference',payment_reference,
    'finance_reported_collected',finance_reported_collected,
    'finance_variance',finance_variance,
    'finance_settlement_status',settlement_status,
    'proof_status',proof_status,
    'delivered_at',delivered_at,
    'updated_at',updated_at,
    'vehicle_code',vehicle_code,
    'vehicle_name',vehicle_name
  ) order by stop_sequence),'[]'::jsonb)
  into v_rows
  from classified;

  with r as (
    select x.*
    from jsonb_to_recordset(v_rows) as x(
      result text,
      failed_reason_code text,
      failed_reason text,
      delivery_way_id text
    )
    where x.result='FAILED'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'reason_code',failed_reason_code,
    'reason',failed_reason,
    'count',cnt,
    'ways',ways
  ) order by cnt desc,failed_reason),'[]'::jsonb)
  into v_failures
  from (
    select failed_reason_code,failed_reason,count(*)::int cnt,
           jsonb_agg(delivery_way_id order by delivery_way_id) ways
    from r
    group by failed_reason_code,failed_reason
  ) q;

  with r as (
    select *
    from jsonb_to_recordset(v_rows) as x(
      result text,
      payment_mode text,
      actual_collected numeric
    )
    where x.result='SUCCESS'
  )
  select jsonb_build_object(
    'CASH',coalesce(sum(actual_collected) filter(where payment_mode='CASH'),0),
    'QR',coalesce(sum(actual_collected) filter(where payment_mode='QR'),0),
    'BANK_TRANSFER',coalesce(sum(actual_collected) filter(where payment_mode='BANK_TRANSFER'),0),
    'MOBILE_WALLET',coalesce(sum(actual_collected) filter(where payment_mode='MOBILE_WALLET'),0),
    'PREPAID',coalesce(sum(actual_collected) filter(where payment_mode='PREPAID'),0),
    'UNKNOWN',coalesce(sum(actual_collected) filter(where payment_mode not in ('CASH','QR','BANK_TRANSFER','MOBILE_WALLET','PREPAID') or payment_mode is null),0)
  )
  into v_channels
  from r;

  with r as (
    select *
    from jsonb_to_recordset(v_rows) as x(
      result text,
      expected_collect numeric,
      actual_collected numeric
    )
  ),
  totals as (
    select
      count(*)::int total_ways,
      count(*) filter(where result='SUCCESS')::int success_ways,
      count(*) filter(where result='FAILED')::int failed_ways,
      count(*) filter(where result='ACTIVE')::int active_ways,
      coalesce(sum(expected_collect),0) wayplan_expected_total,
      coalesce(sum(expected_collect) filter(where result='SUCCESS'),0) success_expected_total,
      coalesce(sum(actual_collected) filter(where result='SUCCESS'),0) actual_collected_total
    from r
  )
  select jsonb_build_object(
    'total_ways',total_ways,
    'success_ways',success_ways,
    'failed_ways',failed_ways,
    'active_ways',active_ways,
    'wayplan_expected_total',wayplan_expected_total,
    'success_expected_total',success_expected_total,
    'actual_collected_total',actual_collected_total,
    'wayplan_collection_gap',actual_collected_total-wayplan_expected_total,
    'cash_reconciliation_variance',actual_collected_total-success_expected_total,
    'cash_reconciliation_status',case
      when actual_collected_total=success_expected_total then 'MATCH'
      when actual_collected_total<success_expected_total then 'SHORT'
      else 'OVER'
    end
  )
  into v_summary
  from totals;

  return jsonb_build_object(
    'ok',true,
    'work_date',v_date,
    'identity',v_identity,
    'summary',v_summary,
    'payment_channels',v_channels,
    'failure_reasons',v_failures,
    'rows',v_rows,
    'generated_at',now(),
    'build','FIELD_DAILY_DELIVERY_DASHBOARD_V172'
  );
end
$function$;

revoke all on function public.be_field_team_delivery_daily_dashboard_v172(date) from public,anon;
grant execute on function public.be_field_team_delivery_daily_dashboard_v172(date) to authenticated,service_role;

create or replace function public.be_finance_field_delivery_daily_v172(
  p_work_date date default null,
  p_worker_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text := public.be_finance_assert_internal_v3();
  v_actor text := public.be_finance_actor_email_v3();
  v_date date := coalesce(p_work_date,(now() at time zone 'Asia/Yangon')::date);
  v_worker text := nullif(upper(btrim(coalesce(p_worker_code,''))),'');
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  with src as materialized (
    select distinct on (s.wayplan_id,s.delivery_way_id)
      s.wayplan_id,s.delivery_way_id,s.waybill_no,
      coalesce(nullif(s.metadata->>'worker_code',''),f.rider_code,f.driver_code) as worker_code,
      coalesce(nullif(s.metadata->>'worker_role',''),'field') as worker_role,
      s.recipient_name,s.township,
      upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) as status,
      s.failed_reason,
      coalesce(d.actual_collect,d.cod_amount,s.cod_amount,0)::numeric as expected_collect,
      coalesce(s.cod_collected,f.reported_collected,0)::numeric as actual_collected,
      upper(coalesce(nullif(s.metadata->>'payment_mode',''),nullif(f.payment_mode,''),'UNKNOWN')) as payment_mode,
      coalesce(nullif(s.metadata->>'payment_reference',''),f.remittance_reference) as payment_reference,
      f.settlement_status,f.variance_type,f.variance_amount,f.proof_status,
      coalesce(s.delivered_at,s.updated_at) as result_at
    from public.be_wayplan_dispatch_stops s
    join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
    left join lateral (
      select dd.* from public.be_data_entry_parcel_details dd
      where upper(dd.delivery_way_id)=upper(s.delivery_way_id)
      order by dd.updated_at desc nulls last,dd.saved_at desc nulls last
      limit 1
    ) d on true
    left join public.be_finance_cod_settlements_v48 f
      on upper(f.delivery_way_id)=upper(s.delivery_way_id)
    where (coalesce(w.dispatched_at,w.created_at) at time zone 'Asia/Yangon')::date=v_date
      and (v_worker is null or upper(coalesce(nullif(s.metadata->>'worker_code',''),f.rider_code,f.driver_code,''))=v_worker)
    order by s.wayplan_id,s.delivery_way_id,s.updated_at desc
  ),
  classified as (
    select *,
      case
        when status in ('DELIVERED','COMPLETED') then 'SUCCESS'
        when failed_reason is not null or status in ('FAILED_DELIVERY','DELIVERY_FAILED','ATTEMPTED_FAILED','RETURN_TO_WAREHOUSE','RTO') then 'FAILED'
        else 'ACTIVE'
      end result_class
    from src
  )
  select coalesce(jsonb_agg(to_jsonb(classified) order by result_at desc),'[]'::jsonb)
  into v_rows
  from classified;

  with r as (
    select *
    from jsonb_to_recordset(v_rows) as x(
      result_class text,
      expected_collect numeric,
      actual_collected numeric,
      payment_mode text
    )
  )
  select jsonb_build_object(
    'total_ways',count(*)::int,
    'success_ways',count(*) filter(where result_class='SUCCESS')::int,
    'failed_ways',count(*) filter(where result_class='FAILED')::int,
    'active_ways',count(*) filter(where result_class='ACTIVE')::int,
    'wayplan_expected_total',coalesce(sum(expected_collect),0),
    'success_expected_total',coalesce(sum(expected_collect) filter(where result_class='SUCCESS'),0),
    'actual_collected_total',coalesce(sum(actual_collected) filter(where result_class='SUCCESS'),0),
    'cash_collected',coalesce(sum(actual_collected) filter(where result_class='SUCCESS' and payment_mode='CASH'),0),
    'mobile_banking_collected',coalesce(sum(actual_collected) filter(where result_class='SUCCESS' and payment_mode in ('QR','BANK_TRANSFER','MOBILE_WALLET')),0),
    'prepaid_collected',coalesce(sum(actual_collected) filter(where result_class='SUCCESS' and payment_mode='PREPAID'),0),
    'unknown_channel_collected',coalesce(sum(actual_collected) filter(where result_class='SUCCESS' and (payment_mode='UNKNOWN' or payment_mode is null)),0),
    'cash_reconciliation_variance',
      coalesce(sum(actual_collected) filter(where result_class='SUCCESS'),0)
      - coalesce(sum(expected_collect) filter(where result_class='SUCCESS'),0),
    'cash_reconciliation_status',case
      when coalesce(sum(actual_collected) filter(where result_class='SUCCESS'),0)
         = coalesce(sum(expected_collect) filter(where result_class='SUCCESS'),0) then 'MATCH'
      when coalesce(sum(actual_collected) filter(where result_class='SUCCESS'),0)
         < coalesce(sum(expected_collect) filter(where result_class='SUCCESS'),0) then 'SHORT'
      else 'OVER'
    end
  )
  into v_summary
  from r;

  return jsonb_build_object(
    'ok',true,
    'work_date',v_date,
    'worker_code',v_worker,
    'summary',v_summary,
    'rows',v_rows,
    'authorized_role',v_role,
    'actor_email',v_actor,
    'generated_at',now(),
    'build','FINANCE_FIELD_DELIVERY_DAILY_V172'
  );
end
$function$;

revoke all on function public.be_finance_field_delivery_daily_v172(date,text) from public,anon,authenticated;
grant execute on function public.be_finance_field_delivery_daily_v172(date,text) to service_role;