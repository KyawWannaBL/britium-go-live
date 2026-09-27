-- V157: Motor Bike and Bicycle are reusable delivery vehicle TYPES.
-- Do not reserve the generic type code as a single physical fleet asset.
-- Rider uniqueness remains enforced for active DISPATCHED / ON_HOLD routes.

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_generate_multi_van_v43'
  limit 1;
  if v_def is null then raise exception 'be_generate_multi_van_v43 not found'; end if;

  v_old := '    key:=wave_no::text||'':''||(p->>''vehicle_code''); if key=any(van_keys) then raise exception ''A fleet cannot run two routes in the same wave.''; end if; van_keys:=array_append(van_keys,key);';
  v_new := '    if vehicle_mode<>''RIDER_ONLY'' then
      key:=wave_no::text||'':''||(p->>''vehicle_code'');
      if key=any(van_keys) then raise exception ''A fleet cannot run two routes in the same wave.''; end if;
      van_keys:=array_append(van_keys,key);
    end if;';
  if position(v_old in v_def)=0 then raise exception 'V157 vehicle-wave anchor changed'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_old := '        if exists(select 1 from jsonb_array_elements(ctx->''busy'') b where b->>''vehicle_code''=p->>''vehicle_code'' or b->>''rider_code''=p->>''rider_code'') then raise exception ''The selected Motor Bike/Bicycle or Rider is active on another dispatched/on-hold Wayplan. Refresh availability.''; end if;';
  v_new := '        if exists(select 1 from jsonb_array_elements(ctx->''busy'') b where b->>''rider_code''=p->>''rider_code'') then raise exception ''The selected Rider is active on another dispatched/on-hold Wayplan. Choose another Rider or complete/cancel the active route first.''; end if;';
  if position(v_old in v_def)=0 then raise exception 'V157 rider-only busy anchor changed'; end if;
  v_def:=replace(v_def,v_old,v_new);

  v_def:=replace(v_def,'WAYPLAN_RIDER_NO_MINIMUM_V84','WAYPLAN_MOBILITY_TYPE_AVAILABILITY_V157');
  execute v_def;
end
$patch$;

comment on function public.be_generate_multi_van_v43(jsonb)
is 'V157: Motor Bike/Bicycle are reusable vehicle types; active Rider uniqueness is enforced independently.';
