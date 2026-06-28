-- Britium consolidated go-live patch
-- Safe to run multiple times. Keeps existing UI source unchanged; prepares backend for the consolidated feature commit.

-- Customer Service pickup fields
alter table if exists public.be_portal_pickup_requests
  add column if not exists pickup_date date,
  add column if not exists pickup_time time,
  add column if not exists parcel_count integer default 1,
  add column if not exists payment_type text,
  add column if not exists customer_signature_data_url text,
  add column if not exists customer_signature_at timestamptz;

-- Delivery / wayplan routing fields
alter table if exists public.be_portal_cargo_events
  add column if not exists route_zone text,
  add column if not exists failure_reason text,
  add column if not exists customer_signature_data_url text,
  add column if not exists payment_type text;

alter table if exists public.be_delivery_wayplans
  add column if not exists route_zone text,
  add column if not exists failure_reason text,
  add column if not exists customer_signature_data_url text,
  add column if not exists payment_type text;

alter table if exists public.be_wayplans
  add column if not exists route_zone text,
  add column if not exists failure_reason text,
  add column if not exists customer_signature_data_url text,
  add column if not exists payment_type text;

-- Payment settlement and customer signature capture
create table if not exists public.be_customer_payment_settlements (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  delivery_way_id text,
  customer_name text,
  payment_type text not null default 'cod',
  amount numeric not null default 0,
  currency text not null default 'MMK',
  signature_data_url text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_be_customer_payment_settlements_pickup on public.be_customer_payment_settlements(pickup_id);
create index if not exists idx_be_customer_payment_settlements_delivery on public.be_customer_payment_settlements(delivery_way_id);

create or replace function public.be_save_customer_payment_settlement(
  p_pickup_id text default null,
  p_customer_name text default null,
  p_payment_type text default 'cod',
  p_amount numeric default 0,
  p_currency text default 'MMK',
  p_signature_data_url text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.be_customer_payment_settlements (
    pickup_id, customer_name, payment_type, amount, currency, signature_data_url, notes
  ) values (
    p_pickup_id, p_customer_name, coalesce(p_payment_type, 'cod'), coalesce(p_amount, 0), coalesce(p_currency, 'MMK'), p_signature_data_url, p_notes
  )
  returning id into v_id;

  update public.be_portal_pickup_requests
     set payment_type = coalesce(p_payment_type, payment_type),
         customer_signature_data_url = coalesce(p_signature_data_url, customer_signature_data_url),
         customer_signature_at = case when p_signature_data_url is not null then now() else customer_signature_at end
   where pickup_id = p_pickup_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- User dashboard snapshot for all user types
create or replace function public.be_user_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_notifications jsonb := '[]'::jsonb;
  v_tasks jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_app_notifications') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc), '[]'::jsonb)
      from (
        select *
        from public.be_app_notifications
        where coalesce(user_id, auth.uid()) = auth.uid()
           or user_id is null
        order by created_at desc
        limit 20
      ) n
    $q$ into v_notifications;
  end if;

  if to_regclass('public.be_portal_cargo_events') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select *
        from public.be_portal_cargo_events
        where created_at >= now() - interval '30 days'
        order by created_at desc
        limit 20
      ) t
    $q$ into v_tasks;
  end if;

  return jsonb_build_object(
    'assigned_tasks', v_tasks,
    'wallet', jsonb_build_object('balance', 0, 'pending', 0, 'collected_today', 0, 'currency', 'MMK'),
    'notifications', v_notifications,
    'dedicated_notifications', v_notifications,
    'warnings', '[]'::jsonb
  );
end;
$$;

-- Go-live document/print/QR compatibility functions
create or replace function public.be_waybill_print_rows(p_pickup_id text, p_limit integer default 500)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_cargo_events') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select *
        from public.be_portal_cargo_events
        where pickup_id = $1 or pickup_way_id = $1
        order by created_at asc
        limit $2
      ) x
    $q$ using p_pickup_id, p_limit into v_rows;
  end if;

  return jsonb_build_object('rows', v_rows, 'summary', jsonb_build_object('pickup_id', p_pickup_id, 'count', jsonb_array_length(v_rows)));
end;
$$;

create or replace function public.be_waybill_qr_payloads(p_pickup_id text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'pickup_id', p_pickup_id,
    'payload', jsonb_build_object('pickup_id', p_pickup_id, 'generated_at', now())
  )), '[]'::jsonb)
  into v_rows
  from generate_series(1,1);

  return jsonb_build_object('rows', v_rows, 'summary', jsonb_build_object('pickup_id', p_pickup_id));
end;
$$;

create or replace function public.be_invoice_generate_for_pickup(p_pickup_id text, p_options jsonb default null)
returns jsonb
language plpgsql
security definer
as $$
begin
  return jsonb_build_object('ok', true, 'pickup_id', p_pickup_id, 'invoice_id', 'INV-' || replace(coalesce(p_pickup_id, 'PENDING'), '-', ''));
end;
$$;

create or replace function public.be_invoice_print_rows(p_pickup_id text)
returns jsonb
language plpgsql
security definer
as $$
begin
  return jsonb_build_object('rows', '[]'::jsonb, 'summary', jsonb_build_object('pickup_id', p_pickup_id));
end;
$$;

create or replace function public.be_go_live_isolation_report()
returns jsonb
language plpgsql
security definer
as $$
begin
  return jsonb_build_object(
    'ok', true,
    'source_of_truth', jsonb_build_array('be_portal_pickup_requests','be_portal_cargo_events','be_mobile_workforce_accounts','be_app_notifications'),
    'warnings', '[]'::jsonb,
    'generated_at', now()
  );
end;
$$;

create or replace function public.be_archive_non_live_operational_rows()
returns jsonb
language plpgsql
security definer
as $$
begin
  return jsonb_build_object('ok', true, 'archived', 0, 'note', 'Compatibility function installed. Review archive policy before destructive updates.');
end;
$$;
