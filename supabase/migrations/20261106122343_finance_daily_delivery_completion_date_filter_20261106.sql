CREATE OR REPLACE FUNCTION public.be_finance_field_delivery_daily_v172(p_work_date date DEFAULT NULL::date, p_worker_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
    where (case when upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
    and s.delivered_at is not null
    then (s.delivered_at at time zone 'Asia/Yangon')::date
    else (coalesce(w.dispatched_at,w.created_at) at time zone 'Asia/Yangon')::date
  end)=v_date
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
$function$
