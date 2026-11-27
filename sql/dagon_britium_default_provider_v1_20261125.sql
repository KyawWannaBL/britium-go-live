-- Default the four Dagon townships to BRITIUM, including Seikkan aliases.
-- Suggestion only: preserves existing overrides, wayplan, tariffs, custody and Finance.
-- Remote areas may use an authorized ROYAL EXPRESS correction request.
CREATE OR REPLACE FUNCTION public.be_data_entry_service_provider_route_v17(p_township text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text := public.be_data_entry_destination_key_v17(p_township);
  v_provider_code text;
  v_reason text := 'UNRESOLVED';
  v_destination_name text;
begin

  -- Four Dagon service townships default to BRITIUM.
  -- Specific remote-area Royal service is an audited provider override.
  if v_key = any(array[
    'တောင်ဒဂုံ','မြောက်ဒဂုံ','အရှေ့ဒဂုံ','ဒဂုံဆိပ်ကမ်း',
    'ဒဂုံသစ်ဆိပ်ကမ်း','ဒဂုံမြို့သစ်ဆိပ်ကမ်း',
    'southdagon','northdagon','eastdagon','dagonseikkan'
  ]::text[]) then
    return jsonb_build_object(
      'provider_code','BRITIUM',
      'reason','DAGON_BRITIUM_DEFAULT',
      'destination_key',v_key,
      'matched_destination',p_township
    );
  end if;

  -- MDY_EXPLICIT_AREA_RATE_V1
  select t.destination_name into v_destination_name
  from public.be_data_entry_tariff_catalog t
  join public.be_data_entry_service_providers p on p.provider_code=t.provider_code and p.is_active
  where t.is_active and t.provider_code='MDY BRANCH'
    and t.source_file='MDY_APPROVED_MANUAL_AREAS_6487f3c1'
    and (public.be_data_entry_destination_key_v17(t.destination_key)=v_key or public.be_data_entry_destination_key_v17(t.destination_name)=v_key)
  limit 1;
  if found then
    return jsonb_build_object('provider_code','MDY BRANCH','reason','MANDALAY_BRANCH_SERVICE_AREA','destination_key',v_key,'matched_destination',v_destination_name,'selection_mode','EXPLICIT_AREA_RATE');
  end if;
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
    v_provider_code := 'MDY BRANCH';
    v_reason := 'MANDALAY_BRANCH_SERVICE_AREA';
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
      when 'MDY BRANCH' then 2
      when 'DK DELIVERY' then 3
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
$function$

