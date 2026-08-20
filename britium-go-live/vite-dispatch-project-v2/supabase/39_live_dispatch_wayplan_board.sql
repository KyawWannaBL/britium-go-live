create extension if not exists pgcrypto;

create table if not exists public.be_dispatch_wayplan_assignments (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  way_id text,
  rider_code text,
  driver_code text,
  helper_code text,
  fleet_code text,
  vehicle_plate text,
  branch_code text default 'HQ',
  assignment_status text default 'ASSIGNED',
  workflow_status text default 'PICKUP_ASSIGNED',
  supervisor_note text,
  assigned_by text,
  assigned_at timestamptz default now(),
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_be_dispatch_wayplan_pickup
  on public.be_dispatch_wayplan_assignments (pickup_id);

create index if not exists idx_be_dispatch_wayplan_rider
  on public.be_dispatch_wayplan_assignments (rider_code);

create index if not exists idx_be_dispatch_wayplan_branch
  on public.be_dispatch_wayplan_assignments (branch_code);

create or replace function public.be_get_live_dispatch_wayplan_board(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch text := upper(coalesce(p_payload->>'branch_code', 'HQ'));
  v_limit integer := least(greatest(coalesce(nullif(p_payload->>'limit', '')::integer, 300), 1), 1000);

  v_pickups jsonb := '[]'::jsonb;
  v_workforce jsonb := '[]'::jsonb;
  v_assignments jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select *
        from public.be_portal_pickup_requests p
        where (
          $1 = ''
          or upper(coalesce(to_jsonb(p)->>'branch_code', to_jsonb(p)->'metadata'->>'branch_code', 'HQ')) = $1
        )
        and upper(coalesce(to_jsonb(p)->>'status', 'PICKUP_REQUESTED')) in (
          'PICKUP_REQUESTED',
          'PICKUP_ASSIGNED',
          'PICKUP_COMPLETED',
          'READY_FOR_DISPATCH',
          'READY_FOR_DELIVERY',
          'DELIVERY_ASSIGNED'
        )
        order by coalesce(to_jsonb(p)->>'created_at', '') desc
        limit $2
      ) x
    $q$
    into v_pickups
    using v_branch, v_limit;
  end if;

  if to_regclass('public.be_mobile_workforce_accounts') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select *
        from public.be_mobile_workforce_accounts w
        where coalesce((to_jsonb(w)->>'active')::boolean, true) = true
          and lower(coalesce(to_jsonb(w)->>'role_type', to_jsonb(w)->>'workforce_type', to_jsonb(w)->>'role', '')) in (
            'rider',
            'driver',
            'helper',
            'mobile'
          )
        order by coalesce(to_jsonb(w)->>'rider_code', to_jsonb(w)->>'worker_id', to_jsonb(w)->>'full_name', '')
        limit 1000
      ) x
    $q$
    into v_workforce;
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.assigned_at desc), '[]'::jsonb)
  into v_assignments
  from public.be_dispatch_wayplan_assignments a
  where ($1 = '' or upper(coalesce(a.branch_code, 'HQ')) = $1)
  limit v_limit;

  return jsonb_build_object(
    'ok', true,
    'branch_code', v_branch,
    'pickups', coalesce(v_pickups, '[]'::jsonb),
    'workforce', coalesce(v_workforce, '[]'::jsonb),
    'assignments', coalesce(v_assignments, '[]'::jsonb)
  );
end;
$$;

create or replace function public.be_assign_live_dispatch_wayplan(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id text := coalesce(p_payload->>'pickup_id', '');
  v_way_id text := coalesce(p_payload->>'way_id', '');
  v_rider_code text := coalesce(p_payload->>'rider_code', '');
  v_driver_code text := coalesce(p_payload->>'driver_code', '');
  v_helper_code text := coalesce(p_payload->>'helper_code', '');
  v_fleet_code text := coalesce(p_payload->>'fleet_code', '');
  v_vehicle_plate text := coalesce(p_payload->>'vehicle_plate', '');
  v_branch_code text := upper(coalesce(p_payload->>'branch_code', 'HQ'));
  v_actor_email text := coalesce(p_payload->>'actor_email', '');
  v_note text := coalesce(p_payload->>'supervisor_note', '');
  v_event jsonb := '{}'::jsonb;
begin
  if v_pickup_id = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'pickup_id is required before dispatch assignment'
    );
  end if;

  if v_rider_code = '' and v_driver_code = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'rider_code or driver_code is required'
    );
  end if;

  insert into public.be_dispatch_wayplan_assignments (
    pickup_id,
    way_id,
    rider_code,
    driver_code,
    helper_code,
    fleet_code,
    vehicle_plate,
    branch_code,
    assignment_status,
    workflow_status,
    supervisor_note,
    assigned_by,
    raw_payload
  )
  values (
    v_pickup_id,
    nullif(v_way_id, ''),
    nullif(v_rider_code, ''),
    nullif(v_driver_code, ''),
    nullif(v_helper_code, ''),
    nullif(v_fleet_code, ''),
    nullif(v_vehicle_plate, ''),
    v_branch_code,
    'ASSIGNED',
    'PICKUP_ASSIGNED',
    nullif(v_note, ''),
    nullif(v_actor_email, ''),
    p_payload
  )
  on conflict do nothing;

  update public.be_dispatch_wayplan_assignments
  set
    way_id = nullif(v_way_id, ''),
    rider_code = nullif(v_rider_code, ''),
    driver_code = nullif(v_driver_code, ''),
    helper_code = nullif(v_helper_code, ''),
    fleet_code = nullif(v_fleet_code, ''),
    vehicle_plate = nullif(v_vehicle_plate, ''),
    branch_code = v_branch_code,
    assignment_status = 'ASSIGNED',
    workflow_status = 'PICKUP_ASSIGNED',
    supervisor_note = nullif(v_note, ''),
    assigned_by = nullif(v_actor_email, ''),
    assigned_at = now(),
    updated_at = now(),
    raw_payload = p_payload
  where pickup_id = v_pickup_id;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute $q$
        update public.be_portal_pickup_requests p
        set
          status = 'PICKUP_ASSIGNED',
          updated_at = now()
        where coalesce(to_jsonb(p)->>'pickup_id', to_jsonb(p)->>'canonical_pickup_id', '') = $1
      $q$
      using v_pickup_id;
    exception when others then
      null;
    end;
  end if;

  if to_regprocedure('public.be_logistics_apply_workflow_event_strict(jsonb)') is not null then
    begin
      execute 'select public.be_logistics_apply_workflow_event_strict($1)'
      into v_event
      using jsonb_build_object(
        'pickup_id', v_pickup_id,
        'way_id', v_way_id,
        'process_type', 'PICKUP',
        'status_code', 'PICKUP_ASSIGNED',
        'actor_email', v_actor_email,
        'actor_role', 'dispatch',
        'remarks', coalesce(v_note, 'Pickup assigned from live dispatch wayplan board'),
        'metadata', p_payload
      );
    exception when others then
      v_event := jsonb_build_object('ok', false, 'warning', 'workflow strict event failed');
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup_id,
    'way_id', v_way_id,
    'rider_code', v_rider_code,
    'driver_code', v_driver_code,
    'helper_code', v_helper_code,
    'fleet_code', v_fleet_code,
    'vehicle_plate', v_vehicle_plate,
    'branch_code', v_branch_code,
    'workflow_status', 'PICKUP_ASSIGNED',
    'workflow_event', coalesce(v_event, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.be_get_live_dispatch_wayplan_board(jsonb) to anon, authenticated;
grant execute on function public.be_assign_live_dispatch_wayplan(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
