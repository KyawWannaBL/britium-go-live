-- Britium Yangon township alias normalization V31
-- Hlaingtharya East/West inherit Hlaingtharya tariff/scope.
-- Kyeemyindaing inherits Kyimyindaing / ကြည့်မြင်တိုင် tariff/scope.
-- Mingalartaungnyunt spelling variants inherit မင်္ဂလာတောင်ညွန့် tariff/scope.

create or replace function public.be_data_entry_destination_key_v17(p_value text)
returns text
language sql
immutable parallel safe
set search_path to 'public','pg_temp'
as $function$
  with normalized as (
    select regexp_replace(
      replace(replace(replace(replace(replace(replace(
        regexp_replace(
          lower(btrim(coalesce(p_value,''))),
          '(royal[[:space:]]*express|royal|dk[[:space:]]*delivery|npt[[:space:]]*branch|grs)',
          '',
          'g'
        ),
        'မြို့နယ်',''),
        'မြို့',''),
        'တိုင်းဒေသကြီး',''),
        'ပြည်ထောင်စုနယ်မြေ',''),
        'township',''),
        'city',''),
      '[[:space:]()（）.,၊။/|·_-]+',
      '',
      'g'
    ) as destination_key
  )
  select case destination_key
    when 'northdagon' then 'မြောက်ဒဂုံ'
    when 'dagonmyothitnorth' then 'မြောက်ဒဂုံ'
    when 'ဒဂုံမြို့သစ်မြောက်ပိုင်း' then 'မြောက်ဒဂုံ'
    when 'southdagon' then 'တောင်ဒဂုံ'
    when 'dagonmyothitsouth' then 'တောင်ဒဂုံ'
    when 'ဒဂုံမြို့သစ်တောင်ပိုင်း' then 'တောင်ဒဂုံ'
    when 'eastdagon' then 'အရှေ့ဒဂုံ'
    when 'dagonmyothiteast' then 'အရှေ့ဒဂုံ'
    when 'ဒဂုံမြို့သစ်အရှေ့ပိုင်း' then 'အရှေ့ဒဂုံ'
    when 'dagonseikkan' then 'ဒဂုံဆိပ်ကမ်း'
    when 'dagonmyothitseikkan' then 'ဒဂုံဆိပ်ကမ်း'
    when 'ဒဂုံမြို့သစ်ဆိပ်ကမ်း' then 'ဒဂုံဆိပ်ကမ်း'

    -- Hlaingtharya / Hlaing Tharyar East and West are one Britium tariff zone.
    when 'hlaingtharya' then 'လှိုင်သာယာ'
    when 'hlaingtharyar' then 'လှိုင်သာယာ'
    when 'hlaingthaya' then 'လှိုင်သာယာ'
    when 'hlaingthayar' then 'လှိုင်သာယာ'
    when 'hlaingtharyaeast' then 'လှိုင်သာယာ'
    when 'hlaingtharyawest' then 'လှိုင်သာယာ'
    when 'hlaingtharyareast' then 'လှိုင်သာယာ'
    when 'hlaingtharyarwest' then 'လှိုင်သာယာ'
    when 'hlaingthayaeast' then 'လှိုင်သာယာ'
    when 'hlaingthayawest' then 'လှိုင်သာယာ'
    when 'hlaingthayareast' then 'လှိုင်သာယာ'
    when 'hlaingthayarwest' then 'လှိုင်သာယာ'

    -- English spelling variants of ကြည့်မြင်တိုင်.
    when 'kyimyindaing' then 'ကြည့်မြင်တိုင်'
    when 'kyeemyindaing' then 'ကြည့်မြင်တိုင်'
    when 'kyimyindine' then 'ကြည့်မြင်တိုင်'
    when 'kyeemyindine' then 'ကြည့်မြင်တိုင်'

    -- English spelling variants of မင်္ဂလာတောင်ညွန့်.
    when 'mingalataungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'mingalartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'minglartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'mingalataungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'mingalartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    else destination_key
  end
  from normalized;
$function$;

-- Keep the location/tariff alias master explicit for downstream tooling.
insert into public.be_tariff_location_alias_v61_7_1(
  normalized_alias,alias_value,location_key,township_code,location_kind,canonical_label,created_at,updated_at
) values
  ('hlaingtharya east','Hlaingtharya (East) Township','လှိုင်သာယာ',null,'TOWNSHIP','လှိုင်သာယာ',now(),now()),
  ('hlaingtharya west','Hlaingtharya (West) Township','လှိုင်သာယာ',null,'TOWNSHIP','လှိုင်သာယာ',now(),now()),
  ('hlaing tharyar east','Hlaing Tharyar East Township','လှိုင်သာယာ',null,'TOWNSHIP','လှိုင်သာယာ',now(),now()),
  ('hlaing tharyar west','Hlaing Tharyar West Township','လှိုင်သာယာ',null,'TOWNSHIP','လှိုင်သာယာ',now(),now()),
  ('kyeemyindaing','Kyeemyindaing Township','ကြည့်မြင်တိုင်',null,'TOWNSHIP','ကြည့်မြင်တိုင်',now(),now()),
  ('kyimyindaing','Kyimyindaing Township','ကြည့်မြင်တိုင်',null,'TOWNSHIP','ကြည့်မြင်တိုင်',now(),now()),
  ('mingalartaungnyunt','Mingalartaungnyunt Township','မင်္ဂလာတောင်ညွန့်',null,'TOWNSHIP','မင်္ဂလာတောင်ညွန့်',now(),now()),
  ('minglartaungnyunt','Minglartaungnyunt Township','မင်္ဂလာတောင်ညွန့်',null,'TOWNSHIP','မင်္ဂလာတောင်ညွန့်',now(),now())
