-- Britium Data Entry V31
-- Explicitly maps the 15-column Data Entry fields to the live legacy public.parcels
-- NOT NULL columns. This patch no longer relies on jsonb_populate_record alone.
-- Run this entire file once in a new Supabase SQL Editor tab.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) One deterministic BEFORE trigger for every write path.
-- -----------------------------------------------------------------------------
create or replace function public.be_fill_parcel_required_v31()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tracking_code := coalesce(
    nullif(btrim(new.tracking_code), ''),
    nullif(btrim(new.way_id), ''),
    gen_random_uuid()::text
  );

  new.sender_name := coalesce(
    nullif(btrim(new.sender_name), ''),
    nullif(btrim(new.os), ''),
    nullif(btrim(new.merchant_id), ''),
    nullif(btrim(new.customer_id), ''),
    'Unknown Sender'
  );

  new.recipient_address := coalesce(
    nullif(btrim(new.recipient_address), ''),
    nullif(btrim(new.delivery_address), '')
  );

  new.delivery_address := coalesce(
    nullif(btrim(new.delivery_address), ''),
    nullif(btrim(new.recipient_address), '')
  );

  if nullif(btrim(new.recipient_name), '') is null then
    raise exception 'recipient_name is required for Way ID %', coalesce(new.way_id, new.tracking_code, '(unknown)');
  end if;

  if nullif(btrim(new.recipient_phone), '') is null then
    raise exception 'recipient_phone is required for Way ID %', coalesce(new.way_id, new.tracking_code, '(unknown)');
  end if;

  if nullif(btrim(new.recipient_address), '') is null then
    raise exception 'recipient_address is required for Way ID %', coalesce(new.way_id, new.tracking_code, '(unknown)');
  end if;

  new.extra_weight_charge := coalesce(new.extra_weight_charge, 0);
  new.collect_amount := coalesce(
    new.collect_amount,
    coalesce(new.item_price, 0) + coalesce(new.delivery_charges, 0)
  );

  return new;
end;
$$;

comment on function public.be_fill_parcel_required_v31() is
  'Directly fills tracking_code, sender_name, and recipient_address for every public.parcels write.';

do $$
begin
  if to_regclass('public.parcels') is null then
    raise exception 'public.parcels does not exist';
  end if;

  execute 'drop trigger if exists be_parcels_fill_tracking_code_v28 on public.parcels';
  execute 'drop trigger if exists be_parcels_fill_legacy_required_v29 on public.parcels';
  execute 'drop trigger if exists be_parcels_fill_required_v30 on public.parcels';
  execute 'drop trigger if exists be_parcels_fill_required_v31 on public.parcels';

  execute $trigger$
    create trigger be_parcels_fill_required_v31
    before insert or update on public.parcels
    for each row
    execute function public.be_fill_parcel_required_v31()
  $trigger$;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2) Parcel-sheet save RPC: explicitly writes all live NOT NULL legacy fields.
