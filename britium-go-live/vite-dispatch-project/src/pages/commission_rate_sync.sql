
-- Britium commission rate fix for pickup, delivery, and highway drop-off.
-- Rates:
--   Parcel pickup: Rider 150, Driver 75, Helper 75 MMK / parcel
--   Parcel delivery: Rider 300, Driver 150, Helper 150 MMK / parcel
--   Highway station drop-off: Rider/Driver/Helper 1000 MMK / bag
--
-- This patch is schema-safe and uses live operational data.
-- It does not create demo/mock parcel rows.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) Canonical commission rate master
-- ---------------------------------------------------------------------
create table if not exists public.be_commission_rate_master (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null,
  role_code text not null,
  unit_type text not null,
  rate_mmk numeric not null default 0,
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_type, role_code, unit_type, effective_from)
);

insert into public.be_commission_rate_master (
  operation_type, role_code, unit_type, rate_mmk, active, effective_from, notes
)
values
  ('PICKUP', 'RIDER',  'PARCEL', 150, true, current_date, 'Parcel pickup commission: rider 150 MMK / parcel'),
  ('PICKUP', 'DRIVER', 'PARCEL',  75, true, current_date, 'Parcel pickup commission: driver 75 MMK / parcel'),
  ('PICKUP', 'HELPER', 'PARCEL',  75, true, current_date, 'Parcel pickup commission: helper 75 MMK / parcel'),

  ('DELIVERY', 'RIDER',  'PARCEL', 300, true, current_date, 'Delivery commission: rider 300 MMK / parcel'),
  ('DELIVERY', 'DRIVER', 'PARCEL', 150, true, current_date, 'Delivery commission: driver 150 MMK / parcel'),
  ('DELIVERY', 'HELPER', 'PARCEL', 150, true, current_date, 'Delivery commission: helper 150 MMK / parcel'),

  ('HIGHWAY_DROPOFF', 'RIDER',  'BAG', 1000, true, current_date, 'Highway station drop-off: 1000 MMK / bag'),
  ('HIGHWAY_DROPOFF', 'DRIVER', 'BAG', 1000, true, current_date, 'Highway station drop-off: 1000 MMK / bag'),
  ('HIGHWAY_DROPOFF', 'HELPER', 'BAG', 1000, true, current_date, 'Highway station drop-off: 1000 MMK / bag')
on conflict (operation_type, role_code, unit_type, effective_from)
do update set
  rate_mmk = excluded.rate_mmk,
  active = true,
  notes = excluded.notes,
  updated_at = now();

-- Disable older rate rows for the same rules if they exist.
update public.be_commission_rate_master r
set active = false, updated_at = now()
where r.effective_from <> current_date
  and (r.operation_type, r.role_code, r.unit_type) in (
    ('PICKUP','RIDER','PARCEL'), ('PICKUP','DRIVER','PARCEL'), ('PICKUP','HELPER','PARCEL'),
    ('DELIVERY','RIDER','PARCEL'), ('DELIVERY','DRIVER','PARCEL'), ('DELIVERY','HELPER','PARCEL'),
    ('HIGHWAY_DROPOFF','RIDER','BAG'), ('HIGHWAY_DROPOFF','DRIVER','BAG'), ('HIGHWAY_DROPOFF','HELPER','BAG')
  );

-- ---------------------------------------------------------------------
-- 2) Commission ledger
-- ---------------------------------------------------------------------
create table if not exists public.be_commission_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'AUTO',
  work_date date not null default current_date,
  operation_type text not null,
  unit_type text not null,
  unit_count numeric not null default 1,
  role_code text not null,
  assignee_email text,
  assignee_name text,
  asset_code text,
  tracking_no text,
  pickup_id text,
  waybill_no text,
  wayplan_code text,
  bag_count integer,
  rate_mmk numeric not null default 0,
  commission_mmk numeric not null default 0,
  event_status text not null default 'PENDING',
  actor_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists be_commission_events_work_date_idx on public.be_commission_events(work_date);
create index if not exists be_commission_events_assignee_idx on public.be_commission_events(assignee_email, role_code);
create index if not exists be_commission_events_tracking_idx on public.be_commission_events(tracking_no);
create index if not exists be_commission_events_operation_idx on public.be_commission_events(operation_type, role_code);

