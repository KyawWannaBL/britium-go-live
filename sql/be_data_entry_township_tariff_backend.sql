-- Britium Data Entry Township Autocomplete + Delivery Charge Tariff Backend
-- Run this in Supabase SQL Editor first.

create table if not exists public.be_township_master (
  id bigserial primary key,
  township_name text not null,
  city text not null default 'Yangon',
  region text not null default 'Yangon',
  zone_code text not null default 'YGN_LOCAL',
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists be_township_master_name_city_uq
on public.be_township_master (lower(township_name), lower(city));

create table if not exists public.be_tariff_master (
  id bigserial primary key,
  tariff_code text not null,
  tariff_name text not null default 'Standard Tariff',
  city text,
  township_name text,
  zone_code text,
  service_type text not null default 'STANDARD',
  parcel_type text not null default 'NORMAL',
  weight_min numeric not null default 0,
  weight_max numeric not null default 999999,
  base_fee numeric not null default 0,
  cod_percent numeric not null default 0,
  min_cod_fee numeric not null default 0,
  max_cod_fee numeric,
  active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists be_tariff_master_lookup_idx
on public.be_tariff_master (active, lower(service_type), lower(parcel_type), lower(city), lower(township_name), zone_code);

insert into public.be_township_master (township_name, city, region, zone_code, aliases)
values
  ('Ahlone', 'Yangon', 'Yangon', 'YGN_LOCAL', array['Alone','အလုံ']),
  ('Bahan', 'Yangon', 'Yangon', 'YGN_LOCAL', array['ဗဟန်း']),
  ('Dagon', 'Yangon', 'Yangon', 'YGN_LOCAL', array['ဒဂုံ']),
  ('Dagon Seikkan', 'Yangon', 'Yangon', 'YGN_OUTER', array['ဒဂုံဆိပ်ကမ်း']),
  ('Hlaing', 'Yangon', 'Yangon', 'YGN_LOCAL', array['လှိုင်']),
  ('Kamayut', 'Yangon', 'Yangon', 'YGN_LOCAL', array['ကမာရွတ်']),
  ('Kyauktada', 'Yangon', 'Yangon', 'YGN_LOCAL', array['ကျောက်တံတား']),
  ('Mayangone', 'Yangon', 'Yangon', 'YGN_LOCAL', array['မရမ်းကုန်း']),
  ('North Okkalapa', 'Yangon', 'Yangon', 'YGN_LOCAL', array['N Okkalapa','မြောက်ဥက္ကလာပ']),
  ('South Okkalapa', 'Yangon', 'Yangon', 'YGN_LOCAL', array['S Okkalapa','တောင်ဥက္ကလာပ']),
  ('Sanchaung', 'Yangon', 'Yangon', 'YGN_LOCAL', array['စမ်းချောင်း']),
  ('Thingangyun', 'Yangon', 'Yangon', 'YGN_LOCAL', array['သင်္ဃန်းကျွန်း']),
  ('Yankin', 'Yangon', 'Yangon', 'YGN_LOCAL', array['ရန်ကင်း']),
  ('Insein', 'Yangon', 'Yangon', 'YGN_OUTER', array['အင်းစိန်']),
  ('Hlaing Tharyar', 'Yangon', 'Yangon', 'YGN_OUTER', array['Hlaingthaya','လှိုင်သာယာ']),
  ('Shwepyithar', 'Yangon', 'Yangon', 'YGN_OUTER', array['ရွှေပြည်သာ']),
  ('Thanlyin', 'Yangon', 'Yangon', 'YGN_OUTER', array['သန်လျင်']),
  ('Mandalay', 'Mandalay', 'Mandalay', 'MDY_LOCAL', array['MDY','မန္တလေး']),
  ('Naypyitaw', 'Naypyitaw', 'Naypyitaw', 'NPT_LOCAL', array['NPT','နေပြည်တော်'])
on conflict (lower(township_name), lower(city)) do update
set region = excluded.region,
    zone_code = excluded.zone_code,
    aliases = excluded.aliases,
    active = true,
    updated_at = now();

-- Starter tariff master. Replace base_fee values with official Britium tariff before production.
insert into public.be_tariff_master (
  tariff_code, tariff_name, city, township_name, zone_code, service_type, parcel_type,
  weight_min, weight_max, base_fee, cod_percent, min_cod_fee, max_cod_fee
)
values
  ('YGN-LOCAL-STANDARD-NORMAL', 'Yangon Local Standard Normal', 'Yangon', null, 'YGN_LOCAL', 'STANDARD', 'NORMAL', 0, 3, 7500, 0, 0, null),
  ('YGN-LOCAL-EXPRESS-NORMAL', 'Yangon Local Express Normal', 'Yangon', null, 'YGN_LOCAL', 'EXPRESS', 'NORMAL', 0, 3, 9500, 0, 0, null),
  ('YGN-OUTER-STANDARD-NORMAL', 'Yangon Outer Standard Normal', 'Yangon', null, 'YGN_OUTER', 'STANDARD', 'NORMAL', 0, 3, 9500, 0, 0, null),
  ('YGN-OUTER-EXPRESS-NORMAL', 'Yangon Outer Express Normal', 'Yangon', null, 'YGN_OUTER', 'EXPRESS', 'NORMAL', 0, 3, 12000, 0, 0, null),
  ('MDY-STANDARD-NORMAL', 'Mandalay Standard Normal', 'Mandalay', null, 'MDY_LOCAL', 'STANDARD', 'NORMAL', 0, 3, 8000, 0, 0, null),
  ('NPT-STANDARD-NORMAL', 'Naypyitaw Standard Normal', 'Naypyitaw', null, 'NPT_LOCAL', 'STANDARD', 'NORMAL', 0, 3, 8500, 0, 0, null)
on conflict do nothing;

create or replace function public.be_data_entry_township_suggest(
  p_query text default '',
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := lower(trim(coalesce(p_query, '')));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_result jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'township', township_name,
      'township_name', township_name,
      'city', city,
      'region', region,
      'zone_code', zone_code
    )
    order by township_name
  ), '[]'::jsonb)
  into v_result
  from (
    select distinct township_name, city, region, zone_code
    from public.be_township_master tm
    where tm.active = true
      and (
        v_q = ''
        or lower(tm.township_name) like '%' || v_q || '%'
        or lower(tm.city) like '%' || v_q || '%'
        or exists (
          select 1
          from unnest(tm.aliases) a
          where lower(a) like '%' || v_q || '%'
        )
      )
    order by township_name
    limit v_limit
  ) s;

  return v_result;
