-- V165A: synchronize authoritative Data Entry COD into Rider delivery source.

create or replace view public.be_v_rider_delivery_wayplan_jobs as
select
  s.id,
  s.wayplan_id,
  s.stop_sequence,
  s.pickup_id,
  s.pickup_way_id,
  s.delivery_way_id,
  s.waybill_no,
  coalesce(s.recipient_name,'Customer') as recipient_name,
  coalesce(s.recipient_phone,'') as recipient_phone,
  coalesce(s.township,'') as township,
  coalesce(s.address,'') as address,
  coalesce(de.cod_amount,s.cod_amount,0) as cod_amount,
  coalesce(s.delivery_fee,0) as delivery_fee,
  coalesce(s.parcel_weight_kg,0) as parcel_weight_kg,
  s.stop_status,
  coalesce(s.rider_status,'PENDING') as rider_status,
  s.loaded_to_vehicle_at,
  s.handed_over_to_rider_at,
  s.delivered_at,
  s.cod_collected,
  s.failed_reason,
  s.rider_proof_url,
  s.receiver_name,
  s.receiver_phone,
  w.wayplan_status,
  w.vehicle_code,
  w.vehicle_name,
  w.driver_code,
  w.driver_name,
  w.rider_code,
  w.rider_name,
  w.helper_code,
  w.helper_name,
  w.dispatched_at,
  w.created_at as wayplan_created_at,
  jsonb_build_object(
    'source','be_v_rider_delivery_wayplan_jobs',
    'wayplan_status',w.wayplan_status,
    'stop_status',s.stop_status,
    'rider_status',coalesce(s.rider_status,'PENDING'),
    'rider_code',w.rider_code,
    'vehicle_code',w.vehicle_code,
    'receiver_signature_url',s.receiver_signature_url,
    'cod_source',case when de.delivery_way_id is not null then 'DATA_ENTRY' else 'WAYPLAN_STOP' end,
    'amount_entry_type',de.amount_entry_type,
    'data_entry_item_price',de.item_price,
    'data_entry_delivery_fee',de.delivery_fee,
    'build','RIDER_DELIVERY_VIEW_V165'
  ) as metadata,
  s.receiver_signature_url,
  coalesce(de.cod_amount,s.cod_amount,0) as calculated_cod_amount,
  case when de.delivery_way_id is not null then 'DATA_ENTRY' else 'WAYPLAN_STOP' end as cod_source,
  de.item_price as data_entry_item_price,
  de.delivery_fee as data_entry_delivery_fee,
  de.amount_entry_type as data_entry_amount_entry_type
from public.be_wayplan_dispatch_stops s
join public.be_wayplan_dispatches w on w.wayplan_id=s.wayplan_id
left join lateral (
  select d.delivery_way_id,d.cod_amount,d.item_price,d.delivery_fee,d.amount_entry_type,d.updated_at
  from public.be_data_entry_parcel_details d
  where upper(d.delivery_way_id)=upper(s.delivery_way_id)
  order by d.updated_at desc nulls last
  limit 1
) de on true
where coalesce(w.wayplan_status,'') in ('DISPATCHED','LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','COMPLETED')
and coalesce(s.stop_status,'') in (
  'DISPATCHED','READY_FOR_DELIVERY','RIDER_ACCEPTED','DELIVERY_ACCEPTED','ACCEPTED_FOR_DELIVERY',
  'LOADED_TO_VEHICLE','HANDOVER_TO_RIDER','OUT_FOR_DELIVERY','ARRIVED_AT_CUSTOMER',
  'DELIVERED','FAILED_DELIVERY','RETURN_TO_WAREHOUSE'
);

update public.be_wayplan_dispatch_stops s
set cod_amount=d.cod_amount,
    updated_at=now()
from (
  select distinct on (upper(delivery_way_id))
    upper(delivery_way_id) as delivery_way_id,
    cod_amount
  from public.be_data_entry_parcel_details
  where delivery_way_id is not null
  order by upper(delivery_way_id),updated_at desc nulls last
) d
where upper(s.delivery_way_id)=d.delivery_way_id
  and s.cod_amount is distinct from d.cod_amount;

comment on view public.be_v_rider_delivery_wayplan_jobs is
'V165: Rider COD is sourced from Data Entry calculated cod_amount and exposed as immutable collection amount metadata.';