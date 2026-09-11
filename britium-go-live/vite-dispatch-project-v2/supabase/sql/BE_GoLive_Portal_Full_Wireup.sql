-- BE_GoLive_Portal_Full_Wireup.sql
create extension if not exists pgcrypto;

create table if not exists public.be_parcel_status_timeline (
  id uuid primary key default gen_random_uuid(),
  assignment_key text, pickup_id text, pickup_way_id text, delivery_way_id text,
  status_code text, status_label text, actor_id text, actor_name text, actor_role text,
  source_module text default 'enterprise_portal', branch_code text default 'YGN',
  notes text, metadata jsonb default '{}'::jsonb, created_at timestamptz default now()
);

create table if not exists public.be_warehouse_parcel_status (
  id uuid primary key default gen_random_uuid(),
  assignment_key text unique, pickup_id text, pickup_way_id text, delivery_way_id text,
  parcel_status text default 'assigned_to_rider', warehouse_status text default 'not_received',
  branch_code text default 'YGN', location_note text, updated_by text, updated_by_name text,
  payload jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.be_cod_ledger (
  id uuid primary key default gen_random_uuid(),
  assignment_key text, pickup_id text, pickup_way_id text, delivery_way_id text,
  rider_id text, rider_name text, branch_code text default 'YGN',
  cod_amount numeric default 0, collected_amount numeric default 0, handover_amount numeric default 0,
  variance_amount numeric default 0, cod_status text default 'pending_collection',
  collected_at timestamptz, handed_over_at timestamptz, finance_received_at timestamptz,
  payload jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.be_financial_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_no text, assignment_key text unique, pickup_id text, pickup_way_id text, delivery_way_id text,
  rider_id text, rider_name text, merchant_code text, merchant_name text, branch_code text default 'YGN',
  cod_amount numeric default 0, collected_amount numeric default 0, delivery_fee numeric default 0,
  deductions numeric default 0, net_payable numeric default 0,
  settlement_status text default 'cod_pending', finance_status text default 'pending_finance',
  payload jsonb default '{}'::jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.be_template_upload_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text unique default ('BATCH-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,8))),
  template_type text, file_name text, row_count integer default 0, valid_count integer default 0, error_count integer default 0,
  status text default 'uploaded', uploaded_by text, payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.be_wayplan_routes (
  id uuid primary key default gen_random_uuid(),
  wayplan_id text unique, branch_code text default 'YGN', zone_code text,
  rider_id text, driver_id text, helper_id text, fleet_id text, status text default 'draft',
  stops jsonb default '[]'::jsonb, payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create or replace function public.be_master_data_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'ok', true,
    'branches', jsonb_build_array(jsonb_build_object('code','YGN','name','Yangon')),
    'townships', jsonb_build_array('East Dagon','South Dagon','Tamwe','North Okkalapa'),
    'statuses', jsonb_build_array('not_received','inbound_to_warehouse','received_at_warehouse','sorting','bagged','ready_for_dispatch','out_for_delivery','delivered','return_pending','exception_hold')
  );
$$;

create or replace function public.be_data_entry_template_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'ok', true,
    'columns', jsonb_build_array(
      jsonb_build_object('name','pickup_way_id','color','yellow','type','system'),
      jsonb_build_object('name','delivery_way_id','color','yellow','type','system'),
      jsonb_build_object('name','merchant','color','green','type','dropdown'),
      jsonb_build_object('name','recipient_township','color','green','type','dropdown'),
      jsonb_build_object('name','recipient_name','color','blue','type','manual'),
      jsonb_build_object('name','recipient_phone','color','blue','type','manual'),
      jsonb_build_object('name','recipient_address','color','blue','type','manual'),
      jsonb_build_object('name','cod_amount','color','blue','type','manual'),
      jsonb_build_object('name','weight_kg','color','blue','type','manual')
    )
  );
$$;

create or replace function public.be_gl_bulk_register_delivery_rows(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_batch public.be_template_upload_batches; v_count int := coalesce(jsonb_array_length(coalesce(p_payload->'rows','[]'::jsonb)),0);
begin
  insert into public.be_template_upload_batches(template_type,file_name,row_count,valid_count,error_count,status,uploaded_by,payload)
  values(coalesce(p_payload->>'template_type','data_entry_register'),p_payload->>'file_name',v_count,v_count,0,'validated',p_payload->>'uploaded_by',p_payload)
  returning * into v_batch;
  insert into public.be_parcel_status_timeline(status_code,status_label,source_module,notes,metadata)
  values('bulk_registered','Bulk registered','data_entry','Bulk Excel/webform registration',row_to_json(v_batch)::jsonb);
  return jsonb_build_object('ok',true,'batch',row_to_json(v_batch)::jsonb);
end;
$$;

create or replace function public.be_warehouse_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$
  select jsonb_build_object('ok',true,'warehouse_rows',coalesce((select jsonb_agg(row_to_json(x)::jsonb order by updated_at desc) from public.be_warehouse_parcel_status x),'[]'::jsonb));
$$;

create or replace function public.be_wayplan_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$
  select jsonb_build_object('ok',true,'routes',coalesce((select jsonb_agg(row_to_json(x)::jsonb order by updated_at desc) from public.be_wayplan_routes x),'[]'::jsonb));
$$;

create or replace function public.be_wayplan_generate(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare v_route public.be_wayplan_routes;
begin
  insert into public.be_wayplan_routes(wayplan_id,branch_code,zone_code,rider_id,driver_id,helper_id,fleet_id,stops,payload)
  values('WP-'||coalesce(p_payload->>'branch_code','YGN')||'-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(encode(gen_random_bytes(3),'hex'),1,6)),
         coalesce(p_payload->>'branch_code','YGN'),p_payload->>'zone_code',p_payload->>'rider_id',p_payload->>'driver_id',p_payload->>'helper_id',p_payload->>'fleet_id',coalesce(p_payload->'stops','[]'::jsonb),p_payload)
  returning * into v_route;
  return jsonb_build_object('ok',true,'route',row_to_json(v_route)::jsonb);
end;
$$;

create or replace function public.be_wayplan_save(p_payload jsonb)
returns jsonb language sql security definer as $$ select public.be_wayplan_generate(p_payload); $$;

create or replace function public.be_wayplan_dispatch(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
begin
  update public.be_wayplan_routes set status='dispatched', payload=payload||p_payload, updated_at=now()
  where wayplan_id=p_payload->>'wayplan_id';
  return jsonb_build_object('ok',true,'wayplan_id',p_payload->>'wayplan_id','status','dispatched');
end;
$$;

create or replace function public.be_waybill_print_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$ select jsonb_build_object('ok',true,'items','[]'::jsonb); $$;

create or replace function public.be_invoice_print_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$ select jsonb_build_object('ok',true,'settlements',coalesce((select jsonb_agg(row_to_json(x)::jsonb) from public.be_financial_settlements x),'[]'::jsonb)); $$;

create or replace function public.be_customer_tracking_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$
  select jsonb_build_object('ok',true,'timeline',coalesce((select jsonb_agg(row_to_json(x)::jsonb order by created_at desc) from public.be_parcel_status_timeline x where x.pickup_way_id=p_payload->>'pickup_way_id' or x.delivery_way_id=p_payload->>'delivery_way_id'),'[]'::jsonb));
$$;

create or replace function public.be_merchant_portal_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$ select jsonb_build_object('ok',true,'settlements',coalesce((select jsonb_agg(row_to_json(x)::jsonb) from public.be_financial_settlements x),'[]'::jsonb)); $$;

create or replace function public.be_finance_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security definer as $$
  select jsonb_build_object('ok',true,'cod_ledger',coalesce((select jsonb_agg(row_to_json(x)::jsonb order by updated_at desc) from public.be_cod_ledger x),'[]'::jsonb),'settlements',coalesce((select jsonb_agg(row_to_json(x)::jsonb order by updated_at desc) from public.be_financial_settlements x),'[]'::jsonb));
$$;

grant execute on all functions in schema public to anon, authenticated;
notify pgrst, 'reload schema';
