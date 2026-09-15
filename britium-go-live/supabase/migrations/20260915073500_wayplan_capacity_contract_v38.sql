-- V38: make the 50-75 delivery-van contract authoritative for every planning mode.
-- The V2 generator retains the proven transactional save path; V3 adds mandatory
-- capacity/approval validation before delegating to it.

create or replace function public.be_generate_multi_van_v3(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  plans jsonb := p_payload->'plans';
  p jsonb;
  n integer;
  short_count integer := 0;
  reason text := btrim(coalesce(p_payload->>'below_minimum_reason',''));
  approved boolean := coalesce((p_payload->>'approve_below_minimum')::boolean, false);
begin
  if plans is null or jsonb_typeof(plans) <> 'array' or jsonb_array_length(plans) < 1 then
    raise exception 'At least one delivery van plan is required.';
  end if;

  for p in select value from jsonb_array_elements(plans)
  loop
    if p->'delivery_way_ids' is null or jsonb_typeof(p->'delivery_way_ids') <> 'array' then
      raise exception 'Each activated van needs parcels.';
    end if;

    n := jsonb_array_length(p->'delivery_way_ids');
    if n < 1 then
      raise exception 'Each activated van needs parcels.';
    end if;
    if n > 75 then
      raise exception 'A delivery van cannot exceed 75 parcels.';
    end if;
    if n < 50 then
      short_count := short_count + 1;
    end if;
  end loop;

  if short_count > 1 then
    raise exception 'Only one delivery van may be below 50 parcels.';
  end if;

  if short_count = 1 and (approved is not true or length(reason) < 5) then
    raise exception 'Operator approval and a reason are required.';
  end if;

  return public.be_generate_multi_van_v2(p_payload);
end
$function$;

revoke all on function public.be_generate_multi_van_v3(jsonb) from public;
grant execute on function public.be_generate_multi_van_v3(jsonb) to authenticated;
