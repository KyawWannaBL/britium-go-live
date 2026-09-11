-- Britium Express Dispatch / Wayplan Execution V41
-- Requires Warehouse / Dispatch V39 and Wayplan V40.
-- Workflow: READY_FOR_DISPATCH -> mandatory dispatch scan -> guarded publish -> DISPATCHED / OUT_FOR_DELIVERY.

begin;

create or replace function public.be_dispatch_actor_v41(p_actor_email text default null)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_actor_email), ''),
    nullif(auth.jwt() ->> 'email', ''),
    'dispatch@britiumexpress.com'
  );
$$;

create or replace function public.be_dispatch_wayplan_snapshot_v41(
  p_wayplan_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_filter text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_jobs jsonb := '[]'::jsonb;
  v_wayplans jsonb := '[]'::jsonb;
  v_assets jsonb := '[]'::jsonb;
  v_zones jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
begin
  if to_regclass('public.be_wayplan_membership_v40') is null then
    raise exception 'Wayplan V40 is required before Dispatch V41';
  end if;
  if to_regclass('public.be_v_warehouse_receipt_v39') is null then
    raise exception 'Warehouse / Dispatch V39 is required before Dispatch V41';
  end if;

  with rows as (
    select
      m.wayplan_id,
      m.delivery_way_id,
      m.pickup_id,
      m.route_zone,
      m.membership_status,
      m.vehicle_type,
      m.vehicle_code,
      m.vehicle_name,
      m.rider_code,
      m.rider_name,
      m.driver_code,
      m.driver_name,
      m.helper_code,
      m.helper_name,
      m.created_at as wayplan_created_at,
      m.updated_at as membership_updated_at,
      v.parcel_sequence,
      v.batch_waybill_no,
      v.merchant_name,
      v.recipient_name,
      v.recipient_phone,
      v.township,
      v.recipient_address,
      v.destination,
      v.item_price,
      v.delivery_fee,
      v.surcharge,
      v.actual_collect,
      v.declared_weight_kg,
      v.remark,
      v.warehouse_status,
      v.discrepancy_code,
      v.delivery_attempt_status,
      coalesce(s.scan_status = 'SCANNED', false) as dispatch_scanned,
      s.scanned_at as dispatch_scanned_at,
      s.scanned_by as dispatch_scanned_by
    from public.be_wayplan_membership_v40 m
    join public.be_v_warehouse_receipt_v39 v
      on v.delivery_way_id = m.delivery_way_id
    left join public.be_dispatch_scans_v39 s
      on s.delivery_way_id = m.delivery_way_id
     and s.wayplan_code = m.wayplan_id
    where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
      and (v_filter is null or m.wayplan_id = v_filter)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'tracking_no', r.delivery_way_id,
    'delivery_way_id', r.delivery_way_id,
    'wayplan_code', r.wayplan_id,
    'wayplan_no', r.wayplan_id,
    'wayplan_id', r.wayplan_id,
    'pickup_id', r.pickup_id,
    'parcel_sequence', r.parcel_sequence,
    'batch_waybill_no', r.batch_waybill_no,
    'merchant_name', r.merchant_name,
    'recipient_name', r.recipient_name,
    'recipient_phone', r.recipient_phone,
    'phone_number', r.recipient_phone,
    'delivery_township', r.township,
    'destination_city', r.destination,
    'recipient_address', r.recipient_address,
    'cod_amount', r.item_price,
    'delivery_charges', r.delivery_fee,
    'surcharge', r.surcharge,
    'total_collected_amount', r.actual_collect,
    'weight_kg', r.declared_weight_kg,
    'remarks', r.remark,
    'route_zone', r.route_zone,
    'asset_code', coalesce(nullif(r.vehicle_code, ''), 'UNASSIGNED'),
    'asset_name', coalesce(nullif(r.vehicle_name, ''), nullif(r.vehicle_code, ''), 'UNASSIGNED'),
    'vehicle_type', r.vehicle_type,
    'vehicle_code', r.vehicle_code,
    'vehicle_name', r.vehicle_name,
    'rider_code', r.rider_code,
    'rider_name', r.rider_name,
    'driver_code', r.driver_code,
    'driver_name', r.driver_name,
    'helper_code', r.helper_code,
    'helper_name', r.helper_name,
    'warehouse_status', r.warehouse_status,
    'discrepancy_code', r.discrepancy_code,
    'delivery_attempt_status', r.delivery_attempt_status,
    'membership_status', r.membership_status,
    'dispatch_scanned', r.dispatch_scanned,
    'dispatch_scanned_at', r.dispatch_scanned_at,
    'dispatch_scanned_by', r.dispatch_scanned_by,
    'dispatch_status', case when r.membership_status = 'DISPATCHED' then 'OUT_FOR_DELIVERY' else 'READY_FOR_DISPATCH' end,
    'delivery_status', case when r.membership_status = 'DISPATCHED' then 'OUT_FOR_DELIVERY' else 'PENDING' end,
    'created_at', r.wayplan_created_at,
    'updated_at', r.membership_updated_at
  ) order by r.wayplan_id, r.parcel_sequence, r.delivery_way_id), '[]'::jsonb)
  into v_jobs
  from rows r;

  with rows as (
    select
      m.wayplan_id,
      max(m.route_zone) as route_zone,
      max(m.vehicle_type) as vehicle_type,
      max(m.vehicle_code) as vehicle_code,
      max(m.vehicle_name) as vehicle_name,
      max(m.rider_code) as rider_code,
      max(m.rider_name) as rider_name,
      min(m.created_at) as created_at,
      max(m.updated_at) as updated_at,
      count(*)::integer as parcel_count,
      count(*) filter (where m.membership_status = 'PLANNED')::integer as planned_count,
      count(*) filter (where m.membership_status = 'READY_FOR_DISPATCH')::integer as ready_count,
      count(*) filter (where m.membership_status = 'DISPATCHED')::integer as dispatched_count,
      count(*) filter (where coalesce(s.scan_status = 'SCANNED', false))::integer as scanned_count,
      count(*) filter (where not coalesce(s.scan_status = 'SCANNED', false))::integer as remaining_count,
      count(*) filter (
        where v.warehouse_status <> 'WAREHOUSE_READY'
           or v.discrepancy_code is not null
           or coalesce(v.delivery_attempt_status, '') = 'RTO'
           or m.membership_status in ('ON_HOLD','RTO')
      )::integer as blocked_count
    from public.be_wayplan_membership_v40 m
    join public.be_v_warehouse_receipt_v39 v
      on v.delivery_way_id = m.delivery_way_id
    left join public.be_dispatch_scans_v39 s
      on s.delivery_way_id = m.delivery_way_id
     and s.wayplan_code = m.wayplan_id
    where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
      and (v_filter is null or m.wayplan_id = v_filter)
    group by m.wayplan_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'wayplan_code', r.wayplan_id,
    'wayplan_no', r.wayplan_id,
    'wayplan_id', r.wayplan_id,
    'parcel_count', r.parcel_count,
    'planned_count', r.planned_count,
    'ready_count', r.ready_count,
    'dispatched_count', r.dispatched_count,
    'scanned_count', r.scanned_count,
    'remaining_count', r.remaining_count,
    'blocked_count', r.blocked_count,
    'route_zone', r.route_zone,
    'vehicle_type', r.vehicle_type,
    'vehicle_code', r.vehicle_code,
    'vehicle_name', r.vehicle_name,
    'rider_code', r.rider_code,
    'rider_name', r.rider_name,
    'dispatch_scan_complete', r.remaining_count = 0 and r.blocked_count = 0 and r.ready_count > 0,
    'wayplan_status', case
      when r.dispatched_count = r.parcel_count then 'DISPATCHED'
      when r.blocked_count > 0 then 'BLOCKED'
      when r.ready_count > 0 then 'READY_FOR_DISPATCH'
      else 'PLANNED'
    end,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.updated_at desc nulls last, r.wayplan_id), '[]'::jsonb)
  into v_wayplans
  from rows r;

  select coalesce(jsonb_agg(jsonb_build_object(
    'asset_code', q.asset_code,
    'asset_name', q.asset_name,
    'asset_type', q.vehicle_type,
    'operation_type', 'DELIVERY',
    'active', true,
    'sort_order', q.sort_order
  ) order by q.sort_order, q.asset_code), '[]'::jsonb)
  into v_assets
  from (
    select d.*,
           row_number() over (order by d.asset_code) as sort_order
    from (
      select distinct
        coalesce(nullif(m.vehicle_code, ''), 'UNASSIGNED') as asset_code,
        coalesce(nullif(m.vehicle_name, ''), nullif(m.vehicle_code, ''), 'UNASSIGNED') as asset_name,
        m.vehicle_type
      from public.be_wayplan_membership_v40 m
      where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
        and (v_filter is null or m.wayplan_id = v_filter)
    ) d
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'zone_code', q.route_zone,
    'zone_name', q.route_zone,
    'active', true,
    'sort_order', q.sort_order
  ) order by q.sort_order, q.route_zone), '[]'::jsonb)
  into v_zones
  from (
    select d.route_zone,
           row_number() over (order by d.route_zone) as sort_order
    from (
      select distinct coalesce(m.route_zone, 'UNASSIGNED') as route_zone
      from public.be_wayplan_membership_v40 m
      where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
        and (v_filter is null or m.wayplan_id = v_filter)
    ) d
  ) q;

  select jsonb_build_object(
    'wayplans', count(distinct m.wayplan_id)::integer,
    'jobs', count(*)::integer,
    'pending', count(*) filter (where m.membership_status in ('PLANNED','READY_FOR_DISPATCH'))::integer,
    'ready_for_dispatch', count(*) filter (where m.membership_status = 'READY_FOR_DISPATCH')::integer,
    'dispatch_scanned', count(*) filter (where coalesce(s.scan_status = 'SCANNED', false))::integer,
    'to_scan', count(*) filter (where not coalesce(s.scan_status = 'SCANNED', false) and m.membership_status = 'READY_FOR_DISPATCH')::integer,
    'out_for_delivery', count(*) filter (where m.membership_status = 'DISPATCHED')::integer,
    'delivered', 0,
    'failed', count(*) filter (where coalesce(v.delivery_attempt_status, '') = 'ATTEMPTED_FAILED')::integer,
    'rto', count(*) filter (where coalesce(v.delivery_attempt_status, '') = 'RTO' or m.membership_status = 'RTO')::integer,
    'blocked', count(*) filter (
      where v.warehouse_status <> 'WAREHOUSE_READY'
         or v.discrepancy_code is not null
         or coalesce(v.delivery_attempt_status, '') = 'RTO'
         or m.membership_status in ('ON_HOLD','RTO')
    )::integer,
    'cod', coalesce(sum(v.actual_collect), 0)
  )
  into v_stats
  from public.be_wayplan_membership_v40 m
  join public.be_v_warehouse_receipt_v39 v
    on v.delivery_way_id = m.delivery_way_id
  left join public.be_dispatch_scans_v39 s
    on s.delivery_way_id = m.delivery_way_id
   and s.wayplan_code = m.wayplan_id
  where m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO')
    and (v_filter is null or m.wayplan_id = v_filter);

  return jsonb_build_object(
    'ok', true,
    'build', 'DISPATCH_V41_WAYPLAN_SCANNING_GUARDED_RELEASE_2026-07-30',
    'workflow', 'READY_FOR_DISPATCH -> mandatory parcel scan -> guarded Publish -> DISPATCHED / OUT_FOR_DELIVERY',
    'selected_wayplan_id', v_filter,
    'stats', coalesce(v_stats, '{}'::jsonb),
    'wayplans', v_wayplans,
    'jobs', v_jobs,
    'assets', v_assets,
    'zones', v_zones
  );
