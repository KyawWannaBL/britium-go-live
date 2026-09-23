-- V125: smooth Wayplan assignment without weakening route or capacity safety.
-- 1) Small routes with an assigned Rider are truly exempt from the below-50 approval in backend.
-- 2) Delivery vehicles must belong to the active branch.
-- 3) Restore 1H-6033 to PICKUP_HIGHWAY duty so it cannot be auto-selected for delivery Wayplans.

update public.be_master_data_rows
set payload = jsonb_set(coalesce(payload,'{}'::jsonb), '{operation_type}', '"PICKUP_HIGHWAY"'::jsonb, true),
    updated_at = now()
where dataset_key='fleet_master'
  and record_key='FLT011'
  and payload->>'vehicle_no'='1H-6033';

do $migration$
declare
  v_def text;
  v_old_short text := $old$
    n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated route needs parcels.'; end if;
    if n>75 then raise exception 'A delivery route cannot exceed 75 parcels.'; end if; total_count:=total_count+n; if n<50 then short_count:=short_count+1; end if;
$old$;
  v_new_short text := $new$
    n:=jsonb_array_length(p->'delivery_way_ids'); if n is null or n<1 then raise exception 'Each activated route needs parcels.'; end if;
    if n>75 then raise exception 'A delivery route cannot exceed 75 parcels.'; end if;
    total_count:=total_count+n;
    if n<50 and not (
      (crew_mode='ROSTER' and coalesce(p->>'rider_code','')<>'')
      or (crew_mode='EMERGENCY_MANUAL' and nullif(btrim(p->>'rider_name'),'') is not null)
    ) then
      short_count:=short_count+1;
    end if;
$new$;
  v_old_vehicle text := $old2$
    select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
    if v is null then raise exception 'Choose a delivery fleet; pickup/highway fleets are reserved.'; end if;
$old2$;
  v_new_vehicle text := $new2$
    select x into v from jsonb_array_elements(ctx->'vehicles') x where x->>'id'=p->>'vehicle_code' and x->>'operation_type'='DELIVERY';
    if v is null then raise exception 'Choose a delivery fleet; pickup/highway fleets are reserved.'; end if;
    if coalesce(v->>'branch_code','') not in ('',branch) then raise exception 'Selected delivery fleet belongs to another branch.'; end if;
$new2$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_generate_multi_van_v43'
  limit 1;

  if v_def is null then
    raise exception 'be_generate_multi_van_v43 was not found';
  end if;
  if position(v_old_short in v_def)=0 then
    raise exception 'V125 expected short-route block was not found';
  end if;
  if position(v_old_vehicle in v_def)=0 then
    raise exception 'V125 expected vehicle block was not found';
  end if;

  v_def := replace(v_def,v_old_short,v_new_short);
  v_def := replace(v_def,v_old_vehicle,v_new_vehicle);
  execute v_def;
end
$migration$;

comment on function public.be_generate_multi_van_v43(jsonb)
is 'V125: Rider-assisted sub-50 routes are exempt consistently; delivery fleet is branch-scoped; route, weight and road-source safety remain enforced.';