on conflict (normalized_alias) do update set
  alias_value=excluded.alias_value,
  location_key=excluded.location_key,
  location_kind=excluded.location_kind,
  canonical_label=excluded.canonical_label,
  updated_at=now();

-- Correct already-saved alias rows without changing prices/COD/settlement amounts.
with normalized as (
  select d.delivery_way_id,
    case
      when public.be_data_entry_destination_key_v17(d.township)='လှိုင်သာယာ' then 'လှိုင်သာယာ'
      when public.be_data_entry_destination_key_v17(d.township)='ကြည့်မြင်တိုင်' then 'ကြည့်မြင်တိုင်'
      when public.be_data_entry_destination_key_v17(d.township)='မင်္ဂလာတောင်ညွန့်' then 'မင်္ဂလာတောင်ညွန့်'
    end as canonical_township
  from public.be_data_entry_parcel_details d
  where d.township in (
    'Hlaingtharya(East) Township','Hlaingtharya (East) Township',
    'Hlaingtharya(West) Township','Hlaingtharya (West) Township',
    'Hlaing Tharyar East Township','Hlaing Tharyar West Township',
    'Kyeemyindaing Township','Kyimyindaing Township',
    'Mingalartaungnyunt Township','Minglartaungnyunt Township','Mingala Taungnyunt Township'
  )
)
update public.be_data_entry_parcel_details d
set township=n.canonical_township,
    township_key=n.canonical_township,
    delivery_region='YANGON',
    delivery_route_mode='DOORSTEP_MAP',
    location_required=true,
    financial_quote=coalesce(d.financial_quote,'{}'::jsonb)
      || jsonb_build_object(
        'township',n.canonical_township,
        'service_provider_code','BRITIUM',
        'delivery_region','YANGON',
        'delivery_route_mode','DOORSTEP_MAP',
        'location_required',true,
        'alias_normalized_by','BRITIUM_YANGON_TOWNSHIP_ALIASES_V31'
      ),
    updated_at=now()
from normalized n
where d.delivery_way_id=n.delivery_way_id
  and n.canonical_township is not null;

update public.be_waybill_ledger w
set township=case
  when public.be_data_entry_destination_key_v17(w.township)='လှိုင်သာယာ' then 'လှိုင်သာယာ'
  when public.be_data_entry_destination_key_v17(w.township)='ကြည့်မြင်တိုင်' then 'ကြည့်မြင်တိုင်'
  when public.be_data_entry_destination_key_v17(w.township)='မင်္ဂလာတောင်ညွန့်' then 'မင်္ဂလာတောင်ညွန့်'
  else w.township
end,
updated_at=now()
where w.township in (
  'Hlaingtharya(East) Township','Hlaingtharya (East) Township',
  'Hlaingtharya(West) Township','Hlaingtharya (West) Township',
  'Hlaing Tharyar East Township','Hlaing Tharyar West Township',
  'Kyeemyindaing Township','Kyimyindaing Township',
  'Mingalartaungnyunt Township','Minglartaungnyunt Township','Mingala Taungnyunt Township'
);

update public.be_delivery_location_registry r
set township=case
  when public.be_data_entry_destination_key_v17(r.township)='လှိုင်သာယာ' then 'လှိုင်သာယာ'
  when public.be_data_entry_destination_key_v17(r.township)='ကြည့်မြင်တိုင်' then 'ကြည့်မြင်တိုင်'
  when public.be_data_entry_destination_key_v17(r.township)='မင်္ဂလာတောင်ညွန့်' then 'မင်္ဂလာတောင်ညွန့်'
  else r.township
end,
updated_at=now()
where r.township in (
  'Hlaingtharya(East) Township','Hlaingtharya (East) Township',
  'Hlaingtharya(West) Township','Hlaingtharya (West) Township',
  'Hlaing Tharyar East Township','Hlaing Tharyar West Township',
  'Kyeemyindaing Township','Kyimyindaing Township',
  'Mingalartaungnyunt Township','Minglartaungnyunt Township','Mingala Taungnyunt Township'
);