end;
$$;

create or replace function public.be_dispatch_scan_wayplan_parcel_v41(
  p_wayplan_id text,
  p_way_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_actor text := public.be_dispatch_actor_v41(p_actor_email);
  v_status text;
  v_result jsonb;
begin
  if v_wayplan is null then raise exception 'Select a Wayplan before scanning'; end if;
  if v_way_id is null then raise exception 'Parcel Way ID is required'; end if;

  select membership_status
  into v_status
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
    and delivery_way_id = v_way_id
  for update;

  if v_status is null then
    raise exception 'Way ID % does not belong to Wayplan %', v_way_id, v_wayplan;
  end if;
  if v_status = 'DISPATCHED' then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'wayplan_id', v_wayplan,
      'way_id', v_way_id,
      'membership_status', v_status,
      'message', format('%s is already dispatched', v_way_id)
    );
  end if;
  if v_status <> 'READY_FOR_DISPATCH' then
    raise exception 'Way ID % is %; prepare the Wayplan for Dispatch first', v_way_id, v_status;
  end if;

  v_result := public.be_dispatch_scan_parcel_v39(v_way_id, v_wayplan, v_actor);

  insert into public.be_wayplan_events_v40(wayplan_id, delivery_way_id, event_type, actor_email, payload)
  values (
    v_wayplan,
    v_way_id,
    'MANDATORY_DISPATCH_SCAN_V41',
    v_actor,
    coalesce(v_result, '{}'::jsonb)
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'way_id', v_way_id,
    'membership_status', v_status,
    'dispatch_scan_required', true
  );
