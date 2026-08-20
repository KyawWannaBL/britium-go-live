-- Britium Data Entry Township Master Update
-- Run this in Supabase SQL Editor.
-- Adds the exact EN/MM township list requested for Data Entry autocomplete.
-- This does NOT insert into your existing be_township_master, so it avoids township_key NOT NULL failures.

create table if not exists public.be_township_lookup (
  township_key text primary key,
  township_name text not null,
  township_mm text,
  city text not null default 'Yangon',
  region text not null default 'Yangon Region',
  zone_code text not null default 'YGN_LOCAL',
  aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.be_township_lookup (
  township_key, township_name, township_mm, city, region, zone_code, aliases, active
)
values
  ('AHLONE', 'Ahlone', 'အလုံ', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Alone','Ahlone','အလုံ']::text[], true),
  ('BAHAN', 'Bahan', 'ဗဟန်း', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Bahan','ဗဟန်း']::text[], true),
  ('DAGON', 'Dagon', 'ဒဂုံ', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Dagon','ဒဂုံ']::text[], true),
  ('EAST_DAGON', 'East Dagon', 'ဒဂုံအရှေ့ပိုင်း', 'Yangon', 'Yangon Region', 'YGN_OUTER', array['East Dagon','Dagon East','ဒဂုံအရှေ့ပိုင်း']::text[], true),
  ('NORTH_DAGON', 'North Dagon', 'ဒဂုံမြောက်ပိုင်း', 'Yangon', 'Yangon Region', 'YGN_OUTER', array['North Dagon','Dagon North','ဒဂုံမြောက်ပိုင်း']::text[], true),
  ('SOUTH_DAGON', 'South Dagon', 'ဒဂုံတောင်ပိုင်း', 'Yangon', 'Yangon Region', 'YGN_OUTER', array['South Dagon','Dagon South','ဒဂုံတောင်ပိုင်း']::text[], true),
  ('HLAING', 'Hlaing', 'လှိုင်', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Hlaing','လှိုင်']::text[], true),
  ('INSEIN', 'Insein', 'အင်းစိန်', 'Yangon', 'Yangon Region', 'YGN_OUTER', array['Insein','အင်းစိန်']::text[], true),
  ('KAMAYUT', 'Kamayut', 'ကမာရွတ်', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Kamayut','ကမာရွတ်']::text[], true),
  ('MINGALA_TAUNG_NYUNT', 'Mingala Taung Nyunt', 'မင်္ဂလာတောင်ညွန့်', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Mingala Taung Nyunt','Mingalar Taung Nyunt','မင်္ဂလာတောင်ညွန့်']::text[], true),
  ('NORTH_OKKALAPA', 'North Okkalapa', 'ဥက္ကလာပမြောက်ပိုင်း', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['N. Okkalapa','N Okkalapa','North Okkala','ဥက္ကလာပမြောက်ပိုင်း']::text[], true),
  ('SOUTH_OKKALAPA', 'South Okkalapa', 'ဥက္ကလာပတောင်ပိုင်း', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['S. Okkalapa','S Okkalapa','South Okkala','ဥက္ကလာပတောင်ပိုင်း']::text[], true),
  ('TAMWE', 'Tamwe', 'တာမွေ', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Tamwe','တာမွေ']::text[], true),
  ('THAKETA', 'Thaketa', 'သာကေတ', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Thaketa','သာကေတ']::text[], true),
  ('THINGANGYUN', 'Thingangyun', 'သင်္ဃန်းကျွန်း', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Thingangyun','Thin Gan Gyun','သင်္ဃန်းကျွန်း']::text[], true),
  ('YANKIN', 'Yankin', 'ရန်ကင်း', 'Yangon', 'Yangon Region', 'YGN_LOCAL', array['Yankin','ရန်ကင်း']::text[], true),
  ('MANDALAY', 'Mandalay', 'မန္တလေး', 'Mandalay', 'Mandalay', 'MDY_LOCAL', array['Mandalay','MDY','မန္တလေး']::text[], true),
  ('NAYPYIDAW', 'Naypyidaw', 'နေပြည်တော်', 'Naypyidaw', 'Naypyidaw', 'NPT_LOCAL', array['Naypyidaw','NPT','Nay Pyi Taw','နေပြည်တော်']::text[], true)
on conflict (township_key) do update
set
  township_name = excluded.township_name,
  township_mm = excluded.township_mm,
  city = excluded.city,
  region = excluded.region,
  zone_code = excluded.zone_code,
  aliases = excluded.aliases,
  active = true,
  updated_at = now();

create index if not exists be_township_lookup_search_idx
on public.be_township_lookup (active, lower(township_name), lower(city), zone_code);

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
  with lookup_ref as (
    select
      township_name,
      township_mm,
      city,
      region,
      zone_code,
      aliases,
      active,
      0 as priority
    from public.be_township_lookup

    union all

    select
      coalesce(township_name, '') as township_name,
      null::text as township_mm,
      coalesce(city, 'Yangon') as city,
      coalesce(region, coalesce(city, 'Yangon')) as region,
      coalesce(zone_code, 'YGN_LOCAL') as zone_code,
      coalesce(aliases, '{}') as aliases,
      coalesce(active, true) as active,
      1 as priority
    from public.be_township_master
    where township_name is not null and township_name <> ''
  ),
  matched as (
    select distinct on (lower(township_name), lower(city))
      township_name, township_mm, city, region, zone_code, priority
    from lookup_ref tm
    where tm.active = true
      and tm.township_name is not null
      and tm.township_name <> ''
      and (
        v_q = ''
        or lower(tm.township_name) like '%' || v_q || '%'
        or lower(coalesce(tm.township_mm, '')) like '%' || v_q || '%'
        or lower(coalesce(tm.city, '')) like '%' || v_q || '%'
        or exists (
          select 1
          from unnest(coalesce(tm.aliases, '{}')) a
          where lower(a) like '%' || v_q || '%'
        )
      )
    order by lower(township_name), lower(city), priority
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'township', township_name,
      'township_name', township_name,
      'township_mm', township_mm,
      'city', city,
      'region', region,
      'zone_code', zone_code
    )
    order by priority, township_name
  ), '[]'::jsonb)
  into v_result
  from (
    select *
    from matched
    order by priority, township_name
    limit v_limit
  ) limited;

  return v_result;
end;
$$;

grant select on public.be_township_lookup to anon, authenticated;
grant execute on function public.be_data_entry_township_suggest(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

select public.be_data_entry_township_suggest('လှိုင်', 10) as mm_test;
select public.be_data_entry_township_suggest('hla', 10) as en_test;
