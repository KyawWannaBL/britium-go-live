
create extension if not exists pgcrypto;

create or replace function public.be_operational_master_snapshot()
returns jsonb language sql security definer as $$
  with base as (select public.be_master_data_dropdown_snapshot() as snap),
  zones as (
    select coalesce(jsonb_agg(jsonb_build_object('value', coalesce(row_data->>'zone_label_final', row_data->>'state_region_name_en', record_key), 'label', coalesce(row_data->>'zone_label_final', row_data->>'state_region_name_en', record_key), 'id', record_key) order by display_name), '[]'::jsonb) data
    from public.be_master_data_records where entity_code = 'zones' and coalesce(is_active, true) = true
  ),
  destinations as (
    select coalesce(jsonb_agg(jsonb_build_object('value', coalesce(row_data->>'dropoff_code', row_data->>'dropoff_name_en', record_key), 'label', coalesce(row_data->>'dropoff_name_en', row_data->>'dropoff_code', display_name, record_key), 'id', record_key) order by display_name), '[]'::jsonb) data
    from public.be_master_data_records where entity_code in ('cargo_dropoff_rates','zones') and coalesce(is_active, true) = true
  )
  select jsonb_build_object(
    'dropdowns', coalesce(snap->'dropdowns', '{}'::jsonb),
    'merchants', coalesce(snap->'merchants', '[]'::jsonb),
    'riders', coalesce(snap->'riders', '[]'::jsonb),
    'drivers', coalesce(snap->'drivers', '[]'::jsonb),
    'helpers', coalesce(snap->'helpers', '[]'::jsonb),
    'employees', coalesce(snap->'employees', '[]'::jsonb),
    'fleets', coalesce(snap->'fleets', '[]'::jsonb),
    'townships', coalesce(zones.data, '[]'::jsonb),
    'destinations', coalesce(destinations.data, '[]'::jsonb)
  ) from base, zones, destinations;
$$;

create or replace function public.be_waybill_tariff_lookup(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_town text := nullif(trim(coalesce(p_payload->>'township', p_payload->>'recipient_town', '')), '');
  v_destination text := nullif(trim(coalesce(p_payload->>'destination', '')), '');
  v_weight numeric := coalesce(nullif(p_payload->>'weight', '')::numeric, 0);
  v_item numeric := coalesce(nullif(p_payload->>'item_price', '')::numeric, 0);
  v_cod numeric := coalesce(nullif(p_payload->>'cod', '')::numeric, 0);
  v_deli numeric := 0; v_surcharge numeric := 0; v_allowance numeric := 0; v_extra_rate numeric := 0; v_highway numeric := 0;
begin
  if to_regclass('public.be_tariff_master') is not null then
    begin
      execute 'select coalesce(base_fee,0)::numeric, coalesce(weight_allowance,0)::numeric, coalesce(extra_weight_rate,0)::numeric, coalesce(highway_fee,0)::numeric from public.be_tariff_master where lower(coalesce(township,)) = lower(coalesce($1,)) or lower(coalesce(township,)) = lower(coalesce($2,)) or nullif(trim(coalesce(township,)),) is null order by case when lower(coalesce(township,)) = lower(coalesce($1,)) then 0 when lower(coalesce(township,)) = lower(coalesce($2,)) then 1 else 2 end, updated_at desc nulls last limit 1'
      into v_deli, v_allowance, v_extra_rate, v_highway using v_town, v_destination;
    exception when others then null;
    end;
  end if;
  if v_weight > v_allowance and v_extra_rate > 0 then v_surcharge := greatest(0, ceil(v_weight - v_allowance) * v_extra_rate); end if;
  if coalesce(v_destination, '') ilike '%highway%' then v_surcharge := v_surcharge + coalesce(v_highway, 0); end if;
  return jsonb_build_object('deli_fee', coalesce(v_deli,0), 'surcharge', coalesce(v_surcharge,0), 'weight', coalesce(v_weight,0), 'cod', coalesce(v_cod,0), 'destination', coalesce(v_destination, v_town, ''), 'final_cod', coalesce(v_item,0) + coalesce(v_deli,0) + coalesce(v_surcharge,0));
end;
$$;

create or replace function public.be_supervisor_assignment_snapshot()
returns jsonb language plpgsql security definer as $$
declare v_pickups jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $q$
      select coalesce(jsonb_agg(jsonb_build_object('pickup_id', pickup_id, 'merchant_name', merchant_name, 'pickup_address', pickup_address, 'parcel_count', coalesce(parcel_count,0), 'cod_amount', coalesce(cod_amount,0), 'assigned_branch', coalesce(assigned_branch, branch_code, 'YGN'), 'status', coalesce(status,'pending'), 'created_at', created_at) order by created_at desc nulls last), '[]'::jsonb)
      from public.be_portal_pickup_requests
      where lower(coalesce(status,'')) not in ('cancelled','completed')
      limit 100
    $q$ into v_pickups;
  end if;
  return jsonb_build_object('pickups', coalesce(v_pickups,'[]'::jsonb), 'kpis', jsonb_build_object('pending', jsonb_array_length(coalesce(v_pickups,'[]'::jsonb)), 'active',0, 'exceptions',0, 'fleet_ready', jsonb_array_length(coalesce(public.be_master_data_dropdown_snapshot()->'fleets','[]'::jsonb))));
end;
$$;

create table if not exists public.be_supervisor_job_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  rider_id text, rider_name text, driver_id text, driver_name text, helper_id text, helper_name text,
  fleet_id text, fleet_label text, supervisor_note text,
  assignment_type text default 'both',
  status text default 'assigned',
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index if not exists be_supervisor_job_assignments_pickup_uidx on public.be_supervisor_job_assignments (pickup_id);

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'), '');
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  insert into public.be_supervisor_job_assignments (pickup_id, rider_id, rider_name, driver_id, driver_name, helper_id, helper_name, fleet_id, fleet_label, supervisor_note, assignment_type, status, payload, updated_at)
  values (v_pickup_id, p_payload->>'rider_id', p_payload->>'rider_name', p_payload->>'driver_id', p_payload->>'driver_name', p_payload->>'helper_id', p_payload->>'helper_name', p_payload->>'fleet_id', p_payload->>'fleet_label', p_payload->>'supervisor_note', coalesce(nullif(p_payload->>'assignment_type',''),'both'), 'assigned', p_payload, now())
  on conflict (pickup_id) do update set rider_id=excluded.rider_id, rider_name=excluded.rider_name, driver_id=excluded.driver_id, driver_name=excluded.driver_name, helper_id=excluded.helper_id, helper_name=excluded.helper_name, fleet_id=excluded.fleet_id, fleet_label=excluded.fleet_label, supervisor_note=excluded.supervisor_note, assignment_type=excluded.assignment_type, status='assigned', payload=excluded.payload, updated_at=now();
  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin execute 'update public.be_portal_pickup_requests set status = ''assigned'', updated_at = now() where pickup_id = $1' using v_pickup_id; exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true, 'pickup_id', v_pickup_id, 'status', 'assigned');