-- ---------------------------------------------------------------------
-- 3) Helpers
-- ---------------------------------------------------------------------
create or replace function public.be_commission_get_rate(
  p_operation_type text,
  p_role_code text,
  p_unit_type text,
  p_work_date date default current_date
)
returns numeric
language sql
stable
as $$
  select coalesce((
    select r.rate_mmk
    from public.be_commission_rate_master r
    where r.active
      and r.operation_type = upper(trim(p_operation_type))
      and r.role_code = upper(trim(p_role_code))
      and r.unit_type = upper(trim(p_unit_type))
      and r.effective_from <= coalesce(p_work_date, current_date)
      and (r.effective_to is null or r.effective_to >= coalesce(p_work_date, current_date))
    order by r.effective_from desc, r.updated_at desc
    limit 1
  ), 0);
$$;

create or replace function public.be_text_first_nonempty(p_data jsonb, variadic p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  foreach k in array p_keys loop
    v := nullif(trim(coalesce(p_data ->> k, '')), '');
    if v is not null and lower(v) not in ('null','undefined','nan') then
      return v;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.be_date_from_json(p_data jsonb, variadic p_keys text[])
returns date
language plpgsql
stable
as $$
declare
  k text;
  v text;
begin
  foreach k in array p_keys loop
    v := nullif(trim(coalesce(p_data ->> k, '')), '');
    if v is not null and lower(v) not in ('null','undefined','nan') then
      begin
        return v::timestamptz::date;
      exception when others then
        begin
          return v::date;
        exception when others then
          null;
        end;
      end;
    end if;
  end loop;
  return current_date;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Auto rebuild commission ledger from live workflow data.
--    This deletes only AUTO rows for the selected work_date.
--    Manual HIGHWAY_DROPOFF bag rows are preserved.
-- ---------------------------------------------------------------------
create or replace function public.be_rebuild_auto_commission_events(
  p_work_date date default current_date,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  d jsonb;
  v_work_date date := coalesce(p_work_date, current_date);
  v_tracking text;
  v_pickup text;
  v_waybill text;
  v_wayplan text;
  v_asset text;
  v_role text;
  v_email text;
  v_name text;
  v_rate numeric;
  v_units numeric;
  v_delivery_rows integer := 0;
  v_pickup_rows integer := 0;
  v_inserted integer := 0;
  v_status text;
  v_op text;
  v_has_dispatch_view boolean;
  v_has_pickup_table boolean;
  v_pickup_item_count integer;
begin
  delete from public.be_commission_events
  where work_date = v_work_date
    and source_type = 'AUTO';

  select to_regclass('public.be_v_enterprise_dispatch_jobs') is not null
  into v_has_dispatch_view;

  if v_has_dispatch_view then
    for rec in execute 'select * from public.be_v_enterprise_dispatch_jobs'
    loop
      d := to_jsonb(rec);
      v_status := upper(coalesce(
        public.be_text_first_nonempty(d, 'delivery_status'),
        public.be_text_first_nonempty(d, 'dispatch_status'),
        ''
      ));

      -- Delivery commission is payable only for completed delivery/drop-off rows.
      if v_status in ('DELIVERED','DROP_OFF','COMPLETED') then
        v_op := case
          when upper(coalesce(public.be_text_first_nonempty(d,'operation_type','job_type','service_type'), '')) like '%HIGHWAY%'
            or upper(coalesce(public.be_text_first_nonempty(d,'first_stop_dropoff','dropoff_type','delivery_township','destination_city','remarks','remark'), '')) like '%HIGHWAY%'
          then 'HIGHWAY_DROPOFF'
          else 'DELIVERY'
        end;

        v_units := 1;
        v_tracking := public.be_text_first_nonempty(d, 'tracking_no','delivery_way_id','id');
        v_pickup := public.be_text_first_nonempty(d, 'pickup_id');
        v_waybill := public.be_text_first_nonempty(d, 'waybill_no');
        v_wayplan := public.be_text_first_nonempty(d, 'wayplan_code','wayplan_no','wayplan_id');
        v_asset := public.be_text_first_nonempty(d, 'asset_code','vehicle_id','vehicle_code');

        foreach v_role in array array['RIDER','DRIVER','HELPER'] loop
          v_email := case v_role
            when 'RIDER' then public.be_text_first_nonempty(d, 'rider_email','assigned_rider_email','rider_user_email')
            when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_email','assigned_driver_email','driver_user_email')
            when 'HELPER' then public.be_text_first_nonempty(d, 'helper_email','assigned_helper_email','helper_user_email')
          end;

          v_name := case v_role
            when 'RIDER' then public.be_text_first_nonempty(d, 'rider_name','assigned_rider_name')
            when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_name','assigned_driver_name')
            when 'HELPER' then public.be_text_first_nonempty(d, 'helper_name','assigned_helper_name')
          end;

          if v_email is not null then
            v_rate := public.be_commission_get_rate(v_op, v_role, case when v_op = 'HIGHWAY_DROPOFF' then 'BAG' else 'PARCEL' end, v_work_date);

            insert into public.be_commission_events (
              source_type, work_date, operation_type, unit_type, unit_count,
              role_code, assignee_email, assignee_name, asset_code,
              tracking_no, pickup_id, waybill_no, wayplan_code, bag_count,
              rate_mmk, commission_mmk, event_status, actor_email, metadata
            )
            values (
              'AUTO', v_work_date, v_op, case when v_op = 'HIGHWAY_DROPOFF' then 'BAG' else 'PARCEL' end, v_units,
              v_role, v_email, v_name, v_asset,
              v_tracking, v_pickup, v_waybill, v_wayplan, case when v_op = 'HIGHWAY_DROPOFF' then v_units::integer else null end,
              v_rate, v_rate * v_units, 'READY', p_actor_email, d
            );

            v_inserted := v_inserted + 1;
          end if;
        end loop;

        v_delivery_rows := v_delivery_rows + 1;
      end if;
    end loop;
  end if;

  select to_regclass('public.be_portal_pickup_requests') is not null
  into v_has_pickup_table;

  if v_has_pickup_table then
    for rec in execute 'select * from public.be_portal_pickup_requests'
    loop
      d := to_jsonb(rec);
      v_status := upper(coalesce(
        public.be_text_first_nonempty(d, 'pickup_status','workflow_stage','status'),
        ''
      ));

      -- Pickup commission is payable when pickup is completed/collected.
      if v_status in ('PICKUP_COMPLETED','COMPLETED','COLLECTED') then
        if public.be_date_from_json(d, 'pickup_completed_at','completed_at','updated_at','created_at') = v_work_date then
          v_pickup := public.be_text_first_nonempty(d, 'pickup_id','pickup_way_id','id');
          v_waybill := public.be_text_first_nonempty(d, 'waybill_no');
          v_asset := public.be_text_first_nonempty(d, 'asset_code','vehicle_id','vehicle_code');

          v_pickup_item_count := 1;
          if to_regclass('public.be_portal_pickup_request_items') is not null and v_pickup is not null then
            begin
              execute 'select greatest(count(*),1)::int from public.be_portal_pickup_request_items where pickup_id = $1'
              into v_pickup_item_count
              using v_pickup;
            exception when others then
              v_pickup_item_count := 1;
            end;
          end if;

          foreach v_role in array array['RIDER','DRIVER','HELPER'] loop
            v_email := case v_role
              when 'RIDER' then public.be_text_first_nonempty(d, 'rider_email','assigned_rider_email','rider_user_email')
              when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_email','assigned_driver_email','driver_user_email')
              when 'HELPER' then public.be_text_first_nonempty(d, 'helper_email','assigned_helper_email','helper_user_email')
            end;

            v_name := case v_role
              when 'RIDER' then public.be_text_first_nonempty(d, 'rider_name','assigned_rider_name')
              when 'DRIVER' then public.be_text_first_nonempty(d, 'driver_name','assigned_driver_name')
              when 'HELPER' then public.be_text_first_nonempty(d, 'helper_name','assigned_helper_name')
            end;

            if v_email is not null then
              v_rate := public.be_commission_get_rate('PICKUP', v_role, 'PARCEL', v_work_date);

              insert into public.be_commission_events (
                source_type, work_date, operation_type, unit_type, unit_count,
                role_code, assignee_email, assignee_name, asset_code,
                tracking_no, pickup_id, waybill_no, wayplan_code, bag_count,
                rate_mmk, commission_mmk, event_status, actor_email, metadata
              )
              values (
                'AUTO', v_work_date, 'PICKUP', 'PARCEL', v_pickup_item_count,
                v_role, v_email, v_name, v_asset,
                v_pickup, v_pickup, v_waybill, null, null,
                v_rate, v_rate * v_pickup_item_count, 'READY', p_actor_email, d
              );

              v_inserted := v_inserted + 1;
            end if;
          end loop;

          v_pickup_rows := v_pickup_rows + 1;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true,
    'work_date', v_work_date,
    'delivery_completed_rows', v_delivery_rows,
    'pickup_completed_rows', v_pickup_rows,
    'commission_event_rows_inserted', v_inserted
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Manual highway station bag drop-off registration.
--    Use this when pickup van / delivery van drops sacks at highway station.
-- ---------------------------------------------------------------------
create or replace function public.be_record_highway_dropoff_bags(
  p_wayplan_code text,
  p_bag_count integer,
  p_asset_code text default null,
  p_rider_email text default null,
  p_driver_email text default null,
  p_helper_email text default null,
  p_actor_email text default null,
  p_work_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bags integer := greatest(coalesce(p_bag_count,0),0);
  v_work_date date := coalesce(p_work_date, current_date);
  v_role text;
  v_email text;
  v_rate numeric;
  v_inserted integer := 0;
begin
  if nullif(trim(coalesce(p_wayplan_code,'')), '') is null then
    raise exception 'p_wayplan_code is required';
  end if;

  if v_bags <= 0 then
    raise exception 'p_bag_count must be greater than zero';
  end if;

  delete from public.be_commission_events
  where source_type = 'MANUAL_HIGHWAY_DROPOFF'
    and work_date = v_work_date
    and wayplan_code = p_wayplan_code
    and coalesce(asset_code,'') = coalesce(p_asset_code,'');

  foreach v_role in array array['RIDER','DRIVER','HELPER'] loop
    v_email := case v_role
      when 'RIDER' then nullif(trim(coalesce(p_rider_email,'')), '')
      when 'DRIVER' then nullif(trim(coalesce(p_driver_email,'')), '')
      when 'HELPER' then nullif(trim(coalesce(p_helper_email,'')), '')
    end;

    if v_email is not null then
      v_rate := public.be_commission_get_rate('HIGHWAY_DROPOFF', v_role, 'BAG', v_work_date);

      insert into public.be_commission_events (
        source_type, work_date, operation_type, unit_type, unit_count,
        role_code, assignee_email, asset_code, wayplan_code, bag_count,
        rate_mmk, commission_mmk, event_status, actor_email,
        metadata
      )
      values (
        'MANUAL_HIGHWAY_DROPOFF', v_work_date, 'HIGHWAY_DROPOFF', 'BAG', v_bags,
        v_role, v_email, p_asset_code, p_wayplan_code, v_bags,
        v_rate, v_rate * v_bags, 'READY', p_actor_email,
        jsonb_build_object('wayplan_code', p_wayplan_code, 'asset_code', p_asset_code, 'bag_count', v_bags)
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'wayplan_code', p_wayplan_code,
    'bag_count', v_bags,
    'rows_inserted', v_inserted,
    'rate_per_bag_mmk', public.be_commission_get_rate('HIGHWAY_DROPOFF','DRIVER','BAG',v_work_date)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Settlement views and snapshots
-- ---------------------------------------------------------------------
create or replace view public.be_v_commission_settlement as
select
  e.work_date,
  e.role_code,
  e.assignee_email,
  coalesce(nullif(e.assignee_name,''), e.assignee_email) as assignee_name,
  e.operation_type,
  e.unit_type,
  sum(e.unit_count) as total_units,
  max(e.rate_mmk) as rate_mmk,
  sum(e.commission_mmk) as commission_mmk,
  count(*) as event_rows
from public.be_commission_events e
where e.event_status in ('READY','PENDING','APPROVED','PAID')
group by
  e.work_date,
  e.role_code,
  e.assignee_email,
  coalesce(nullif(e.assignee_name,''), e.assignee_email),
  e.operation_type,
  e.unit_type;

create or replace function public.be_commission_settlement_snapshot(
  p_work_date date default current_date,
  p_actor_email text default null,
  p_rebuild boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(p_work_date, current_date);
  v_rebuild jsonb := null;
  v_rates jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  if coalesce(p_rebuild, true) then
    v_rebuild := public.be_rebuild_auto_commission_events(v_work_date, p_actor_email);
  end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.operation_type, r.role_code), '[]'::jsonb)
  into v_rates
  from (
    select operation_type, role_code, unit_type, rate_mmk
    from public.be_commission_rate_master
    where active
      and effective_from <= v_work_date
      and (effective_to is null or effective_to >= v_work_date)
    order by operation_type, role_code, unit_type
  ) r;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.role_code, s.assignee_email, s.operation_type), '[]'::jsonb)
  into v_rows
  from public.be_v_commission_settlement s
  where s.work_date = v_work_date;

  select jsonb_build_object(
    'work_date', v_work_date,
    'pickup_commission', coalesce(sum(commission_mmk) filter (where operation_type = 'PICKUP'),0),
    'delivery_commission', coalesce(sum(commission_mmk) filter (where operation_type = 'DELIVERY'),0),
    'highway_dropoff_commission', coalesce(sum(commission_mmk) filter (where operation_type = 'HIGHWAY_DROPOFF'),0),
    'rider_commission', coalesce(sum(commission_mmk) filter (where role_code = 'RIDER'),0),
    'driver_commission', coalesce(sum(commission_mmk) filter (where role_code = 'DRIVER'),0),
    'helper_commission', coalesce(sum(commission_mmk) filter (where role_code = 'HELPER'),0),
    'total_commission', coalesce(sum(commission_mmk),0),
    'event_rows', coalesce(sum(event_rows),0)
  )
  into v_stats
  from public.be_v_commission_settlement
  where work_date = v_work_date;

  return jsonb_build_object(
    'ok', true,
    'rebuild', v_rebuild,
    'rates', v_rates,
    'stats', v_stats,
    'rows', v_rows
  );
end;
$$;

-- Drop overloaded old settlement functions that cause PostgREST ambiguity.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('be_rider_settlement_snapshot','be_driver_helper_settlement_snapshot')
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

create or replace function public.be_rider_settlement_snapshot(
  p_rider_email text default null,
  p_work_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(p_work_date, current_date);
  v_base jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  v_base := public.be_commission_settlement_snapshot(v_work_date, p_rider_email, true);

  select coalesce(jsonb_agg(to_jsonb(s) order by s.assignee_email, s.operation_type), '[]'::jsonb)
  into v_rows
  from public.be_v_commission_settlement s
  where s.work_date = v_work_date
    and s.role_code = 'RIDER'
    and (p_rider_email is null or s.assignee_email = p_rider_email);

  select jsonb_build_object(
    'work_date', v_work_date,
    'rider_email', p_rider_email,
    'pickup_units', coalesce(sum(total_units) filter (where operation_type = 'PICKUP'),0),
    'delivery_units', coalesce(sum(total_units) filter (where operation_type = 'DELIVERY'),0),
    'highway_bags', coalesce(sum(total_units) filter (where operation_type = 'HIGHWAY_DROPOFF'),0),
    'pickup_commission', coalesce(sum(commission_mmk) filter (where operation_type = 'PICKUP'),0),
    'delivery_commission', coalesce(sum(commission_mmk) filter (where operation_type = 'DELIVERY'),0),
    'highway_dropoff_commission', coalesce(sum(commission_mmk) filter (where operation_type = 'HIGHWAY_DROPOFF'),0),
    'total_commission', coalesce(sum(commission_mmk),0),
    'jobs', coalesce(sum(event_rows),0)
  )
  into v_stats
  from public.be_v_commission_settlement s
  where s.work_date = v_work_date
    and s.role_code = 'RIDER'
    and (p_rider_email is null or s.assignee_email = p_rider_email);

  return jsonb_build_object('ok', true, 'stats', v_stats, 'rows', v_rows, 'rates', v_base -> 'rates');
end;
$$;

create or replace function public.be_driver_helper_settlement_snapshot(
  p_work_date date default current_date,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(p_work_date, current_date);
  v_base jsonb;
  v_rows jsonb;
  v_stats jsonb;
begin
  v_base := public.be_commission_settlement_snapshot(v_work_date, p_actor_email, true);

  select coalesce(jsonb_agg(to_jsonb(s) order by s.role_code, s.assignee_email, s.operation_type), '[]'::jsonb)
  into v_rows
  from public.be_v_commission_settlement s
  where s.work_date = v_work_date
    and s.role_code in ('DRIVER','HELPER');

  select jsonb_build_object(
    'work_date', v_work_date,
    'driver_commission', coalesce(sum(commission_mmk) filter (where role_code = 'DRIVER'),0),
    'helper_commission', coalesce(sum(commission_mmk) filter (where role_code = 'HELPER'),0),
    'total_commission', coalesce(sum(commission_mmk),0),
    'driver_units', coalesce(sum(total_units) filter (where role_code = 'DRIVER'),0),
    'helper_units', coalesce(sum(total_units) filter (where role_code = 'HELPER'),0),
    'rows', count(*)
  )
  into v_stats
  from public.be_v_commission_settlement s
  where s.work_date = v_work_date
    and s.role_code in ('DRIVER','HELPER');

  return jsonb_build_object('ok', true, 'stats', v_stats, 'rows', v_rows, 'rates', v_base -> 'rates');
end;
$$;

grant execute on function public.be_commission_get_rate(text,text,text,date) to authenticated;
grant execute on function public.be_rebuild_auto_commission_events(date,text) to authenticated;
grant execute on function public.be_record_highway_dropoff_bags(text,integer,text,text,text,text,text,date) to authenticated;
grant execute on function public.be_commission_settlement_snapshot(date,text,boolean) to authenticated;
grant execute on function public.be_rider_settlement_snapshot(text,date) to authenticated;
grant execute on function public.be_driver_helper_settlement_snapshot(date,text) to authenticated;

notify pgrst, 'reload schema';
