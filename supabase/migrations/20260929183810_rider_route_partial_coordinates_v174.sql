
do $$
declare
  v_ddl text;
begin
  select pg_get_functiondef(p.oid)
    into v_ddl
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_rider_prepare_route_v77'
  limit 1;

  if v_ddl is null then
    raise exception 'be_rider_prepare_route_v77 was not found';
  end if;

  v_ddl := replace(
    v_ddl,
    $old$
  if exists(
    select 1 from public.be_rider_route_stop_state_v46
    where wayplan_id=v_wayplan and (latitude is null or longitude is null)
      and stop_status in ('PENDING','ARRIVED')
  ) then
    raise exception 'WAYPLAN_STOP_COORDINATES_INCOMPLETE: %',v_wayplan using errcode='22023';
  end if;
$old$,
    $new$
  -- V174: do not block the entire dispatched Wayplan just because another
  -- pending stop is still missing destination coordinates. Each stop is
  -- validated when the rider reaches that stop; stops with valid coordinates
  -- may continue normally. Missing stops can be corrected with the existing
  -- authenticated drop-off pin workflow.
$new$
  );

  execute v_ddl;
end
$$;
