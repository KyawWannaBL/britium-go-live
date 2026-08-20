-- Britium Express V51
-- Rider / Driver Wayplan assignment visibility bridge for the Field Command Wall.
-- Fixes company-email logins such as driver_ygn_0001@britiumventures.com by
-- resolving them to the canonical workforce code DRV001 used by Wayplan V44.

begin;

create or replace function public.be_field_team_code_from_login_v51(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_raw text := lower(btrim(coalesce(p_value, '')));
  v_local text;
  v_match text[];
  v_prefix text;
begin
  if v_raw = '' then return null; end if;
  v_local := split_part(v_raw, '@', 1);

  v_match := regexp_match(v_local, '^(rider|driver|helper)(?:_[a-z]{3})?_0*([0-9]+)$');
  if v_match is not null then
    v_prefix := case v_match[1]
      when 'driver' then 'DRV'
      when 'helper' then 'HLP'
      else 'RID'
    end;
    return v_prefix || lpad((v_match[2]::integer)::text, 3, '0');
  end if;

  v_match := regexp_match(v_local, '^(rid|drv|hlp)[-_ ]*0*([0-9]+)$');
  if v_match is not null then
    return upper(v_match[1]) || lpad((v_match[2]::integer)::text, 3, '0');
  end if;

  v_match := regexp_match(v_local, '^uat[-_ ]?(rider|driver|helper)[-_ ]*0*([0-9]+)$');
  if v_match is not null then
    v_prefix := case v_match[1]
      when 'driver' then 'DRV'
      when 'helper' then 'HLP'
      else 'RID'
    end;
    return v_prefix || lpad((v_match[2]::integer)::text, 3, '0');
  end if;

  return upper(btrim(p_value));
end;
$$;

create or replace function public.be_field_team_role_from_code_v51(p_value text)
returns text
language sql
immutable
as $$
  select case
    when upper(coalesce(public.be_field_team_code_from_login_v51(p_value), '')) like 'DRV%' then 'driver'
    when upper(coalesce(public.be_field_team_code_from_login_v51(p_value), '')) like 'HLP%' then 'helper'
    else 'rider'
  end;
$$;

create or replace function public.be_field_team_wayplan_snapshot_v51(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_login text := coalesce(
    nullif(btrim(v_payload ->> 'worker_code'), ''),
    nullif(btrim(v_payload ->> 'login'), ''),
    nullif(btrim(v_payload ->> 'email'), '')
  );
  v_email text := lower(coalesce(nullif(btrim(v_payload ->> 'email'), ''), ''));
  v_code text;
  v_role text;
  v_dataset text;
  v_id_field text;
  v_name_field text;
  v_master jsonb;
  v_name text;
  v_jobs jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_active integer := 0;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated field-team session is required';
  end if;

  if to_regclass('public.be_wayplan_membership_v40') is null then
    raise exception 'Wayplan membership table be_wayplan_membership_v40 is required';
  end if;

  v_code := public.be_field_team_code_from_login_v51(v_login);
  v_role := lower(coalesce(nullif(btrim(v_payload ->> 'role'), ''), public.be_field_team_role_from_code_v51(v_code)));
  if v_role not in ('rider','driver','helper') then
    v_role := public.be_field_team_role_from_code_v51(v_code);
  end if;

  v_dataset := case v_role when 'driver' then 'driver_master' when 'helper' then 'helper_master' else 'rider_master' end;
  v_id_field := case v_role when 'driver' then 'driver_id' when 'helper' then 'helper_id' else 'rider_id' end;
  v_name_field := case v_role when 'driver' then 'driver_name' when 'helper' then 'helper_name' else 'rider_name' end;

  if to_regclass('public.be_master_data_rows') is not null then
    select r.payload
    into v_master
    from public.be_master_data_rows r
    where r.dataset_key = v_dataset
      and r.deleted_at is null
      and upper(coalesce(r.status, 'ACTIVE')) not in ('INACTIVE','DELETED','SUSPENDED','RETIRED')
      and (
        upper(coalesce(r.payload ->> v_id_field, r.payload ->> 'employee_id', r.record_key)) = upper(v_code)
        or upper(r.record_key) = upper(v_code)
        or lower(coalesce(r.payload ->> 'email', r.payload ->> 'work_email', r.payload ->> 'auth_email', r.payload ->> 'login_email', '')) = v_email
      )
    order by case when upper(coalesce(r.payload ->> v_id_field, r.record_key)) = upper(v_code) then 0 else 1 end
    limit 1;
  end if;

  v_name := coalesce(
    nullif(v_master ->> v_name_field, ''),
    nullif(v_master ->> 'employee_name', ''),
    nullif(v_master ->> 'name', ''),
    v_code
  );

  with matched as (
    select m.*
    from public.be_wayplan_membership_v40 m
    where m.membership_status in ('DISPATCHED','COMPLETED','RTO')
      and case v_role
        when 'driver' then upper(coalesce(m.driver_code, '')) = upper(v_code)
        when 'helper' then upper(coalesce(m.helper_code, '')) = upper(v_code)
        else upper(coalesce(m.rider_code, '')) = upper(v_code)
      end
  ), grouped as (
    select
      m.wayplan_id,
      min(m.pickup_id) as canonical_pickup_id,
      min(m.route_zone) as route_zone,
      min(m.vehicle_type) as vehicle_type,
      min(m.vehicle_code) as vehicle_code,
      min(m.vehicle_name) as vehicle_name,
      min(m.rider_code) as rider_code,
      min(m.rider_name) as rider_name,
      min(m.driver_code) as driver_code,
      min(m.driver_name) as driver_name,
      min(m.helper_code) as helper_code,
      min(m.helper_name) as helper_name,
      count(*)::integer as parcel_count,
      sum(coalesce(v.actual_collect, 0))::numeric as cod_amount,
      min(v.township) as township,
      min(v.recipient_address) as first_address,
      max(m.updated_at) as updated_at,
      min(m.created_at) as created_at,
      min(coalesce(r.run_status, '')) as route_run_status,
      min(coalesce(rv.review_status, 'DISPATCHED')) as review_status,
      bool_or(rp.route_status = 'READY') as route_saved
    from matched m
    left join public.be_v_warehouse_receipt_v39 v on v.delivery_way_id = m.delivery_way_id
    left join public.be_rider_route_runs_v46 r on r.wayplan_id = m.wayplan_id
    left join public.be_wayplan_review_v43 rv on rv.wayplan_id = m.wayplan_id
    left join public.be_wayplan_route_plans_v45 rp on rp.wayplan_id = m.wayplan_id
    group by m.wayplan_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'source_type', 'WAYPLAN_V51',
    'assignment_source', 'WAYPLAN_V51',
    'route_execution', 'V46',
    'job_key', 'WAYPLAN:' || g.wayplan_id,
    'pickup_id', g.wayplan_id,
    'canonical_pickup_id', g.canonical_pickup_id,
    'wayplan_id', g.wayplan_id,
    'wayplan_code', g.wayplan_id,
    'merchant_name', 'Assigned delivery Wayplan',
    'customer_name', concat_ws(' · ', 'Wayplan route', g.route_zone),
    'township', coalesce(g.route_zone, g.township),
    'pickup_township', coalesce(g.route_zone, g.township),
    'pickup_address', 'Britium Head Office -> saved Mapbox route',
    'delivery_address', coalesce(g.first_address, 'Open Route for ordered stops'),
    'expected_parcels', g.parcel_count,
    'delivery_line_count', g.parcel_count,
    'parcel_count', g.parcel_count,
    'cod_amount', g.cod_amount,
    'rider_cod_amount', g.cod_amount,
    'assignment_role', upper(v_role),
    'worker_code', v_code,
    'vehicle_type', g.vehicle_type,
    'vehicle_code', g.vehicle_code,
    'vehicle_name', g.vehicle_name,
    'rider_code', g.rider_code,
    'rider_name', g.rider_name,
    'driver_code', g.driver_code,
    'driver_name', g.driver_name,
    'helper_code', g.helper_code,
    'helper_name', g.helper_name,
    'route_zone', g.route_zone,
    'route_saved', g.route_saved,
    'review_status', g.review_status,
    'route_run_status', nullif(g.route_run_status, ''),
    'assignment_status', case
      when g.route_run_status = 'COMPLETED' then 'DELIVERED'
      when g.route_run_status = 'COMPLETED_WITH_EXCEPTIONS' then 'DELIVERY_EXCEPTION'
      when g.route_run_status = 'IN_PROGRESS' then 'OUT_FOR_DELIVERY'
      when g.route_run_status = 'ACCEPTED' then 'READY_FOR_DELIVERY'
      else 'ASSIGNED_FOR_DELIVERY'
    end,
    'status', case
      when g.route_run_status = 'COMPLETED' then 'DELIVERED'
      when g.route_run_status = 'COMPLETED_WITH_EXCEPTIONS' then 'DELIVERY_EXCEPTION'
      when g.route_run_status = 'IN_PROGRESS' then 'OUT_FOR_DELIVERY'
      when g.route_run_status = 'ACCEPTED' then 'READY_FOR_DELIVERY'
      else 'ASSIGNED_FOR_DELIVERY'
    end,
    'delivery_status', case
      when g.route_run_status = 'COMPLETED' then 'DELIVERED'
      when g.route_run_status = 'COMPLETED_WITH_EXCEPTIONS' then 'DELIVERY_EXCEPTION'
      when g.route_run_status = 'IN_PROGRESS' then 'OUT_FOR_DELIVERY'
      when g.route_run_status = 'ACCEPTED' then 'READY_FOR_DELIVERY'
      else 'ASSIGNED_FOR_DELIVERY'
    end,
    'dispatch_status', 'OUT_FOR_DELIVERY',
    'published_to_rider', true,
    'created_at', g.created_at,
    'updated_at', g.updated_at,
    'mobile_role', v_role
  ) order by g.updated_at desc), '[]'::jsonb), count(*)::integer
  into v_jobs, v_active
  from grouped g;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'WAYPLAN-V51-' || (job ->> 'wayplan_id') || '-' || v_code,
    'notification_type', 'WAYPLAN_ASSIGNED',
    'title', 'Delivery Wayplan assigned',
    'body', format('%s is assigned to %s. Open Route to accept and start from Head Office.', job ->> 'wayplan_id', v_code),
    'wayplan_id', job ->> 'wayplan_id',
    'target_user_code', v_code,
    'target_email', v_email,
    'target_role', v_role,
    'is_read', false,
    'created_at', coalesce(job ->> 'updated_at', now()::text),
    'metadata', jsonb_build_object('source','WAYPLAN_V51','parcel_count',job ->> 'parcel_count')
  )), '[]'::jsonb)
  into v_notifications
  from jsonb_array_elements(v_jobs) job
  where coalesce(job ->> 'status', '') not in ('DELIVERED','DELIVERY_EXCEPTION');

  return jsonb_build_object(
    'ok', true,
    'build', 'FIELD_TEAM_V51_DRIVER_WAYPLAN_VISIBILITY_2026-07-30',
    'source', 'be_field_team_wayplan_snapshot_v51',
    'identity', jsonb_build_object(
      'worker_code', v_code,
      'display_name', v_name,
      'email', nullif(v_email, ''),
      'role', v_role,
      'branch_code', coalesce(nullif(v_master ->> 'branch_code', ''), 'YGN'),
      'assigned_zone', coalesce(v_master ->> 'assigned_zone', v_master ->> 'zone', '')
    ),
    'jobs', v_jobs,
    'notifications', v_notifications,
    'counts', jsonb_build_object('assigned_wayplans', v_active),
    'workflow', 'EMAIL/CODE -> CANONICAL WORKFORCE CODE -> DISPATCHED WAYPLAN -> DRIVER/RIDER ROUTE V46'
  );
