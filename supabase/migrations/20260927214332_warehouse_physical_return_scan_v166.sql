-- V166: Return Scan 1/2/3 are physical Warehouse scans, not Rider failure counts.

create or replace function public.be_warehouse_return_scan(
  p_tracking_no text,
  p_reason_code text,
  p_actor_email text default null,
  p_remark text default null,
  p_warehouse_code text default 'YGN-MAIN'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text;
  v_actor text;
  v_way text := nullif(upper(btrim(coalesce(p_tracking_no,''))),'');
  v_failure_count integer := 0;
  v_physical_attempt integer := 0;
  v_status text;
  v_failure_reason text;
  v_reason_code text;
  v_reason_name text;
  v_pickup text;
  v_scan_at timestamptz := now();
  v_result jsonb;
begin
  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();

  if v_way is null then
    raise exception 'Delivery Way ID is required';
  end if;

  select d.pickup_id into v_pickup
  from public.be_data_entry_parcel_details d
  where upper(d.delivery_way_id)=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  if v_pickup is null then
    raise exception 'Delivery Way ID % was not found',v_way;
  end if;

  select coalesce(s.consecutive_failures,0),
         upper(coalesce(s.last_status,'')),
         nullif(btrim(coalesce(s.last_failure_reason,'')),'')
    into v_failure_count,v_status,v_failure_reason
  from public.be_delivery_attempt_state_v39 s
  where upper(s.delivery_way_id)=v_way;

  if coalesce(v_status,'') not in ('ATTEMPTED_FAILED','RTO') or v_failure_count < 1 then
    raise exception 'Delivery failure must be recorded before Warehouse return scan for %',v_way;
  end if;

  -- Physical Return Scan slot is determined only by actual Warehouse return history.
  select coalesce(max(r.attempt_number),0)+1
    into v_physical_attempt
  from public.be_warehouse_return_scans_v39 r
  where upper(r.delivery_way_id)=v_way;

  if v_physical_attempt > 3 then
    raise exception 'All three Warehouse return scans are already recorded for %',v_way;
  end if;

  select upper(r.exception_code),
         coalesce(nullif(r.exception_name_mm,''),nullif(r.exception_name_en,''),r.exception_code)
    into v_reason_code,v_reason_name
  from public.be_exception_rules r
  where upper(coalesce(r.exception_code,''))=upper(coalesce(v_failure_reason,''))
    and coalesce(r.active,true)
    and upper(coalesce(r.process_type,'')) in ('DELIVERY','WAREHOUSE')
  order by case when upper(coalesce(r.process_type,''))='DELIVERY' then 0 else 1 end
  limit 1;

  if v_reason_code is null then
    v_reason_code := coalesce(nullif(upper(btrim(coalesce(p_reason_code,''))),''),'OTHER_MANUAL');
    v_reason_name := coalesce(v_failure_reason,'Delivery attempt failed');
  end if;

  -- Confirm physical warehouse receipt; this does not create RTO.
  v_result := public.be_warehouse_return_scan_v39_legacy_20260823(
    v_way,
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
    case when v_status='RTO' then 'RTO' else 'FAILED_RETURN' end
  );

  insert into public.be_warehouse_return_scans_v39(
    delivery_way_id,pickup_id,attempt_number,reason_code,reason_name,
    remark,actor_email,warehouse_code,scanned_at,created_at,updated_at
  ) values (
    v_way,v_pickup,v_physical_attempt,
    v_reason_code,
    v_reason_name,
    coalesce(nullif(btrim(coalesce(p_remark,'')),''),
             format('Physical Warehouse Return Scan %s after failed delivery',v_physical_attempt)),
    v_actor,
    coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
    v_scan_at,now(),now()
  );

  update public.be_wayplan_items i
     set return_scan_1_at = case when v_physical_attempt=1 then coalesce(i.return_scan_1_at,v_scan_at) else i.return_scan_1_at end,
         return_scan_1_by = case when v_physical_attempt=1 then v_actor else i.return_scan_1_by end,
         return_reason_1 = case when v_physical_attempt=1 then v_reason_code else i.return_reason_1 end,
         return_scan_2_at = case when v_physical_attempt=2 then coalesce(i.return_scan_2_at,v_scan_at) else i.return_scan_2_at end,
         return_scan_2_by = case when v_physical_attempt=2 then v_actor else i.return_scan_2_by end,
         return_reason_2 = case when v_physical_attempt=2 then v_reason_code else i.return_reason_2 end,
         return_scan_3_at = case when v_physical_attempt=3 then coalesce(i.return_scan_3_at,v_scan_at) else i.return_scan_3_at end,
         return_scan_3_by = case when v_physical_attempt=3 then v_actor else i.return_scan_3_by end,
         return_reason_3 = case when v_physical_attempt=3 then v_reason_code else i.return_reason_3 end,
         return_attempt_count = greatest(coalesce(i.return_attempt_count,0),v_physical_attempt),
         next_attempt_priority = (v_status<>'RTO' and v_physical_attempt<3),
         rto_at = case when v_status='RTO' then coalesce(i.rto_at,v_scan_at) else null end,
         rto_reason = case when v_status='RTO' then coalesce(v_reason_name,i.rto_reason) else null end,
         warehouse_scan_status = case when v_status='RTO' then 'RTO' else 'RETURN_SCANNED' end,
         last_exception_code=v_reason_code,
         last_exception_reason=v_reason_name,
         updated_at=now()
   where upper(coalesce(i.tracking_no,i.delivery_way_id,''))=v_way;

  update public.be_dispatch_job_assignments a
     set return_attempt_count=greatest(coalesce(a.return_attempt_count,0),v_physical_attempt),
         next_attempt_priority=(v_status<>'RTO' and v_physical_attempt<3),
         rto_at=case when v_status='RTO' then coalesce(a.rto_at,v_scan_at) else null end,
         exception_status=case when v_status='RTO' then 'RTO' else 'RETURN_SCANNED' end,
         last_exception_code=v_reason_code,
         last_exception_reason=v_reason_name,
         updated_by_email=v_actor,
         updated_at=now()
   where upper(a.tracking_no)=v_way;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'ok',true,
    'tracking_no',v_way,
    'attempt_count',v_physical_attempt,
    'physical_return_scan_number',v_physical_attempt,
    'delivery_failure_count',v_failure_count,
    'delivery_attempt_status',v_status,
    'reason_code',v_reason_code,
    'reason_name',v_reason_name,
    'reason_source','DELIVERY_ATTEMPT_STATE',
    'return_scan_at',v_scan_at,
    'receipt_method','RETURN_SCAN',
    'next_attempt_priority',(v_status<>'RTO' and v_physical_attempt<3),
    'rto',(v_status='RTO'),
    'actor_email',v_actor,
    'authorized_role',v_role,
    'build','WAREHOUSE_RETURN_PHYSICAL_SCAN_V166'
  );
end
$function$;

revoke execute on function public.be_warehouse_return_scan(text,text,text,text,text) from public,anon;
grant execute on function public.be_warehouse_return_scan(text,text,text,text,text) to authenticated,service_role;

-- Correct the currently misnumbered first physical return for D0927-PHS-001.
update public.be_warehouse_return_scans_v39
set attempt_number=1,
    remark=case
      when remark is null or remark like 'Physical warehouse return scan after delivery attempt %'
      then 'Physical Warehouse Return Scan 1 after failed delivery'
      else remark
    end,
    updated_at=now()
where upper(delivery_way_id)='D0927-PHS-001'
  and attempt_number=3
  and not exists (
    select 1 from public.be_warehouse_return_scans_v39 x
    where upper(x.delivery_way_id)='D0927-PHS-001'
      and x.attempt_number=1
  );

comment on function public.be_warehouse_return_scan(text,text,text,text,text)
is 'V166: Warehouse Return Scan slots 1-3 follow physical scans only; Rider failure count is separate and never auto-creates RTO.';