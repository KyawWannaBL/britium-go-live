-- Britium Data Entry V26
-- Fixes Save Parcel / Save, Check & Close when public.parcels.way_id
-- does not have a UNIQUE or EXCLUDE constraint.
--
-- This script replaces the two save RPCs with UPDATE-then-INSERT logic.
-- It does not drop tables, views, or existing parcel records.

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
begin
  if v_way_id is null then
    raise exception 'Way ID is required';
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
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_existing_id is not null then
    update public.parcels
    set
      parcel_sequence = greatest(coalesce(p_sequence, 1), 1),
      status = coalesce(nullif(btrim(p_status), ''), 'registered'),
      os = nullif(btrim(p_os), ''),
      recipient_name = nullif(btrim(p_recipient_name), ''),
      recipient_phone = nullif(btrim(p_recipient_phone), ''),
      township = nullif(v_calc->>'township', ''),
      delivery_address = nullif(btrim(p_delivery_address), ''),
      item_price = coalesce((v_calc->>'item_price')::numeric, 0),
      delivery_charges = coalesce((v_calc->>'delivery_charges')::numeric, 0),
      weight_kg = coalesce((v_calc->>'weight_kg')::numeric, 0),
      extra_weight_charge = coalesce((v_calc->>'extra_weight_charge')::numeric, 0),
      collect_amount = coalesce((v_calc->>'collect_amount')::numeric, 0),
      destination = nullif(v_calc->>'destination', ''),
      remarks = nullif(btrim(p_remarks), ''),
      customer_id = nullif(btrim(p_os), ''),
      merchant_id = nullif(btrim(p_os), ''),
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
      os,
      recipient_name,
      recipient_phone,
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
      nullif(btrim(p_os), ''),
      nullif(btrim(p_recipient_name), ''),
      nullif(btrim(p_recipient_phone), ''),
      nullif(v_calc->>'township', ''),
      nullif(btrim(p_delivery_address), ''),
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
    'save_strategy', case when v_existing_id is null then 'insert' else 'update_by_id' end
  );
end;
$$;

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
begin
  if v_way_id is null then
    raise exception 'way_id is required';
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
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if v_existing_id is not null then
    update public.parcels
    set
      customer_id = nullif(btrim(coalesce(p_customer_id, '')), ''),
      merchant_id = nullif(btrim(coalesce(p_merchant_id, '')), ''),
      status = coalesce(nullif(btrim(p_status), ''), 'registered'),
      recipient_name = nullif(btrim(coalesce(p_recipient_name, '')), ''),
      recipient_phone = nullif(btrim(coalesce(p_recipient_phone, '')), ''),
      township = coalesce(nullif(v_calc->>'township', ''), nullif(btrim(coalesce(p_township, '')), '')),
      delivery_address = nullif(btrim(coalesce(p_delivery_address, '')), ''),
      item_price = greatest(coalesce(p_item_price, 0), 0),
      delivery_charges = v_delivery_charges,
      cod_amount = v_cod_amount,
      weight_kg = greatest(coalesce(p_weight_kg, 0), 0),
      environment = v_environment,
      updated_at = now()
    where id = v_existing_id
    returning * into v_saved;
  else
    insert into public.parcels (
      way_id,
      customer_id,
      merchant_id,
      status,
      recipient_name,
      recipient_phone,
      township,
      delivery_address,
      item_price,
      delivery_charges,
      cod_amount,
      weight_kg,
      created_at,
      updated_at,
      environment
    ) values (
      v_way_id,
      nullif(btrim(coalesce(p_customer_id, '')), ''),
      nullif(btrim(coalesce(p_merchant_id, '')), ''),
      coalesce(nullif(btrim(p_status), ''), 'registered'),
      nullif(btrim(coalesce(p_recipient_name, '')), ''),
      nullif(btrim(coalesce(p_recipient_phone, '')), ''),
      coalesce(nullif(v_calc->>'township', ''), nullif(btrim(coalesce(p_township, '')), '')),
      nullif(btrim(coalesce(p_delivery_address, '')), ''),
      greatest(coalesce(p_item_price, 0), 0),
      v_delivery_charges,
      v_cod_amount,
      greatest(coalesce(p_weight_kg, 0), 0),
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
    'save_strategy', case when v_existing_id is null then 'insert' else 'update_by_id' end,
    'uploaded_id_ignored', p_id,
    'uploaded_delivery_charges_ignored', p_delivery_charges,
    'uploaded_cod_amount_ignored', p_cod_amount,
    'uploaded_updated_at_ignored', p_updated_at
  );
end;
$$;

grant execute on function public.be_save_data_entry_parcel_sheet(text,integer,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text) to authenticated;
grant execute on function public.be_save_data_entry_parcel_sheet(text,integer,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text) to service_role;
grant execute on function public.be_save_data_entry_parcel(text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.be_save_data_entry_parcel(text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,text) to service_role;

notify pgrst, 'reload schema';

select
  to_regprocedure('public.be_save_data_entry_parcel_sheet(text,integer,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,text)')::text as parcel_sheet_save_rpc,
  to_regprocedure('public.be_save_data_entry_parcel(text,text,text,text,text,text,text,text,text,numeric,numeric,numeric,numeric,timestamptz,timestamptz,text,text)')::text as legacy_save_rpc,
  'UPDATE-THEN-INSERT; no ON CONFLICT dependency'::text as save_strategy;
