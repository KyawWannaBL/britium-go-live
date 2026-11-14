do $patch$
declare src text;
old_fragment text := $old$
  perform public.be_rider_prepare_route_v77(v_wayplan,v_worker);

  if not exists(
$old$;
new_fragment text := $new$
  -- Reuse a current, already prepared route to avoid costly rebuilds when
  -- acquiring arrival GPS for a dispatched stop.
  if not exists (
    select 1
    from public.be_rider_route_runs_v46 rr
    join public.be_rider_route_stop_state_v46 rs
      on rs.wayplan_id=rr.wayplan_id and rs.delivery_way_id=v_way
    where rr.wayplan_id=v_wayplan
      and rr.route_version=(
        select max(rv.route_version)
        from public.be_wayplan_route_version_stops_v1 rv
        where rv.wayplan_id=v_wayplan
      )
  ) then
    perform public.be_rider_prepare_route_v77(v_wayplan,v_worker);
  end if;

  if not exists(
$new$;
begin
select pg_get_functiondef(oid) into src from pg_proc where proname='be_rider_arrive_customer_v77';
if src is null or (length(src)-length(replace(src,old_fragment,'')))/length(old_fragment) <> 1 then
 raise exception 'ARRIVAL_FUNCTION_GUARD_FAILED';
end if;
execute replace(src,old_fragment,new_fragment);
end $patch$;