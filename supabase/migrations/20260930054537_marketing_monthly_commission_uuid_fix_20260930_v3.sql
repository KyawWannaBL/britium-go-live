
begin;

create or replace function public.be_refresh_marketing_support_commission_month(p_month date)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_start date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_end date:=(date_trunc('month',coalesce(p_month,current_date))+interval '1 month - 1 day')::date;
  v_rows integer:=0;
begin
  delete from public.be_commission_events
  where operation_type='MARKETING_SUPPORT'
    and work_date between v_start and v_end
    and event_status in ('PENDING','READY');

  with delivered as (
    select distinct
      d.delivery_way_id,
      coalesce(d.saved_at,d.created_at)::date as work_date,
      d.merchant_id,
      coalesce(p.merchant_name,d.merchant_id) as merchant_name
    from public.be_data_entry_parcel_details d
    left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
    where coalesce(d.saved_at,d.created_at)::date between v_start and v_end
      and exists(
        select 1
        from public.be_wayplan_dispatch_stops s
        where upper(s.delivery_way_id)=upper(d.delivery_way_id)
          and upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
      )
      and nullif(d.merchant_id,'') is not null
  ), eligible as (
    select
      x.*,
      r.assignment_id,r.referrer_employee_id,r.referrer_email,r.referrer_name
    from delivered x
    join lateral public.be_merchant_referrer_for_date(x.merchant_id,x.work_date) r on true
  ), grouped as (
    select
      referrer_employee_id,referrer_email,referrer_name,
      merchant_id,max(merchant_name) merchant_name,
      min(work_date) first_work_date,count(distinct delivery_way_id)::numeric unit_count,
      min(assignment_id::text)::uuid assignment_id
    from eligible
    group by referrer_employee_id,referrer_email,referrer_name,merchant_id
  )
  insert into public.be_commission_events(
    source_type,source_key,work_date,operation_type,unit_type,unit_count,
    role_code,assignee_email,assignee_name,merchant_id,merchant_name,referral_assignment_id,
    rate_mmk,commission_mmk,event_status,metadata
  )
  select
    'AUTO_MONTHLY',
    'MARKETING|'||to_char(v_start,'YYYY-MM')||'|'||merchant_id||'|'||coalesce(referrer_employee_id,referrer_email),
    v_end,'MARKETING_SUPPORT','PARCEL',unit_count,
    'MARKETING_SUPPORT',referrer_email,referrer_name,merchant_id,merchant_name,assignment_id,
    100,unit_count*100,'READY',
    jsonb_build_object(
      'month',to_char(v_start,'YYYY-MM'),
      'policy_version','COMMISSION_2026_09_30',
      'eligibility','EMPLOYED_AND_SUPPORTED_MERCHANT_ACTIVE',
      'monthly_parcels',unit_count
    )
  from grouped
  where public.be_is_employee_employed_on(referrer_email,v_end)
  on conflict (source_type,source_key,role_code,operation_type) do update
  set unit_count=excluded.unit_count,
      rate_mmk=excluded.rate_mmk,
      commission_mmk=excluded.commission_mmk,
      assignee_name=excluded.assignee_name,
      merchant_name=excluded.merchant_name,
      referral_assignment_id=excluded.referral_assignment_id,
      metadata=excluded.metadata,
      updated_at=now();

  get diagnostics v_rows=row_count;
  return jsonb_build_object(
    'ok',true,'month',to_char(v_start,'YYYY-MM'),'rows',v_rows,
    'rate_mmk_per_parcel',100,'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

commit;
