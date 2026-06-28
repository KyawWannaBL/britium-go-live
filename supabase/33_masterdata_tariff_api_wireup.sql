create extension if not exists pgcrypto;

create table if not exists public.be_delivery_charge_calculation_events (
  id uuid primary key default gen_random_uuid(),
  pickup_id text,
  way_id text,
  merchant_code text,
  branch_code text,
  service_type text,
  weight_kg numeric,
  parcel_count numeric,
  distance_km numeric,
  cod_amount numeric,
  base_charge numeric,
  weight_charge numeric,
  distance_charge numeric,
  parcel_charge numeric,
  cod_charge numeric,
  total_charge numeric,
  currency text default 'MMK',
  source text,
  payload jsonb default '{}'::jsonb,
  result jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.be_delivery_charge_calculation_events
  add column if not exists pickup_id text,
  add column if not exists way_id text,
  add column if not exists merchant_code text,
  add column if not exists branch_code text,
  add column if not exists service_type text,
  add column if not exists weight_kg numeric,
  add column if not exists parcel_count numeric,
  add column if not exists distance_km numeric,
  add column if not exists cod_amount numeric,
  add column if not exists base_charge numeric,
  add column if not exists weight_charge numeric,
  add column if not exists distance_charge numeric,
  add column if not exists parcel_charge numeric,
  add column if not exists cod_charge numeric,
  add column if not exists total_charge numeric,
  add column if not exists currency text default 'MMK',
  add column if not exists source text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists result jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create or replace function public.be_jsonb_text(p_json jsonb, p_keys text[], p_default text default '')
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  foreach k in array p_keys loop
    v := nullif(trim(coalesce(p_json ->> k, '')), '');
    if v is not null then
      return v;
    end if;
  end loop;
  return p_default;
end;
$$;

create or replace function public.be_jsonb_num(p_json jsonb, p_keys text[], p_default numeric default 0)
returns numeric
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  foreach k in array p_keys loop
    v := nullif(trim(coalesce(p_json ->> k, '')), '');
    if v is not null and v ~ '^-?[0-9]+(\.[0-9]+)?$' then
      return v::numeric;
    end if;
  end loop;
  return p_default;
end;
$$;

create or replace function public.be_calculate_delivery_charge(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight numeric := greatest(public.be_jsonb_num(p_payload, array['weight_kg','actual_weight_kg','actual_weight','declared_weight','chargeable_weight','weight'], 0), 0);
  v_parcels numeric := greatest(public.be_jsonb_num(p_payload, array['parcel_count','qty','quantity','pieces','no_of_parcels'], 1), 1);
  v_distance numeric := greatest(public.be_jsonb_num(p_payload, array['distance_km','km','route_km'], 0), 0);
  v_cod numeric := greatest(public.be_jsonb_num(p_payload, array['cod_amount','cod','actual_collect','collect_amount'], 0), 0);
  v_service text := upper(public.be_jsonb_text(p_payload, array['service_type','service','delivery_type','shipment_type'], 'STANDARD'));
  v_branch text := upper(public.be_jsonb_text(p_payload, array['branch_code','origin_branch','warehouse_code'], 'HQ'));
  v_merchant text := public.be_jsonb_text(p_payload, array['merchant_code','merchant_id','merchant'], '');
  v_pickup text := public.be_jsonb_text(p_payload, array['pickup_id','canonical_pickup_id'], '');
  v_way text := public.be_jsonb_text(p_payload, array['way_id','tracking_no','waybill_no'], '');
  v_base numeric := 1000;
  v_per_kg numeric := 500;
  v_per_km numeric := 0;
  v_per_parcel numeric := 0;
  v_cod_rate numeric := 0.01;
  v_min numeric := 0;
  v_max numeric := null;
  v_surcharge numeric := 0;
  v_currency text := 'MMK';
  v_source text := 'default_formula';
  v_row jsonb;
  v_row_service text;
  v_row_branch text;
  v_base_charge numeric;
  v_weight_charge numeric;
  v_distance_charge numeric;
  v_parcel_charge numeric;
  v_cod_charge numeric;
  v_total numeric;
  v_result jsonb;
begin
  if to_regclass('public.be_tariff_master') is not null then
    for v_row in execute 'select to_jsonb(t) from (select * from public.be_tariff_master limit 500) t' loop
      if lower(coalesce(v_row->>'status', v_row->>'record_status', 'active')) in ('inactive','disabled','deleted','rejected') then
        continue;
      end if;

      v_row_service := upper(public.be_jsonb_text(v_row, array['service_type','service','delivery_type','shipment_type'], ''));
      if v_row_service <> '' and v_row_service <> v_service then
        continue;
      end if;

      v_row_branch := upper(public.be_jsonb_text(v_row, array['branch_code','origin_branch','warehouse_code'], ''));
      if v_row_branch <> '' and v_row_branch <> v_branch then
        continue;
      end if;

      v_base := public.be_jsonb_num(v_row, array['base_fee','base_rate','minimum_charge','base_charge','fixed_charge','flat_rate'], v_base);
      v_per_kg := public.be_jsonb_num(v_row, array['per_kg','kg_rate','rate_per_kg','weight_rate'], v_per_kg);
      v_per_km := public.be_jsonb_num(v_row, array['per_km','km_rate','rate_per_km','distance_rate'], v_per_km);
      v_per_parcel := public.be_jsonb_num(v_row, array['per_parcel','parcel_rate','piece_rate','rate_per_piece'], v_per_parcel);
      v_cod_rate := public.be_jsonb_num(v_row, array['cod_percent','cod_rate','cod_fee_percent'], v_cod_rate);
      v_min := public.be_jsonb_num(v_row, array['min_charge','minimum_charge','floor_charge'], v_min);
      v_max := nullif(public.be_jsonb_num(v_row, array['max_charge','maximum_charge','ceiling_charge'], -1), -1);
      v_surcharge := public.be_jsonb_num(v_row, array['surcharge','handling_fee','special_handling_fee'], v_surcharge);
      v_currency := public.be_jsonb_text(v_row, array['currency'], v_currency);
      v_source := 'be_tariff_master';
      exit;
    end loop;
  end if;

  if v_cod_rate > 1 then
    v_cod_rate := v_cod_rate / 100;
  end if;

  v_base_charge := v_base;
  v_weight_charge := v_weight * v_per_kg;
  v_distance_charge := v_distance * v_per_km;
  v_parcel_charge := v_parcels * v_per_parcel;
  v_cod_charge := v_cod * v_cod_rate;
  v_total := v_base_charge + v_weight_charge + v_distance_charge + v_parcel_charge + v_cod_charge + v_surcharge;

  if v_min > 0 and v_total < v_min then
    v_total := v_min;
  end if;

  if v_max is not null and v_max > 0 and v_total > v_max then
    v_total := v_max;
  end if;

  v_total := round(v_total, 0);

  v_result := jsonb_build_object(
    'ok', true,
    'source', v_source,
    'currency', v_currency,
    'service_type', v_service,
    'branch_code', v_branch,
    'merchant_code', v_merchant,
    'pickup_id', v_pickup,
    'way_id', v_way,
    'weight_kg', v_weight,
    'parcel_count', v_parcels,
    'distance_km', v_distance,
    'cod_amount', v_cod,
    'base_charge', v_base_charge,
    'weight_charge', round(v_weight_charge, 0),
    'distance_charge', round(v_distance_charge, 0),
    'parcel_charge', round(v_parcel_charge, 0),
    'cod_charge', round(v_cod_charge, 0),
    'surcharge', round(v_surcharge, 0),
    'total_charge', v_total
  );

  insert into public.be_delivery_charge_calculation_events (
    pickup_id, way_id, merchant_code, branch_code, service_type,
    weight_kg, parcel_count, distance_km, cod_amount,
    base_charge, weight_charge, distance_charge, parcel_charge, cod_charge,
    total_charge, currency, source, payload, result, created_at
  ) values (
    v_pickup, v_way, v_merchant, v_branch, v_service,
    v_weight, v_parcels, v_distance, v_cod,
    v_base_charge, round(v_weight_charge, 0), round(v_distance_charge, 0), round(v_parcel_charge, 0), round(v_cod_charge, 0),
    v_total, v_currency, v_source, p_payload, v_result, now()
  );

  return v_result;
end;
$$;

create or replace function public.be_get_operational_masterdata(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rules jsonb := '{}'::jsonb;
  v_branches jsonb := '[]'::jsonb;
  v_pickups jsonb := '[]'::jsonb;
  v_tariffs jsonb := '[]'::jsonb;
  v_merchants jsonb := '[]'::jsonb;
begin
  if to_regprocedure('public.be_logistics_get_field_rules()') is not null then
    select public.be_logistics_get_field_rules() into v_rules;
  end if;

  if to_regclass('public.be_branch_nodes') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.be_branch_nodes limit 300) t' into v_branches;
  end if;

  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.be_portal_pickup_requests order by created_at desc nulls last limit 300) t' into v_pickups;
  end if;

  if to_regclass('public.be_tariff_master') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.be_tariff_master limit 300) t' into v_tariffs;
  end if;

  if to_regclass('public.be_master_merchants') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.be_master_merchants limit 300) t' into v_merchants;
  elsif to_regclass('public.merchants') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.merchants limit 300) t' into v_merchants;
  elsif to_regclass('public.merchant_master') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.merchant_master limit 300) t' into v_merchants;
  end if;

  return jsonb_build_object(
    'ok', true,
    'field_rules', coalesce(v_rules, '{}'::jsonb),
    'branches', coalesce(v_branches, '[]'::jsonb),
    'pickup_options', coalesce(v_pickups, '[]'::jsonb),
    'tariffs', coalesce(v_tariffs, '[]'::jsonb),
    'merchants', coalesce(v_merchants, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.be_calculate_delivery_charge(jsonb) to anon, authenticated;
grant execute on function public.be_get_operational_masterdata(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
