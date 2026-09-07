begin;

-- Data Entry V17 makes service-provider assignment deterministic at the same
-- backend boundary used by Calculate, Save, and Save All. The client mirrors
-- these rules for immediate feedback, but the database remains authoritative.

insert into public.be_data_entry_service_providers(
  provider_code,display_name,provider_type,is_active,updated_at
) values
  ('NPT BRANCH','NPT Branch','BRANCH',true,now()),
  ('DK DELIVERY','DK Delivery','OUTSOURCE',true,now()),
  ('ROYAL EXPRESS','Royal Express','OUTSOURCE',true,now())
on conflict(provider_code) do update set
  display_name=excluded.display_name,
  provider_type=excluded.provider_type,
  is_active=true,
  updated_at=now();

-- The prices come from the existing approved Mandalay/Naypyitaw 6,000/5,000
-- rate card. On conflict, retain any newer approved price while correcting the
-- provider and route metadata.
insert into public.be_data_entry_tariff_catalog(
  destination_key,destination_name,original_label,
  standard_rate_mmk,special_rate_mmk,rack_code,provider_code,
  is_active,source_file,updated_at
) values
  ('အောင်မြေသာစံ','အောင်မြေသာစံ','DK Delivery · အောင်မြေသာစံ',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('ချမ်းအေးသာစံ','ချမ်းအေးသာစံ','DK Delivery · ချမ်းအေးသာစံ',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('မဟာအောင်မြေ','မဟာအောင်မြေ','DK Delivery · မဟာအောင်မြေ',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('ချမ်းမြသာစည်','ချမ်းမြသာစည်','DK Delivery · ချမ်းမြသာစည်',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('ပြည်ကြီးတံခွန်','ပြည်ကြီးတံခွန်','DK Delivery · ပြည်ကြီးတံခွန်',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('အမရပူရ','အမရပူရ','DK Delivery · အမရပူရ',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('ပုသိမ်ကြီး','ပုသိမ်ကြီး','DK Delivery · ပုသိမ်ကြီး',6000,5000,'4D','DK DELIVERY',true,'data_entry_service_provider_routing_v17',now()),
  ('ဇမ္ဗူသီရိ','ဇမ္ဗူသီရိ','NPT Branch · ဇမ္ဗူသီရိ',6000,5000,'4D','NPT BRANCH',true,'data_entry_service_provider_routing_v17',now()),
  ('ပျဉ်းမနား','ပျဉ်းမနား','NPT Branch · ပျဉ်းမနား',6000,5000,'4D','NPT BRANCH',true,'data_entry_service_provider_routing_v17',now()),
  ('ဇေယျာသီရိ','ဇေယျာသီရိ','NPT Branch · ဇေယျာသီရိ',6000,5000,'4D','NPT BRANCH',true,'data_entry_service_provider_routing_v17',now()),
  ('ဒက္ခိဏသီရိ','ဒက္ခိဏသီရိ','NPT Branch · ဒက္ခိဏသီရိ',6000,5000,'4D','NPT BRANCH',true,'data_entry_service_provider_routing_v17',now()),
  ('ပုဗ္ဗသီရိ','ပုဗ္ဗသီရိ','NPT Branch · ပုဗ္ဗသီရိ',6000,5000,'4D','NPT BRANCH',true,'data_entry_service_provider_routing_v17',now()),
  ('ဥတ္တရသီရိ','ဥတ္တရသီရိ','NPT Branch · ဥတ္တရသီရိ',6000,5000,'4D','NPT BRANCH',true,'data_entry_service_provider_routing_v17',now()),
  ('တပ်ကုန်း','တပ်ကုန်း','Royal Express · တပ်ကုန်း',6000,null,'R','ROYAL EXPRESS',true,'data_entry_service_provider_routing_v17',now()),
  ('လယ်ဝေး','လယ်ဝေး','Royal Express · လယ်ဝေး',6000,null,'R','ROYAL EXPRESS',true,'data_entry_service_provider_routing_v17',now())
on conflict(destination_key) do update set
  destination_name=excluded.destination_name,
  original_label=excluded.original_label,
  rack_code=excluded.rack_code,
  provider_code=excluded.provider_code,
  is_active=true,
  source_file=excluded.source_file,
  updated_at=now();

update public.be_data_entry_tariff_catalog
set provider_code='DK DELIVERY',is_active=true,
    source_file='data_entry_service_provider_routing_v17',updated_at=now()
where destination_key='မန္တလေး';

update public.be_data_entry_tariff_catalog
set provider_code='NPT BRANCH',is_active=true,
    source_file='data_entry_service_provider_routing_v17',updated_at=now()
where destination_key='နေပြည်တော်';

create or replace function public.be_data_entry_destination_key_v17(p_value text)
returns text
language sql
immutable
parallel safe
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
    else destination_key
  end
  from normalized;
$function$;

revoke all on function public.be_data_entry_destination_key_v17(text)
from public, anon, authenticated;
grant execute on function public.be_data_entry_destination_key_v17(text)
to service_role;

create or replace function public.be_data_entry_service_provider_route_v17(p_township text)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_key text := public.be_data_entry_destination_key_v17(p_township);
  v_provider_code text;
  v_reason text := 'UNRESOLVED';
  v_destination_name text;
begin
  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,
      'reason',v_reason,
      'destination_key',v_key,
      'matched_destination',null
    );
  end if;

  if v_key = any(array['tatkon','တပ်ကုန်း','lewe','leway','လယ်ဝေး']::text[]) then
    v_provider_code := 'ROYAL EXPRESS';
    v_reason := 'NAYPYITAW_EXCEPTION_ROYAL';
  elsif v_key = any(array[
    'mandalay','မန္တလေး',
    'aungmyaythazan','aungmyaytharzan','အောင်မြေသာစံ',
    'chanayethazan','chanayetharzan','ချမ်းအေးသာစံ',
    'mahaaungmyay','မဟာအောင်မြေ',
    'chanmyathazi','chanmyatharsi','ချမ်းမြသာစည်',
    'pyigyitagon','ပြည်ကြီးတံခွန်',
    'amarapura','အမရပူရ',
    'patheingyi','ပုသိမ်ကြီး'
  ]::text[]) then
    v_provider_code := 'DK DELIVERY';
    v_reason := 'MANDALAY_DK_SERVICE_AREA';
  elsif v_key = any(array[
    'naypyitaw','naypyidaw','နေပြည်တော်',
    'zabuthiri','ဇမ္ဗူသီရိ',
    'pyinmana','ပျဉ်းမနား',
    'zayyarthiri','zeyathiri','ဇေယျာသီရိ',
    'detkhinathiri','dekkhinathiri','ဒက္ခိဏသီရိ',
    'pokebathiri','pobbathiri','ပုဗ္ဗသီရိ',
    'oketarathiri','ottarathiri','ဥတ္တရသီရိ'
  ]::text[]) then
    v_provider_code := 'NPT BRANCH';
    v_reason := 'NAYPYITAW_BRANCH_SERVICE_AREA';
  else
    select t.provider_code,t.destination_name
    into v_provider_code,v_destination_name
    from public.be_data_entry_tariff_catalog t
    join public.be_data_entry_service_providers p
      on p.provider_code=t.provider_code and p.is_active
    where t.is_active
      and (
        public.be_data_entry_destination_key_v17(t.destination_key)=v_key
        or public.be_data_entry_destination_key_v17(t.destination_name)=v_key
      )
    order by case t.provider_code
      when 'BRITIUM' then 0
      when 'NPT BRANCH' then 1
      when 'DK DELIVERY' then 2
      when 'ROYAL EXPRESS' then 3
      when 'GRS' then 4
      else 5
    end,t.updated_at desc
    limit 1;

    if v_provider_code='BRITIUM' then
      v_reason := 'EXACT_BRITIUM_ROUTE';
    elsif v_provider_code is not null then
      v_reason := 'EXACT_CONFIGURED_ROUTE';
    else
      v_provider_code := 'ROYAL EXPRESS';
      v_reason := 'OUTSIDE_BRITIUM_SERVICE_AREA';
    end if;
  end if;

  if v_destination_name is null then
    select t.destination_name
    into v_destination_name
    from public.be_data_entry_tariff_catalog t
    where t.is_active and t.provider_code=v_provider_code
      and (
        public.be_data_entry_destination_key_v17(t.destination_key)=v_key
        or public.be_data_entry_destination_key_v17(t.destination_name)=v_key
      )
    order by t.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'provider_code',v_provider_code,
    'reason',v_reason,
    'destination_key',v_key,
    'matched_destination',v_destination_name
  );
end
$function$;

revoke all on function public.be_data_entry_service_provider_route_v17(text)
from public, anon, authenticated;
grant execute on function public.be_data_entry_service_provider_route_v17(text)
to service_role;

-- A previous interrupted rollout may already have renamed the authoritative
-- calculator while leaving the V17 wrapper absent. Preserve that helper when
-- it exists so this migration is safe to retry and can repair that state.
do $block$
begin
  if to_regprocedure('public.be_data_entry_financial_v2_calculate_v13_2_legacy(jsonb)') is null then
    if to_regprocedure('public.be_data_entry_financial_v2_calculate(jsonb)') is null then
      raise exception 'Data Entry calculator is unavailable; cannot install V17 provider routing';
    end if;

    alter function public.be_data_entry_financial_v2_calculate(jsonb)
    rename to be_data_entry_financial_v2_calculate_v13_2_legacy;
  end if;
end
$block$;

create or replace function public.be_data_entry_financial_v2_calculate(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_route jsonb := public.be_data_entry_service_provider_route_v17(p_payload->>'township');
  v_provider_code text := nullif(v_route->>'provider_code','');
  v_requested_provider text := upper(nullif(btrim(coalesce(p_payload->>'service_provider_code','')),''));
  v_result jsonb;
  v_data jsonb;
  v_resolution jsonb;
  v_warnings jsonb;
begin
  if v_provider_code is not null then
    v_payload := jsonb_set(v_payload,'{service_provider_code}',to_jsonb(v_provider_code),true);
  end if;

  v_result := public.be_data_entry_financial_v2_calculate_v13_2_legacy(v_payload);
  v_data := coalesce(v_result->'data','{}'::jsonb)
    || jsonb_build_object('service_provider_code',v_provider_code);
  v_resolution := coalesce(v_result->'server_resolution','{}'::jsonb)
    || jsonb_build_object(
      'service_provider_code',v_provider_code,
      'service_provider_route',v_route,
      'client_service_provider_ignored',
        v_requested_provider is distinct from v_provider_code
    );
  v_warnings := coalesce(v_result->'warnings','[]'::jsonb);

  if v_requested_provider is not null
     and v_requested_provider is distinct from v_provider_code then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
      'code','SERVICE_PROVIDER_AUTO_CORRECTED',
      'message','The service provider was corrected from the authoritative township routing rule.',
      'requested_provider',v_requested_provider,
      'resolved_provider',v_provider_code
    ));
  end if;

  return v_result || jsonb_build_object(
    'build','DATA_ENTRY_PROVIDER_ROUTING_V17_20260903',
    'data',v_data,
    'server_resolution',v_resolution,
    'warnings',v_warnings
  );
end
$function$;

revoke all on function public.be_data_entry_financial_v2_calculate_v13_2_legacy(jsonb)
from public, anon, authenticated;
grant execute on function public.be_data_entry_financial_v2_calculate_v13_2_legacy(jsonb)
to service_role;
revoke all on function public.be_data_entry_financial_v2_calculate(jsonb)
from public, anon;
grant execute on function public.be_data_entry_financial_v2_calculate(jsonb)
to authenticated, service_role;

comment on function public.be_data_entry_financial_v2_calculate(jsonb) is
  'V17 authoritative provider routing: Mandalay city to DK, core Naypyitaw to NPT Branch, Tatkon/Lewe and non-Britium destinations to Royal.';

create or replace function public.be_data_entry_service_provider_options_v13()
returns jsonb
language sql
stable
security invoker
set search_path='public','pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_code',p.provider_code,
    'display_name',p.display_name,
    'provider_type',p.provider_type,
    'active_tariff_count',coalesce(c.active_tariff_count,0)
  ) order by case p.provider_code
      when 'BRITIUM' then 0
      when 'ROYAL EXPRESS' then 1
      when 'DK DELIVERY' then 2
      when 'NPT BRANCH' then 3
      when 'GRS' then 4
      else 5
    end,p.display_name
  ),'[]'::jsonb)
  from public.be_data_entry_service_providers p
  left join lateral (
    select count(*)::integer as active_tariff_count
    from public.be_data_entry_tariff_catalog t
    where t.provider_code=p.provider_code and t.is_active
  ) c on true
  where p.is_active and auth.uid() is not null;
