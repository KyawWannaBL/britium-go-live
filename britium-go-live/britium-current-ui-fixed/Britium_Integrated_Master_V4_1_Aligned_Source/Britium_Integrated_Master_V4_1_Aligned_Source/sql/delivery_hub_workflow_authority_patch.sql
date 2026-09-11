-- Britium High-Density Delivery Hub + Authority Patch
-- Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.delivery_hub_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_name text not null,
  resource text not null,
  can_create boolean default false,
  can_edit boolean default false,
  can_delete boolean default false,
  can_review boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (role_name, resource)
);

create table if not exists public.delivery_hub_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid(),
  actor_role text,
  action text not null,
  resource text not null,
  reference_id text,
  before_data jsonb,
  after_data jsonb,
  note text,
  created_at timestamptz default now()
);

create table if not exists public.delivery_hub_merchants (
  id uuid primary key default gen_random_uuid(),
  merchant_code text unique,
  merchant_name text,
  phone_primary text,
  pickup_township text,
  pickup_address text,
  payout_method text,
  payout_account_ref text,
  account_holder_name text,
  billing_rules jsonb default '{}'::jsonb,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_hub_riders (
  id uuid primary key default gen_random_uuid(),
  employee_id text unique,
  rider_code text,
  name text,
  phone text,
  role text default 'rider',
  platform text default 'Android',
  status text default 'online',
  zone text,
  vehicle_no text,
  is_rider_enabled boolean default true,
  firebase_uid text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_hub_township_pricing (
  id uuid primary key default gen_random_uuid(),
  destination_name text unique not null,
  zone text default 'Zone A',
  base_fee numeric default 0,
  destination_type text default 'township',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_hub_routes (
  id uuid primary key default gen_random_uuid(),
  route_id text unique,
  assigned_rider_code text,
  assigned_driver_code text,
  assigned_helper_code text,
  vehicle_plate text,
  status text default 'draft',
  item_count integer default 0,
  total_cod numeric default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_hub_route_items (
  id uuid primary key default gen_random_uuid(),
  route_id text,
  way_id text,
  sequence_no integer,
  status text default 'assigned',
  cod_amount numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (route_id, way_id)
);

create table if not exists public.delivery_hub_finance_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_no text unique default ('SET-' || extract(epoch from now())::bigint::text),
  merchant_code text,
  merchant_name text,
  total_cod numeric default 0,
  total_fees numeric default 0,
  total_surcharge numeric default 0,
  net_payout numeric default 0,
  transaction_ref text,
  status text default 'draft',
  confirmed_by uuid default auth.uid(),
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.pickup_requests (
  id uuid primary key default gen_random_uuid(),
  pickup_id text unique,
  pickup_way_id text,
  pickup_request_id text,
  merchant_code text,
  merchant_name text,
  sender_name text,
  sender_phone text,
  pickup_address text,
  pickup_township text,
  township text,
  estimated_parcels integer,
  parcel_count integer default 1,
  vehicle_type text,
  assigned_rider_code text,
  assigned_driver_code text,
  assigned_helper_code text,
  assigned_vehicle_plate text,
  dispatcher_notes text,
  status text default 'created',
  data_entry_status text default 'pending',
  assignment_status text default 'pending',
  cod_amount numeric default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.delivery_waybills (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  pickup_way_id text,
  pickup_request_id text,
  deliver_way_id text unique,
  delivery_way_id text,
  tracking_no text,
  merchant_code text,
  merchant_name text,
  receiver_name text,
  recipient_name text,
  receiver_phone text,
  recipient_phone text,
  township text,
  receiver_township text,
  recipient_town text,
  delivery_address text,
  receiver_address text,
  item_price numeric default 0,
  delivery_fee numeric default 0,
  deli_fee_os numeric default 0,
  surcharge numeric default 0,
  cod_amount numeric default 0,
  final_cod numeric default 0,
  weight_kg numeric default 0,
  status text default 'draft',
  warehouse_status text,
  assignment_status text default 'pending',
  route_id text,
  assigned_rider_code text,
  assigned_driver_code text,
  assigned_helper_code text,
  assigned_vehicle_plate text,
  remarks text,
  delete_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists delivery_waybills_delivery_way_id_idx on public.delivery_waybills (delivery_way_id);
create index if not exists delivery_waybills_deliver_way_id_idx on public.delivery_waybills (deliver_way_id);
create index if not exists delivery_waybills_status_idx on public.delivery_waybills (status);
create index if not exists pickup_requests_assignment_idx on public.pickup_requests (assignment_status, status);

create or replace function public.be_delivery_hub_seed_permissions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resources text[] := array['all_ways','pickup_way','pending_item','deliver_way','successful_way','failed_way','return_way','pickup_tasks','hub_sorting','merchant_profile','rider_fleet','driver_fleet','helper_fleet','township_pricing','route_dispatch','warehouse','shipment_detail','finance','report','printer_settings'];
  r text;
  role text;
begin
  foreach role in array array['SUPER_ADMIN','APP_OWNER','ADMIN','admin','super_admin'] loop
    foreach r in array resources loop
      insert into public.delivery_hub_role_permissions(role_name, resource, can_create, can_edit, can_delete, can_review)
      values(role, r, true, true, true, true)
      on conflict(role_name, resource) do update set can_create=true, can_edit=true, can_delete=true, can_review=true, updated_at=now();
    end loop;
  end loop;

  foreach role in array array['OPERATIONS_ADMIN','OPT_MGR','OPERATION_MANAGER','MANAGER'] loop
    foreach r in array resources loop
      insert into public.delivery_hub_role_permissions(role_name, resource, can_create, can_edit, can_delete, can_review)
      values(role, r, r <> 'finance', r <> 'finance', false, true)
      on conflict(role_name, resource) do update set can_create=excluded.can_create, can_edit=excluded.can_edit, can_delete=false, can_review=true, updated_at=now();
    end loop;
  end loop;

  foreach role in array array['SUPERVISOR'] loop
    foreach r in array resources loop
      insert into public.delivery_hub_role_permissions(role_name, resource, can_create, can_edit, can_delete, can_review)
      values(role, r, r in ('pickup_tasks','route_dispatch','rider_fleet','driver_fleet','helper_fleet'), r in ('pickup_tasks','route_dispatch','rider_fleet','driver_fleet','helper_fleet','pending_item','deliver_way','failed_way','return_way','shipment_detail'), false, true)
      on conflict(role_name, resource) do update set can_create=excluded.can_create, can_edit=excluded.can_edit, can_delete=false, can_review=true, updated_at=now();
    end loop;
  end loop;

  foreach role in array array['WAREHOUSE_MANAGER','HUB_MANAGER','WAREHOUSE_STAFF','warehouse-staff','DATA_ENTRY','data-entry'] loop
    foreach r in array resources loop
      insert into public.delivery_hub_role_permissions(role_name, resource, can_create, can_edit, can_delete, can_review)
      values(role, r, r in ('hub_sorting','warehouse','pickup_way','pending_item'), r in ('hub_sorting','warehouse','pickup_way','pending_item','shipment_detail'), false, r <> 'finance')
      on conflict(role_name, resource) do update set can_create=excluded.can_create, can_edit=excluded.can_edit, can_delete=false, can_review=excluded.can_review, updated_at=now();
    end loop;
  end loop;

  foreach role in array array['RIDER','DRIVER','HELPER'] loop
    foreach r in array resources loop
      insert into public.delivery_hub_role_permissions(role_name, resource, can_create, can_edit, can_delete, can_review)
      values(role, r, false, r in ('pickup_tasks','deliver_way','failed_way','return_way'), false, r in ('pickup_tasks','deliver_way','successful_way','failed_way','return_way','shipment_detail'))
      on conflict(role_name, resource) do update set can_create=false, can_edit=excluded.can_edit, can_delete=false, can_review=excluded.can_review, updated_at=now();
    end loop;
  end loop;

  foreach role in array array['FINANCE_ADMIN','FINANCE_SENIOR','FINANCE_CASHIER','FINANCE_STAFF','finance'] loop
    foreach r in array resources loop
      insert into public.delivery_hub_role_permissions(role_name, resource, can_create, can_edit, can_delete, can_review)
      values(role, r, r='finance', r in ('finance','shipment_detail'), false, r in ('finance','report','shipment_detail','all_ways','successful_way'))
      on conflict(role_name, resource) do update set can_create=excluded.can_create, can_edit=excluded.can_edit, can_delete=false, can_review=excluded.can_review, updated_at=now();
    end loop;
  end loop;
end;
$$;

select public.be_delivery_hub_seed_permissions();

create or replace function public.be_delivery_hub_role_allowed(p_role text, p_resource text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case lower(coalesce(p_action, 'review'))
    when 'create' then coalesce(max(can_create::int), 0) = 1
    when 'edit' then coalesce(max(can_edit::int), 0) = 1
    when 'delete' then coalesce(max(can_delete::int), 0) = 1
    else coalesce(max(can_review::int), 0) = 1
  end
  from public.delivery_hub_role_permissions
  where upper(role_name) = upper(coalesce(p_role, 'GUEST'))
    and resource = p_resource;
$$;

create or replace function public.be_delivery_hub_permissions(p_role text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(resource, jsonb_build_object('create', can_create, 'edit', can_edit, 'delete', can_delete, 'review', can_review)), '{}'::jsonb)
  from public.delivery_hub_role_permissions
  where upper(role_name) = upper(coalesce(p_role, 'GUEST'));
$$;

create or replace function public.be_delivery_hub_snapshot(p_limit integer default 1500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waybills jsonb := '[]'::jsonb;
  v_pickups jsonb := '[]'::jsonb;
  v_merchants jsonb := '[]'::jsonb;
  v_riders jsonb := '[]'::jsonb;
  v_townships jsonb := '[]'::jsonb;
  v_routes jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_waybills from (select * from public.delivery_waybills where coalesce(status, '') <> 'deleted' order by created_at desc limit greatest(coalesce(p_limit, 1500), 1)) x;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_pickups from (select * from public.pickup_requests order by created_at desc limit 500) x;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_merchants from (select * from public.delivery_hub_merchants order by merchant_name nulls last limit 500) x;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_riders from (select * from public.delivery_hub_riders order by name nulls last limit 500) x;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_townships from (select * from public.delivery_hub_township_pricing where is_active = true order by destination_type, destination_name limit 1000) x;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_routes from (select * from public.delivery_hub_routes order by created_at desc limit 200) x;

  select jsonb_build_object(
    'pending_pickups', (select count(*) from public.pickup_requests where coalesce(assignment_status, 'pending') <> 'assigned'),
    'hub_processing', (select count(*) from public.delivery_waybills where coalesce(status, 'draft') in ('draft','pending','hub_processing','warehouse_received')),
    'active_dispatch', (select count(*) from public.delivery_waybills where coalesce(status, 'draft') in ('assigned','dispatched','in-transit','out_for_delivery')),
    'delivered', (select count(*) from public.delivery_waybills where coalesce(status, '') in ('delivered','successful','completed')),
    'failed', (select count(*) from public.delivery_waybills where coalesce(status, '') in ('failed','exception','damaged','lost')),
    'returns', (select count(*) from public.delivery_waybills where coalesce(status, '') in ('return','returned','returned_to_sender','rts')),
    'cod_to_collect', (select coalesce(sum(coalesce(final_cod, cod_amount, 0)), 0) from public.delivery_waybills where coalesce(status, '') not in ('delivered','successful','completed','deleted')),
    'success_rate', case when (select count(*) from public.delivery_waybills where coalesce(status, '') <> 'deleted') = 0 then '0%' else round(100.0 * (select count(*) from public.delivery_waybills where coalesce(status, '') in ('delivered','successful','completed')) / greatest((select count(*) from public.delivery_waybills where coalesce(status, '') <> 'deleted'), 1))::text || '%' end
  ) into v_summary;

  return jsonb_build_object('waybills', v_waybills, 'pickups', v_pickups, 'merchants', v_merchants, 'riders', v_riders, 'drivers', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(v_riders) value where lower(value->>'role') = 'driver'), 'helpers', (select coalesce(jsonb_agg(value), '[]'::jsonb) from jsonb_array_elements(v_riders) value where lower(value->>'role') = 'helper'), 'townships', v_townships, 'routes', v_routes, 'financeRows', v_waybills, 'summary', v_summary);
end;
$$;

create or replace function public.be_delivery_hub_save_merchant(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.delivery_hub_merchants%rowtype;
  v_code text;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'merchant_profile', 'create') and not public.be_delivery_hub_role_allowed(p_actor_role, 'merchant_profile', 'edit') then
    raise exception 'Permission denied for merchant_profile';
  end if;
  v_code := coalesce(nullif(p_payload->>'merchant_code',''), nullif(p_payload->>'code',''), upper(substr(regexp_replace(coalesce(p_payload->>'business_name', p_payload->>'merchant_name', 'MERCHANT'), '[^A-Za-z0-9]', '', 'g'), 1, 10)));
  insert into public.delivery_hub_merchants(merchant_code, merchant_name, phone_primary, pickup_township, pickup_address, payout_method, payout_account_ref, account_holder_name, billing_rules, updated_at)
  values (v_code, coalesce(p_payload->>'business_name', p_payload->>'merchant_name'), coalesce(p_payload->>'phone_primary', p_payload->>'phone'), p_payload->>'pickup_township', p_payload->>'pickup_address', p_payload->>'payout_method', coalesce(p_payload->>'account_ref', p_payload->>'payout_account_ref'), p_payload->>'account_holder_name', coalesce(p_payload->'billing_rules', '{}'::jsonb), now())
  on conflict (merchant_code) do update set merchant_name = excluded.merchant_name, phone_primary = excluded.phone_primary, pickup_township = excluded.pickup_township, pickup_address = excluded.pickup_address, payout_method = excluded.payout_method, payout_account_ref = excluded.payout_account_ref, account_holder_name = excluded.account_holder_name, billing_rules = excluded.billing_rules, updated_at = now()
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'upsert', 'merchant_profile', v_row.merchant_code, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_save_rider(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.delivery_hub_riders%rowtype;
  v_emp text;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'rider_fleet', 'create') and not public.be_delivery_hub_role_allowed(p_actor_role, 'rider_fleet', 'edit') then
    raise exception 'Permission denied for rider_fleet';
  end if;
  v_emp := coalesce(nullif(p_payload->>'employee_id',''), nullif(p_payload->>'rider_code',''), 'RD-' || extract(epoch from now())::bigint::text);
  insert into public.delivery_hub_riders(employee_id, rider_code, name, phone, role, platform, status, zone, vehicle_no, is_rider_enabled, updated_at)
  values(v_emp, v_emp, p_payload->>'name', p_payload->>'phone', coalesce(p_payload->>'role','rider'), coalesce(p_payload->>'platform','Android'), coalesce(p_payload->>'status','online'), p_payload->>'zone', coalesce(p_payload->>'vehicle_no', p_payload->>'vehicle'), coalesce((p_payload->>'is_rider_enabled')::boolean, true), now())
  on conflict(employee_id) do update set rider_code = excluded.rider_code, name = excluded.name, phone = excluded.phone, role = excluded.role, platform = excluded.platform, status = excluded.status, zone = excluded.zone, vehicle_no = excluded.vehicle_no, is_rider_enabled = excluded.is_rider_enabled, updated_at = now()
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'upsert', 'rider_fleet', v_row.employee_id, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_save_township_pricing(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.delivery_hub_township_pricing%rowtype;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'township_pricing', 'create') and not public.be_delivery_hub_role_allowed(p_actor_role, 'township_pricing', 'edit') then raise exception 'Permission denied for township_pricing'; end if;
  insert into public.delivery_hub_township_pricing(destination_name, zone, base_fee, destination_type, updated_at)
  values(coalesce(p_payload->>'destination_name', p_payload->>'name'), coalesce(p_payload->>'zone','Zone A'), coalesce((p_payload->>'base_fee')::numeric, (p_payload->>'fee')::numeric, 0), coalesce(p_payload->>'destination_type', p_payload->>'category', 'township'), now())
  on conflict(destination_name) do update set zone = excluded.zone, base_fee = excluded.base_fee, destination_type = excluded.destination_type, updated_at = now()
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'upsert', 'township_pricing', v_row.destination_name, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_create_pickup_task(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.pickup_requests%rowtype; v_pickup_id text;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'pickup_tasks', 'create') then raise exception 'Permission denied for pickup_tasks'; end if;
  v_pickup_id := coalesce(p_payload->>'pickup_id', 'PU-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  insert into public.pickup_requests(pickup_id, pickup_way_id, pickup_request_id, merchant_code, merchant_name, pickup_address, pickup_township, township, estimated_parcels, parcel_count, vehicle_type, assigned_rider_code, dispatcher_notes, status, assignment_status, updated_at)
  values(v_pickup_id, v_pickup_id, v_pickup_id, p_payload->>'merchant_code', p_payload->>'merchant_name', p_payload->>'pickup_address', p_payload->>'pickup_township', p_payload->>'pickup_township', coalesce((p_payload->>'estimated_parcels')::integer, 1), coalesce((p_payload->>'estimated_parcels')::integer, 1), p_payload->>'vehicle_type', p_payload->>'assigned_rider_code', p_payload->>'notes', 'pickup_assigned', 'assigned', now())
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'create', 'pickup_tasks', v_row.pickup_id, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_save_hub_entry(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.delivery_waybills%rowtype; v_way text;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'hub_sorting', 'create') and not public.be_delivery_hub_role_allowed(p_actor_role, 'hub_sorting', 'edit') then raise exception 'Permission denied for hub_sorting'; end if;
  v_way := coalesce(nullif(p_payload->>'deliver_way_id',''), nullif(p_payload->>'delivery_way_id',''), 'D-' || coalesce(p_payload->>'pickup_id','HUB') || '-' || to_char(now(), 'HH24MISSMS'));
  insert into public.delivery_waybills(pickup_id, pickup_way_id, pickup_request_id, deliver_way_id, delivery_way_id, tracking_no, merchant_code, merchant_name, receiver_name, recipient_name, receiver_phone, recipient_phone, township, receiver_township, recipient_town, delivery_address, receiver_address, item_price, delivery_fee, deli_fee_os, surcharge, cod_amount, final_cod, weight_kg, status, assigned_rider_code, assigned_helper_code, remarks, updated_at)
  values(p_payload->>'pickup_id', p_payload->>'pickup_id', p_payload->>'pickup_id', v_way, v_way, v_way, p_payload->>'merchant_code', p_payload->>'merchant_name', coalesce(p_payload->>'receiver_name', p_payload->>'recipient_name'), coalesce(p_payload->>'receiver_name', p_payload->>'recipient_name'), coalesce(p_payload->>'receiver_phone', p_payload->>'recipient_phone'), coalesce(p_payload->>'receiver_phone', p_payload->>'recipient_phone'), p_payload->>'township', p_payload->>'township', p_payload->>'township', coalesce(p_payload->>'delivery_address', p_payload->>'receiver_address'), coalesce(p_payload->>'delivery_address', p_payload->>'receiver_address'), coalesce((p_payload->>'item_price')::numeric, 0), coalesce((p_payload->>'delivery_fee')::numeric, (p_payload->>'deli_fee_os')::numeric, (p_payload->>'merchant_charge')::numeric, 0), coalesce((p_payload->>'deli_fee_os')::numeric, (p_payload->>'delivery_fee')::numeric, (p_payload->>'merchant_charge')::numeric, 0), coalesce((p_payload->>'surcharge')::numeric, 0), coalesce((p_payload->>'cod_amount')::numeric, (p_payload->>'final_cod')::numeric, 0), coalesce((p_payload->>'final_cod')::numeric, (p_payload->>'cod_amount')::numeric, 0), coalesce((p_payload->>'weight_kg')::numeric, 0), coalesce(p_payload->>'status', 'hub_processing'), coalesce(p_payload->>'assigned_primary', p_payload->>'assigned_rider_code'), coalesce(p_payload->>'assigned_secondary', p_payload->>'assigned_helper_code'), p_payload->>'remarks', now())
  on conflict(deliver_way_id) do update set receiver_name = excluded.receiver_name, recipient_name = excluded.recipient_name, receiver_phone = excluded.receiver_phone, recipient_phone = excluded.recipient_phone, township = excluded.township, receiver_township = excluded.receiver_township, delivery_address = excluded.delivery_address, receiver_address = excluded.receiver_address, item_price = excluded.item_price, delivery_fee = excluded.delivery_fee, deli_fee_os = excluded.deli_fee_os, surcharge = excluded.surcharge, cod_amount = excluded.cod_amount, final_cod = excluded.final_cod, weight_kg = excluded.weight_kg, status = excluded.status, assigned_rider_code = excluded.assigned_rider_code, assigned_helper_code = excluded.assigned_helper_code, remarks = excluded.remarks, updated_at = now()
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'upsert', 'hub_sorting', v_row.deliver_way_id, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_update_waybill(p_way_id text, p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_before jsonb; v_row public.delivery_waybills%rowtype;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'shipment_detail', 'edit') then raise exception 'Permission denied for shipment_detail'; end if;
  select to_jsonb(dw) into v_before from public.delivery_waybills dw where dw.deliver_way_id = p_way_id or dw.delivery_way_id = p_way_id or dw.tracking_no = p_way_id limit 1;
  update public.delivery_waybills set
    receiver_name = coalesce(p_payload->>'receiver_name', receiver_name),
    recipient_name = coalesce(p_payload->>'recipient_name', recipient_name),
    receiver_phone = coalesce(p_payload->>'receiver_phone', receiver_phone),
    recipient_phone = coalesce(p_payload->>'recipient_phone', recipient_phone),
    township = coalesce(p_payload->>'township', township),
    receiver_township = coalesce(p_payload->>'receiver_township', receiver_township),
    delivery_address = coalesce(p_payload->>'delivery_address', delivery_address),
    receiver_address = coalesce(p_payload->>'receiver_address', receiver_address),
    item_price = coalesce((p_payload->>'item_price')::numeric, item_price),
    delivery_fee = coalesce((p_payload->>'delivery_fee')::numeric, delivery_fee),
    deli_fee_os = coalesce((p_payload->>'deli_fee_os')::numeric, deli_fee_os),
    surcharge = coalesce((p_payload->>'surcharge')::numeric, surcharge),
    cod_amount = coalesce((p_payload->>'cod_amount')::numeric, cod_amount),
    final_cod = coalesce((p_payload->>'final_cod')::numeric, final_cod),
    weight_kg = coalesce((p_payload->>'weight_kg')::numeric, weight_kg),
    status = coalesce(p_payload->>'status', status),
    assigned_rider_code = coalesce(p_payload->>'assigned_rider_code', assigned_rider_code),
    assigned_driver_code = coalesce(p_payload->>'assigned_driver_code', assigned_driver_code),
    assigned_helper_code = coalesce(p_payload->>'assigned_helper_code', assigned_helper_code),
    assigned_vehicle_plate = coalesce(p_payload->>'assigned_vehicle_plate', assigned_vehicle_plate),
    remarks = coalesce(p_payload->>'remarks', remarks),
    updated_at = now()
  where deliver_way_id = p_way_id or delivery_way_id = p_way_id or tracking_no = p_way_id
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, before_data, after_data) values(p_actor_role, 'update', 'shipment_detail', p_way_id, v_before, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_delete_waybill(p_way_id text, p_reason text default null, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.delivery_waybills%rowtype;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'shipment_detail', 'delete') then raise exception 'Permission denied for shipment_detail delete'; end if;
  update public.delivery_waybills set status = 'deleted', delete_reason = p_reason, updated_at = now() where deliver_way_id = p_way_id or delivery_way_id = p_way_id or tracking_no = p_way_id returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, note, after_data) values(p_actor_role, 'delete', 'shipment_detail', p_way_id, p_reason, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.be_delivery_hub_dispatch_route(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_route public.delivery_hub_routes%rowtype; v_route_id text; item jsonb; i integer := 0; v_total numeric := 0; v_way text;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'route_dispatch', 'create') then raise exception 'Permission denied for route_dispatch'; end if;
  v_route_id := coalesce(p_payload->>'route_id', 'RT-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  insert into public.delivery_hub_routes(route_id, assigned_rider_code, assigned_driver_code, assigned_helper_code, vehicle_plate, status, metadata)
  values(v_route_id, p_payload->>'assigned_rider_code', p_payload->>'assigned_driver_code', p_payload->>'assigned_helper_code', p_payload->>'vehicle_plate', 'dispatched', p_payload)
  returning * into v_route;
  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb)) loop
    i := i + 1;
    v_way := coalesce(item->>'way_id', item->>'deliver_way_id', item->>'delivery_way_id');
    v_total := v_total + coalesce((item->>'final_cod')::numeric, (item->>'cod_amount')::numeric, 0);
    insert into public.delivery_hub_route_items(route_id, way_id, sequence_no, cod_amount) values(v_route_id, v_way, i, coalesce((item->>'final_cod')::numeric, (item->>'cod_amount')::numeric, 0))
    on conflict(route_id, way_id) do update set sequence_no = excluded.sequence_no, cod_amount = excluded.cod_amount, updated_at = now();
    update public.delivery_waybills set status = 'in-transit', route_id = v_route_id, assigned_rider_code = coalesce(p_payload->>'assigned_rider_code', assigned_rider_code), assigned_driver_code = coalesce(p_payload->>'assigned_driver_code', assigned_driver_code), assigned_helper_code = coalesce(p_payload->>'assigned_helper_code', assigned_helper_code), assigned_vehicle_plate = coalesce(p_payload->>'vehicle_plate', assigned_vehicle_plate), updated_at = now()
    where deliver_way_id = v_way or delivery_way_id = v_way or tracking_no = v_way;
  end loop;
  update public.delivery_hub_routes set item_count = i, total_cod = v_total, updated_at = now() where route_id = v_route_id returning * into v_route;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'dispatch', 'route_dispatch', v_route_id, to_jsonb(v_route));
  return to_jsonb(v_route);
end;
$$;

create or replace function public.be_delivery_hub_confirm_payment(p_payload jsonb, p_actor_role text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.delivery_hub_finance_settlements%rowtype;
begin
  if not public.be_delivery_hub_role_allowed(p_actor_role, 'finance', 'edit') then raise exception 'Permission denied for finance'; end if;
  insert into public.delivery_hub_finance_settlements(merchant_code, merchant_name, total_cod, total_fees, total_surcharge, net_payout, transaction_ref, status, confirmed_at, updated_at)
  values(p_payload->>'merchant_code', p_payload->>'merchant_name', coalesce((p_payload->>'total_cod')::numeric, 0), coalesce((p_payload->>'total_fees')::numeric, 0), coalesce((p_payload->>'total_surcharge')::numeric, 0), coalesce((p_payload->>'net_payout')::numeric, 0), p_payload->>'transaction_ref', 'confirmed', now(), now())
  returning * into v_row;
  insert into public.delivery_hub_audit_logs(actor_role, action, resource, reference_id, after_data) values(p_actor_role, 'confirm_payment', 'finance', v_row.settlement_no, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$$;
