-- Full Operational Wayplan V1: append-only generated/rider route versions and immutable warehouse loading snapshot.

create table if not exists public.be_wayplan_route_versions_v1 (
  wayplan_id text not null,
  route_version integer not null,
  route_kind text not null,
  route_source text not null,
  route_mode text not null,
  ordered_stops jsonb not null default '[]'::jsonb,
  distance_m bigint not null default 0,
  duration_s bigint not null default 0,
  request_count integer not null default 0,
  parent_route_version integer,
  generated_by text,
  generated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  primary key (wayplan_id, route_version)
);

create index if not exists be_wayplan_route_versions_v1_wayplan_idx
  on public.be_wayplan_route_versions_v1(wayplan_id, route_version desc);

create table if not exists public.be_wayplan_warehouse_route_snapshots_v1 (
  wayplan_id text primary key,
  generated_route_version integer not null,
  delivery_order jsonb not null default '[]'::jsonb,
  loading_order jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.be_wayplan_route_stop_events_v1 (
  id bigint generated always as identity primary key,
  wayplan_id text not null,
  delivery_way_id text not null,
  route_version integer,
  original_sequence integer,
  active_sequence integer,
  event_type text not null,
  actor_code text,
  actor_role text,
  event_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists be_wayplan_route_stop_events_v1_wayplan_idx
  on public.be_wayplan_route_stop_events_v1(wayplan_id, event_at desc);
create index if not exists be_wayplan_route_stop_events_v1_delivery_idx
  on public.be_wayplan_route_stop_events_v1(delivery_way_id, event_at desc);

alter table public.be_wayplan_dispatches
  add column if not exists generated_route_version integer,
  add column if not exists active_route_version integer;

create or replace function public.be_wayplan_route_history_immutable_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  raise exception using errcode='55000', message='Generated Wayplan route history is immutable. Create a new route version instead.';
end $$;

revoke all on function public.be_wayplan_route_history_immutable_v1() from public,anon,authenticated;

drop trigger if exists trg_be_wayplan_route_versions_immutable_v1 on public.be_wayplan_route_versions_v1;
create trigger trg_be_wayplan_route_versions_immutable_v1
before update or delete on public.be_wayplan_route_versions_v1
for each row execute function public.be_wayplan_route_history_immutable_v1();

drop trigger if exists trg_be_wayplan_warehouse_snapshot_immutable_v1 on public.be_wayplan_warehouse_route_snapshots_v1;
create trigger trg_be_wayplan_warehouse_snapshot_immutable_v1
before update or delete on public.be_wayplan_warehouse_route_snapshots_v1
for each row execute function public.be_wayplan_route_history_immutable_v1();

revoke insert,update,delete on public.be_wayplan_route_versions_v1 from public,anon,authenticated;
revoke insert,update,delete on public.be_wayplan_warehouse_route_snapshots_v1 from public,anon,authenticated;
revoke insert,update,delete on public.be_wayplan_route_stop_events_v1 from public,anon,authenticated;
grant select on public.be_wayplan_route_versions_v1 to authenticated;
grant select on public.be_wayplan_warehouse_route_snapshots_v1 to authenticated;
grant select on public.be_wayplan_route_stop_events_v1 to authenticated;

create or replace function public.be_wayplan_record_generated_route_v1(
  p_wayplan_id text,
  p_route jsonb default '{}'::jsonb,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_wayplan text:=nullif(btrim(coalesce(p_wayplan_id,'')),'');
  v_existing public.be_wayplan_warehouse_route_snapshots_v1%rowtype;
  v_version integer;
  v_delivery jsonb:='[]'::jsonb;
  v_loading jsonb:='[]'::jsonb;
  v_count integer:=0;
  v_source text:=upper(coalesce(nullif(p_route->>'source',''),'GEOGRAPHIC_FALLBACK'));
  v_mode text:=coalesce(nullif(p_route->>'route_mode',''),'GEOGRAPHIC_NEAREST_NEIGHBOUR_EMERGENCY');
  v_actor text:=coalesce(nullif(btrim(p_actor),''),auth.jwt()->>'email',auth.uid()::text,'system');
begin
  if v_wayplan is null then raise exception 'Wayplan ID is required.'; end if;

  select * into v_existing from public.be_wayplan_warehouse_route_snapshots_v1 where wayplan_id=v_wayplan;
  if found then
    return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_existing.generated_route_version,'duplicate',true);
  end if;

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'sequence',s.stop_sequence,
           'delivery_way_id',s.delivery_way_id,
           'waybill_no',s.waybill_no,
           'recipient_name',s.recipient_name,
           'recipient_phone',s.recipient_phone,
           'address',coalesce(s.delivery_address,s.address),
           'township',coalesce(s.delivery_township,s.recipient_township,s.township),
           'latitude',l.latitude,
           'longitude',l.longitude,
           'notes',coalesce(s.metadata->>'notes',s.warehouse_notes,''),
           'status',coalesce(s.stop_status,s.rider_status,s.dispatch_status,'PENDING')
         ) order by s.stop_sequence),'[]'::jsonb)
  into v_count,v_delivery
  from public.be_wayplan_dispatch_stops s
  left join public.be_delivery_location_registry l on l.delivery_way_id=s.delivery_way_id
  where s.wayplan_id=v_wayplan;

  if v_count=0 then raise exception 'Wayplan % has no dispatch stops.',v_wayplan; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'load_sequence',z.load_sequence,
    'delivery_sequence',z.stop_sequence,
    'delivery_way_id',z.delivery_way_id,
    'waybill_no',z.waybill_no,
    'recipient_name',z.recipient_name,
    'recipient_phone',z.recipient_phone,
    'address',z.address,
    'township',z.township,
    'parcel_weight_kg',z.parcel_weight_kg
  ) order by z.load_sequence),'[]'::jsonb)
  into v_loading
  from (
    select s.stop_sequence,s.delivery_way_id,s.waybill_no,s.recipient_name,s.recipient_phone,
           coalesce(s.delivery_address,s.address) address,
           coalesce(s.delivery_township,s.recipient_township,s.township) township,
           s.parcel_weight_kg,
           v_count-s.stop_sequence+1 as load_sequence
    from public.be_wayplan_dispatch_stops s
    where s.wayplan_id=v_wayplan
  ) z;

  select coalesce(max(route_version),0)+1 into v_version from public.be_wayplan_route_versions_v1 where wayplan_id=v_wayplan;

  insert into public.be_wayplan_route_versions_v1(
    wayplan_id,route_version,route_kind,route_source,route_mode,ordered_stops,
    distance_m,duration_s,request_count,parent_route_version,generated_by,metadata
  ) values (
    v_wayplan,v_version,'GENERATED',v_source,v_mode,v_delivery,
    greatest(coalesce(nullif(p_route->>'distance_m','')::bigint,0),0),
    greatest(coalesce(nullif(p_route->>'duration_s','')::bigint,0),0),
    greatest(coalesce(nullif(p_route->>'request_count','')::integer,0),0),
    null,v_actor,
    jsonb_build_object('fallback',coalesce((p_route->>'fallback')::boolean,false),'warning',p_route->>'warning','immutable',true)
  );

  insert into public.be_wayplan_warehouse_route_snapshots_v1(
    wayplan_id,generated_route_version,delivery_order,loading_order,created_by,metadata
  ) values (
    v_wayplan,v_version,v_delivery,v_loading,v_actor,
    jsonb_build_object('load_strategy','LIFO','immutable_generated_route',true,'route_source',v_source,'route_mode',v_mode)
  );

  update public.be_wayplan_dispatches
  set generated_route_version=v_version,
      active_route_version=v_version,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'generated_route_version',v_version,'active_route_version',v_version,
        'generated_route_source',v_source,'generated_route_mode',v_mode,
        'warehouse_route_immutable',true
      ),updated_at=now()
  where wayplan_id=v_wayplan;

  update public.be_wayplan_dispatch_stops s
  set metadata=coalesce(s.metadata,'{}'::jsonb)||jsonb_build_object(
        'generated_route_version',v_version,
        'generated_delivery_sequence',s.stop_sequence,
        'warehouse_lifo_load_sequence',v_count-s.stop_sequence+1
      ),
      warehouse_metadata=coalesce(s.warehouse_metadata,'{}'::jsonb)||jsonb_build_object(
        'generated_route_version',v_version,
        'delivery_sequence',s.stop_sequence,
        'lifo_load_sequence',v_count-s.stop_sequence+1,
        'load_strategy','LIFO',
        'immutable',true
      ),
      updated_at=now()
  where s.wayplan_id=v_wayplan;

  return jsonb_build_object('ok',true,'wayplan_id',v_wayplan,'route_version',v_version,'route_source',v_source,'route_mode',v_mode,'stop_count',v_count);