$function$;

revoke all on function public.be_data_entry_service_provider_options_v13()
from public, anon;
grant execute on function public.be_data_entry_service_provider_options_v13()
to authenticated, service_role;

do $block$
declare
  v_case record;
  v_actual text;
begin
  for v_case in
    select * from (values
      ('ချမ်းအေးသာစံ','DK DELIVERY'),
      ('Chanayethazan Township','DK DELIVERY'),
      ('မန္တလေး','DK DELIVERY'),
      ('ဇမ္ဗူသီရိ','NPT BRANCH'),
      ('Pyinmana Township','NPT BRANCH'),
      ('နေပြည်တော်','NPT BRANCH'),
      ('တပ်ကုန်း','ROYAL EXPRESS'),
      ('Lewe Township','ROYAL EXPRESS'),
      ('မြောက်ဒဂုံ','BRITIUM'),
      ('Dagon Myothit (North) Township','BRITIUM'),
      ('Some Unsupported Township','ROYAL EXPRESS')
    ) as checks(township,expected_provider)
  loop
    v_actual := public.be_data_entry_service_provider_route_v17(v_case.township)->>'provider_code';
    if v_actual is distinct from v_case.expected_provider then
      raise exception 'V17 provider route failed for %: expected %, received %',
        v_case.township,v_case.expected_provider,v_actual;
    end if;
  end loop;
end
$block$;

commit;
