-- Britium Enterprise Workflow Wire-Up Fix
-- CS -> Supervisor -> Rider App -> Data Entry -> COD -> Finance
-- Paste this whole file into Supabase SQL Editor and run.

create extension if not exists pgcrypto;

drop function if exists public.be_mobile_go_live_snapshot(text, text, integer);

create or replace function public.be_operational_master_snapshot()
returns jsonb language plpgsql security definer as $$
declare v jsonb := '{}'::jsonb;
begin
  begin select public.be_master_data_dropdown_snapshot() into v; exception when others then v := '{}'::jsonb; end;
  return jsonb_build_object(
    'dropdowns', coalesce(v->'dropdowns','{}'::jsonb),
    'merchants', coalesce(v->'merchants','[]'::jsonb),
    'riders', coalesce(v->'riders','[]'::jsonb),
    'drivers', coalesce(v->'drivers','[]'::jsonb),
    'helpers', coalesce(v->'helpers','[]'::jsonb),
    'employees', coalesce(v->'employees','[]'::jsonb),
    'fleets', coalesce(v->'fleets','[]'::jsonb),
    'townships', coalesce(v->'townships', coalesce(v->'zones','[]'::jsonb)),
    'destinations', coalesce(v->'destinations', coalesce(v->'branches','[]'::jsonb))
  );
end $$;