end;
$$;

create or replace function public.be_data_entry_calculate_delivery_charge(
  p_township text,
  p_service_type text default 'STANDARD',
  p_parcel_type text default 'NORMAL',
  p_cod_amount numeric default 0,
  p_weight numeric default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_township text := trim(coalesce(p_township, ''));
  v_service text := upper(trim(coalesce(p_service_type, 'STANDARD')));
  v_type text := upper(trim(coalesce(p_parcel_type, 'NORMAL')));
  v_cod numeric := coalesce(p_cod_amount, 0);
  v_weight numeric := coalesce(p_weight, 1);
  v_city text;
  v_zone text;
  v_tariff record;
  v_fee numeric := 0;
  v_cod_fee numeric := 0;
begin
  if v_township = '' then
    return jsonb_build_object('ok', false, 'delivery_fee', 0, 'message', 'Township is required');
  end if;

  select city, zone_code
  into v_city, v_zone
  from public.be_township_master
  where active = true
    and (
      lower(township_name) = lower(v_township)
      or lower(v_township) = any(select lower(x) from unnest(aliases) x)
    )
  order by case when lower(township_name) = lower(v_township) then 0 else 1 end, township_name
  limit 1;

  if v_city is null then
    return jsonb_build_object(
      'ok', false,
      'delivery_fee', 0,
      'message', 'Township is not found in township master',
      'township', v_township
    );
  end if;

  select *
  into v_tariff
  from public.be_tariff_master t
  where t.active = true
    and lower(t.service_type) = lower(v_service)
    and lower(t.parcel_type) = lower(v_type)
    and v_weight between t.weight_min and t.weight_max
    and (
      lower(coalesce(t.township_name, '')) = lower(v_township)
      or (
        t.township_name is null
        and (
          lower(coalesce(t.city, '')) = lower(v_city)
          or coalesce(t.zone_code, '') = coalesce(v_zone, '')
        )
      )
    )
    and (t.effective_to is null or t.effective_to >= current_date)
    and t.effective_from <= current_date
  order by
    case when lower(coalesce(t.township_name, '')) = lower(v_township) then 0 else 1 end,
    t.effective_from desc,
    t.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'delivery_fee', 0,
      'message', 'No active tariff found for township/service/parcel type',
      'township', v_township,
      'city', v_city,
      'zone_code', v_zone,
      'service_type', v_service,
      'parcel_type', v_type
    );
  end if;

  if coalesce(v_tariff.cod_percent, 0) > 0 then
    v_cod_fee := v_cod * v_tariff.cod_percent / 100.0;
    v_cod_fee := greatest(v_cod_fee, coalesce(v_tariff.min_cod_fee, 0));
    if v_tariff.max_cod_fee is not null then
      v_cod_fee := least(v_cod_fee, v_tariff.max_cod_fee);
    end if;
  end if;

  v_fee := coalesce(v_tariff.base_fee, 0) + coalesce(v_cod_fee, 0);

  return jsonb_build_object(
    'ok', true,
    'delivery_fee', ceil(v_fee),
    'base_fee', v_tariff.base_fee,
    'cod_fee', ceil(v_cod_fee),
    'tariff_code', v_tariff.tariff_code,
    'tariff_name', v_tariff.tariff_name,
    'township', v_township,
    'city', v_city,
    'zone_code', v_zone,
    'service_type', v_service,
    'parcel_type', v_type
  );
end;
$$;

grant select on public.be_township_master to anon, authenticated;
grant select on public.be_tariff_master to anon, authenticated;
grant execute on function public.be_data_entry_township_suggest(text, integer) to anon, authenticated;
grant execute on function public.be_data_entry_calculate_delivery_charge(text, text, text, numeric, numeric) to anon, authenticated;

notify pgrst, 'reload schema';

-- Quick checks:
-- select public.be_data_entry_township_suggest('hla', 10);
-- select public.be_data_entry_calculate_delivery_charge('Hlaing', 'STANDARD', 'NORMAL', 42000, 1);