end;
$$;

alter table public.be_supervisor_job_assignments enable row level security;
drop policy if exists be_supervisor_job_assignments_select_auth on public.be_supervisor_job_assignments;
drop policy if exists be_supervisor_job_assignments_insert_auth on public.be_supervisor_job_assignments;
drop policy if exists be_supervisor_job_assignments_update_auth on public.be_supervisor_job_assignments;
drop policy if exists be_supervisor_job_assignments_delete_auth on public.be_supervisor_job_assignments;
create policy be_supervisor_job_assignments_select_auth on public.be_supervisor_job_assignments for select to authenticated using (true);
create policy be_supervisor_job_assignments_insert_auth on public.be_supervisor_job_assignments for insert to authenticated with check (true);
create policy be_supervisor_job_assignments_update_auth on public.be_supervisor_job_assignments for update to authenticated using (true) with check (true);
create policy be_supervisor_job_assignments_delete_auth on public.be_supervisor_job_assignments for delete to authenticated using (true);

grant select, insert, update, delete on public.be_supervisor_job_assignments to authenticated;
grant execute on function public.be_operational_master_snapshot() to authenticated;
grant execute on function public.be_waybill_tariff_lookup(jsonb) to authenticated;
grant execute on function public.be_supervisor_assignment_snapshot() to authenticated;
grant execute on function public.be_supervisor_assign_job(jsonb) to authenticated;

notify pgrst, 'reload schema';

select jsonb_array_length(public.be_operational_master_snapshot()->'riders') as riders,
       jsonb_array_length(public.be_operational_master_snapshot()->'drivers') as drivers,
       jsonb_array_length(public.be_operational_master_snapshot()->'helpers') as helpers,
       jsonb_array_length(public.be_operational_master_snapshot()->'fleets') as fleets,
       jsonb_array_length(public.be_operational_master_snapshot()->'townships') as townships,
       jsonb_array_length(public.be_operational_master_snapshot()->'destinations') as destinations;