create table if not exists public.be_enterprise_workflow_events (
  event_id uuid primary key default gen_random_uuid(),
  pickup_id text,
  waybill_id text,
  tracking_no text,
  event_type text not null,
  event_status text,
  actor_id text,
  actor_name text,
  actor_role text,
  source_module text,
  target_module text,
  amount numeric default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.be_supervisor_job_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  job_id text default ('JOB-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  pickup_id text not null,
  job_type text not null default 'order_picking',
  assignment_type text default 'order_picking',
  status text default 'order_picking_assigned',
  rider_id text,
  rider_name text,
  driver_id text,
  driver_name text,
  helper_id text,
  helper_name text,
  fleet_id text,
  fleet_label text,
  supervisor_note text,
  assigned_by text,
  assigned_by_name text,
  assigned_at timestamptz default now(),
  acknowledged_at timestamptz,
  started_at timestamptz,
  picked_up_at timestamptz,
  data_entry_registered_at timestamptz,
  delivery_started_at timestamptz,
  delivery_completed_at timestamptz,
  cod_handover_at timestamptz,
  finance_settled_at timestamptz,
  cod_amount numeric default 0,
  delivery_fee numeric default 0,
  final_cod numeric default 0,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.be_supervisor_job_assignments
  add column if not exists assignment_id uuid default gen_random_uuid(),
  add column if not exists job_id text,
  add column if not exists pickup_id text,
  add column if not exists job_type text default 'order_picking',
  add column if not exists assignment_type text default 'order_picking',
  add column if not exists status text default 'order_picking_assigned',
  add column if not exists rider_id text,
  add column if not exists rider_name text,
  add column if not exists driver_id text,
  add column if not exists driver_name text,
  add column if not exists helper_id text,
  add column if not exists helper_name text,
  add column if not exists fleet_id text,
  add column if not exists fleet_label text,
  add column if not exists supervisor_note text,
  add column if not exists assigned_by text,
  add column if not exists assigned_by_name text,
  add column if not exists assigned_at timestamptz default now(),
  add column if not exists acknowledged_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists data_entry_registered_at timestamptz,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivery_completed_at timestamptz,
  add column if not exists cod_handover_at timestamptz,
  add column if not exists finance_settled_at timestamptz,
  add column if not exists cod_amount numeric default 0,
  add column if not exists delivery_fee numeric default 0,
  add column if not exists final_cod numeric default 0,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.be_supervisor_job_assignments set
  assignment_id=coalesce(assignment_id,gen_random_uuid()),
  job_id=coalesce(nullif(job_id,''),'JOB-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  job_type=coalesce(nullif(job_type,''),nullif(assignment_type,''),'order_picking'),
  assignment_type=coalesce(nullif(assignment_type,''),nullif(job_type,''),'order_picking'),
  status=coalesce(nullif(status,''),'order_picking_assigned'),
  assigned_at=coalesce(assigned_at,created_at,now()),
  cod_amount=coalesce(cod_amount,0), delivery_fee=coalesce(delivery_fee,0), final_cod=coalesce(final_cod,cod_amount,0),
  payload=coalesce(payload,'{}'::jsonb), created_at=coalesce(created_at,now()), updated_at=coalesce(updated_at,now());

alter table public.be_supervisor_job_assignments
  alter column job_id set default ('JOB-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  alter column job_type set default 'order_picking',
  alter column job_type set not null,
  alter column status set default 'order_picking_assigned';

with ranked as (
  select ctid, row_number() over (partition by pickup_id order by updated_at desc nulls last, created_at desc nulls last) rn
  from public.be_supervisor_job_assignments where pickup_id is not null
)
delete from public.be_supervisor_job_assignments t using ranked r where t.ctid=r.ctid and r.rn>1;

drop index if exists public.be_supervisor_job_assignments_pickup_uidx;
create unique index be_supervisor_job_assignments_pickup_uidx on public.be_supervisor_job_assignments(pickup_id);
create index if not exists be_supervisor_job_assignments_people_idx on public.be_supervisor_job_assignments(rider_id,driver_id,helper_id,fleet_id,status,updated_at desc);

create table if not exists public.be_cod_ledger (
  cod_id uuid primary key default gen_random_uuid(),
  pickup_id text unique,
  rider_id text,
  rider_name text,
  merchant_name text,
  cod_amount numeric default 0,
  collected_amount numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  cod_status text default 'pending_collection',
  collected_at timestamptz,
  handed_over_at timestamptz,
  received_by text,
  received_by_name text,
  settlement_id text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_financial_settlements (
  settlement_id text primary key default ('SET-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  pickup_id text unique,
  cod_id uuid,
  merchant_name text,
  rider_id text,
  rider_name text,
  gross_cod numeric default 0,
  delivery_fee numeric default 0,
  handover_amount numeric default 0,
  variance_amount numeric default 0,
  settlement_status text default 'pending_finance',
  finance_note text,
  closed_by text,
  closed_by_name text,
  closed_at timestamptz,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.be_supervisor_assignment_snapshot()
returns jsonb language plpgsql security definer as $$
declare v_pickups jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $q$
      select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc),'[]'::jsonb)
      from (
        select pr.pickup_id, pr.merchant_name, pr.pickup_address,
          coalesce(pr.parcel_count,0) parcel_count, coalesce(pr.cod_amount,0) cod_amount,
          coalesce(pr.assigned_branch,pr.branch_code,'YGN') assigned_branch,
          coalesce(a.status,pr.status,'pending') status,
          a.rider_id,a.rider_name,a.driver_id,a.driver_name,a.helper_id,a.helper_name,a.fleet_id,a.fleet_label,
          pr.created_at
        from public.be_portal_pickup_requests pr
        left join public.be_supervisor_job_assignments a on a.pickup_id=pr.pickup_id
        where lower(coalesce(pr.status,'')) not in ('cancelled','completed','delivery_completed','finance_settled')
        order by pr.created_at desc nulls last limit 200
      ) x
    $q$ into v_pickups;
  else
    select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc),'[]'::jsonb) into v_pickups
    from (select pickup_id, payload->>'merchant_name' merchant_name, payload->>'pickup_address' pickup_address,
      0 parcel_count, cod_amount, 'YGN' assigned_branch, status, rider_id,rider_name,driver_id,driver_name,helper_id,helper_name,fleet_id,fleet_label,created_at
      from public.be_supervisor_job_assignments order by created_at desc limit 200) x;
  end if;
  return jsonb_build_object('pickups',v_pickups,'kpis',jsonb_build_object('pending',jsonb_array_length(v_pickups),'fleet_ready',jsonb_array_length(public.be_operational_master_snapshot()->'fleets')));
end $$;

create or replace function public.be_supervisor_assign_job(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  v_pickup_id text := nullif(trim(p_payload->>'pickup_id'),'');
  v_type text := coalesce(nullif(trim(p_payload->>'assignment_type'),''),'order_picking');
  v_status text;
  v_job_id text := 'JOB-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8));
  v_cod numeric := coalesce(nullif(p_payload->>'cod_amount','')::numeric,0);
  v_merchant text := nullif(p_payload->>'merchant_name','');
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_type='order_picking' and nullif(trim(coalesce(p_payload->>'rider_id','')),'') is null then raise exception 'rider_id is required for order picking assignment'; end if;
  if v_type='delivery' and (nullif(trim(coalesce(p_payload->>'driver_id','')),'') is null or nullif(trim(coalesce(p_payload->>'helper_id','')),'') is null or nullif(trim(coalesce(p_payload->>'fleet_id','')),'') is null) then raise exception 'driver_id, helper_id and fleet_id are required for delivery assignment'; end if;
  if v_type='both' and (nullif(trim(coalesce(p_payload->>'rider_id','')),'') is null or nullif(trim(coalesce(p_payload->>'driver_id','')),'') is null or nullif(trim(coalesce(p_payload->>'helper_id','')),'') is null or nullif(trim(coalesce(p_payload->>'fleet_id','')),'') is null) then raise exception 'rider_id, driver_id, helper_id and fleet_id are required for full assignment'; end if;

  v_status := case when v_type='order_picking' then 'order_picking_assigned' when v_type='delivery' then 'delivery_resources_assigned' else 'assigned' end;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin execute 'select coalesce(cod_amount,0), merchant_name from public.be_portal_pickup_requests where pickup_id=$1 limit 1' into v_cod, v_merchant using v_pickup_id; exception when others then null; end;
  end if;

  insert into public.be_supervisor_job_assignments(job_id,pickup_id,job_type,assignment_type,status,rider_id,rider_name,driver_id,driver_name,helper_id,helper_name,fleet_id,fleet_label,supervisor_note,assigned_by,assigned_by_name,assigned_at,cod_amount,final_cod,payload,updated_at)
  values(v_job_id,v_pickup_id,v_type,v_type,v_status,nullif(p_payload->>'rider_id',''),nullif(p_payload->>'rider_name',''),nullif(p_payload->>'driver_id',''),nullif(p_payload->>'driver_name',''),nullif(p_payload->>'helper_id',''),nullif(p_payload->>'helper_name',''),nullif(p_payload->>'fleet_id',''),nullif(p_payload->>'fleet_label',''),nullif(p_payload->>'supervisor_note',''),nullif(p_payload->>'assigned_by',''),nullif(p_payload->>'assigned_by_name',''),now(),v_cod,v_cod,p_payload||jsonb_build_object('merchant_name',v_merchant),now())
  on conflict(pickup_id) do update set
    job_type=excluded.job_type, assignment_type=excluded.assignment_type, status=excluded.status,
    rider_id=coalesce(excluded.rider_id,public.be_supervisor_job_assignments.rider_id), rider_name=coalesce(excluded.rider_name,public.be_supervisor_job_assignments.rider_name),
    driver_id=coalesce(excluded.driver_id,public.be_supervisor_job_assignments.driver_id), driver_name=coalesce(excluded.driver_name,public.be_supervisor_job_assignments.driver_name),
    helper_id=coalesce(excluded.helper_id,public.be_supervisor_job_assignments.helper_id), helper_name=coalesce(excluded.helper_name,public.be_supervisor_job_assignments.helper_name),
    fleet_id=coalesce(excluded.fleet_id,public.be_supervisor_job_assignments.fleet_id), fleet_label=coalesce(excluded.fleet_label,public.be_supervisor_job_assignments.fleet_label),
    supervisor_note=coalesce(excluded.supervisor_note,public.be_supervisor_job_assignments.supervisor_note), assigned_at=now(), cod_amount=coalesce(excluded.cod_amount,public.be_supervisor_job_assignments.cod_amount), final_cod=coalesce(excluded.final_cod,public.be_supervisor_job_assignments.final_cod), payload=public.be_supervisor_job_assignments.payload||excluded.payload, updated_at=now();

  if to_regclass('public.be_portal_pickup_requests') is not null then
    begin execute 'update public.be_portal_pickup_requests set status=$2, updated_at=now() where pickup_id=$1' using v_pickup_id, v_status; exception when others then null; end;
  end if;

  insert into public.be_cod_ledger(pickup_id,rider_id,rider_name,merchant_name,cod_amount,cod_status,payload,updated_at)
  values(v_pickup_id,nullif(p_payload->>'rider_id',''),nullif(p_payload->>'rider_name',''),v_merchant,v_cod,case when v_cod>0 then 'pending_collection' else 'not_required' end,p_payload,now())
  on conflict(pickup_id) do update set rider_id=coalesce(excluded.rider_id,public.be_cod_ledger.rider_id), rider_name=coalesce(excluded.rider_name,public.be_cod_ledger.rider_name), merchant_name=coalesce(excluded.merchant_name,public.be_cod_ledger.merchant_name), cod_amount=coalesce(excluded.cod_amount,public.be_cod_ledger.cod_amount), payload=public.be_cod_ledger.payload||excluded.payload, updated_at=now();

  insert into public.be_enterprise_workflow_events(pickup_id,event_type,event_status,actor_name,actor_role,source_module,target_module,amount,payload)
  values(v_pickup_id,'SUPERVISOR_ASSIGNMENT',v_status,nullif(p_payload->>'assigned_by_name',''),'supervisor','supervisor',case when v_type='order_picking' then 'rider_app' else 'dispatch' end,v_cod,p_payload);

  return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'job_id',v_job_id,'assignment_type',v_type,'status',v_status,'synced_to_rider',true,'synced_to_cod',true);
end $$;

create or replace function public.be_mobile_go_live_snapshot(p_workforce_code text default null, p_phone text default null, p_limit integer default 100)
returns jsonb language plpgsql security definer as $$
declare
  v_code text := upper(nullif(trim(coalesce(p_workforce_code,'')),''));
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
  v_codes text[] := array[]::text[];
  v_assigned jsonb := '[]'::jsonb;
  v_delivery jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
  v_limit int := least(greatest(coalesce(p_limit,100),1),500);
begin
  if v_code is not null then v_codes := array_append(v_codes,v_code); end if;
  if to_regclass('public.be_master_data_records') is not null then
    begin
      select coalesce(array_agg(distinct upper(record_key)),v_codes) into v_codes
      from (
        select unnest(v_codes) record_key
        union all
        select record_key from public.be_master_data_records
        where entity_code in ('riders','drivers','helpers','employees') and coalesce(is_active,true)=true
        and (upper(record_key)=any(v_codes) or (v_code is not null and lower(coalesce(row_data->>'email',row_data->>'email_address',row_data->>'login_email',''))=lower(v_code)) or (v_phone<>'' and regexp_replace(coalesce(row_data->>'phone_primary',row_data->>'phone',row_data->>'mobile',''),'[^0-9+]','','g')=v_phone))
      ) s where record_key is not null;
    exception when others then null; end;
  end if;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc),'[]'::jsonb) into v_assigned
  from (
    select a.assignment_id::text,a.job_id,a.pickup_id,coalesce(p.merchant_name,a.payload->>'merchant_name','Merchant') merchant_name,coalesce(p.pickup_address,a.payload->>'pickup_address','No pickup address') pickup_address,coalesce(p.parcel_count,0) parcel_count,coalesce(p.cod_amount,a.cod_amount,0) cod_amount,coalesce(p.assigned_branch,p.branch_code,a.payload->>'assigned_branch','YGN') assigned_branch,a.rider_id,a.rider_name,a.driver_id,a.driver_name,a.helper_id,a.helper_name,a.fleet_id,a.fleet_label,a.supervisor_note,a.assignment_type,a.job_type,a.status,a.updated_at
    from public.be_supervisor_job_assignments a left join public.be_portal_pickup_requests p on p.pickup_id=a.pickup_id
    where a.status not in ('cancelled','delivery_completed','finance_settled') and (coalesce(array_length(v_codes,1),0)=0 or upper(coalesce(a.rider_id,''))=any(v_codes) or upper(coalesce(a.driver_id,''))=any(v_codes) or upper(coalesce(a.helper_id,''))=any(v_codes))
    order by a.updated_at desc limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc),'[]'::jsonb) into v_delivery
  from (
    select a.assignment_id::text,a.job_id,a.pickup_id,coalesce(p.merchant_name,a.payload->>'merchant_name','Merchant') merchant_name,coalesce(p.pickup_address,a.payload->>'pickup_address','No pickup address') pickup_address,coalesce(p.parcel_count,0) parcel_count,coalesce(p.cod_amount,a.cod_amount,0) cod_amount,a.rider_id,a.rider_name,a.driver_id,a.driver_name,a.helper_id,a.helper_name,a.fleet_id,a.fleet_label,a.status,a.updated_at
    from public.be_supervisor_job_assignments a left join public.be_portal_pickup_requests p on p.pickup_id=a.pickup_id
    where a.status in ('delivery_resources_assigned','assigned','delivery_started','data_entry_registered') and (coalesce(array_length(v_codes,1),0)=0 or upper(coalesce(a.rider_id,''))=any(v_codes) or upper(coalesce(a.driver_id,''))=any(v_codes) or upper(coalesce(a.helper_id,''))=any(v_codes))
    order by a.updated_at desc limit v_limit
  ) x;

  select coalesce(jsonb_agg(row_to_json(n)::jsonb order by n.created_at desc),'[]'::jsonb) into v_notifications
  from (
    select a.assignment_id::text id,a.pickup_id,case when a.status='order_picking_assigned' then 'New Order Picking Assignment' when a.status='delivery_resources_assigned' then 'New Delivery Assignment' when a.status='data_entry_registered' then 'Data Entry Registered' else 'Workflow Update' end title,'Pickup '||a.pickup_id||' is '||replace(a.status,'_',' ')||'.' message,a.status,a.updated_at created_at,true unread
    from public.be_supervisor_job_assignments a
    where a.status not in ('cancelled','delivery_completed','finance_settled') and (coalesce(array_length(v_codes,1),0)=0 or upper(coalesce(a.rider_id,''))=any(v_codes) or upper(coalesce(a.driver_id,''))=any(v_codes) or upper(coalesce(a.helper_id,''))=any(v_codes))
    order by a.updated_at desc limit v_limit
  ) n;

  return jsonb_build_object('assigned_pickups',v_assigned,'delivery_jobs',v_delivery,'notifications',v_notifications,'kpis',jsonb_build_object('assigned_pickups',jsonb_array_length(v_assigned),'delivery_jobs',jsonb_array_length(v_delivery),'cod_to_handle',(select coalesce(sum(cod_amount),0) from public.be_cod_ledger where cod_status in ('pending_collection','collected'))),'identity',jsonb_build_object('requested_workforce_code',p_workforce_code,'phone',p_phone,'resolved_codes',to_jsonb(v_codes)),'sync_source','be_supervisor_job_assignments','synced_at',now());
