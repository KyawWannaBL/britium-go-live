create or replace function public.be_warehouse_wayplan_view_v199(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_role text:=lower(coalesce(public.be_current_role(),''));
  v_data jsonb;
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'AUTHENTICATED_USER_REQUIRED' using errcode='42501';
  end if;
  if session_user<>'postgres' and v_role not in (
    'warehouse','warehouse_staff','sorter','supervisor','operations','operations_admin',
    'operation_manager','management','director','superadmin'
  ) then
    raise exception 'WAREHOUSE_WAYPLAN_VIEW_NOT_AUTHORIZED' using errcode='42501';
  end if;
  v_data:=public.be_wayplan_command_center(least(greatest(coalesce(p_limit,500),1),1000));
  return coalesce(v_data,'{}'::jsonb)||jsonb_build_object(
    'read_only',true,'authority','WAREHOUSE_WAYPLAN_VIEW',
    'role',case when session_user='postgres' then 'postgres' else v_role end,
    'build','WAREHOUSE_WAYPLAN_VIEW_V199'
  );
end;
$function$;

revoke all on function public.be_warehouse_wayplan_view_v199(integer) from public,anon;
grant execute on function public.be_warehouse_wayplan_view_v199(integer) to authenticated,service_role;

create or replace function public.be_warehouse_rto_report_v199(
  p_date_from date default null,
  p_date_to date default null,
  p_merchant text default null,
  p_limit integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_role text:=lower(coalesce(public.be_current_role(),''));
  v_rows jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,2000),1),5000);