end;
$$;

-- V51 makes the existing V46 authorization helper understand company-email
-- logins as well as canonical RID/DRV codes. The signature remains unchanged.
create or replace function public.be_rider_route_operator_v46(
  p_wayplan_id text,
  p_rider_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := public.be_rider_norm_v46(p_rider_key);
  v_code text := public.be_field_team_code_from_login_v51(p_rider_key);
  v_rider_code text;
  v_rider_name text;
  v_driver_code text;
  v_driver_name text;
  v_match boolean := false;
begin
  select
    min(nullif(rider_code, '')),
    min(nullif(rider_name, '')),
    min(nullif(driver_code, '')),
    min(nullif(driver_name, ''))
  into v_rider_code, v_rider_name, v_driver_code, v_driver_name
  from public.be_wayplan_membership_v40
  where wayplan_id = btrim(p_wayplan_id)
    and membership_status <> 'CANCELLED';

  if v_key <> '' then
    v_match := v_key in (
      public.be_rider_norm_v46(v_rider_code),
      public.be_rider_norm_v46(v_rider_name),
      public.be_rider_norm_v46(v_driver_code),
      public.be_rider_norm_v46(v_driver_name)
    ) or upper(coalesce(v_code, '')) in (
      upper(coalesce(v_rider_code, '')),
      upper(coalesce(v_driver_code, ''))
    );
  end if;

  return jsonb_build_object(
    'ok', v_match,
    'operator_key', p_rider_key,
    'resolved_operator_code', v_code,
    'rider_code', v_rider_code,
    'rider_name', v_rider_name,
    'driver_code', v_driver_code,
    'driver_name', v_driver_name
  );
end;
$$;

revoke all on function public.be_field_team_code_from_login_v51(text) from public, anon;
revoke all on function public.be_field_team_role_from_code_v51(text) from public, anon;
revoke all on function public.be_field_team_wayplan_snapshot_v51(jsonb) from public, anon;
revoke all on function public.be_rider_route_operator_v46(text,text) from public, anon;

grant execute on function public.be_field_team_code_from_login_v51(text) to authenticated;
grant execute on function public.be_field_team_role_from_code_v51(text) to authenticated;
grant execute on function public.be_field_team_wayplan_snapshot_v51(jsonb) to authenticated;
grant execute on function public.be_rider_route_operator_v46(text,text) to authenticated;

commit;

select jsonb_build_object(
  'field_team_wayplan_snapshot_rpc', to_regprocedure('public.be_field_team_wayplan_snapshot_v51(jsonb)')::text,
  'email_to_code_rpc', to_regprocedure('public.be_field_team_code_from_login_v51(text)')::text,
  'v46_operator_rpc', to_regprocedure('public.be_rider_route_operator_v46(text,text)')::text,
  'driver_email_example', public.be_field_team_code_from_login_v51('driver_ygn_0001@britiumventures.com'),
  'workflow', 'DRIVER EMAIL -> DRV001 -> DISPATCHED WAYPLAN -> FIELD COMMAND WALL + RIDER V46 ROUTE'
) as rider_driver_v51;