end $$;

create or replace function public.be_rider_update_job_status(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'),''); v_action text := lower(nullif(trim(p_payload->>'action'),'')); v_status text; v_cod numeric := coalesce(nullif(p_payload->>'cod_amount','')::numeric,nullif(p_payload->>'collected_amount','')::numeric,0);
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  if v_action is null then raise exception 'action is required'; end if;
  v_status := case v_action when 'acknowledge' then 'order_picking_acknowledged' when 'start_order_picking' then 'order_picking_started' when 'verify_pickup' then 'picked_up_verified' when 'photos_uploaded' then 'parcel_photos_uploaded' when 'send_to_data_entry' then 'data_entry_pending' when 'complete_order_picking' then 'data_entry_pending' when 'start_delivery' then 'delivery_started' when 'collect_cod' then 'cod_collected' when 'complete_delivery' then 'delivery_completed' else v_action end;
  update public.be_supervisor_job_assignments set status=v_status, acknowledged_at=case when v_status like 'order_picking%' or v_status in ('picked_up_verified','parcel_photos_uploaded','data_entry_pending') then coalesce(acknowledged_at,now()) else acknowledged_at end, started_at=case when v_status='order_picking_started' then coalesce(started_at,now()) else started_at end, picked_up_at=case when v_status in ('picked_up_verified','parcel_photos_uploaded','data_entry_pending') then coalesce(picked_up_at,now()) else picked_up_at end, delivery_started_at=case when v_status='delivery_started' then coalesce(delivery_started_at,now()) else delivery_started_at end, delivery_completed_at=case when v_status='delivery_completed' then coalesce(delivery_completed_at,now()) else delivery_completed_at end, payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id;
  if not found then raise exception 'No assignment found for pickup_id %', v_pickup_id; end if;
  if v_status='cod_collected' then update public.be_cod_ledger set collected_amount=case when v_cod>0 then v_cod else cod_amount end, variance_amount=(case when v_cod>0 then v_cod else cod_amount end)-cod_amount, cod_status='collected', collected_at=now(), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id; end if;
  insert into public.be_enterprise_workflow_events(pickup_id,event_type,event_status,actor_id,actor_name,actor_role,source_module,target_module,amount,payload) values(v_pickup_id,'RIDER_JOB_STATUS',v_status,nullif(p_payload->>'rider_id',''),nullif(p_payload->>'rider_name',''),'rider','rider_app',case when v_status='data_entry_pending' then 'data_entry' when v_status='cod_collected' then 'cod' else 'supervisor' end,v_cod,p_payload);
  return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'status',v_status);