end;
$$;

create or replace function public.be_dispatch_scan_wayplan_batch_v41(
  p_wayplan_id text,
  p_way_ids text[],
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_dispatch_actor_v41(p_actor_email);
  v_way_id text;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_scanned integer := 0;
  v_failed integer := 0;
  v_seen text[] := '{}'::text[];
begin
  if v_wayplan is null then raise exception 'Select a Wayplan before batch scanning'; end if;
  if p_way_ids is null or coalesce(array_length(p_way_ids, 1), 0) = 0 then
    raise exception 'Paste at least one parcel Way ID';
  end if;

  foreach v_way_id in array p_way_ids loop
    v_way_id := nullif(btrim(coalesce(v_way_id, '')), '');
    if v_way_id is null or v_way_id = any(v_seen) then continue; end if;
    v_seen := array_append(v_seen, v_way_id);

    begin
      v_result := public.be_dispatch_scan_wayplan_parcel_v41(v_wayplan, v_way_id, v_actor);
      v_scanned := v_scanned + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'way_id', v_way_id,
        'ok', true,
        'result', v_result
      ));
    exception when others then
      v_failed := v_failed + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'way_id', v_way_id,
        'ok', false,
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'wayplan_id', v_wayplan,
    'submitted', cardinality(v_seen),
    'scanned', v_scanned,
    'failed', v_failed,
    'results', v_results
  );
