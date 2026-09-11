begin;
create or replace function public.be_approved_wayplan_membership_sync_v1(
  p_wayplan_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_status text;
  v_rows integer := 0;
begin
  if v_actor is null or not private.be_emergency_is_superadmin_v2() then
    raise exception 'Superadmin authorization is required.' using errcode = '42501';
  end if;

  if v_wayplan is null then
    return jsonb_build_object('ok', false, 'error', 'Wayplan ID is required.');
  end if;

  select wayplan_status
  into v_status
  from public.be_wayplan_dispatches
  where wayplan_id = v_wayplan;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Wayplan was not found.');
  end if;

  if upper(coalesce(v_status, '')) not in ('CREATED', 'WAYPLAN_CREATED', 'DRAFT') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Only an undispatched Wayplan can rebuild parcel membership.',
      'wayplan_status', v_status
    );
  end if;

  update public.be_wayplan_membership_v40 m
  set
    membership_status = 'CANCELLED',
    updated_at = now(),
    metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
      'membership_sync_v1', 'REMOVED_FROM_CURRENT_DISPATCH_STOPS',
      'membership_sync_at', now()
    )
  where m.wayplan_id = v_wayplan
    and m.membership_status in ('PLANNED', 'READY_FOR_DISPATCH', 'ON_HOLD')
    and not exists (
      select 1
      from public.be_wayplan_dispatch_stops s
      where s.wayplan_id = v_wayplan
        and s.delivery_way_id = m.delivery_way_id
        and upper(coalesce(s.stop_status, '')) not in ('CANCELLED', 'COMPLETED', 'RTO')
    );

  insert into public.be_wayplan_membership_v40 (
    wayplan_id,
    delivery_way_id,
    pickup_id,
    route_zone,
    membership_status,
    vehicle_code,
    vehicle_name,
    rider_code,
    rider_name,
    driver_code,
    driver_name,
    helper_code,
    helper_name,
    created_by,
    metadata
  )
  select
    d.wayplan_id,
    s.delivery_way_id,
    s.pickup_id,
    s.township,
    'READY_FOR_DISPATCH',
    d.vehicle_code,
    d.vehicle_name,
    d.rider_code,
    d.rider_name,
    d.driver_code,
    d.driver_name,
    d.helper_code,
    d.helper_name,
    coalesce(auth.jwt()->>'email', v_actor::text),
    jsonb_build_object(
      'source', 'APPROVED_WAYPLAN_MEMBERSHIP_SYNC_V1',
      'dispatch_stop_status', s.stop_status,
      'synced_at', now()
    )
  from public.be_wayplan_dispatches d
  join public.be_wayplan_dispatch_stops s
    on s.wayplan_id = d.wayplan_id
  where d.wayplan_id = v_wayplan
    and nullif(btrim(coalesce(s.delivery_way_id, '')), '') is not null
    and upper(coalesce(s.stop_status, '')) not in ('CANCELLED', 'COMPLETED', 'RTO')
  on conflict (wayplan_id, delivery_way_id) do update
  set
    pickup_id = excluded.pickup_id,
    route_zone = excluded.route_zone,
    membership_status = 'READY_FOR_DISPATCH',
    vehicle_code = excluded.vehicle_code,
    vehicle_name = excluded.vehicle_name,
    rider_code = excluded.rider_code,
    rider_name = excluded.rider_name,
    driver_code = excluded.driver_code,
    driver_name = excluded.driver_name,
    helper_code = excluded.helper_code,
    helper_name = excluded.helper_name,
    updated_at = now(),
    metadata = coalesce(be_wayplan_membership_v40.metadata, '{}'::jsonb) || excluded.metadata
  where be_wayplan_membership_v40.membership_status not in ('COMPLETED', 'RTO');

  select count(*)::integer
  into v_rows
  from public.be_wayplan_membership_v40
  where wayplan_id = v_wayplan
    and membership_status not in ('CANCELLED', 'COMPLETED', 'RTO');

  if v_rows = 0 then
    return jsonb_build_object(
      'ok', false,
      'error', 'No active dispatch stops were available for membership synchronization.',
      'wayplan_id', v_wayplan
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'membership_rows', v_rows,
    'status', 'SYNCHRONIZED'
  );
end;
$function$;
revoke all on function public.be_approved_wayplan_membership_sync_v1(text) from public;
revoke all on function public.be_approved_wayplan_membership_sync_v1(text) from anon;
grant execute on function public.be_approved_wayplan_membership_sync_v1(text) to authenticated;
commit;
