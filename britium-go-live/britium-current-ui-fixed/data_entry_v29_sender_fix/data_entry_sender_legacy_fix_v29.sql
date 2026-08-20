-- Britium Data Entry V29
-- Purpose:
--   Fix parcel saves that fail because the existing legacy public.parcels table
--   requires sender_name (and related legacy fields) while the 15-column Data
--   Entry sheet stores the sender/merchant in OS.
--
-- Safe behavior:
--   * Keeps the V28 tracking_code trigger.
--   * Adds one schema-tolerant BEFORE trigger for every INSERT/UPDATE path.
--   * Maps sender_name from OS first, then merchant/customer identifiers.
--   * Maps legacy receiver fields from the recipient fields.
--   * Does not drop tables, views, constraints, or existing RPCs.
--
-- Run this entire file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.be_fill_parcel_legacy_required_v29()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j jsonb := to_jsonb(new);
  v_way_id text;
  v_os text;
  v_sender_name text;
  v_recipient_name text;
  v_recipient_phone text;
  v_township text;
  v_delivery_address text;
  v_destination text;
  v_status text;
  v_delivery_charges numeric := 0;
  v_cod_amount numeric := 0;
  v_collect_amount numeric := 0;
  v_patch jsonb;
begin
  v_way_id := nullif(btrim(coalesce(
    j->>'way_id',
    j->>'tracking_code',
    j->>'barcode',
    ''
  )), '');

  v_os := nullif(btrim(coalesce(
    j->>'os',
    j->>'merchant_name',
    j->>'merchant_id',
    j->>'customer_id',
    ''
  )), '');

  v_recipient_name := nullif(btrim(coalesce(
    j->>'recipient_name',
    j->>'receiver_name',
    ''
  )), '');

  v_recipient_phone := nullif(btrim(coalesce(
    j->>'recipient_phone',
    j->>'receiver_phone',
    j->>'contact_no_1',
    ''
  )), '');

  v_township := nullif(btrim(coalesce(j->>'township', '')), '');
  v_delivery_address := nullif(btrim(coalesce(
    j->>'delivery_address',
    j->>'receiver_address',
    j->>'recipient_address',
    ''
  )), '');

  v_destination := nullif(btrim(coalesce(
    j->>'destination',
    v_township,
    'Yangon'
  )), '');

  v_status := coalesce(
    nullif(btrim(j->>'status'), ''),
    nullif(btrim(j->>'parcel_status'), ''),
    nullif(btrim(j->>'current_status'), ''),
    'registered'
  );

  v_sender_name := coalesce(
    nullif(btrim(j->>'sender_name'), ''),
    v_os,
    nullif(btrim(j->>'merchant_id'), ''),
    nullif(btrim(j->>'customer_id'), ''),
    'Unknown Sender'
  );

  begin
    v_delivery_charges := greatest(coalesce(nullif(j->>'delivery_charges', '')::numeric, nullif(j->>'delivery_fee', '')::numeric, 0), 0);
  exception when others then
    v_delivery_charges := 0;
  end;

  begin
    v_cod_amount := greatest(coalesce(nullif(j->>'cod_amount', '')::numeric, nullif(j->>'item_price', '')::numeric, 0), 0);
  exception when others then
    v_cod_amount := 0;
  end;

  begin
    v_collect_amount := greatest(coalesce(
      nullif(j->>'collect_amount', '')::numeric,
      nullif(j->>'amount_to_collect', '')::numeric,
      nullif(j->>'total_amount', '')::numeric,
      v_cod_amount + v_delivery_charges,
      0
    ), 0);
  exception when others then
    v_collect_amount := v_cod_amount + v_delivery_charges;
  end;

  -- jsonb_populate_record ignores keys that are not columns in the live table.
  -- This makes the trigger safe across the parcel-table variants used by the
  -- current and legacy screens.
  v_patch := jsonb_build_object(
    'way_id', coalesce(v_way_id, nullif(btrim(j->>'way_id'), '')),
    'tracking_code', coalesce(nullif(btrim(j->>'tracking_code'), ''), v_way_id, gen_random_uuid()::text),
    'barcode', coalesce(nullif(btrim(j->>'barcode'), ''), v_way_id),

    'os', coalesce(nullif(btrim(j->>'os'), ''), v_os),
    'sender_name', v_sender_name,
    'sender_phone', coalesce(nullif(btrim(j->>'sender_phone'), ''), ''),
    'sender_address', coalesce(nullif(btrim(j->>'sender_address'), ''), ''),

    'recipient_name', v_recipient_name,
    'recipient_phone', v_recipient_phone,
    'delivery_address', v_delivery_address,
    'receiver_name', coalesce(nullif(btrim(j->>'receiver_name'), ''), v_recipient_name, ''),
    'receiver_phone', coalesce(nullif(btrim(j->>'receiver_phone'), ''), v_recipient_phone, ''),
    'receiver_address', coalesce(nullif(btrim(j->>'receiver_address'), ''), v_delivery_address, ''),

    'status', v_status,
    'parcel_status', coalesce(nullif(btrim(j->>'parcel_status'), ''), v_status),
    'current_status', coalesce(nullif(btrim(j->>'current_status'), ''), v_status),

    'origin', coalesce(nullif(btrim(j->>'origin'), ''), 'Yangon'),
    'destination', coalesce(v_destination, 'Yangon'),
    'parcel_type', coalesce(nullif(btrim(j->>'parcel_type'), ''), 'Parcel'),
    'service_type', coalesce(nullif(btrim(j->>'service_type'), ''), 'Standard'),
    'payment_type', coalesce(nullif(btrim(j->>'payment_type'), ''), 'COD'),

    'delivery_fee', v_delivery_charges,
    'delivery_charges', v_delivery_charges,
    'cod_amount', v_cod_amount,
    'collect_amount', v_collect_amount,
    'amount_to_collect', v_collect_amount,
    'total_amount', v_collect_amount,

    'environment', coalesce(nullif(btrim(j->>'environment'), ''), 'production'),
    'created_at', coalesce(nullif(j->>'created_at', ''), now()::text),
    'updated_at', now()::text
  );

  new := jsonb_populate_record(new, v_patch);
  return new;