-- -----------------------------------------------------------------------------
create or replace function public.be_save_data_entry_parcel_sheet(
  p_pickup_id text,
  p_sequence integer,
  p_status text,
  p_way_id text,
  p_os text,
  p_recipient_name text,
  p_recipient_phone text,
  p_township text,
  p_delivery_address text,
  p_item_price numeric,
  p_delivery_charges numeric,
  p_weight_kg numeric,
  p_extra_weight_charge numeric,
  p_collect_amount numeric,
  p_destination text,
  p_remarks text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc jsonb;
  v_saved public.parcels%rowtype;
  v_existing_id public.parcels.id%type;
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_sender_name text := coalesce(nullif(btrim(coalesce(p_os, '')), ''), 'Unknown Sender');
  v_recipient_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
begin
  if v_way_id is null then
    raise exception 'Way ID is required';
  end if;
  if nullif(btrim(coalesce(p_recipient_name, '')), '') is null then
    raise exception 'Recipient name is required for Way ID %', v_way_id;
  end if;
  if nullif(btrim(coalesce(p_recipient_phone, '')), '') is null then
    raise exception 'Recipient phone is required for Way ID %', v_way_id;
  end if;
  if v_recipient_address is null then
    raise exception 'Recipient address is required for Way ID %', v_way_id;
  end if;

  v_calc := public.be_calculate_parcel_sheet_amounts(
    p_township,
    p_destination,
    p_os,
    coalesce(p_weight_kg, 0),
    coalesce(p_item_price, 0)
  );

  select p.id
  into v_existing_id
  from public.parcels p
  where btrim(coalesce(p.way_id, '')) = v_way_id
     or btrim(coalesce(p.tracking_code, '')) = v_way_id
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_existing_id is not null then
    update public.parcels
    set
      parcel_sequence = greatest(coalesce(p_sequence, 1), 1),
      status = coalesce(nullif(btrim(p_status), ''), 'registered'),
      way_id = v_way_id,
      tracking_code = v_way_id,
      os = nullif(btrim(p_os), ''),
      sender_name = v_sender_name,
      recipient_name = nullif(btrim(p_recipient_name), ''),
      recipient_phone = nullif(btrim(p_recipient_phone), ''),
      recipient_address = v_recipient_address,
      township = nullif(v_calc->>'township', ''),
      delivery_address = v_recipient_address,
      item_price = coalesce((v_calc->>'item_price')::numeric, 0),
      delivery_charges = coalesce((v_calc->>'delivery_charges')::numeric, 0),
      weight_kg = coalesce((v_calc->>'weight_kg')::numeric, 0),
      extra_weight_charge = coalesce((v_calc->>'extra_weight_charge')::numeric, 0),
      collect_amount = coalesce((v_calc->>'collect_amount')::numeric, 0),
      destination = nullif(v_calc->>'destination', ''),
      remarks = nullif(btrim(p_remarks), ''),
      customer_id = coalesce(nullif(btrim(p_os), ''), customer_id),
      merchant_id = coalesce(nullif(btrim(p_os), ''), merchant_id),
      cod_amount = coalesce((v_calc->>'cod_amount')::numeric, 0),
      environment = 'production',
      updated_at = now()
    where id = v_existing_id
    returning * into v_saved;
  else
    insert into public.parcels (
      parcel_sequence,
      status,
      way_id,
      tracking_code,
      os,
      sender_name,
      recipient_name,
      recipient_phone,
      recipient_address,
      township,
      delivery_address,
      item_price,
      delivery_charges,
      weight_kg,
      extra_weight_charge,
      collect_amount,
      destination,
      remarks,
      customer_id,
      merchant_id,
      cod_amount,
      environment,
      created_at,
      updated_at
    ) values (
      greatest(coalesce(p_sequence, 1), 1),
      coalesce(nullif(btrim(p_status), ''), 'registered'),
      v_way_id,
      v_way_id,
      nullif(btrim(p_os), ''),
      v_sender_name,
      nullif(btrim(p_recipient_name), ''),
      nullif(btrim(p_recipient_phone), ''),
      v_recipient_address,
      nullif(v_calc->>'township', ''),
      v_recipient_address,
      coalesce((v_calc->>'item_price')::numeric, 0),
      coalesce((v_calc->>'delivery_charges')::numeric, 0),
      coalesce((v_calc->>'weight_kg')::numeric, 0),
      coalesce((v_calc->>'extra_weight_charge')::numeric, 0),
      coalesce((v_calc->>'collect_amount')::numeric, 0),
      nullif(v_calc->>'destination', ''),
      nullif(btrim(p_remarks), ''),
      nullif(btrim(p_os), ''),
      nullif(btrim(p_os), ''),
      coalesce((v_calc->>'cod_amount')::numeric, 0),
      'production',
      now(),
      now()
    )
    returning * into v_saved;
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'pickup_id', nullif(btrim(coalesce(p_pickup_id, '')), ''),
    'actor_email', nullif(btrim(coalesce(p_actor_email, '')), ''),
    'parcel', to_jsonb(v_saved),
    'calculation', v_calc,
    'save_strategy', case when v_existing_id is null then 'insert_explicit_required_fields' else 'update_explicit_required_fields' end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Legacy save RPC: same explicit required-field mapping.
-- -----------------------------------------------------------------------------
create or replace function public.be_save_data_entry_parcel(
  p_id text,
  p_way_id text,
  p_customer_id text,
  p_merchant_id text,
  p_status text,
  p_recipient_name text,
  p_recipient_phone text,
  p_township text,
  p_delivery_address text,
  p_item_price numeric,
  p_delivery_charges numeric,
  p_cod_amount numeric,
  p_weight_kg numeric,
  p_created_at timestamptz,
  p_updated_at timestamptz,
  p_environment text,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calc jsonb;
  v_saved public.parcels%rowtype;
  v_existing_id public.parcels.id%type;
  v_delivery_charges numeric;
  v_cod_amount numeric;
  v_environment text;
  v_way_id text := nullif(btrim(coalesce(p_way_id, '')), '');
  v_sender_name text := coalesce(
    nullif(btrim(coalesce(p_merchant_id, '')), ''),
    nullif(btrim(coalesce(p_customer_id, '')), ''),
    'Unknown Sender'
  );
  v_recipient_address text := nullif(btrim(coalesce(p_delivery_address, '')), '');
begin
  if v_way_id is null then
    raise exception 'way_id is required';
  end if;
  if nullif(btrim(coalesce(p_recipient_name, '')), '') is null then
    raise exception 'recipient_name is required for Way ID %', v_way_id;
  end if;
  if nullif(btrim(coalesce(p_recipient_phone, '')), '') is null then
    raise exception 'recipient_phone is required for Way ID %', v_way_id;
  end if;
  if v_recipient_address is null then
    raise exception 'recipient_address is required for Way ID %', v_way_id;
  end if;

  v_calc := public.be_calculate_parcel_amounts(
    p_township,
    p_customer_id,
    coalesce(p_weight_kg, 0),
    coalesce(p_item_price, 0),
    coalesce(nullif(p_environment, ''), 'production')
  );

  v_delivery_charges := coalesce((v_calc->>'delivery_charges')::numeric, 0);
  v_cod_amount := coalesce((v_calc->>'cod_amount')::numeric, coalesce(p_item_price, 0));
  v_environment := coalesce(nullif(v_calc->>'environment', ''), nullif(p_environment, ''), 'production');

  select p.id
  into v_existing_id
  from public.parcels p
  where btrim(coalesce(p.way_id, '')) = v_way_id
     or btrim(coalesce(p.tracking_code, '')) = v_way_id
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_existing_id is not null then
    update public.parcels
    set
      way_id = v_way_id,
      tracking_code = v_way_id,
      customer_id = nullif(btrim(coalesce(p_customer_id, '')), ''),
      merchant_id = nullif(btrim(coalesce(p_merchant_id, '')), ''),
      os = coalesce(nullif(btrim(coalesce(p_merchant_id, '')), ''), nullif(btrim(coalesce(p_customer_id, '')), ''), os),
      sender_name = v_sender_name,
      status = coalesce(nullif(btrim(p_status), ''), 'registered'),
      recipient_name = nullif(btrim(coalesce(p_recipient_name, '')), ''),
      recipient_phone = nullif(btrim(coalesce(p_recipient_phone, '')), ''),
      recipient_address = v_recipient_address,
      township = coalesce(nullif(v_calc->>'township', ''), nullif(btrim(coalesce(p_township, '')), '')),
      delivery_address = v_recipient_address,
      item_price = greatest(coalesce(p_item_price, 0), 0),
      delivery_charges = v_delivery_charges,
      cod_amount = v_cod_amount,
      weight_kg = greatest(coalesce(p_weight_kg, 0), 0),
      collect_amount = greatest(coalesce(p_item_price, 0), 0) + v_delivery_charges,
      environment = v_environment,
      updated_at = now()
    where id = v_existing_id
    returning * into v_saved;
  else
    insert into public.parcels (
      way_id,
      tracking_code,
      customer_id,
      merchant_id,
      os,
      sender_name,
      status,
      recipient_name,
      recipient_phone,
      recipient_address,
      township,
      delivery_address,
      item_price,
      delivery_charges,
      cod_amount,
      weight_kg,
      extra_weight_charge,
      collect_amount,
      created_at,
      updated_at,
      environment
    ) values (
      v_way_id,
      v_way_id,
      nullif(btrim(coalesce(p_customer_id, '')), ''),
      nullif(btrim(coalesce(p_merchant_id, '')), ''),
      coalesce(nullif(btrim(coalesce(p_merchant_id, '')), ''), nullif(btrim(coalesce(p_customer_id, '')), '')),
      v_sender_name,
      coalesce(nullif(btrim(p_status), ''), 'registered'),
      nullif(btrim(coalesce(p_recipient_name, '')), ''),
      nullif(btrim(coalesce(p_recipient_phone, '')), ''),
      v_recipient_address,
      coalesce(nullif(v_calc->>'township', ''), nullif(btrim(coalesce(p_township, '')), '')),
      v_recipient_address,
      greatest(coalesce(p_item_price, 0), 0),
      v_delivery_charges,
      v_cod_amount,
      greatest(coalesce(p_weight_kg, 0), 0),
      0,
      greatest(coalesce(p_item_price, 0), 0) + v_delivery_charges,
      coalesce(p_created_at, now()),
      now(),
      v_environment
    )
    returning * into v_saved;
  end if;

  return jsonb_build_object(
    'ok', true,
    'parcel', to_jsonb(v_saved),
    'calculation', v_calc,
    'actor_email', p_actor_email,
    'save_strategy', case when v_existing_id is null then 'insert_explicit_required_fields' else 'update_explicit_required_fields' end,
    'uploaded_id_ignored', p_id,
    'uploaded_delivery_charges_ignored', p_delivery_charges,
    'uploaded_cod_amount_ignored', p_cod_amount,
    'uploaded_updated_at_ignored', p_updated_at
  );
end;
$$;

grant execute on function public.be_fill_parcel_required_v31() to authenticated, service_role;
grant execute on function public.be_save_data_entry_parcel_sheet(text,integer,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text) to authenticated, service_role;
grant execute on function public.be_save_data_entry_parcel(text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';

-- Verification result.
select
  to_regprocedure('public.be_fill_parcel_required_v31()')::text as required_fill_function,
  (
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.parcels'::regclass
      and t.tgname = 'be_parcels_fill_required_v31'
      and not t.tgisinternal
    limit 1
  ) as required_fill_trigger,
  to_regprocedure('public.be_save_data_entry_parcel_sheet(text,integer,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text)')::text as parcel_sheet_save_rpc,
  to_regprocedure('public.be_save_data_entry_parcel(text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,text)')::text as legacy_save_rpc,
  'recipient_address is written explicitly by trigger, both RPCs, and V31 frontend fallback'::text as save_strategy;
