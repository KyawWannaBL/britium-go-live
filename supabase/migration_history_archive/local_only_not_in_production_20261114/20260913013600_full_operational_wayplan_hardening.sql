-- Production hardening for Full Operational Wayplan.
-- Direct table access is intentionally removed; application access is through audited RPCs.

revoke all on table public.be_wayplan_route_versions_v1 from authenticated,anon;
revoke all on table public.be_wayplan_route_version_stops_v1 from authenticated,anon;
revoke all on table public.be_wayplan_warehouse_loading_snapshots_v1 from authenticated,anon;
revoke all on table public.be_wayplan_stop_events_v1 from authenticated,anon;

create or replace function public.be_wayplan_operational_crew_guard_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  v_driver text:=upper(nullif(btrim(coalesce(new.driver_code,'')),''));
  v_rider text:=upper(nullif(btrim(coalesce(new.rider_code,'')),''));
  v_helper text:=upper(nullif(btrim(coalesce(new.helper_code,'')),''));
  v_active boolean:=upper(coalesce(new.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED');
begin
  if v_driver is not null and v_rider is not null and v_driver=v_rider then
    raise exception using errcode='23514',message='Driver and Rider must be different workforce members.';
  end if;
  if v_driver is not null and v_helper is not null and v_driver=v_helper then
    raise exception using errcode='23514',message='Driver and Helper must be different workforce members.';
  end if;
  if v_rider is not null and v_helper is not null and v_rider=v_helper then
    raise exception using errcode='23514',message='Rider and Helper must be different workforce members.';
  end if;

  if v_active then
    if v_driver is not null and exists(
      select 1 from public.be_wayplan_dispatches d
      where d.wayplan_id<>new.wayplan_id
        and upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
        and v_driver in (upper(coalesce(d.driver_code,'')),upper(coalesce(d.rider_code,'')),upper(coalesce(d.helper_code,'')))
    ) then raise exception using errcode='23514',message='Driver is already allocated to another active Wayplan.'; end if;

    if v_rider is not null and exists(
      select 1 from public.be_wayplan_dispatches d
      where d.wayplan_id<>new.wayplan_id
        and upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
        and v_rider in (upper(coalesce(d.driver_code,'')),upper(coalesce(d.rider_code,'')),upper(coalesce(d.helper_code,'')))
    ) then raise exception using errcode='23514',message='Rider is already allocated to another active Wayplan.'; end if;

    if v_helper is not null and exists(
      select 1 from public.be_wayplan_dispatches d
      where d.wayplan_id<>new.wayplan_id
        and upper(coalesce(d.wayplan_status,'PLANNED')) not in ('CANCELLED','COMPLETED','CLOSED')
        and v_helper in (upper(coalesce(d.driver_code,'')),upper(coalesce(d.rider_code,'')),upper(coalesce(d.helper_code,'')))
    ) then raise exception using errcode='23514',message='Helper is already allocated to another active Wayplan.'; end if;
  end if;
  return new;
end $$;

revoke all on function public.be_wayplan_operational_crew_guard_v1() from public,anon,authenticated;

drop trigger if exists trg_be_wayplan_operational_crew_guard_v1 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_operational_crew_guard_v1
before insert or update of driver_code,rider_code,helper_code,wayplan_status
on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_operational_crew_guard_v1();
