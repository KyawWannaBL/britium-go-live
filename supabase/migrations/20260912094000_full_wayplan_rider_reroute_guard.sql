-- Harden Full Operational Wayplan rerouting without changing the immutable warehouse snapshot.

create or replace function public.be_wayplan_append_route_version(
  p_wayplan_id text,p_route_kind text,p_optimizer_source text,p_route_mode text,p_ordered_stops jsonb,
  p_distance_m bigint default 0,p_duration_s bigint default 0,p_request_count integer default 0,
  p_actor text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_kind text:=upper(btrim(coalesce(p_route_kind,'')));
  v_source text:=upper(btrim(coalesce(p_optimizer_source,'')));
  v_mode text:=upper(btrim(coalesce(p_route_mode,'')));
  v_version int; v_count int; v_expected int;
  v_ids text[]; v_expected_ids text[]; v_origin jsonb:='{}'::jsonb; v_lifo jsonb;
  v_actor text:=coalesce(nullif(p_actor,''),auth.jwt()->>'email',auth.uid()::text);
  v_branch text;
begin
  if v_kind not in ('GENERATED','RIDER_REROUTE') then raise exception 'Invalid route kind.'; end if;
  if v_source not in ('GOOGLE_ROUTES','MAPBOX_FALLBACK','GEOGRAPHIC_FALLBACK') then raise exception 'Invalid optimizer source.'; end if;
  if jsonb_typeof(p_ordered_stops)<>'array' or jsonb_array_length(p_ordered_stops)=0 then raise exception 'Ordered route stops are required.'; end if;

  select branch_code into v_branch from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id for update;
  if not found then raise exception 'Wayplan not found.'; end if;

  select count(*),array_agg(id order by id) into v_count,v_ids
  from (select value->>'delivery_way_id' id from jsonb_array_elements(p_ordered_stops)) q;
  if exists(select 1 from (select value->>'delivery_way_id' id,count(*) c from jsonb_array_elements(p_ordered_stops) group by 1 having count(*)>1) d) then
    raise exception 'Route contains duplicate parcel IDs.';
  end if;
  if exists(select 1 from jsonb_array_elements(p_ordered_stops) x where not exists(select 1 from public.be_wayplan_dispatch_stops s where s.wayplan_id=p_wayplan_id and s.delivery_way_id=x.value->>'delivery_way_id')) then
    raise exception 'Route contains a parcel outside this Wayplan.';
  end if;

  if v_kind='GENERATED' then
    select count(*),array_agg(delivery_way_id order by delivery_way_id) into v_expected,v_expected_ids
    from public.be_wayplan_dispatch_stops where wayplan_id=p_wayplan_id;
    if v_count<>v_expected or v_ids is distinct from v_expected_ids then
      raise exception 'Generated route must contain every Wayplan stop exactly once.';
    end if;
  else
    select count(*),array_agg(delivery_way_id order by delivery_way_id) into v_expected,v_expected_ids
    from public.be_wayplan_dispatch_stops
    where wayplan_id=p_wayplan_id
      and upper(coalesce(stop_status,rider_status,'')) not in ('DELIVERED','RTO','RETURN_TO_WAREHOUSE','SKIP','SKIPPED','RESCHEDULE','RESCHEDULED','CUSTOMER_UNAVAILABLE','FAILED_DELIVERY','CANCELLED');
    if v_expected=0 then raise exception 'No eligible remaining stops are available for Rider rerouting.'; end if;
    if v_count<>v_expected or v_ids is distinct from v_expected_ids then
      raise exception 'Rider reroute must contain every remaining eligible stop exactly once and no completed/skipped stop.';
    end if;
  end if;

  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions where wayplan_id=p_wayplan_id;
  select coalesce(to_jsonb(b),'{}'::jsonb) into v_origin
  from (
    select branch_code,branch_name label,lat latitude,lng longitude
    from public.be_branch_offices
    where branch_code=v_branch and coalesce(active,true)=true and lat is not null and lng is not null
    order by is_head_office desc nulls last,updated_at desc nulls last limit 1
  ) b;

  insert into public.be_wayplan_route_versions(wayplan_id,route_version,route_kind,optimizer_source,route_mode,origin,ordered_stops,distance_m,duration_s,request_count,generated_by,metadata)
  values(p_wayplan_id,v_version,v_kind,v_source,v_mode,v_origin,p_ordered_stops,greatest(coalesce(p_distance_m,0),0),greatest(coalesce(p_duration_s,0),0),greatest(coalesce(p_request_count,0),0),v_actor,coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('warehouse_route_regenerated',false));

  insert into public.be_wayplan_active_routes(wayplan_id,current_route_version,updated_by)
  values(p_wayplan_id,v_version,v_actor)
  on conflict(wayplan_id) do update set current_route_version=excluded.current_route_version,updated_at=now(),updated_by=excluded.updated_by;

  update public.be_wayplan_dispatches
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('current_route_version',v_version,'current_route_source',v_source,'current_route_mode',v_mode),updated_at=now()
  where wayplan_id=p_wayplan_id;

  if v_kind='GENERATED' then
    select coalesce(jsonb_agg(value order by ord desc),'[]'::jsonb) into v_lifo
    from jsonb_array_elements(p_ordered_stops) with ordinality x(value,ord);
    insert into public.be_wayplan_warehouse_route_snapshots(wayplan_id,generated_route_version,delivery_order,lifo_load_order,locked_by,metadata)
    values(p_wayplan_id,v_version,p_ordered_stops,v_lifo,v_actor,jsonb_build_object('optimizer_source',v_source,'route_mode',v_mode,'immutable',true))
    on conflict(wayplan_id) do nothing;
    update public.be_wayplan_dispatches
    set warehouse_metadata=coalesce(warehouse_metadata,'{}'::jsonb)||jsonb_build_object('generated_route_version',v_version,'warehouse_route_locked',true,'warehouse_load_strategy','LIFO')
    where wayplan_id=p_wayplan_id;
  end if;

  return jsonb_build_object('ok',true,'wayplan_id',p_wayplan_id,'route_version',v_version,'route_kind',v_kind,'optimizer_source',v_source,'route_mode',v_mode,'warehouse_route_regenerated',false);
end $$;
revoke all on function public.be_wayplan_append_route_version(text,text,text,text,jsonb,bigint,bigint,integer,text,jsonb) from public,anon;
grant execute on function public.be_wayplan_append_route_version(text,text,text,text,jsonb,bigint,bigint,integer,text,jsonb) to authenticated;