end $$;

revoke all on function public.be_wayplan_record_generated_route_v1(text,jsonb,text) from public,anon,authenticated;

-- Preserve already-active production Wayplans as an explicitly-labelled immutable pre-upgrade baseline.
do $$
declare r record;
begin
  for r in
    select d.wayplan_id
    from public.be_wayplan_dispatches d
    where upper(coalesce(d.wayplan_status,'CREATED')) not in ('CANCELLED','COMPLETED','CLOSED')
      and not exists(select 1 from public.be_wayplan_warehouse_route_snapshots_v1 w where w.wayplan_id=d.wayplan_id)
  loop
    perform public.be_wayplan_record_generated_route_v1(
      r.wayplan_id,
      jsonb_build_object(
        'source','LEGACY_PREDEPLOY_BASELINE',
        'route_mode','GEOGRAPHIC_NEAREST_FIRST_LEGACY',
        'fallback',true,
        'warning','Baseline captured at Full Operational Wayplan deployment; not represented as Google road optimized.'
      ),
      'production_upgrade_20260913'
    );
  end loop;
end $$;

create or replace function public.be_wayplan_lifo_manifest(p_wayplan_id text)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_role text;
  v_plan public.be_wayplan_dispatches%rowtype;
  v_snapshot public.be_wayplan_warehouse_route_snapshots_v1%rowtype;
  v_rows jsonb;
