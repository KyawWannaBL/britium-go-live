create or replace function public.be_royal_tariff_destination_key_v1(p_name text)
returns text
language sql immutable
set search_path = pg_catalog
as $$
  select case cleaned
    when 'မော်ကျွန်း' then 'မော်လမြိုင်ကျွန်း'
    when 'mawgyun' then 'မော်လမြိုင်ကျွန်း'
    when 'mawlamyinegyun' then 'မော်လမြိုင်ကျွန်း'
    when 'athoke' then 'အသုတ်'
    when 'ahthoke' then 'အသုတ်'
    else cleaned end
  from (select regexp_replace(
    regexp_replace(lower(normalize(btrim(coalesce(p_name,'')))), '[[:space:]()（）.,၊။/|·_​﻿-]+', '', 'g'),
    '(royalexpress|royal|မြို့နယ်|မြို့)+$', ''
  ) as cleaned) k;
$$;

-- Athoke is already listed as a town in the portal's Myanmar location master.
-- Register only its location identity here. The rate is entered separately.
insert into public.be_tariff_location_alias_v61_7_1(
  normalized_alias,alias_value,location_key,location_kind,canonical_label
)
select distinct on (normalized) normalized,label,'APPROVED:အသုတ်','SERVICE_POINT','အသုတ်'
from (
  select public.be_financial_v2_normalize_township_text_v61_7(label) normalized,label
  from unnest(array['အသုတ်','အသုတ် မြို့','အသုတ် (Royal)','Athoke','Athoke (Royal)',
    'Ahthoke','Ahthoke (Royal)','Ahthoke Town']) as aliases(label)
) a
order by normalized,label
on conflict (normalized_alias) do nothing;

create or replace function public.be_royal_tariff_save_v1(
  p_action text, p_key text, p_name text, p_rate numeric
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_name text := btrim(regexp_replace(
    regexp_replace(normalize(coalesce(p_name,'')), '[[:space:]​﻿]+', ' ', 'g'),
    '[[:space:]]*([（(][[:space:]]*royal([[:space:]]+express)?[[:space:]]*[)）]|[-[:space:]]+royal([[:space:]]+express)?)[[:space:]]*$', '', 'i'));
  v_normalized text;
  v_key text;
  v_existing text;
  v_saved_name text;
  v_location_count integer;
begin
  if not public.be_tariff_manage_allowed_v1() then
    raise exception 'Tariff editing permission is required.' using errcode='42501';
  end if;
  if p_action is null or p_action not in ('ADD','SAVE','REMOVE') then
    raise exception 'Choose a valid tariff action.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('britium:royal-tariff-catalog', 0));
  if p_action <> 'ADD' then
    select destination_key,destination_name into v_key,v_saved_name
    from public.be_data_entry_tariff_catalog
    where destination_key=p_key and provider_code='ROYAL EXPRESS' for update;
    if not found then raise exception 'Royal Express tariff no longer exists. Refresh the list.'; end if;
  end if;
  if p_action = 'REMOVE' then
    if public.be_current_role() not in ('superadmin','super_admin') then
      raise exception 'Only Super Admin can deactivate a Royal Express tariff.' using errcode='42501';
    end if;
    return public.be_tariff_catalog_manage_v1('ROYAL EXPRESS','REMOVE',v_key,null,null);
  end if;

  v_normalized := public.be_royal_tariff_destination_key_v1(v_name);
  if length(v_normalized)<2 or length(v_name)>160 then
    raise exception 'Enter a destination name of 2–160 characters.';
  end if;
  if p_rate is null or p_rate::text in ('NaN','Infinity','-Infinity')
     or p_rate <= 0 or p_rate <> trunc(p_rate) or p_rate>9007199254740991 then
    raise exception 'Enter the confirmed Royal Express rate as a positive whole number in MMK.';
  end if;

  if p_action='SAVE' and public.be_royal_tariff_destination_key_v1(v_saved_name)<>v_normalized then
    raise exception 'Existing destination names are linked to Finance. Change the rate here or request a destination correction.';
  end if;

  select c.destination_name into v_existing
  from public.be_data_entry_tariff_catalog c
  where c.provider_code='ROYAL EXPRESS' and c.destination_key is distinct from v_key
    and public.be_royal_tariff_destination_key_v1(c.destination_name)=v_normalized
    and (p_action='ADD' or public.be_royal_tariff_destination_key_v1(v_saved_name)<>v_normalized)
  order by c.is_active desc, c.destination_key limit 1;
  if found then raise exception 'A Royal Express tariff already exists for %. Open that row to edit or reactivate it.',v_existing; end if;

  if p_action='ADD' then
    v_key := v_normalized || ' (royal)';
    if v_normalized='အသုတ်' then v_name:='အသုတ်'; end if;
    v_saved_name := v_name || ' (Royal)';
    if public.be_approved_tariff_lookup_key(v_saved_name) is null then
      -- A destination missing from the tariff index can be added when its
      -- township identity is unambiguous in the active location master.
      select count(*) into v_location_count from (
        select distinct lower(btrim(township)),lower(btrim(city)),lower(btrim(state_region))
        from public.master_locations
        where active is true and public.be_royal_tariff_destination_key_v1(township)=v_normalized
      ) locations;
      if v_location_count<>1 then
        raise exception 'The destination is missing or ambiguous in the location master. Use the registered town or township name, or ask an administrator to verify the location.';
      end if;
      insert into public.be_tariff_location_alias_v61_7_1(
        normalized_alias,alias_value,location_key,location_kind,canonical_label
      )
      select distinct on (normalized) normalized,label,'APPROVED:'||v_normalized,'TOWNSHIP',v_name
      from (
        select public.be_financial_v2_normalize_township_text_v61_7(label) normalized,label
        from unnest(array[v_name,v_saved_name]) as aliases(label)
      ) a
      order by normalized,label
      on conflict (normalized_alias) do nothing;
    end if;
  end if;
  return public.be_tariff_catalog_manage_v1('ROYAL EXPRESS',p_action,v_key,v_saved_name,p_rate);
end;
$$;

revoke all on function public.be_royal_tariff_save_v1(text,text,text,numeric) from public,anon;
grant execute on function public.be_royal_tariff_save_v1(text,text,text,numeric) to authenticated;
