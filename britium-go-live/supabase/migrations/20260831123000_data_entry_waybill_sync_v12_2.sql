begin;
create schema if not exists private;
create or replace function private.be_waybill_sync_allowed_v12_2()
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.be_user_account_registry u
    where u.auth_user_id = auth.uid()
      and lower(coalesce(u.status, '')) = 'active'
      and lower(coalesce(u.role, '')) in (
        'data_entry', 'superadmin', 'admin', 'operation_manager',
        'operations', 'supervisor', 'warehouse', 'dispatch'
      )
  );
$function$;
revoke all on function private.be_waybill_sync_allowed_v12_2() from public, anon, authenticated;
grant execute on function private.be_waybill_sync_allowed_v12_2() to postgres;
create or replace function public.be_data_entry_waybill_sync_v12_2(
  p_pickup_id text,
  p_merchant_code text default null,
  p_merchant_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_pickup text := nullif(btrim(p_pickup_id), '');
  v_source_count integer := 0;
  v_printable_count integer := 0;
  v_missing_ids integer := 0;
begin
  if not private.be_waybill_sync_allowed_v12_2() then
    raise exception 'Data Entry waybill synchronization permission is required.' using errcode = '42501';
  end if;
  if v_pickup is null then
    raise exception 'Pickup ID is required.' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where nullif(btrim(delivery_way_id), '') is null)
    into v_source_count, v_missing_ids
  from public.be_data_entry_parcel_details
  where pickup_id = v_pickup;

  if v_source_count = 0 then
    raise exception 'No registered parcel details exist for pickup %.', v_pickup using errcode = 'P0002';
  end if;
  if v_missing_ids > 0 then
    raise exception '% registered parcel(s) have no Delivery Way ID.', v_missing_ids using errcode = '23502';
  end if;

  insert into public.be_v32_parcels (
    waybill_no, pickup_id, merchant_code, merchant_name,
    recipient_name, recipient_phone, recipient_phone_2,
    township, recipient_address, customer_tier,
    item_price, weight_kg, surcharge, delivery_fee,
    cod_amount, actual_collect, branch_code, route_zone,
    status, created_by, updated_by, created_at, updated_at
  )
  select
    d.delivery_way_id, d.pickup_id,
    coalesce(nullif(btrim(p_merchant_code), ''), nullif(btrim(d.merchant_id), '')),
    nullif(btrim(p_merchant_name), ''),
    d.recipient_name, d.contact_no_1, d.contact_no_2,
    nullif(btrim(d.township), ''), d.recipient_address,
    upper(coalesce(nullif(btrim(d.customer_tier), ''), 'STANDARD')),
    coalesce(d.item_price, 0), greatest(coalesce(d.weight_kg, 0), 0),
    coalesce(d.surcharge, 0), coalesce(d.delivery_fee, 0),
    coalesce(d.cod_amount, d.actual_collect, 0), coalesce(d.actual_collect, d.cod_amount, 0),
    'YGN',
    nullif(btrim(d.township_key), ''),
    'REGISTERED', coalesce(nullif(btrim(d.saved_by_email), ''), auth.jwt()->>'email'),
    auth.jwt()->>'email', coalesce(d.created_at, now()), now()
  from public.be_data_entry_parcel_details d
  where d.pickup_id = v_pickup
  on conflict (waybill_no) do update set
    pickup_id = excluded.pickup_id,
    merchant_code = coalesce(excluded.merchant_code, be_v32_parcels.merchant_code),
    merchant_name = coalesce(excluded.merchant_name, be_v32_parcels.merchant_name),
    recipient_name = excluded.recipient_name,
    recipient_phone = excluded.recipient_phone,
    recipient_phone_2 = excluded.recipient_phone_2,
    township = excluded.township,
    recipient_address = excluded.recipient_address,
    customer_tier = excluded.customer_tier,
    item_price = excluded.item_price,
    weight_kg = excluded.weight_kg,
    surcharge = excluded.surcharge,
    delivery_fee = excluded.delivery_fee,
    cod_amount = excluded.cod_amount,
    actual_collect = excluded.actual_collect,
    route_zone = excluded.route_zone,
    updated_by = excluded.updated_by,
    updated_at = now();

  select count(*) into v_printable_count
  from public.be_v32_parcels
  where pickup_id = v_pickup
    and nullif(btrim(waybill_no), '') is not null
    and nullif(btrim(township), '') is not null;

  if v_printable_count <> v_source_count then
    raise exception 'Waybill synchronization verification failed: % of % printable.', v_printable_count, v_source_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pickup_id', v_pickup,
    'source_count', v_source_count,
    'printable_count', v_printable_count
  );
end;
$function$;
revoke all on function public.be_data_entry_waybill_sync_v12_2(text, text, text) from public, anon;
grant execute on function public.be_data_entry_waybill_sync_v12_2(text, text, text) to authenticated;
create or replace function public.be_waybill_studio_snapshot_v12_2(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_rows jsonb;
begin
  if not private.be_waybill_sync_allowed_v12_2() then
    raise exception 'Waybill Studio permission is required.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select *
    from public.be_v32_parcels
    where nullif(btrim(waybill_no), '') is not null
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows, 'row_count', jsonb_array_length(v_rows));
end;
$function$;
revoke all on function public.be_waybill_studio_snapshot_v12_2(integer) from public, anon;
grant execute on function public.be_waybill_studio_snapshot_v12_2(integer) to authenticated;
commit;