end $$;

create or replace function public.be_data_entry_work_queue_snapshot(p_status text default null, p_limit integer default 200)
returns jsonb language sql security definer as $$
  select jsonb_build_object('rows',coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc),'[]'::jsonb),'synced_at',now())
  from (select a.*, coalesce(p.merchant_name,a.payload->>'merchant_name','Merchant') merchant_name, coalesce(p.pickup_address,a.payload->>'pickup_address','No pickup address') pickup_address from public.be_supervisor_job_assignments a left join public.be_portal_pickup_requests p on p.pickup_id=a.pickup_id where a.status in ('picked_up_verified','parcel_photos_uploaded','data_entry_pending','data_entry_registered') and (p_status is null or a.status=p_status) order by a.updated_at desc limit least(greatest(coalesce(p_limit,200),1),500)) x;
$$;

create or replace function public.be_data_entry_confirm_registration(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'),'');
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  update public.be_supervisor_job_assignments set status='data_entry_registered', data_entry_registered_at=now(), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id;
  if not found then raise exception 'No assignment found for pickup_id %', v_pickup_id; end if;
  insert into public.be_enterprise_workflow_events(pickup_id,event_type,event_status,actor_name,actor_role,source_module,target_module,payload) values(v_pickup_id,'DATA_ENTRY_REGISTRATION','data_entry_registered',nullif(p_payload->>'data_entry_name',''),'data_entry','data_entry','supervisor',p_payload);
  return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'status','data_entry_registered');
