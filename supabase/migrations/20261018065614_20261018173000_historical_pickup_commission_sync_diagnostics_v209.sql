-- V209: Don't flag archived-rate historical pickup commissions as missing.
-- Preserves all commission events, statuses, payouts, and historical source.
begin;
CREATE OR REPLACE FUNCTION public.be_post_pickup_commissions_v204(p_pickup_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pickup public.be_portal_pickup_requests%rowtype;
  v_role text;
  v_code text;
  v_email text;
  v_name text;
  v_resolved record;
  v_work_date date;
  v_item_count integer;
  v_units integer;
  v_calc jsonb;
  v_rate numeric;
  v_amount numeric;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_missing_rate integer := 0;
  v_van_crew boolean;
  v_affected integer;
begin
  select * into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id = p_pickup_id
  limit 1;

  if not found or v_pickup.pickup_collected_at is null
    or upper(coalesce(v_pickup.pickup_status,'')) not in
       ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','PICKUP_COMPLETED','COLLECTED','COMPLETED')
  then
    return jsonb_build_object('ok',true,'inserted',0,'skipped',0,'eligible',false);
  end if;
  v_work_date := v_pickup.pickup_collected_at::date;

  select count(*) into v_item_count
  from public.be_portal_pickup_request_items i
  where i.pickup_id = v_pickup.pickup_id;

  v_units := case
    when v_item_count > 0 then v_item_count
    else greatest(coalesce(v_pickup.parcel_count,v_pickup.expected_parcels,1),1)
  end;

  -- A rider receives the rider-only share. If a van crew is actually
  -- assigned, split between its driver and (optional) helper instead.
  v_van_crew := nullif(btrim(coalesce(v_pickup.assigned_driver_email,'')),'') is not null
    or nullif(btrim(coalesce(v_pickup.assigned_driver_code,'')),'') is not null
    or nullif(btrim(coalesce(v_pickup.assigned_helper_email,'')),'') is not null
    or nullif(btrim(coalesce(v_pickup.assigned_helper_code,'')),'') is not null;

  foreach v_role in array
    (case when v_van_crew then array['DRIVER','HELPER']::text[] else array['RIDER']::text[] end)
  loop
    v_code := case v_role
      when 'RIDER' then v_pickup.assigned_rider_code
      when 'DRIVER' then v_pickup.assigned_driver_code
      when 'HELPER' then v_pickup.assigned_helper_code end;
    v_email := case v_role
      when 'RIDER' then v_pickup.assigned_rider_email
      when 'DRIVER' then v_pickup.assigned_driver_email
      when 'HELPER' then v_pickup.assigned_helper_email end;
    v_name := case v_role
      when 'RIDER' then v_pickup.assigned_rider_name
      when 'DRIVER' then v_pickup.assigned_driver_name
      when 'HELPER' then v_pickup.assigned_helper_name end;

    v_email := nullif(btrim(coalesce(v_email,'')),'');
    if v_email is null and nullif(btrim(coalesce(v_code,'')),'') is not null then
      select * into v_resolved
      from public.be_resolve_workforce_identifier(v_code,v_role)
      limit 1;
      if found then
        v_email := nullif(btrim(coalesce(v_resolved.resolved_email,'')),'');
        v_name := coalesce(nullif(btrim(coalesce(v_name,'')),''),v_resolved.resolved_name);
      end if;
    end if;

    if v_email is null then
      v_skipped := v_skipped+1;
      continue;
    end if;

    -- Reconciled historical pickup events (including archived-rate V208)
    -- are already credited; do not classify them as missing effective rates.
    if exists (
      select 1 from public.be_commission_events e
      where e.operation_type='PICKUP'
        and e.source_key=v_pickup.pickup_id
        and e.role_code=v_role
        and lower(e.assignee_email)=lower(v_email)
        and e.event_status in ('READY','PENDING','APPROVED','PAID')
    ) then
      continue;
    end if;

    v_calc := public.be_commission_calculate_v2('PICKUP',v_role,v_units,v_work_date);
    v_rate := coalesce((v_calc->>'rate_mmk')::numeric,0);
    v_amount := coalesce((v_calc->>'commission_mmk')::numeric,0);
    if v_amount<=0 then
      v_missing_rate := v_missing_rate+1;
      continue;
    end if;

    insert into public.be_commission_events(
      source_type,source_key,work_date,operation_type,unit_type,unit_count,
      role_code,assignee_email,assignee_name,
      tracking_no,pickup_id,merchant_id,merchant_name,
      rate_mmk,commission_mmk,event_status,metadata
    ) values (
      'AUTO',v_pickup.pickup_id,v_work_date,'PICKUP','PARCEL',v_units,
      v_role,v_email,coalesce(nullif(btrim(coalesce(v_name,'')),''),v_email),
      null,v_pickup.pickup_id,coalesce(v_pickup.merchant_id,v_pickup.merchant_code),v_pickup.merchant_name,
      v_rate,v_amount,'READY',
      jsonb_build_object(
        'source_adapter','PICKUP_COLLECTED_TRIGGER_V204',
        'policy_version',v_calc->>'policy_version',
        'pickup_collected_at',v_pickup.pickup_collected_at,
        'workforce_code',v_code,
        'calculation',v_calc
      )
    )
    on conflict do nothing;
    get diagnostics v_affected = row_count;
    v_inserted := v_inserted + v_affected;
  end loop;
  return jsonb_build_object(
    'ok',true,'eligible',true,'pickup_id',v_pickup.pickup_id,
    'commission_event_rows_inserted',v_inserted,'workers_without_verified_email',v_skipped,
    'workers_missing_effective_rate',v_missing_rate,
    'parcel_units',v_units,'work_date',v_work_date
  );
end;
$function$;
revoke all on function public.be_post_pickup_commissions_v204(text) from public,anon,authenticated;
commit;