begin
  if auth.uid() is null and session_user<>'postgres' then
    raise exception 'AUTHENTICATED_USER_REQUIRED' using errcode='42501';
  end if;
  if session_user<>'postgres' and v_role not in (
    'warehouse','warehouse_staff','sorter','supervisor','operations','operations_admin',
    'operation_manager','customer_service','cs','support','management','director','superadmin'
  ) then
    raise exception 'WAREHOUSE_RTO_REPORT_NOT_AUTHORIZED' using errcode='42501';
  end if;

  with ret as (
    select
      upper(btrim(r.delivery_way_id)) as way_id,
      max(r.pickup_id) as pickup_id,
      max(r.attempt_number) as attempt_count,
      max(r.scanned_at) filter(where r.attempt_number=1) as return_scan_1_at,
      max(r.scanned_at) filter(where r.attempt_number=2) as return_scan_2_at,
      max(r.scanned_at) filter(where r.attempt_number>=3) as return_scan_3_at,
      max(r.reason_code) filter(where r.attempt_number=1) as reason_1_code,
      max(r.reason_name) filter(where r.attempt_number=1) as reason_1_name,
      max(r.remark) filter(where r.attempt_number=1) as remark_1,
      max(r.reason_code) filter(where r.attempt_number=2) as reason_2_code,
      max(r.reason_name) filter(where r.attempt_number=2) as reason_2_name,
      max(r.remark) filter(where r.attempt_number=2) as remark_2,
      max(r.reason_code) filter(where r.attempt_number>=3) as reason_3_code,
      max(r.reason_name) filter(where r.attempt_number>=3) as reason_3_name,
      max(r.remark) filter(where r.attempt_number>=3) as remark_3,
      max(r.scanned_at) as last_return_scan_at
    from public.be_warehouse_return_scans_v39 r
    group by upper(btrim(r.delivery_way_id))
    having max(r.attempt_number)>=3
  ),
  stop_latest as (
    select distinct on (upper(btrim(s.delivery_way_id)))
      upper(btrim(s.delivery_way_id)) as way_id,
      s.wayplan_id,s.delivery_way_id,s.waybill_no,s.pickup_id,
      s.recipient_name,s.recipient_phone,s.township,s.address,
      s.cod_amount,s.delivery_fee,s.rider_code,s.rider_name,
      s.stop_status,s.rider_status,s.dispatch_status,s.failed_reason,
      s.warehouse_exception_reason,s.warehouse_notes,s.updated_at
    from public.be_wayplan_dispatch_stops s
    order by upper(btrim(s.delivery_way_id)),s.updated_at desc nulls last,s.created_at desc nulls last
  ),
  detail_latest as (
    select distinct on (upper(btrim(d.pickup_id)),upper(btrim(d.delivery_way_id)))
      upper(btrim(d.pickup_id)) as pickup_key,
      upper(btrim(d.delivery_way_id)) as way_id,
      d.pickup_id,d.delivery_way_id,d.merchant_id,d.recipient_name,d.contact_no_1,
      d.township,d.recipient_address,d.cod_amount,d.delivery_fee,d.item_price,d.remark,
      d.updated_at,d.saved_at
    from public.be_data_entry_parcel_details d
    order by upper(btrim(d.pickup_id)),upper(btrim(d.delivery_way_id)),d.updated_at desc nulls last,d.saved_at desc nulls last
  ),
  base as (
    select
      r.way_id,
      coalesce(s.delivery_way_id,d.delivery_way_id,r.way_id) as delivery_way_id,
      coalesce(s.waybill_no,d.delivery_way_id,r.way_id) as waybill_no,
      coalesce(s.pickup_id,d.pickup_id,r.pickup_id) as pickup_id,
      s.wayplan_id,
      coalesce(d.merchant_id,'') as merchant_code,
      coalesce(m.merchant_name,m.name,m.business_name,d.merchant_id,'') as merchant_name,
      coalesce(d.recipient_name,s.recipient_name) as recipient_name,
      coalesce(d.contact_no_1,s.recipient_phone) as recipient_phone,
      coalesce(d.township,s.township) as township,
      coalesce(d.recipient_address,s.address) as recipient_address,
      greatest(coalesce(d.cod_amount,0),coalesce(s.cod_amount,0),0) as cod_amount,
      greatest(coalesce(d.delivery_fee,0),coalesce(s.delivery_fee,0),0) as delivery_fee,
      coalesce(d.item_price,0) as item_price,
      s.rider_code,s.rider_name,
      r.attempt_count,
      r.return_scan_1_at,r.reason_1_code,r.reason_1_name,r.remark_1,
      r.return_scan_2_at,r.reason_2_code,r.reason_2_name,r.remark_2,
      r.return_scan_3_at,r.reason_3_code,r.reason_3_name,r.remark_3,
      r.last_return_scan_at,
      coalesce(nullif(r.reason_3_name,''),nullif(s.failed_reason,''),nullif(s.warehouse_exception_reason,''),nullif(r.reason_2_name,''),nullif(r.reason_1_name,''),'RTO') as final_failed_reason,
      coalesce(s.warehouse_notes,d.remark,'') as remarks,
      'RTO'::text as rto_status
    from ret r
    left join stop_latest s on s.way_id=r.way_id
    left join detail_latest d
      on d.way_id=r.way_id
     and (nullif(upper(btrim(coalesce(s.pickup_id,r.pickup_id,''))), '') is null
          or d.pickup_key=upper(btrim(coalesce(s.pickup_id,r.pickup_id,''))))
    left join lateral (
      select mm.*
      from public.merchants mm
      where upper(coalesce(mm.merchant_code,''))=upper(coalesce(d.merchant_id,''))
         or mm.id::text=coalesce(d.merchant_id,'')
      order by mm.updated_at desc nulls last
      limit 1
    ) m on true
  ),
  filtered as (
    select *
    from base b
    where (p_date_from is null or b.return_scan_3_at::date>=p_date_from)
      and (p_date_to is null or b.return_scan_3_at::date<=p_date_to)
      and (
        nullif(btrim(coalesce(p_merchant,'')),'') is null
        or upper(b.merchant_code)=upper(btrim(p_merchant))
        or upper(b.merchant_name)=upper(btrim(p_merchant))
      )
    order by b.return_scan_3_at desc nulls last,b.delivery_way_id
    limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.return_scan_3_at desc nulls last,f.delivery_way_id),'[]'::jsonb)
  into v_rows
  from filtered f;

  select jsonb_build_object(
    'rto_count',count(*),
    'total_cod',coalesce(sum((x->>'cod_amount')::numeric),0),
    'merchant_count',count(distinct coalesce(nullif(x->>'merchant_code',''),x->>'merchant_name')),
    'date_from',p_date_from,'date_to',p_date_to,'merchant',p_merchant
  )
  into v_summary
  from jsonb_array_elements(v_rows) x;

  return jsonb_build_object(
    'ok',true,'rows',v_rows,'summary',v_summary,'read_only',true,
    'authority','WAREHOUSE_RTO_REPORT','build','WAREHOUSE_RTO_REPORT_V199'
  );
end;
$function$;

revoke all on function public.be_warehouse_rto_report_v199(date,date,text,integer) from public,anon;
grant execute on function public.be_warehouse_rto_report_v199(date,date,text,integer) to authenticated,service_role;
