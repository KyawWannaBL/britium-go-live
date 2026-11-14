-- Reconciliation diagnostics: distinguish missing historical rates from absent identities.
-- Does not backdate 2026-09-30 rates to earlier workforce activity.
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
CREATE OR REPLACE FUNCTION public.be_workforce_commission_sync_range_v202(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_touched integer := 0;
  v_wallet jsonb;
  v_pickup record;
  v_result jsonb;
  v_pickup_count integer := 0;
  v_pickup_events integer := 0;
  v_pickup_unresolved integer := 0;
  v_pickup_missing_rate integer := 0;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated user is required' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 31 then
    raise exception 'Select a date range of up to 32 days' using errcode='22023';
  end if;

  update public.be_wayplan_dispatch_stops s
     set stop_status=s.stop_status
   where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
     and coalesce(s.delivered_at,s.updated_at,s.created_at)::date between p_from and p_to;
  get diagnostics v_touched = row_count;

  -- Reconcile historic pickup records without regenerating or deleting
  -- approved/pending/paid commission rows. Uniqueness prevents duplicate credits.
  for v_pickup in
    select pickup_id from public.be_portal_pickup_requests
    where pickup_collected_at::date between p_from and p_to
      and upper(coalesce(pickup_status,'')) in
        ('PICKUP_COLLECTED','DELIVERED_TO_WAREHOUSE','PICKUP_COMPLETED','COLLECTED','COMPLETED')
    order by pickup_collected_at,pickup_id
  loop
    v_result := public.be_post_pickup_commissions_v204(v_pickup.pickup_id);
    v_pickup_count := v_pickup_count+1;
    v_pickup_events := v_pickup_events+coalesce((v_result->>'commission_event_rows_inserted')::integer,0);
    v_pickup_unresolved := v_pickup_unresolved+coalesce((v_result->>'workers_without_verified_email')::integer,0);
    v_pickup_missing_rate := v_pickup_missing_rate+coalesce((v_result->>'workers_missing_effective_rate')::integer,0);
  end loop;

  v_wallet := public.be_refresh_party_wallets_v1();
  return jsonb_build_object(
    'ok',true,'sync_build','WORKFORCE_COMMISSION_RANGE_V204',
    'from_date',p_from,'to_date',p_to,
    'delivered_stops_synced',v_touched,
    'collected_pickups_checked',v_pickup_count,
    'pickup_commission_events_inserted',v_pickup_events,
    'unresolved_pickup_worker_assignments',v_pickup_unresolved,
    'missing_pickup_commission_rates',v_pickup_missing_rate,
    'wallet_refresh',v_wallet
  );
end;
$function$;
revoke all on function public.be_post_pickup_commissions_v204(text) from public,anon,authenticated;
revoke all on function public.be_workforce_commission_sync_range_v202(date,date) from public,anon;
grant execute on function public.be_workforce_commission_sync_range_v202(date,date) to authenticated,service_role;
commit;
