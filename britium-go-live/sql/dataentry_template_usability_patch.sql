
begin;

-- ---------------------------------------------------------------------------
-- Data Entry usability patch
-- Adds: full township typeahead/search, Contact No. (2), row remark/special instruction,
-- row-level save, and a backend template view synchronized with Rider parcel proofs.
-- ---------------------------------------------------------------------------

create table if not exists public.be_township_master (
  township_key text primary key,
  township text not null,
  township_mm text,
  city text,
  region_state text,
  zone text,
  branch_code text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.be_township_aliases (
  alias_key text primary key,
  alias_text text not null,
  township_key text not null references public.be_township_master(township_key) on delete cascade,
  language_code text default 'en',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

with seed(township, township_mm, city, region_state) as (
  values
    ('Ahlone','အလုံ','Yangon','Yangon Region'),
    ('Bahan','ဗဟန်း','Yangon','Yangon Region'),
    ('Botataung','ဗိုလ်တထောင်','Yangon','Yangon Region'),
    ('Cocokyun','ကိုကိုးကျွန်း','Yangon','Yangon Region'),
    ('Dagon','ဒဂုံ','Yangon','Yangon Region'),
    ('Dagon Myothit East','ဒဂုံမြို့သစ်အရှေ့ပိုင်း','Yangon','Yangon Region'),
    ('Dagon Myothit North','ဒဂုံမြို့သစ်မြောက်ပိုင်း','Yangon','Yangon Region'),
    ('Dagon Myothit Seikkan','ဒဂုံမြို့သစ်ဆိပ်ကမ်း','Yangon','Yangon Region'),
    ('Dagon Myothit South','ဒဂုံမြို့သစ်တောင်ပိုင်း','Yangon','Yangon Region'),
    ('Dala','ဒလ','Yangon','Yangon Region'),
    ('Dawbon','ဒေါပုံ','Yangon','Yangon Region'),
    ('East Dagon','ဒဂုံအရှေ့ပိုင်း','Yangon','Yangon Region'),
    ('Hlaing','လှိုင်','Yangon','Yangon Region'),
    ('Hlaing Thar Yar','လှိုင်သာယာ','Yangon','Yangon Region'),
    ('Hlaingthaya','လှိုင်သာယာ','Yangon','Yangon Region'),
    ('Insein','အင်းစိန်','Yangon','Yangon Region'),
    ('Kamayut','ကမာရွတ်','Yangon','Yangon Region'),
    ('Kyauktada','ကျောက်တံတား','Yangon','Yangon Region'),
    ('Kyimyindaing','ကြည့်မြင်တိုင်','Yangon','Yangon Region'),
    ('Lanmadaw','လမ်းမတော်','Yangon','Yangon Region'),
    ('Latha','လသာ','Yangon','Yangon Region'),
    ('Mayangon','မရမ်းကုန်း','Yangon','Yangon Region'),
    ('Mingaladon','မင်္ဂလာဒုံ','Yangon','Yangon Region'),
    ('Mingala Taung Nyunt','မင်္ဂလာတောင်ညွန့်','Yangon','Yangon Region'),
    ('North Dagon','ဒဂုံမြောက်ပိုင်း','Yangon','Yangon Region'),
    ('North Okkalapa','ဥက္ကလာပမြောက်ပိုင်း','Yangon','Yangon Region'),
    ('Pabedan','ပန်းဘဲတန်း','Yangon','Yangon Region'),
    ('Pazundaung','ပုဇွန်တောင်','Yangon','Yangon Region'),
    ('Sanchaung','စမ်းချောင်း','Yangon','Yangon Region'),
    ('Seikkan','ဆိပ်ကမ်း','Yangon','Yangon Region'),
    ('Shwe Pyi Thar','ရွှေပြည်သာ','Yangon','Yangon Region'),
    ('Shwepyitha','ရွှေပြည်သာ','Yangon','Yangon Region'),
    ('South Dagon','ဒဂုံတောင်ပိုင်း','Yangon','Yangon Region'),
    ('South Okkalapa','ဥက္ကလာပတောင်ပိုင်း','Yangon','Yangon Region'),
    ('Tamwe','တာမွေ','Yangon','Yangon Region'),
    ('Thaketa','သာကေတ','Yangon','Yangon Region'),
    ('Thingangyun','သင်္ဃန်းကျွန်း','Yangon','Yangon Region'),
    ('Yankin','ရန်ကင်း','Yangon','Yangon Region'),
    ('Mandalay','မန္တလေး','Mandalay','Mandalay'),
    ('Naypyidaw','နေပြည်တော်','Naypyidaw','Naypyidaw')
),
dedup as (
  select distinct on (lower(regexp_replace(trim(township), '[\s\-_()]+', '', 'g')))
    lower(regexp_replace(trim(township), '[\s\-_()]+', '', 'g')) as township_key,
    trim(township) as township,
    township_mm,
    city,
    region_state
  from seed
  where nullif(trim(township), '') is not null
  order by lower(regexp_replace(trim(township), '[\s\-_()]+', '', 'g')), township
)
insert into public.be_township_master (
  township_key, township, township_mm, city, region_state, is_active, updated_at
)
select township_key, township, township_mm, city, region_state, true, now()
from dedup
on conflict (township_key)
do update set
  township = excluded.township,
  township_mm = coalesce(public.be_township_master.township_mm, excluded.township_mm),
  city = coalesce(excluded.city, public.be_township_master.city),
  region_state = coalesce(excluded.region_state, public.be_township_master.region_state),
  is_active = true,
  updated_at = now();

with merchant_townships as (
  select
    lower(regexp_replace(trim(township), '[\s\-_()]+', '', 'g')) as township_key,
    trim(township) as township,
    coalesce(nullif(city, ''), 'Yangon') as city,
    coalesce(nullif(state, ''), 'Yangon Region') as region_state,
    updated_at,
    row_number() over (
      partition by lower(regexp_replace(trim(township), '[\s\-_()]+', '', 'g'))
      order by updated_at desc nulls last, created_at desc nulls last
    ) as rn
  from public.merchant_masters
  where nullif(trim(township), '') is not null
)
insert into public.be_township_master (
  township_key, township, city, region_state, is_active, updated_at
)
select township_key, township, city, region_state, true, now()
from merchant_townships
where rn = 1
on conflict (township_key)
do update set
  township = excluded.township,
  city = coalesce(excluded.city, public.be_township_master.city),
  region_state = coalesce(excluded.region_state, public.be_township_master.region_state),
  is_active = true,
  updated_at = now();

-- English and Myanmar aliases. The alias key is normalized so users can type English or Myanmar.
with alias_seed(alias_text, township) as (
  values
    ('Alone','Ahlone'), ('Ahlone','Ahlone'), ('အလုံ','Ahlone'),
    ('Bahan','Bahan'), ('ဗဟန်း','Bahan'),
    ('Botataung','Botataung'), ('ဗိုလ်တထောင်','Botataung'),
    ('Dagon','Dagon'), ('ဒဂုံ','Dagon'),
    ('East Dagon','East Dagon'), ('Dagon East','East Dagon'), ('ဒဂုံအရှေ့ပိုင်း','East Dagon'),
    ('North Dagon','North Dagon'), ('Dagon North','North Dagon'), ('ဒဂုံမြောက်ပိုင်း','North Dagon'),
    ('South Dagon','South Dagon'), ('Dagon South','South Dagon'), ('ဒဂုံတောင်ပိုင်း','South Dagon'),
    ('Dagon Seikkan','Dagon Myothit Seikkan'), ('ဒဂုံဆိပ်ကမ်း','Dagon Myothit Seikkan'),
    ('Dala','Dala'), ('ဒလ','Dala'),
    ('Dawbon','Dawbon'), ('ဒေါပုံ','Dawbon'),
    ('Hlaing','Hlaing'), ('လှိုင်','Hlaing'),
    ('Hlaing Thar Yar','Hlaing Thar Yar'), ('Hlaingthaya','Hlaingthaya'), ('လှိုင်သာယာ','Hlaing Thar Yar'),
    ('Insein','Insein'), ('အင်းစိန်','Insein'),
    ('Kamayut','Kamayut'), ('ကမာရွတ်','Kamayut'),
    ('Kyauktada','Kyauktada'), ('ကျောက်တံတား','Kyauktada'),
    ('Kyimyindaing','Kyimyindaing'), ('ကြည့်မြင်တိုင်','Kyimyindaing'),
    ('Lanmadaw','Lanmadaw'), ('လမ်းမတော်','Lanmadaw'),
    ('Latha','Latha'), ('လသာ','Latha'),
    ('Mayangon','Mayangon'), ('မရမ်းကုန်း','Mayangon'),
    ('Mingaladon','Mingaladon'), ('မင်္ဂလာဒုံ','Mingaladon'),
    ('Mingala Taung Nyunt','Mingala Taung Nyunt'), ('Mingalar Taung Nyunt','Mingala Taung Nyunt'), ('မင်္ဂလာတောင်ညွန့်','Mingala Taung Nyunt'),
    ('North Okkalapa','North Okkalapa'), ('North Okkalapa Township','North Okkalapa'), ('ဥက္ကလာပမြောက်ပိုင်း','North Okkalapa'),
    ('Pabedan','Pabedan'), ('ပန်းဘဲတန်း','Pabedan'),
    ('Pazundaung','Pazundaung'), ('ပုဇွန်တောင်','Pazundaung'),
    ('Sanchaung','Sanchaung'), ('စမ်းချောင်း','Sanchaung'),
    ('Seikkan','Seikkan'), ('ဆိပ်ကမ်း','Seikkan'),
    ('Shwe Pyi Thar','Shwe Pyi Thar'), ('Shwepyitha','Shwepyitha'), ('ရွှေပြည်သာ','Shwe Pyi Thar'),
    ('South Okkalapa','South Okkalapa'), ('South Okkalapa Township','South Okkalapa'), ('ဥက္ကလာပတောင်ပိုင်း','South Okkalapa'),
    ('Tamwe','Tamwe'), ('တာမွေ','Tamwe'),
    ('Thaketa','Thaketa'), ('သာကေတ','Thaketa'),
    ('Thingangyun','Thingangyun'), ('သင်္ဃန်းကျွန်း','Thingangyun'),
    ('Yankin','Yankin'), ('ရန်ကင်း','Yankin'),
    ('Mandalay','Mandalay'), ('မန္တလေး','Mandalay'),
    ('Naypyidaw','Naypyidaw'), ('Nay Pyi Taw','Naypyidaw'), ('နေပြည်တော်','Naypyidaw')
),
resolved as (
  select
    lower(regexp_replace(trim(a.alias_text), '[\s\-_()]+', '', 'g')) as alias_key,
    trim(a.alias_text) as alias_text,
    m.township_key,
    case when trim(a.alias_text) ~ '[က-၏]' then 'my' else 'en' end as language_code
  from alias_seed a
  join public.be_township_master m
    on lower(regexp_replace(trim(m.township), '[\s\-_()]+', '', 'g'))
     = lower(regexp_replace(trim(a.township), '[\s\-_()]+', '', 'g'))
)
insert into public.be_township_aliases (
  alias_key, alias_text, township_key, language_code, is_active, updated_at
)
select alias_key, alias_text, township_key, language_code, true, now()
from resolved
where alias_key is not null and alias_key <> ''
on conflict (alias_key)
do update set
  alias_text = excluded.alias_text,
  township_key = excluded.township_key,
  language_code = excluded.language_code,
  is_active = true,
  updated_at = now();

create or replace view public.be_v_township_search_options as
select
  m.township_key,
  m.township,
  m.township_mm,
  m.city,
  m.region_state,
  m.zone,
  m.branch_code,
  concat_ws(' / ', m.township, nullif(m.township_mm, '')) as label,
  concat_ws(' ', m.township, m.township_mm, string_agg(a.alias_text, ' ' order by a.alias_text)) as search_text
from public.be_township_master m
left join public.be_township_aliases a
  on a.township_key = m.township_key
 and coalesce(a.is_active, true) = true
where coalesce(m.is_active, true) = true
group by
  m.township_key, m.township, m.township_mm, m.city, m.region_state, m.zone, m.branch_code
order by m.township;

create or replace view public.v_address_township_options as
select
  township,
  city,
  region_state,
  zone,
  branch_code,
  is_active,
  updated_at
from public.be_township_master
where coalesce(is_active, true) = true;

create table if not exists public.be_data_entry_parcel_details (
  id uuid primary key default gen_random_uuid(),
  pickup_id text not null,
  parcel_sequence integer not null,
  delivery_way_id text not null,
  recipient_name text,
  contact_no_1 text,
  contact_no_2 text,
  township text,
  township_key text,
  city text,
  region_state text,
  recipient_address text,
  customer_tier text default 'Standard',
  item_price numeric default 0,
  weight_kg numeric default 0,
  surcharge numeric default 0,
  delivery_fee numeric default 0,
  cod_amount numeric default 0,
  actual_collect numeric default 0,
  destination text,
  pickup_by text,
  remark text,
  saved_by_email text,
  saved_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pickup_id, parcel_sequence)
);

create index if not exists ix_be_data_entry_parcel_details_pickup
on public.be_data_entry_parcel_details (pickup_id, parcel_sequence);

create or replace function public.be_normalize_township(p_input text)
returns table (
  township text,
  township_key text,
  city text,
  region_state text
)
language sql
stable
as $$
  with q as (
    select lower(regexp_replace(trim(coalesce(p_input, '')), '[\s\-_()]+', '', 'g')) as key
  ),
  direct as (
    select m.township, m.township_key, m.city, m.region_state, 1 as rank
    from public.be_township_master m, q
    where m.township_key = q.key
       or lower(regexp_replace(trim(m.township), '[\s\-_()]+', '', 'g')) = q.key
       or lower(regexp_replace(trim(coalesce(m.township_mm, '')), '[\s\-_()]+', '', 'g')) = q.key
  ),
  alias_match as (
    select m.township, m.township_key, m.city, m.region_state, 2 as rank
    from public.be_township_aliases a
    join public.be_township_master m on m.township_key = a.township_key
    join q on a.alias_key = q.key
  ),
  fuzzy as (
    select m.township, m.township_key, m.city, m.region_state, 3 as rank
    from public.be_township_master m, q
    where q.key <> ''
      and (
        lower(regexp_replace(trim(m.township), '[\s\-_()]+', '', 'g')) like q.key || '%'
        or lower(regexp_replace(trim(coalesce(m.township_mm, '')), '[\s\-_()]+', '', 'g')) like q.key || '%'
      )
  )
  select township, township_key, city, region_state
  from (
    select * from direct
    union all
    select * from alias_match
    union all
    select * from fuzzy
  ) x
  order by rank
  limit 1;
$$;

create or replace function public.be_save_data_entry_parcel_detail(
  p_pickup_id text,
  p_parcel_sequence integer,
  p_delivery_way_id text,
  p_recipient_name text default null,
  p_contact_no_1 text default null,
  p_contact_no_2 text default null,
  p_township text default null,
  p_recipient_address text default null,
  p_customer_tier text default 'Standard',
  p_item_price numeric default 0,
  p_weight_kg numeric default 0,
  p_surcharge numeric default 0,
  p_delivery_fee numeric default 0,
  p_cod_amount numeric default 0,
  p_actual_collect numeric default 0,
  p_destination text default null,
  p_pickup_by text default null,
  p_remark text default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  v_township text := nullif(trim(p_township), '');
  v_city text := nullif(trim(p_destination), '');
begin
  if nullif(trim(p_pickup_id), '') is null then
    raise exception 'pickup_id is required';
  end if;

  if p_parcel_sequence is null or p_parcel_sequence <= 0 then
    raise exception 'parcel_sequence must be greater than 0';
  end if;

  select * into t
  from public.be_normalize_township(v_township)
  limit 1;

  if t.township is not null then
    v_township := t.township;
    v_city := coalesce(v_city, t.city);
  end if;

  insert into public.be_data_entry_parcel_details (
    pickup_id,
    parcel_sequence,
    delivery_way_id,
    recipient_name,
    contact_no_1,
    contact_no_2,
    township,
    township_key,
    city,
    region_state,
    recipient_address,
    customer_tier,
    item_price,
    weight_kg,
    surcharge,
    delivery_fee,
    cod_amount,
    actual_collect,
    destination,
    pickup_by,
    remark,
    saved_by_email,
    saved_at,
    updated_at
  )
  values (
    p_pickup_id,
    p_parcel_sequence,
    p_delivery_way_id,
    p_recipient_name,
    p_contact_no_1,
    p_contact_no_2,
    v_township,
    t.township_key,
    v_city,
    t.region_state,
    p_recipient_address,
    coalesce(nullif(p_customer_tier, ''), 'Standard'),
    coalesce(p_item_price, 0),
    coalesce(p_weight_kg, 0),
    coalesce(p_surcharge, 0),
    coalesce(p_delivery_fee, 0),
    coalesce(p_cod_amount, 0),
    coalesce(p_actual_collect, 0),
    coalesce(v_city, p_destination),
    p_pickup_by,
    p_remark,
    p_actor_email,
    now(),
    now()
  )
  on conflict (pickup_id, parcel_sequence)
  do update set
    delivery_way_id = excluded.delivery_way_id,
    recipient_name = excluded.recipient_name,
    contact_no_1 = excluded.contact_no_1,
    contact_no_2 = excluded.contact_no_2,
    township = excluded.township,
    township_key = excluded.township_key,
    city = excluded.city,
    region_state = excluded.region_state,
    recipient_address = excluded.recipient_address,
    customer_tier = excluded.customer_tier,
    item_price = excluded.item_price,
    weight_kg = excluded.weight_kg,
    surcharge = excluded.surcharge,
    delivery_fee = excluded.delivery_fee,
    cod_amount = excluded.cod_amount,
    actual_collect = excluded.actual_collect,
    destination = excluded.destination,
    pickup_by = excluded.pickup_by,
    remark = excluded.remark,
    saved_by_email = excluded.saved_by_email,
    saved_at = now(),
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'pickup_id', p_pickup_id,
    'parcel_sequence', p_parcel_sequence,
    'delivery_way_id', p_delivery_way_id,
    'township', v_township,
    'city', v_city
  );
end;
$$;

-- View used by the Data Entry screen. It joins rider proof rows with Data Entry input values.
create or replace view public.be_v_data_entry_parcel_template as
select
  v.id,
  v.pickup_id,
  v.parcel_sequence,
  v.delivery_way_id,
  v.parcel_weight_kg,
  coalesce(d.weight_kg, v.parcel_weight_kg) as weight,
  v.proof_photo_path,
  v.status,
  v.verified_at,
  v.photo_taken_at,
  v.qr_payload,
  v.merchant_code,
  v.merchant_name,
  v.pickup_date,
  coalesce(d.township, v.township) as township,
  coalesce(d.city, v.city) as city,
  d.recipient_name,
  d.contact_no_1,
  d.contact_no_2,
  d.recipient_address,
  d.customer_tier,
  d.item_price,
  d.surcharge,
  d.delivery_fee,
  d.cod_amount,
  d.actual_collect,
  d.destination,
  d.pickup_by,
  d.remark as data_entry_remark,
  d.saved_at,
  d.saved_by_email
from public.be_v_data_entry_parcel_proofs v
left join public.be_data_entry_parcel_details d
  on d.pickup_id = v.pickup_id
 and d.parcel_sequence = v.parcel_sequence;

grant select on public.v_address_township_options to authenticated;
grant select on public.be_v_township_search_options to authenticated;
grant select, insert, update on public.be_data_entry_parcel_details to authenticated;
grant execute on function public.be_normalize_township(text) to authenticated;
grant execute on function public.be_save_data_entry_parcel_detail(
  text, integer, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, text
) to authenticated;
grant select on public.be_v_data_entry_parcel_template to authenticated;

commit;

notify pgrst, 'reload schema';
