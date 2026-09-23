-- V130: allow exact validated Mapbox geocoding to clear LOCATION_PENDING.
-- Approximate Mapbox street/ward results remain review-only.

create or replace function public.be_wayplan_visible_queue_v124(
  p_region_code text default 'YANGON',
  p_limit integer default 10000
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_region text := upper(coalesce(nullif(btrim(p_region_code),''),'YANGON'));
  v_rows jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_route_ready integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Unsupported Wayplan region.'; end if;

  with base as (
    select
      d.delivery_way_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id) as waybill_no,
      d.pickup_id,
      coalesce(nullif(d.financial_quote->>'source_merchant_name',''),nullif(d.merchant_id,''),'') as merchant_name,
      nullif(d.merchant_id,'') as merchant_code,
      coalesce(d.recipient_name,'') as recipient_name,
      coalesce(d.contact_no_1,'') as recipient_phone,
      coalesce(d.township,'') as township,
      coalesce(d.recipient_address,'') as address,
      coalesce(d.cod_amount,0) as cod_amount,
      coalesce(d.delivery_fee,0) as delivery_fee,
      coalesce(d.weight_kg,0) as parcel_weight_kg,
      'READY_FOR_DISPATCH'::text as dispatch_status,
      r.warehouse_status,
      coalesce(nullif(d.way_management_status,''),'READY_FOR_WAYPLAN') as wayplan_status,
      coalesce(d.updated_at,d.saved_at,d.created_at,now()) as created_at,
      d.delivery_region,
      d.delivery_route_mode,
      d.location_required,
      coalesce(d.financial_quote->>'service_provider_code','BRITIUM') as service_provider_code,
      loc.latitude,
      loc.longitude,
      loc.review_status as location_review_status,
      loc.match_level as location_match_level,
      loc.coordinate_source as location_coordinate_source,
      (
        d.delivery_route_mode='DOORSTEP_MAP'
        and coalesce(d.location_required,false)
        and loc.review_status='ACCEPTED'
        and loc.latitude between 9 and 29
        and loc.longitude between 92 and 102
        and (
          upper(coalesce(loc.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
          or (
            upper(coalesce(loc.coordinate_source,'')) ~ '^MAPBOX_(?:POSTAL_VALIDATED|TOWNSHIP_EXACT_VALIDATED)_(?:ADDRESS_EXACT|POI_EXACT)$'
            and loc.match_level in ('ADDRESS_EXACT','POI_EXACT')
          )
        )
        and loc.coordinate_source<>'QUARANTINED_BULK_COORDINATE_V30'
        and not (round(loc.latitude::numeric,5)=16.80000 and round(loc.longitude::numeric,5)=96.15000)
        and (
          loc.match_level in ('ADDRESS_EXACT','POI_EXACT')
          or (
            loc.match_level='MANUAL'
            and loc.coordinate_source in (
              'DATA_ENTRY_MANUAL_PIN_V30','DATA_ENTRY_MANUAL_COORDINATE',
              'PASTED_TOWNSHIP_VALIDATED_COORDINATE','MANAGEMENT_POSTAL_VALIDATED_ADDRESS'
            )
          )
        )
      ) as route_ready
    from public.be_data_entry_parcel_details d
    join public.be_warehouse_receipts_v36 r
      on r.pickup_id=d.pickup_id and r.parcel_sequence=d.parcel_sequence
    left join public.be_delivery_location_registry loc
      on loc.delivery_way_id=d.delivery_way_id
    where d.delivery_region=v_region
      and upper(coalesce(r.warehouse_status,''))='WAREHOUSE_READY'
      and upper(coalesce(d.financial_validation_status,'')) in ('VALID','OK')
      and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
      and not exists (
        select 1 from public.be_wayplan_membership_v40 m
        where m.delivery_way_id=d.delivery_way_id
          and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      )
  ),
  limited as (
    select * from base
    order by created_at desc, delivery_way_id
    limit greatest(coalesce(p_limit,10000),1)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'delivery_way_id',delivery_way_id,
      'waybill_no',waybill_no,
      'pickup_id',pickup_id,
      'pickup_way_id',pickup_id,
      'merchant_name',merchant_name,
      'merchant_code',merchant_code,
      'recipient_name',recipient_name,
      'recipient_phone',recipient_phone,
      'township',township,
      'address',address,
      'cod_amount',cod_amount,
      'delivery_fee',delivery_fee,
      'parcel_weight_kg',parcel_weight_kg,
      'dispatch_status',dispatch_status,
      'warehouse_status',warehouse_status,
      'wayplan_status',wayplan_status,
      'created_at',created_at,
      'delivery_region',delivery_region,
      'delivery_route_mode',delivery_route_mode,
      'location_required',location_required,
      'service_provider_code',service_provider_code,
      'latitude',latitude,
      'longitude',longitude,
      'route_ready',route_ready,
      'route_block_reason',case when route_ready then null else 'LOCATION_PENDING' end,
      'location_review_status',location_review_status,
      'location_match_level',location_match_level,
      'location_coordinate_source',location_coordinate_source
    ) order by created_at desc, delivery_way_id),'[]'::jsonb),
    count(*)::integer,
    count(*) filter (where route_ready)::integer
  into v_rows,v_total,v_route_ready
  from limited;

  return jsonb_build_object(
    'ok',true,
    'region_code',v_region,
    'queue',v_rows,
    'count',v_total,
    'route_ready_count',v_route_ready,
    'location_pending_count',greatest(v_total-v_route_ready,0),
    'build','WAYPLAN_VISIBLE_QUEUE_V130_MAPBOX_20260923'
  );
end
$function$;

grant execute on function public.be_wayplan_visible_queue_v124(text,integer) to authenticated;


comment on function public.be_wayplan_visible_queue_v124(text,integer)
is 'V130: exact validated Google/Mapbox/manual locations are route-ready; approximate Mapbox results remain LOCATION_PENDING.';
