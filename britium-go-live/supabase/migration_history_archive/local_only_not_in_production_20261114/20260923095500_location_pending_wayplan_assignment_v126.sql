-- V126: allow warehouse-ready location-pending parcels to be assigned to Wayplans.
-- Automatic road optimization remains coordinate-dependent; assignment itself no longer is.

create or replace function public.be_wayplan_eligible_rows_v69(p_region text)
returns table(
  delivery_way_id text,
  waybill_no text,
  pickup_id text,
  pickup_way_id text,
  merchant_name text,
  merchant_code text,
  recipient_name text,
  recipient_phone text,
  township text,
  address text,
  cod_amount numeric,
  delivery_fee numeric,
  parcel_weight_kg numeric,
  dispatch_status text,
  warehouse_status text,
  wayplan_status text,
  created_at timestamptz,
  updated_at timestamptz,
  delivery_region text,
  delivery_route_mode text,
  location_required boolean,
  service_provider_code text,
  latitude numeric,
  longitude numeric,
  metadata jsonb
)
language sql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
  select
    x.delivery_way_id,
    x.waybill_no,
    x.pickup_id,
    x.pickup_way_id,
    x.merchant_name,
    x.merchant_code,
    x.recipient_name,
    x.recipient_phone,
    x.township,
    x.address,
    x.cod_amount,
    x.delivery_fee,
    x.parcel_weight_kg,
    x.dispatch_status,
    x.warehouse_status,
    x.wayplan_status,
    x.created_at,
    x.updated_at,
    x.delivery_region,
    x.delivery_route_mode,
    x.location_required,
    x.service_provider_code,
    x.latitude,
    x.longitude,
    jsonb_strip_nulls(jsonb_build_object(
      'source','be_wayplan_visible_queue_v124/V126',
      'route_ready',coalesce(x.route_ready,false),
      'route_block_reason',x.route_block_reason,
      'location_review_status',x.location_review_status,
      'location_match_level',x.location_match_level,
      'location_coordinate_source',x.location_coordinate_source,
      'deferred_routing',not coalesce(x.route_ready,false)
    ))
  from jsonb_to_recordset(
    coalesce(public.be_wayplan_visible_queue_v124(p_region,10000)->'queue','[]'::jsonb)
  ) as x(
    delivery_way_id text,
    waybill_no text,
    pickup_id text,
    pickup_way_id text,
    merchant_name text,
    merchant_code text,
    recipient_name text,
    recipient_phone text,
    township text,
    address text,
    cod_amount numeric,
    delivery_fee numeric,
    parcel_weight_kg numeric,
    dispatch_status text,
    warehouse_status text,
    wayplan_status text,
    created_at timestamptz,
    updated_at timestamptz,
    delivery_region text,
    delivery_route_mode text,
    location_required boolean,
    service_provider_code text,
    latitude numeric,
    longitude numeric,
    route_ready boolean,
    route_block_reason text,
    location_review_status text,
    location_match_level text,
    location_coordinate_source text
  );
$function$;

comment on function public.be_wayplan_eligible_rows_v69(text)
is 'V126: warehouse-ready regional ways remain Wayplan-eligible even when coordinates are pending; metadata identifies deferred routing.';

grant execute on function public.be_wayplan_eligible_rows_v69(text) to authenticated;