end;
$$;

create or replace function public.be_dispatch_publish_wayplan_v41(
  p_wayplan_id text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_actor text := public.be_dispatch_actor_v41(p_actor_email);
  v_way_ids text[];
  v_count integer := 0;
  v_ready integer := 0;
  v_dispatched integer := 0;
  v_scanned integer := 0;
  v_result jsonb;
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required'; end if;

  perform 1
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
  for update;

  select
    array_agg(delivery_way_id order by delivery_way_id),
    count(*)::integer,
    count(*) filter (where membership_status = 'READY_FOR_DISPATCH')::integer,
    count(*) filter (where membership_status = 'DISPATCHED')::integer
  into v_way_ids, v_count, v_ready, v_dispatched
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
    and membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED','ON_HOLD','RTO');

  if coalesce(v_count, 0) = 0 then
    raise exception 'Wayplan % has no V40 parcel membership', v_wayplan;
  end if;

  if v_dispatched = v_count then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'wayplan_id', v_wayplan,
      'published_rows', v_count,
      'membership_status', 'DISPATCHED',
      'message', format('%s is already dispatched', v_wayplan)
    );
  end if;

  if v_ready <> v_count then
    raise exception 'Wayplan % is not fully READY_FOR_DISPATCH (% of % rows ready)', v_wayplan, v_ready, v_count;
  end if;

  select count(*)::integer
  into v_scanned
  from public.be_dispatch_scans_v39 s
  where s.delivery_way_id = any(v_way_ids)
    and s.scan_status = 'SCANNED'
    and s.wayplan_code = v_wayplan;

  if v_scanned <> v_count then
    raise exception 'Publish blocked. % of % parcels still require mandatory Dispatch scanning', v_count - v_scanned, v_count;
  end if;

  v_result := public.be_publish_wayplan_with_dispatch_scan_v39(v_wayplan, v_way_ids, v_actor);

  update public.be_wayplan_membership_v40
  set membership_status = 'DISPATCHED', updated_at = now()
  where wayplan_id = v_wayplan
    and membership_status = 'READY_FOR_DISPATCH';

  insert into public.be_wayplan_events_v40(wayplan_id, event_type, actor_email, payload)
  values (
    v_wayplan,
    'WAYPLAN_PUBLISHED_AFTER_MANDATORY_SCAN_V41',
    v_actor,
    jsonb_build_object(
      'parcel_count', v_count,
      'way_ids', to_jsonb(v_way_ids),
      'publish_result', v_result
    )
  );

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'published_rows', v_count,
    'membership_status', 'DISPATCHED',
    'next_step', 'Assigned Rider receives the route in Rider App'
  );
