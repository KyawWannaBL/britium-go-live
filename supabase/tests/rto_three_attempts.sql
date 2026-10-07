-- Run against the enterprise database. Uses an existing failed parcel as a
-- rollback-only fixture: no parcel, finance event or notification is retained.
begin;
do $test$
declare
  v_way text := 'D1003-PHS-004';
  v_status text;
  v_result jsonb;
  v_operation text;
  v_scans integer;
  v_attempt integer;
begin
  if not exists(select 1 from public.be_dispatch_job_assignments where tracking_no=v_way)
    or not exists(select 1 from public.be_dispatch_scans_v39 where delivery_way_id=v_way) then
    raise exception 'Regression fixture is missing';
  end if;
  -- The fixture has one physical return already. Repeated scans must be no-ops.
  update public.be_delivery_attempt_state_v39
    set consecutive_failures=1,last_status='ATTEMPTED_FAILED',rto_at=null
    where delivery_way_id=v_way;
  select count(*) into v_scans from public.be_warehouse_return_scans_v39 where delivery_way_id=v_way;
  v_result := public.be_warehouse_return_scan(v_way,'CUSTOMER_UNAVAILABLE');
  if v_result->>'duplicate_return_scan' is distinct from 'true'
    or (select count(*) from public.be_warehouse_return_scans_v39 where delivery_way_id=v_way) <> v_scans then
    raise exception 'Repeated first return scan counted as another attempt: %',v_result;
  end if;
  -- Exercise the real failure writer, compatibility trigger and return scanner.
  update public.be_delivery_attempt_state_v39
    set consecutive_failures=0,last_status='PENDING',rto_at=null where delivery_way_id=v_way;
  for v_attempt in 1..3 loop
    update public.be_dispatch_scans_v39 set scan_status='SCANNED' where delivery_way_id=v_way;
    v_operation := gen_random_uuid()::text;
    v_result := public.be_record_delivery_failure_v39(v_way,'CUSTOMER_UNAVAILABLE','rto-regression',v_operation);
    if (v_result->>'attempt_count')::integer <> v_attempt
      or v_result->>'status' <> (case when v_attempt=3 then 'RTO' else 'ATTEMPTED_FAILED' end) then
      raise exception 'Failure % returned incorrect state: %',v_attempt,v_result;
    end if;
    v_result := public.be_record_delivery_failure_v39(v_way,'CUSTOMER_UNAVAILABLE','rto-regression',gen_random_uuid()::text);
    if (v_result->>'attempt_count')::integer <> v_attempt or v_result->>'duplicate_operation' <> 'true' then
      raise exception 'Double submission counted twice at attempt %: %',v_attempt,v_result;
    end if;
    v_result := public.be_record_delivery_failure_v39(v_way,'CUSTOMER_UNAVAILABLE','rto-regression',v_operation);
    if (v_result->>'attempt_count')::integer <> v_attempt or v_result->>'duplicate_operation' <> 'true' then
      raise exception 'Operation replay counted twice: %',v_result;
    end if;
    if v_attempt=1 then
      update public.be_wayplan_dispatch_stops
        set stop_status='RETURN_TO_WAREHOUSE',rider_status='RETURN_TO_WAREHOUSE',dispatch_status='RETURN_SCANNED'
        where delivery_way_id=v_way;
    else
      v_result := public.be_warehouse_return_scan(v_way,'CUSTOMER_UNAVAILABLE');
      if (v_result->>'physical_return_scan_number')::integer <> v_attempt
        or (v_result->>'rto')::boolean is distinct from (v_attempt=3) then
        raise exception 'Return scan % returned incorrect state: %',v_attempt,v_result;
      end if;
    end if;
    select delivery_status into v_status from public.be_dispatch_job_assignments where tracking_no=v_way limit 1;
    if v_status is distinct from (case when v_attempt=3 then 'RTO' else 'RETURN_SCANNED' end) then
      raise exception 'Dispatch status after attempt % is incorrect: %',v_attempt,v_status;
    end if;
    if v_attempt=3 and (
      not exists(select 1 from public.be_wayplan_dispatch_stops where delivery_way_id=v_way
                 and warehouse_status='RTO' and warehouse_action='RTO_COMPLETE')
      or exists(select 1 from public.be_waybill_ledger where delivery_way_id=v_way
                and warehouse_status='AWAITING_RETURN_SCAN')
      or exists(select 1 from public.be_warehouse_exceptions where delivery_way_id=v_way
                and exception_status='AWAITING_RETURN_SCAN')
    ) then raise exception 'Completed third return scan must not request another return scan'; end if;
    select count(*) into v_scans from public.be_warehouse_return_scans_v39 where delivery_way_id=v_way;
    v_result := public.be_warehouse_return_scan(v_way,'CUSTOMER_UNAVAILABLE');
    if v_result->>'duplicate_return_scan' is distinct from 'true'
      or (select count(*) from public.be_warehouse_return_scans_v39 where delivery_way_id=v_way) <> v_scans then
      raise exception 'Return scan replay counted twice: %',v_result;
    end if;
  end loop;
end;
$test$;
rollback;
select 'PASS: 3 failure/return cycles, double submissions, operation replay and repeated scans; all fixture writes rolled back' as result;
