-- Full Operational Wayplan V1 integrity hardening for the canonical 03000-03300 schema.

create or replace function public.be_wayplan_distinct_rider_helper_guard()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
declare
  d text:=upper(btrim(coalesce(new.driver_code,'')));
  r text:=upper(btrim(coalesce(new.rider_code,'')));
  h text:=upper(btrim(coalesce(new.helper_code,'')));
begin
  if d<>'' and r<>'' and d=r then raise exception using errcode='23514',message='Driver and Rider must be different people on one Wayplan.'; end if;
  if d<>'' and h<>'' and d=h then raise exception using errcode='23514',message='Driver and Helper must be different people on one Wayplan.'; end if;
  if r<>'' and h<>'' and r=h then raise exception using errcode='23514',message='Rider and Helper must be different people on one Wayplan.'; end if;
  return new;
end $$;

create or replace function public.be_wayplan_active_rider_guard_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if nullif(btrim(coalesce(new.rider_code,'')),'') is not null
     and upper(coalesce(new.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED')
     and exists(
       select 1 from public.be_wayplan_dispatches d
       where d.id<>new.id
         and upper(coalesce(d.rider_code,''))=upper(new.rider_code)
         and upper(coalesce(d.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED')
     ) then
    raise exception using errcode='23514',message='Selected Rider already has another active Wayplan.';
  end if;
  return new;
end $$;

drop trigger if exists trg_be_wayplan_active_rider_guard_v1 on public.be_wayplan_dispatches;
create trigger trg_be_wayplan_active_rider_guard_v1
before insert or update of rider_code,wayplan_status on public.be_wayplan_dispatches
for each row execute function public.be_wayplan_active_rider_guard_v1();

create or replace function public.be_wayplan_route_event_immutable_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  raise exception using errcode='55000',message='Wayplan route event history is immutable.';
end $$;

drop trigger if exists trg_be_wayplan_route_stop_events_immutable_v1 on public.be_wayplan_route_stop_events_v1;
create trigger trg_be_wayplan_route_stop_events_immutable_v1
before update or delete on public.be_wayplan_route_stop_events_v1
for each row execute function public.be_wayplan_route_event_immutable_v1();

-- Delivery may also be completed through the existing proof-controlled delivery workflow.
-- Capture it once in the immutable route event stream without weakening that proof workflow.
create or replace function public.be_wayplan_delivery_route_event_audit_v1()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_route integer;
  v_original integer;
  v_active integer;
  v_actor text;
begin
  if upper(coalesce(new.stop_status,new.rider_status,''))='DELIVERED'
     and upper(coalesce(old.stop_status,old.rider_status,''))<>'DELIVERED' then
    select coalesce(active_route_version,generated_route_version) into v_route
    from public.be_wayplan_dispatches where wayplan_id=new.wayplan_id;
    if v_route is not null and not exists(
      select 1 from public.be_wayplan_route_stop_events_v1 e
      where e.wayplan_id=new.wayplan_id and e.delivery_way_id=new.delivery_way_id and e.event_type='DELIVERED'
    ) then
      v_original:=coalesce(nullif(new.metadata->>'generated_delivery_sequence','')::integer,new.stop_sequence);
      select coalesce((x.value->>'sequence')::integer,x.ordinality::integer) into v_active
      from public.be_wayplan_route_versions_v1 r,
           jsonb_array_elements(r.ordered_stops) with ordinality x(value,ordinality)
      where r.wayplan_id=new.wayplan_id and r.route_version=v_route and x.value->>'delivery_way_id'=new.delivery_way_id
      limit 1;
      v_actor:=coalesce(new.metadata->>'confirmed_by_workforce_code',new.metadata->>'last_rider_action_by',new.rider_code);
      insert into public.be_wayplan_route_stop_events_v1(
        wayplan_id,delivery_way_id,route_version,original_sequence,active_sequence,event_type,actor_code,actor_role,metadata
      ) values(
        new.wayplan_id,new.delivery_way_id,v_route,v_original,v_active,'DELIVERED',v_actor,'rider',
        jsonb_build_object('source','existing_delivery_proof_workflow','delivered_at',new.delivered_at,'proof_url',new.rider_proof_url)
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_be_wayplan_delivery_route_event_audit_v1 on public.be_wayplan_dispatch_stops;
create trigger trg_be_wayplan_delivery_route_event_audit_v1
after update of stop_status,rider_status on public.be_wayplan_dispatch_stops
for each row execute function public.be_wayplan_delivery_route_event_audit_v1();
