-- Enforce a practical Yangon delivery-van operating ceiling across every Wayplan creation path.
-- Normal target remains 50+ parcels; automatic planner uses 50-75 parcels per van.

create or replace function public.be_guard_pragmatic_yangon_wayplan_capacity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if upper(coalesce(new.branch_code,''))='YGN'
     and upper(coalesce(new.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED')
     and coalesce(new.total_stops,new.total_parcels,0)>75 then
    raise exception using
      errcode='23514',
      message='Yangon delivery Wayplans are limited to 75 parcels per delivery van. Split the route across additional vans.';
  end if;
  return new;
end $$;

revoke all on function public.be_guard_pragmatic_yangon_wayplan_capacity() from public,anon,authenticated;

drop trigger if exists trg_be_pragmatic_yangon_wayplan_capacity on public.be_wayplan_dispatches;
create trigger trg_be_pragmatic_yangon_wayplan_capacity
before insert or update of branch_code,wayplan_status,total_stops,total_parcels
on public.be_wayplan_dispatches
for each row execute function public.be_guard_pragmatic_yangon_wayplan_capacity();