end;
$$;

create or replace function public.be_dispatch_wayplan_status_v41(p_wayplan_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      m.*,
      coalesce(s.scan_status = 'SCANNED', false) as scanned
    from public.be_wayplan_membership_v40 m
    left join public.be_dispatch_scans_v39 s
      on s.delivery_way_id = m.delivery_way_id
     and s.wayplan_code = m.wayplan_id
    where m.wayplan_id = p_wayplan_id
  )
  select jsonb_build_object(
    'wayplan_id', p_wayplan_id,
    'parcel_count', count(*)::integer,
    'planned', count(*) filter (where membership_status = 'PLANNED')::integer,
    'ready_for_dispatch', count(*) filter (where membership_status = 'READY_FOR_DISPATCH')::integer,
    'dispatch_scanned', count(*) filter (where scanned)::integer,
    'remaining_to_scan', count(*) filter (where not scanned and membership_status = 'READY_FOR_DISPATCH')::integer,
    'dispatched', count(*) filter (where membership_status = 'DISPATCHED')::integer,
    'blocked', count(*) filter (where membership_status in ('ON_HOLD','RTO'))::integer,
    'publish_ready', count(*) > 0
      and count(*) filter (where membership_status = 'READY_FOR_DISPATCH') = count(*)
      and count(*) filter (where scanned) = count(*),
    'way_ids', coalesce(jsonb_agg(delivery_way_id order by delivery_way_id), '[]'::jsonb)
  )
  from rows;
$$;

revoke all on function public.be_dispatch_actor_v41(text) from public, anon;
revoke all on function public.be_dispatch_wayplan_snapshot_v41(text) from public, anon;
revoke all on function public.be_dispatch_scan_wayplan_parcel_v41(text,text,text) from public, anon;
revoke all on function public.be_dispatch_scan_wayplan_batch_v41(text,text[],text) from public, anon;
revoke all on function public.be_dispatch_publish_wayplan_v41(text,text) from public, anon;
revoke all on function public.be_dispatch_wayplan_status_v41(text) from public, anon;

grant execute on function public.be_dispatch_wayplan_snapshot_v41(text) to authenticated;
grant execute on function public.be_dispatch_scan_wayplan_parcel_v41(text,text,text) to authenticated;
grant execute on function public.be_dispatch_scan_wayplan_batch_v41(text,text[],text) to authenticated;
grant execute on function public.be_dispatch_publish_wayplan_v41(text,text) to authenticated;
grant execute on function public.be_dispatch_wayplan_status_v41(text) to authenticated;

commit;

select
  to_regprocedure('public.be_dispatch_wayplan_snapshot_v41(text)')::text as dispatch_snapshot_rpc,
  to_regprocedure('public.be_dispatch_scan_wayplan_parcel_v41(text,text,text)')::text as single_scan_rpc,
  to_regprocedure('public.be_dispatch_scan_wayplan_batch_v41(text,text[],text)')::text as batch_scan_rpc,
  to_regprocedure('public.be_dispatch_publish_wayplan_v41(text,text)')::text as guarded_publish_rpc,
  to_regprocedure('public.be_dispatch_wayplan_status_v41(text)')::text as status_rpc,
  'READY_FOR_DISPATCH -> mandatory Dispatch scan -> guarded Publish -> DISPATCHED / OUT_FOR_DELIVERY' as workflow;
