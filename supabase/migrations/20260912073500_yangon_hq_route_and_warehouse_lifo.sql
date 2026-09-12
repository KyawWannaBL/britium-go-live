-- Yangon delivery routing origin and per-van warehouse LIFO loading metadata.

create or replace function public.be_multi_van_context()
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_options jsonb;
  v_vehicles jsonb;
  v_busy jsonb;
  v_role text;
  v_route_origins jsonb := '{}'::jsonb;
begin
  v_role:=lower(public.be_current_user_role());
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor') then
    raise exception using errcode='42501',message='Wayplan operator permission is required.';
  end if;

  v_options:=public.be_wayplan_assignment_options_v44();

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',record_key,
    'name',payload->>'vehicle_no',
    'capacity_kg',payload->'capacity_kg',
    'operation_type',payload->>'operation_type'
  ) order by record_key),'[]'::jsonb)
  into v_vehicles
  from public.be_master_data_rows
  where dataset_key='fleet_master'
    and deleted_at is null
    and upper(coalesce(status,'ACTIVE'))='ACTIVE'
    and upper(coalesce(payload->>'status','ACTIVE')) in ('ACTIVE','ASSIGNED')
    and payload->>'operation_type' in ('DELIVERY','PICKUP_HIGHWAY');

  select coalesce(jsonb_agg(jsonb_build_object(
    'vehicle_code',vehicle_code,
    'driver_code',driver_code,
    'helper_code',helper_code
  )),'[]'::jsonb)
  into v_busy
  from public.be_wayplan_dispatches
  where wayplan_status not in ('CANCELLED','COMPLETED','CLOSED');

  select jsonb_build_object('YANGON',jsonb_build_object(
    'branch_code',branch_code,
    'label',coalesce(branch_name,'Yangon Head Office'),
    'latitude',lat,
    'longitude',lng
  ))
  into v_route_origins
  from public.be_branch_offices
  where branch_code='YGN'
    and coalesce(is_head_office,false)=true
    and coalesce(active,true)=true
    and lat is not null
    and lng is not null
  order by updated_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'vehicles',v_vehicles,
    'drivers',v_options->'drivers',
    'helpers',v_options->'helpers',
    'busy',v_busy,
    'route_origins',coalesce(v_route_origins,'{}'::jsonb)
  );
end $$;

revoke all on function public.be_multi_van_context() from public,anon;
grant execute on function public.be_multi_van_context() to authenticated;

create or replace function public.be_sync_wayplan_lifo_metadata()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_total integer;
begin
  select total_stops into v_total
  from public.be_wayplan_dispatches
  where wayplan_id=new.wayplan_id;

  if coalesce(v_total,0)>0 and coalesce(new.stop_sequence,0)>0 then
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'delivery_sequence',new.stop_sequence,
      'warehouse_lifo_load_sequence',v_total-new.stop_sequence+1,
      'warehouse_load_strategy','LIFO'
    );
    new.warehouse_metadata:=coalesce(new.warehouse_metadata,'{}'::jsonb)||jsonb_build_object(
      'delivery_sequence',new.stop_sequence,
      'lifo_load_sequence',v_total-new.stop_sequence+1,
      'load_strategy','LIFO'
    );
  end if;
  return new;
end $$;

revoke all on function public.be_sync_wayplan_lifo_metadata() from public,anon,authenticated;

drop trigger if exists trg_be_wayplan_stop_lifo_metadata on public.be_wayplan_dispatch_stops;
create trigger trg_be_wayplan_stop_lifo_metadata
before insert or update of stop_sequence on public.be_wayplan_dispatch_stops
for each row execute function public.be_sync_wayplan_lifo_metadata();

create or replace function public.be_wayplan_lifo_manifest(p_wayplan_id text)
returns jsonb
language plpgsql
stable security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_role text;
  v_plan public.be_wayplan_dispatches%rowtype;
  v_rows jsonb;
begin
  v_role:=lower(public.be_current_user_role());
  if auth.uid() is null or v_role not in ('superadmin','super_admin','admin','dispatch','wayplan_operator','supervisor','warehouse') then
    raise exception using errcode='42501',message='Warehouse or Wayplan permission is required.';
  end if;

  select * into v_plan
  from public.be_wayplan_dispatches
  where wayplan_id=p_wayplan_id;

  if not found then raise exception 'Wayplan not found.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'load_sequence',coalesce((s.warehouse_metadata->>'lifo_load_sequence')::integer,v_plan.total_stops-s.stop_sequence+1),
    'delivery_sequence',s.stop_sequence,
    'delivery_way_id',s.delivery_way_id,
    'waybill_no',s.waybill_no,
    'township',s.township,
    'recipient_name',s.recipient_name,
    'address',s.address,
    'parcel_weight_kg',s.parcel_weight_kg
  ) order by coalesce((s.warehouse_metadata->>'lifo_load_sequence')::integer,v_plan.total_stops-s.stop_sequence+1)),'[]'::jsonb)
  into v_rows
  from public.be_wayplan_dispatch_stops s
  where s.wayplan_id=p_wayplan_id;

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',v_plan.wayplan_id,
    'vehicle_code',v_plan.vehicle_code,
    'vehicle_name',v_plan.vehicle_name,
    'branch_code',v_plan.branch_code,
    'total_stops',v_plan.total_stops,
    'load_strategy','LIFO',
    'rows',v_rows
  );
end $$;

revoke all on function public.be_wayplan_lifo_manifest(text) from public,anon;
grant execute on function public.be_wayplan_lifo_manifest(text) to authenticated;

-- Backfill LIFO metadata for existing active and historical Wayplans from their saved delivery sequence.
update public.be_wayplan_dispatch_stops s
set stop_sequence=s.stop_sequence
from public.be_wayplan_dispatches d
where d.wayplan_id=s.wayplan_id
  and d.total_stops>0
  and s.stop_sequence>0;
