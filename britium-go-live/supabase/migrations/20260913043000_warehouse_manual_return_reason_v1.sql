-- Allow Warehouse Return / Failed scanning to use either an approved exception code
-- or a manually entered Myanmar reason when no predefined reason matches reality.

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
set search_path to 'public'
as $function$
declare
  v_role text;
  v_actor text;
  v_way text := nullif(btrim(coalesce(p_tracking_no,'')),'');
  v_reason text := upper(nullif(btrim(coalesce(p_reason_code,'')),''));
  v_manual_reason text := nullif(btrim(coalesce(p_remark,'')),'');
  v_attempt integer := 0;
  v_status text;
  v_reason_name text;
  v_pickup text;
  v_scan_at timestamptz;
  v_result jsonb;
begin
  v_role := public.be_warehouse_assert_internal();
  v_actor := public.be_warehouse_actor_email();
  if v_way is null then raise exception 'Delivery Way ID is required'; end if;
  if v_reason is null then raise exception 'Return reason is required'; end if;

  if v_reason = 'OTHER_MANUAL' then
    if v_manual_reason is null or length(v_manual_reason) < 2 then
      raise exception 'Manual return reason is required';
    end if;
    v_reason_name := v_manual_reason;
  else
    select coalesce(nullif(r.exception_name_mm,''), r.exception_name_en)
      into v_reason_name
    from public.be_exception_rules r
    where upper(r.exception_code)=v_reason
      and coalesce(r.active,true)
      and upper(coalesce(r.process_type,'')) in ('DELIVERY','WAREHOUSE')
    limit 1;
    if v_reason_name is null then raise exception 'Unknown or inactive return reason: %',v_reason; end if;
  end if;

  select d.pickup_id into v_pickup
  from public.be_data_entry_parcel_details d
  where d.delivery_way_id=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;
  if v_pickup is null then raise exception 'Delivery Way ID % was not found',v_way; end if;

  select coalesce(s.consecutive_failures,0),upper(coalesce(s.last_status,''))
    into v_attempt,v_status
  from public.be_delivery_attempt_state_v39 s
  where s.delivery_way_id=v_way;

  if coalesce(v_status,'') not in ('ATTEMPTED_FAILED','RTO') or v_attempt < 1 then
    raise exception 'Delivery failure must be recorded before Warehouse return scan for %',v_way;
  end if;

  v_attempt := least(v_attempt,3);

  v_result := public.be_warehouse_return_scan_v39(
    v_way,v_actor,coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),
    case when v_status='RTO' then 'RTO' else 'FAILED_RETURN' end
  );

  insert into public.be_warehouse_return_scans_v39(
    delivery_way_id,pickup_id,attempt_number,reason_code,reason_name,remark,
    actor_email,warehouse_code,scanned_at,created_at,updated_at
  ) values (
    v_way,v_pickup,v_attempt,v_reason,v_reason_name,
    case when v_reason='OTHER_MANUAL' then v_manual_reason else nullif(p_remark,'') end,
    v_actor,coalesce(nullif(p_warehouse_code,''),'YGN-MAIN'),now(),now(),now()
  )
  on conflict (delivery_way_id,attempt_number) do update
    set reason_code=excluded.reason_code,
        reason_name=excluded.reason_name,
        remark=coalesce(excluded.remark,public.be_warehouse_return_scans_v39.remark),
        actor_email=excluded.actor_email,
        warehouse_code=excluded.warehouse_code,
        updated_at=now()
  returning scanned_at into v_scan_at;

  update public.be_wayplan_items i
     set return_scan_1_at = case when v_attempt=1 then coalesce(i.return_scan_1_at,v_scan_at) else i.return_scan_1_at end,
         return_scan_1_by = case when v_attempt=1 then v_actor else i.return_scan_1_by end,
         return_reason_1 = case when v_attempt=1 then v_reason else i.return_reason_1 end,
         return_scan_2_at = case when v_attempt=2 then coalesce(i.return_scan_2_at,v_scan_at) else i.return_scan_2_at end,
         return_scan_2_by = case when v_attempt=2 then v_actor else i.return_scan_2_by end,
         return_reason_2 = case when v_attempt=2 then v_reason else i.return_reason_2 end,
         return_scan_3_at = case when v_attempt=3 then coalesce(i.return_scan_3_at,v_scan_at) else i.return_scan_3_at end,
         return_scan_3_by = case when v_attempt=3 then v_actor else i.return_scan_3_by end,
         return_reason_3 = case when v_attempt=3 then v_reason else i.return_reason_3 end,
         return_attempt_count = greatest(coalesce(i.return_attempt_count,0),v_attempt),
         next_attempt_priority = (v_status<>'RTO' and v_attempt<3),
         rto_at = case when v_status='RTO' then coalesce(i.rto_at,v_scan_at) else i.rto_at end,
         rto_reason = case when v_status='RTO' then coalesce(v_reason_name,i.rto_reason) else i.rto_reason end,
         warehouse_scan_status = case when v_status='RTO' then 'RTO' else 'RETURN_SCANNED' end,
         last_exception_code=v_reason,
         last_exception_reason=v_reason_name,
         updated_at=now()
   where i.tracking_no=v_way or i.delivery_way_id=v_way;

  update public.be_dispatch_job_assignments a
     set return_attempt_count=greatest(coalesce(a.return_attempt_count,0),v_attempt),
         next_attempt_priority=(v_status<>'RTO' and v_attempt<3),
         rto_at=case when v_status='RTO' then coalesce(a.rto_at,v_scan_at) else a.rto_at end,
         exception_status=case when v_status='RTO' then 'RTO' else 'RETURN_SCANNED' end,
         last_exception_code=v_reason,
         last_exception_reason=v_reason_name,
         updated_by_email=v_actor,
         updated_at=now()
   where a.tracking_no=v_way;

  return v_result || jsonb_build_object(
    'ok',true,'tracking_no',v_way,'attempt_count',v_attempt,
    'delivery_attempt_status',v_status,'reason_code',v_reason,
    'reason_name',v_reason_name,'manual_reason',(v_reason='OTHER_MANUAL'),
    'return_scan_at',v_scan_at,'receipt_method','RETURN_SCAN',
    'next_attempt_priority',(v_status<>'RTO' and v_attempt<3),
    'rto',(v_status='RTO'),'actor_email',v_actor,'authorized_role',v_role
  );
end;
$function$;
