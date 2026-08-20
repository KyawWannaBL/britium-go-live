-- Way Management backend API compatibility layer.
-- No mock data. No sample rows.
-- Run in Supabase SQL Editor if you want a canonical backend table/RPC for WayManagementPlanPage.

create extension if not exists pgcrypto;

create table if not exists public.be_way_management_plan (
  id uuid primary key default gen_random_uuid(),
  way_id text not null unique,
  way_type text default 'delivery',
  pickup_id text,
  delivery_way_id text,
  waybill_id text,
  merchant_code text,
  merchant_name text,
  receiver_name text,
  receiver_phone text,
  receiver_address text,
  township text,
  zone text,
  status text default 'pending',
  cod_amount numeric default 0,
  item_price numeric default 0,
  delivery_fee numeric default 0,
  weight_kg numeric default 0,
  assigned_primary_id text,
  assigned_primary_name text,
  assigned_secondary_id text,
  assigned_secondary_name text,
  pickup_by_id text,
  pickup_by_name text,
  collection_date timestamptz,
  delivery_date timestamptz,
  remarks text,
  last_event_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_way_management_events (
  id uuid primary key default gen_random_uuid(),
  way_id text not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id text,
  remarks text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_be_way_management_plan_way_id on public.be_way_management_plan (way_id);
create index if not exists idx_be_way_management_plan_pickup_id on public.be_way_management_plan (pickup_id);
create index if not exists idx_be_way_management_plan_status on public.be_way_management_plan (status);
create index if not exists idx_be_way_management_events_way_id on public.be_way_management_events (way_id);

create or replace function public.be_way_management_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.last_event_at := coalesce(new.last_event_at, now());
  return new;
end;
$$;

drop trigger if exists trg_be_way_management_plan_touch on public.be_way_management_plan;
create trigger trg_be_way_management_plan_touch
before update on public.be_way_management_plan
for each row execute function public.be_way_management_touch_updated_at();

create or replace view public.be_way_management_plan_v as
select * from public.be_way_management_plan;

create or replace function public.be_way_management_plan(
  p_view text default 'all',
  p_search text default '',
  p_status text default 'all',
  p_merchant text default 'all',
  p_assigned_to text default '',
  p_limit integer default 1000
)
returns setof public.be_way_management_plan
language sql
stable
as $$
  select *
  from public.be_way_management_plan w
  where
    (
      coalesce(p_view, 'all') = 'all'
      or (p_view = 'pickup' and (w.way_type ilike '%pickup%' or w.status ilike '%pickup%'))
      or (p_view = 'pending' and (w.status ilike '%pending%' or w.status ilike '%needs%' or w.status ilike '%waiting%'))
      or (p_view = 'deliver' and (w.way_type ilike '%delivery%' or w.status in ('ready_for_dispatch', 'in_transit', 'pickup_assigned')))
      or (p_view = 'successful' and (w.status ilike '%delivered%' or w.status ilike '%success%'))
      or (p_view = 'failed' and w.status ilike '%failed%')
      or (p_view = 'return' and w.status ilike '%return%')
    )
    and (coalesce(p_status, 'all') in ('', 'all') or w.status = p_status)
    and (coalesce(p_merchant, 'all') in ('', 'all') or concat_ws(' ', w.merchant_code, w.merchant_name) ilike '%' || p_merchant || '%')
    and (coalesce(p_assigned_to, '') = '' or concat_ws(' ', w.assigned_primary_id, w.assigned_primary_name, w.assigned_secondary_id, w.assigned_secondary_name, w.pickup_by_name) ilike '%' || p_assigned_to || '%')
    and (
      coalesce(p_search, '') = ''
      or concat_ws(
        ' ',
        w.way_id,
        w.pickup_id,
        w.delivery_way_id,
        w.waybill_id,
        w.merchant_code,
        w.merchant_name,
        w.receiver_name,
        w.receiver_phone,
        w.receiver_address,
        w.township,
        w.zone,
        w.status,
        w.assigned_primary_name,
        w.assigned_secondary_name,
        w.pickup_by_name,
        w.remarks
      ) ilike '%' || p_search || '%'
    )
  order by coalesce(w.last_event_at, w.updated_at, w.created_at) desc
  limit greatest(coalesce(p_limit, 1000), 1);
$$;

create or replace function public.be_way_management_update_status(
  p_way_id text,
  p_status text,
  p_remarks text default null,
  p_actor_id text default null
)
returns public.be_way_management_plan
language plpgsql
security definer
as $$
declare
  v_old text;
  v_row public.be_way_management_plan;
begin
  select status into v_old
  from public.be_way_management_plan
  where way_id = p_way_id;

  update public.be_way_management_plan
  set
    status = p_status,
    remarks = coalesce(p_remarks, remarks),
    last_event_at = now(),
    updated_at = now()
  where way_id = p_way_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Way ID % not found', p_way_id;
  end if;

  insert into public.be_way_management_events (way_id, event_type, from_status, to_status, actor_id, remarks)
  values (p_way_id, 'status_update', v_old, p_status, p_actor_id, p_remarks);

  return v_row;
end;
$$;

create or replace function public.be_way_management_assign(
  p_way_id text,
  p_primary_staff_id text default null,
  p_secondary_staff_id text default null,
  p_remarks text default null,
  p_actor_id text default null
)
returns public.be_way_management_plan
language plpgsql
security definer
as $$
declare
  v_primary_name text;
  v_secondary_name text;
  v_row public.be_way_management_plan;
begin
  if to_regclass('public.staff_master') is not null then
    select full_name into v_primary_name
    from public.staff_master
    where id::text = p_primary_staff_id or staff_code = p_primary_staff_id
    limit 1;

    select full_name into v_secondary_name
    from public.staff_master
    where id::text = p_secondary_staff_id or staff_code = p_secondary_staff_id
    limit 1;
  end if;

  update public.be_way_management_plan
  set
    assigned_primary_id = p_primary_staff_id,
    assigned_primary_name = v_primary_name,
    assigned_secondary_id = p_secondary_staff_id,
    assigned_secondary_name = v_secondary_name,
    remarks = coalesce(p_remarks, remarks),
    status = case
      when status in ('pending', 'pickup_requested', 'ready_for_dispatch') and p_primary_staff_id is not null then 'pickup_assigned'
      else status
    end,
    last_event_at = now(),
    updated_at = now()
  where way_id = p_way_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Way ID % not found', p_way_id;
  end if;

  insert into public.be_way_management_events (way_id, event_type, actor_id, remarks, payload)
  values (
    p_way_id,
    'assignment_update',
    p_actor_id,
    p_remarks,
    jsonb_build_object('primary_staff_id', p_primary_staff_id, 'secondary_staff_id', p_secondary_staff_id)
  );

  return v_row;
end;
$$;

alter table public.be_way_management_plan enable row level security;
alter table public.be_way_management_events enable row level security;

drop policy if exists be_way_management_plan_select_auth on public.be_way_management_plan;
drop policy if exists be_way_management_plan_insert_auth on public.be_way_management_plan;
drop policy if exists be_way_management_plan_update_auth on public.be_way_management_plan;
drop policy if exists be_way_management_plan_delete_auth on public.be_way_management_plan;

create policy be_way_management_plan_select_auth
on public.be_way_management_plan for select to authenticated using (true);

create policy be_way_management_plan_insert_auth
on public.be_way_management_plan for insert to authenticated with check (true);

create policy be_way_management_plan_update_auth
on public.be_way_management_plan for update to authenticated using (true) with check (true);

create policy be_way_management_plan_delete_auth
on public.be_way_management_plan for delete to authenticated using (true);

drop policy if exists be_way_management_events_select_auth on public.be_way_management_events;
drop policy if exists be_way_management_events_insert_auth on public.be_way_management_events;

create policy be_way_management_events_select_auth
on public.be_way_management_events for select to authenticated using (true);

create policy be_way_management_events_insert_auth
on public.be_way_management_events for insert to authenticated with check (true);
