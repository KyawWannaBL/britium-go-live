-- V208 / October 2026
-- Targeted reconciliation of 9 September pickups missing 11 workforce credits.
-- Archived effective-date rate master entries are used as source-of-truth.
-- Do NOT reactivate historical rate rows or change the prospective rate function.
-- No settled/approved commission rows are modified and no payout is initiated.
begin;

do $historical_pickup$
declare
  v_allowed text[] := array[
    'P0902-TSW-002','P0902-MMM-002','P0904-KSC-002',
    'P0909-TSW-001','P0909-CHI-001','P0923-FFY-004',
    'P0926-YDC-002','P0927-PHS-002','P0929-POE-001'
  ];
  v_pickup public.be_portal_pickup_requests%rowtype;
  v_role text;
  v_email text;
  v_code text;
  v_name text;
  v_units integer;
  v_rate_min numeric;
  v_rate_max numeric;
  v_rate_count integer;
  v_rate_ids uuid[];
  v_amount numeric;
  v_work_date date;
  v_crew boolean;
  v_inserted integer := 0;
  v_units_credited integer := 0;
  v_amount_credited numeric := 0;
  v_affected integer;
begin
  if (select count(*) from public.be_portal_pickup_requests where pickup_id=any(v_allowed)) <> 9 then
    raise exception 'Historical September pickup reconciliation requires all nine verified pickup IDs';
  end if;

  -- Fail closed if either older subsystem already records a pickup payout or commission
  -- for any of the exact IDs. Historical backfills must never create double liabilities.
  if exists (
    select 1 from public.be_commission_records r where r.ref_id=any(v_allowed)
  ) or exists (
    select 1 from public.be_workforce_wallet_ledger w
    where w.pickup_id=any(v_allowed) and w.amount<>0
  ) then
    raise exception 'Existing September credit outside unified ledger requires Finance reconciliation';
  end if;

  for v_pickup in
    select p.* from public.be_portal_pickup_requests p
    where p.pickup_id=any(v_allowed)
    order by p.pickup_collected_at,p.pickup_id
  loop
    if v_pickup.pickup_collected_at is null
       or v_pickup.pickup_collected_at::date not between date '2026-09-01' and date '2026-09-29'
       or upper(coalesce(v_pickup.pickup_status,'')) not in
          ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','PICKUP_COMPLETED','COLLECTED','COMPLETED')
    then
      raise exception 'Pickup % no longer has a verified September collected state', v_pickup.pickup_id;
    end if;
    v_work_date := v_pickup.pickup_collected_at::date;

    select coalesce(nullif(count(*)::integer,0),greatest(coalesce(v_pickup.parcel_count,v_pickup.expected_parcels,1),1))
    into v_units
    from public.be_portal_pickup_request_items i
    where i.pickup_id=v_pickup.pickup_id;

    v_crew :=
       nullif(btrim(coalesce(v_pickup.assigned_driver_email,'')),'') is not null
       or nullif(btrim(coalesce(v_pickup.assigned_driver_code,'')),'') is not null
       or nullif(btrim(coalesce(v_pickup.assigned_helper_email,'')),'') is not null
       or nullif(btrim(coalesce(v_pickup.assigned_helper_code,'')),'') is not null;

    foreach v_role in array
      (case when v_crew then array['DRIVER','HELPER']::text[] else array['RIDER']::text[] end)
    loop
      v_email := nullif(btrim(coalesce(case v_role
        when 'RIDER' then v_pickup.assigned_rider_email
        when 'DRIVER' then v_pickup.assigned_driver_email
        when 'HELPER' then v_pickup.assigned_helper_email
      end,'')),'');
      v_code := case v_role
        when 'RIDER' then v_pickup.assigned_rider_code
        when 'DRIVER' then v_pickup.assigned_driver_code
        when 'HELPER' then v_pickup.assigned_helper_code
      end;
      v_name := case v_role
        when 'RIDER' then v_pickup.assigned_rider_name
        when 'DRIVER' then v_pickup.assigned_driver_name
        when 'HELPER' then v_pickup.assigned_helper_name
      end;
      if v_email is null then
        raise exception 'Missing verified % assignment email for pickup %',v_role,v_pickup.pickup_id;
      end if;

      select min(r.rate_mmk),max(r.rate_mmk),count(*)::integer,array_agg(r.id order by r.effective_from desc,r.id)
      into v_rate_min,v_rate_max,v_rate_count,v_rate_ids
      from public.be_commission_rate_master r
      where r.operation_type='PICKUP'
        and r.role_code=v_role
        and r.unit_type='PARCEL'
        and r.active=false
        and r.effective_from<=v_work_date
        and (r.effective_to is null or r.effective_to>=v_work_date);
      if v_rate_count=0 or v_rate_min is distinct from v_rate_max or v_rate_min<=0 then
        raise exception 'Missing or conflicting archived September rate for %, %',v_pickup.pickup_id,v_role;
      end if;

      v_amount := v_units*v_rate_min;
      -- These historic jobs are far below both the 7,000-MMK earlier
      -- pickup cap and 7,500-MMK current cap. Defer higher values.
      if v_amount>3500 then
        raise exception 'September cap needs manual review for pickup %, %',v_pickup.pickup_id,v_role;
      end if;

      insert into public.be_commission_events (
        source_type,source_key,work_date,operation_type,unit_type,unit_count,
        role_code,assignee_email,assignee_name,tracking_no,pickup_id,
        merchant_id,merchant_name,rate_mmk,commission_mmk,event_status,metadata
      ) values (
        'AUTO',v_pickup.pickup_id,v_work_date,'PICKUP','PARCEL',v_units,
        v_role,v_email,coalesce(nullif(btrim(coalesce(v_name,'')),''),v_email),
        null,v_pickup.pickup_id,coalesce(v_pickup.merchant_id,v_pickup.merchant_code),
        v_pickup.merchant_name,v_rate_min,v_amount,'READY',
        jsonb_build_object(
          'source_adapter','PICKUP_COLLECTED_TRIGGER_V204',
          'historical_reconciliation','ARCHIVED_EFFECTIVE_RATE_MASTER_V208',
          'historical_rate_ids',to_jsonb(v_rate_ids),
          'historical_rate_count',v_rate_count,
          'historical_rate_mmk',v_rate_min,
          'pickup_collected_at',v_pickup.pickup_collected_at,
          'workforce_code',v_code,
          'rate_currently_active',false,
          'worker_verification','ASSIGNED_EMAIL_IN_PICKUP',
          'payout_initiated',false
        )
      )
      on conflict do nothing;
      get diagnostics v_affected=row_count;
      v_inserted:=v_inserted+v_affected;
      v_units_credited:=v_units_credited+(v_affected*v_units);
      v_amount_credited:=v_amount_credited+(v_affected*v_amount);
    end loop;
  end loop;

  if v_inserted not in (0,11) then
    raise exception 'Partial historical reconciliation (% events): please review',v_inserted;
  end if;
  if v_inserted=11 and v_amount_credited<>2550 then
    raise exception 'Historical pickup reconciliation amount mismatch: % MMK',v_amount_credited;
  end if;

  raise notice 'September historical pickup credits inserted: %, parcel-role units: %, total MMK: %',
     v_inserted,v_units_credited,v_amount_credited;
end;
$historical_pickup$;

commit;