begin
  v_role:=lower(public.be_current_user_role());
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','warehouse') then
    raise exception using errcode='42501',message='Warehouse or Wayplan permission is required.';
  end if;

  select * into v_plan from public.be_wayplan_dispatches where wayplan_id=p_wayplan_id;
  if not found then raise exception 'Wayplan not found.'; end if;

  select * into v_snapshot from public.be_wayplan_warehouse_route_snapshots_v1 where wayplan_id=p_wayplan_id;
  if found then
    return jsonb_build_object(
      'ok',true,'wayplan_id',v_plan.wayplan_id,'vehicle_code',v_plan.vehicle_code,'vehicle_name',v_plan.vehicle_name,
      'branch_code',v_plan.branch_code,'total_stops',v_plan.total_stops,'load_strategy','LIFO',
      'generated_route_version',v_snapshot.generated_route_version,'immutable',true,'rows',v_snapshot.loading_order
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'load_sequence',coalesce((s.warehouse_metadata->>'lifo_load_sequence')::integer,v_plan.total_stops-s.stop_sequence+1),
    'delivery_sequence',s.stop_sequence,'delivery_way_id',s.delivery_way_id,'waybill_no',s.waybill_no,
    'township',s.township,'recipient_name',s.recipient_name,'address',s.address,'parcel_weight_kg',s.parcel_weight_kg
  ) order by coalesce((s.warehouse_metadata->>'lifo_load_sequence')::integer,v_plan.total_stops-s.stop_sequence+1)),'[]'::jsonb)
  into v_rows from public.be_wayplan_dispatch_stops s where s.wayplan_id=p_wayplan_id;

  return jsonb_build_object('ok',true,'wayplan_id',v_plan.wayplan_id,'vehicle_code',v_plan.vehicle_code,'vehicle_name',v_plan.vehicle_name,
    'branch_code',v_plan.branch_code,'total_stops',v_plan.total_stops,'load_strategy','LIFO','immutable',false,'rows',v_rows);
end $$;

revoke all on function public.be_wayplan_lifo_manifest(text) from public,anon;
grant execute on function public.be_wayplan_lifo_manifest(text) to authenticated;