end $$;

create or replace function public.be_cod_mark_handover(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'),''); v_amount numeric := coalesce(nullif(p_payload->>'handover_amount','')::numeric,nullif(p_payload->>'amount','')::numeric,0); v_cod_id uuid; v_settlement_id text := 'SET-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(4),'hex'),1,8));
begin
  if v_pickup_id is null then raise exception 'pickup_id is required'; end if;
  update public.be_cod_ledger set handover_amount=case when v_amount>0 then v_amount else collected_amount end, variance_amount=(case when v_amount>0 then v_amount else collected_amount end)-cod_amount, cod_status='handed_over_to_finance', handed_over_at=now(), received_by=nullif(p_payload->>'received_by',''), received_by_name=nullif(p_payload->>'received_by_name',''), settlement_id=coalesce(settlement_id,v_settlement_id), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where pickup_id=v_pickup_id returning cod_id, settlement_id into v_cod_id, v_settlement_id;
  if v_cod_id is null then raise exception 'No COD ledger found for pickup_id %', v_pickup_id; end if;
  insert into public.be_financial_settlements(settlement_id,pickup_id,cod_id,gross_cod,handover_amount,variance_amount,settlement_status,payload,updated_at) select v_settlement_id,pickup_id,cod_id,cod_amount,handover_amount,variance_amount,'pending_finance',p_payload,now() from public.be_cod_ledger where cod_id=v_cod_id on conflict(pickup_id) do update set gross_cod=excluded.gross_cod,handover_amount=excluded.handover_amount,variance_amount=excluded.variance_amount,settlement_status='pending_finance',payload=public.be_financial_settlements.payload||excluded.payload,updated_at=now();
  update public.be_supervisor_job_assignments set status='cod_handover_pending', cod_handover_at=now(), updated_at=now() where pickup_id=v_pickup_id;
  return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'settlement_id',v_settlement_id,'status','pending_finance');
