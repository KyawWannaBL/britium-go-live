do $patch$
declare s text;
old_part text := $old$
    perform public.be_rider_prepare_route_v77(v_wayplan,v_code);

    v_result:=public.be_field_team_delivery_action(
$old$;
new_part text := $new$
    -- A prepared, current versioned route must not be rebuilt on every stop.
    -- The authoritative delivery action below still checks the signed-in
    -- worker's assignment, dispatch scan, and allowed status transition.
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
      perform public.be_rider_prepare_route_v77(v_wayplan,v_code);
    end if;

    v_result:=public.be_field_team_delivery_action(
$new$;
begin
select pg_get_functiondef(oid) into s from pg_proc where proname='be_field_team_delivery_action_v77';
if s is null then raise exception 'MISSING_ACTION_V77'; end if;
if (length(s)-length(replace(s,old_part,'')))/length(old_part)<>1 then raise exception 'UNEXPECTED_V77_BODY';end if;
s:=replace(s,old_part,new_part);
execute s;
end $patch$;