end;
$$;

comment on function public.be_fill_parcel_legacy_required_v29() is
  'Schema-tolerant Data Entry compatibility trigger. Maps OS to sender_name and fills legacy parcel fields before save.';

do $$
begin
  if to_regclass('public.parcels') is null then
    raise exception 'public.parcels does not exist';
  end if;

  execute 'drop trigger if exists be_parcels_fill_legacy_required_v29 on public.parcels';
  execute $trigger$
    create trigger be_parcels_fill_legacy_required_v29
    before insert or update on public.parcels
    for each row
    execute function public.be_fill_parcel_legacy_required_v29()
  $trigger$;
end;
$$;

grant execute on function public.be_fill_parcel_legacy_required_v29() to authenticated;
grant execute on function public.be_fill_parcel_legacy_required_v29() to service_role;

-- Refresh existing blank sender names where the column is present. The harmless
-- self-update invokes the new BEFORE trigger and preserves all other values.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'parcels'
      and column_name = 'sender_name'
  ) then
    execute $update$
      update public.parcels
      set updated_at = coalesce(updated_at, now())
      where nullif(btrim(coalesce(sender_name::text, '')), '') is null
    $update$;
  end if;
end;
$$;

-- Verification result.
select
  to_regprocedure('public.be_fill_parcel_legacy_required_v29()')::text as legacy_fill_function,
  (
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.parcels'::regclass
      and t.tgname = 'be_parcels_fill_legacy_required_v29'
      and not t.tgisinternal
    limit 1
  ) as legacy_fill_trigger,
  (
    select c.is_nullable
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'parcels'
      and c.column_name = 'sender_name'
  ) as sender_name_nullable,
  'sender_name is auto-filled from OS/merchant/customer before every parcel save'::text as save_strategy;

-- Useful diagnostics: this lists all mandatory columns in the live parcels table.
select
  ordinal_position,
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'parcels'
  and is_nullable = 'NO'
order by ordinal_position;