end $$;

create or replace function public.be_finance_close_settlement(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_pickup_id text := nullif(trim(p_payload->>'pickup_id'),''); v_settlement_id text := nullif(trim(p_payload->>'settlement_id'),'');
begin
  if v_pickup_id is null and v_settlement_id is null then raise exception 'pickup_id or settlement_id is required'; end if;
  update public.be_financial_settlements set settlement_status='finance_settled', finance_note=nullif(p_payload->>'finance_note',''), closed_by=nullif(p_payload->>'closed_by',''), closed_by_name=nullif(p_payload->>'closed_by_name',''), closed_at=now(), payload=coalesce(payload,'{}'::jsonb)||p_payload, updated_at=now() where (v_pickup_id is not null and pickup_id=v_pickup_id) or (v_settlement_id is not null and settlement_id=v_settlement_id) returning pickup_id into v_pickup_id;
  if v_pickup_id is null then raise exception 'Settlement not found'; end if;
  update public.be_supervisor_job_assignments set status='finance_settled', finance_settled_at=now(), updated_at=now() where pickup_id=v_pickup_id;
  update public.be_cod_ledger set cod_status='finance_settled', updated_at=now() where pickup_id=v_pickup_id;
  return jsonb_build_object('ok',true,'pickup_id',v_pickup_id,'status','finance_settled');
end $$;

create or replace function public.be_enterprise_workflow_snapshot()
returns jsonb language sql security definer as $$
  select jsonb_build_object('supervisor_open',(select count(*) from public.be_supervisor_job_assignments where status not in ('delivery_completed','finance_settled','cancelled')),'data_entry_pending',(select count(*) from public.be_supervisor_job_assignments where status in ('picked_up_verified','parcel_photos_uploaded','data_entry_pending')),'cod_pending',(select count(*) from public.be_cod_ledger where cod_status in ('pending_collection','collected','handed_over_to_finance')),'finance_pending',(select count(*) from public.be_financial_settlements where settlement_status='pending_finance'),'synced_at',now());
$$;

alter table public.be_enterprise_workflow_events enable row level security;
alter table public.be_supervisor_job_assignments enable row level security;
alter table public.be_cod_ledger enable row level security;
alter table public.be_financial_settlements enable row level security;

drop policy if exists be_enterprise_workflow_events_all_auth on public.be_enterprise_workflow_events;
drop policy if exists be_supervisor_job_assignments_all_auth on public.be_supervisor_job_assignments;
drop policy if exists be_cod_ledger_all_auth on public.be_cod_ledger;
drop policy if exists be_financial_settlements_all_auth on public.be_financial_settlements;
create policy be_enterprise_workflow_events_all_auth on public.be_enterprise_workflow_events for all to authenticated using(true) with check(true);
create policy be_supervisor_job_assignments_all_auth on public.be_supervisor_job_assignments for all to authenticated using(true) with check(true);
create policy be_cod_ledger_all_auth on public.be_cod_ledger for all to authenticated using(true) with check(true);
create policy be_financial_settlements_all_auth on public.be_financial_settlements for all to authenticated using(true) with check(true);

grant select,insert,update,delete on public.be_enterprise_workflow_events to authenticated;
grant select,insert,update,delete on public.be_supervisor_job_assignments to authenticated;
grant select,insert,update,delete on public.be_cod_ledger to authenticated;
grant select,insert,update,delete on public.be_financial_settlements to authenticated;

grant execute on function public.be_operational_master_snapshot() to authenticated;
grant execute on function public.be_supervisor_assignment_snapshot() to authenticated;
grant execute on function public.be_supervisor_assign_job(jsonb) to authenticated;
grant execute on function public.be_mobile_go_live_snapshot(text,text,integer) to anon, authenticated;
grant execute on function public.be_rider_update_job_status(jsonb) to authenticated;
grant execute on function public.be_data_entry_work_queue_snapshot(text,integer) to authenticated;
grant execute on function public.be_data_entry_confirm_registration(jsonb) to authenticated;
grant execute on function public.be_cod_mark_handover(jsonb) to authenticated;
grant execute on function public.be_finance_close_settlement(jsonb) to authenticated;
grant execute on function public.be_enterprise_workflow_snapshot() to authenticated;

notify pgrst, 'reload schema';

-- QUICK TESTS
-- select jsonb_array_length(public.be_operational_master_snapshot()->'riders') riders, jsonb_array_length(public.be_operational_master_snapshot()->'drivers') drivers, jsonb_array_length(public.be_operational_master_snapshot()->'helpers') helpers, jsonb_array_length(public.be_operational_master_snapshot()->'fleets') fleets;
-- select public.be_supervisor_assign_job('{"pickup_id":"P0521-SMH-001","assignment_type":"order_picking","rider_id":"RID001","rider_name":"Ko Kyaw Zin Khant","supervisor_note":"Assigned"}'::jsonb);
-- select public.be_mobile_go_live_snapshot('RID001', null, 100);
-- select public.be_enterprise_workflow_snapshot();
