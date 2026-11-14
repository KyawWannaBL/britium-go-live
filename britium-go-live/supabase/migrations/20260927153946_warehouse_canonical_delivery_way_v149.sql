-- V149: Warehouse readiness follows canonical D-series Delivery Way IDs.
-- P-series identifiers remain Pickup IDs only and must not be surfaced as Way IDs.

create or replace function public.be_warehouse_mark_delivery_ready_v149(
  p_delivery_way_id text,
  p_staging_zone text default 'READY_FOR_DISPATCH',
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_role text := public.be_warehouse_assert_internal();
  v_actor text := public.be_warehouse_actor_email();
  v_way text := upper(btrim(coalesce(p_delivery_way_id,'')));
  v_pickup_id text;
  v_previous text;
  v_count integer := 0;
begin
  if v_way !~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]+$' then
    raise exception 'Canonical Delivery Way ID (D...) is required' using errcode='22023';
  end if;

  select pickup_id,warehouse_status
    into v_pickup_id,v_previous
  from public.be_warehouse_receipts_v36
  where upper(delivery_way_id)=v_way
  limit 1
  for update;

  if v_pickup_id is null then
    return jsonb_build_object(
      'ok',false,'delivery_way_id',v_way,'ready_count',0,
      'error','DELIVERY_WAY_NOT_FOUND',
      'message','Delivery Way ID was not found in Warehouse receipts.',
      'authorized_role',v_role,'actor_email',v_actor
    );
  end if;

  if v_previous='WAREHOUSE_EXCEPTION' then
    return jsonb_build_object(
      'ok',false,'delivery_way_id',v_way,'pickup_id',v_pickup_id,'ready_count',0,
      'error','WAREHOUSE_EXCEPTION_ON_HOLD',
      'message','This Delivery Way is on Warehouse exception hold.',
      'authorized_role',v_role,'actor_email',v_actor
    );
  end if;

  if v_previous='WAREHOUSE_READY' then
    return jsonb_build_object(
      'ok',true,'delivery_way_id',v_way,'pickup_id',v_pickup_id,'ready_count',0,
      'already_ready',true,'authorized_role',v_role,'actor_email',v_actor,
      'build','WAREHOUSE_DELIVERY_WAY_READY_V149'
    );
  end if;

  if v_previous<>'RECEIVED' then
    return jsonb_build_object(
      'ok',false,'delivery_way_id',v_way,'pickup_id',v_pickup_id,'ready_count',0,
      'error','NO_SCANNED_RECEIVED_PARCEL',
      'message','Warehouse READY requires a successful receiving scan first.',
      'authorized_role',v_role,'actor_email',v_actor
    );
  end if;

  insert into public.be_warehouse_receipt_events_v36(
    pickup_id,parcel_sequence,delivery_way_id,action,
    previous_status,new_status,warehouse_code,staging_zone,actor_email
  )
  select r.pickup_id,r.parcel_sequence,r.delivery_way_id,'DELIVERY_WAY_READY',
         r.warehouse_status,'WAREHOUSE_READY',r.warehouse_code,
         coalesce(nullif(p_staging_zone,''),r.staging_zone,'READY_FOR_DISPATCH'),v_actor
  from public.be_warehouse_receipts_v36 r
  where upper(r.delivery_way_id)=v_way and r.warehouse_status='RECEIVED';

  update public.be_warehouse_receipts_v36
  set warehouse_status='WAREHOUSE_READY',
      parcel_condition=case when parcel_condition='UNINSPECTED' then 'GOOD' else parcel_condition end,
      staging_zone=coalesce(nullif(p_staging_zone,''),staging_zone,'READY_FOR_DISPATCH'),
      ready_at=now(),ready_by=v_actor,updated_at=now()
  where upper(delivery_way_id)=v_way and warehouse_status='RECEIVED';
  get diagnostics v_count=row_count;

  return jsonb_build_object(
    'ok',true,'delivery_way_id',v_way,'pickup_id',v_pickup_id,'ready_count',v_count,
    'authorized_role',v_role,'actor_email',v_actor,'auth_enforced',true,
    'canonical_way_id_prefix','D','pickup_id_prefix','P',
    'build','WAREHOUSE_DELIVERY_WAY_READY_V149'
  );
end
$function$;

revoke execute on function public.be_warehouse_mark_delivery_ready_v149(text,text,text) from anon, public;
grant execute on function public.be_warehouse_mark_delivery_ready_v149(text,text,text) to authenticated, service_role;

comment on function public.be_warehouse_mark_delivery_ready_v149(text,text,text)
is 'V149 Warehouse readiness by canonical D-series Delivery Way ID. P-series values remain Pickup IDs only.';
