-- V67: fast Wayplan queue loading.
-- Avoid heavy warehouse lifecycle views and per-row merchant resolution during page load.

create index if not exists be_data_entry_wayplan_ready_v67_idx
  on public.be_data_entry_parcel_details(delivery_region,delivery_route_mode,location_required,updated_at desc)
  where upper(coalesce(financial_validation_status,'')) in ('VALID','OK')
    and upper(coalesce(parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED');

create index if not exists be_warehouse_receipts_way_status_v67_idx
  on public.be_warehouse_receipts_v36(delivery_way_id,warehouse_status,updated_at desc);

create index if not exists be_delivery_attempt_way_status_v67_idx
  on public.be_delivery_attempt_state_v39(delivery_way_id,last_status,updated_at desc);

create or replace function public.be_dispatch_ready_queue_v19(
  p_limit integer default 200,
  p_region_code text default 'YANGON'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_region text := upper(coalesce(nullif(btrim(p_region_code),''),'YANGON'));
  v_active boolean := false;
  v_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if v_region not in ('YANGON','MANDALAY','NAYPYITAW') then raise exception 'Unsupported Wayplan region.'; end if;

  select r.is_active into v_active
  from public.be_wayplan_region_runtime_v19 r
  where r.region_code=v_region;

  if not coalesce(v_active,false) then
    return jsonb_build_object(
      'ok',true,'enabled',false,'region_code',v_region,'queue','[]'::jsonb,
      'count',0,'build','WAYPLAN_REGION_QUEUE_V67_FAST'
    );
  end if;

  with canonical_base as materialized (
    select
      d.*,
      row_number() over (
        partition by
          upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id)),
          lower(regexp_replace(coalesce(d.recipient_name,''),'\s+','','g')),
          regexp_replace(coalesce(d.contact_no_1,''),'[^0-9]','','g')
        order by
          case when upper(d.delivery_way_id)=upper(coalesce(nullif(d.financial_quote->>'source_waybill_no',''),d.delivery_way_id))
               then 0 else 1 end,
          d.updated_at desc nulls last,
          d.created_at desc nulls last,
          d.delivery_way_id
      ) as canonical_rank
    from public.be_data_entry_parcel_details d
    where d.delivery_region=v_region
      and coalesce(d.parcel_status,'')<>'duplicate_archived'
      and coalesce(d.way_management_status,'')<>'DUPLICATE_ARCHIVED'
  ), candidates as materialized (
    select
      d.delivery_way_id,
      coalesce(nullif(d.financial_quote->>'source_waybill_no',''),nullif(w.waybill_no,''),d.delivery_way_id) as waybill_no,
      d.pickup_id,
      d.pickup_id as pickup_way_id,
      coalesce(nullif(w.merchant_name,''),'') as merchant_name,
      nullif(d.merchant_id,'') as merchant_code,
      coalesce(d.recipient_name,w.recipient_name,'') as recipient_name,
      coalesce(d.contact_no_1,w.contact_no_1,'') as recipient_phone,
      coalesce(d.township,w.township,'') as township,
      coalesce(d.recipient_address,w.recipient_address,'') as address,
      coalesce(d.cod_amount,w.cod_amount,0) as cod_amount,
      coalesce(d.delivery_fee,w.delivery_fee,0) as delivery_fee,
      coalesce(d.weight_kg,w.weight_kg,0) as parcel_weight_kg,
      coalesce(nullif(w.dispatch_status,''),'READY_FOR_DISPATCH') as dispatch_status,
      coalesce(nullif(r.warehouse_status,''),nullif(d.warehouse_status,''),'') as warehouse_status,
      coalesce(nullif(d.way_management_status,''),nullif(w.wayplan_status,''),'READY_FOR_WAYPLAN') as wayplan_status,
      coalesce(w.created_at,d.saved_at,d.created_at,now()) as created_at,
      coalesce(w.updated_at,d.updated_at,now()) as updated_at,
      d.delivery_region,
      d.delivery_route_mode,
      d.location_required,
      coalesce(d.financial_quote->>'service_provider_code','BRITIUM') as service_provider_code,
      loc.latitude,
      loc.longitude,
      loc.review_status as location_review_status,
      loc.match_level as location_match_level,
      loc.coordinate_source as location_coordinate_source,
      coalesce(a.last_status,'') as delivery_attempt_status
    from canonical_base d
    join public.be_warehouse_receipts_v36 r
      on r.pickup_id=d.pickup_id and r.parcel_sequence=d.parcel_sequence
    join public.be_delivery_location_registry loc
      on loc.delivery_way_id=d.delivery_way_id
    left join public.be_waybill_ledger w
      on w.delivery_way_id=d.delivery_way_id
    left join public.be_delivery_attempt_state_v39 a
      on a.delivery_way_id=d.delivery_way_id
    where d.canonical_rank=1
      and (
        d.delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
        or (
          d.delivery_way_id ~ '^P[0-9]{4}-[A-Z0-9]+-[0-9]+-[0-9]+$'
          and d.photo_evidence_mode='OS_SOFTCOPY'
          and d.os_imported_at is not null
          and nullif(d.source_file_name,'') is not null
        )
      )
      and d.delivery_route_mode='DOORSTEP_MAP'
      and coalesce(d.location_required,false)
      and upper(coalesce(d.financial_validation_status,'')) in ('VALID','OK')
      and upper(coalesce(r.warehouse_status,''))='WAREHOUSE_READY'
      and coalesce(r.discrepancy_code,'')=''
      and upper(coalesce(a.last_status,''))<>'RTO'
      and upper(coalesce(d.parcel_status,'')) not in ('DELIVERED','RTO','CANCELLED','CLOSED','SETTLED','DUPLICATE_ARCHIVED')
      and upper(coalesce(w.dispatch_status,'READY_FOR_DISPATCH')) in (
        'READY_FOR_DISPATCH','WAITING_DISPATCH','READY','WAYBILL_CREATED','WAYPLAN_CREATED'
      )
      and upper(coalesce(w.wayplan_status,'READY_FOR_WAYPLAN')) in (
        'NOT_PLANNED','READY_FOR_WAYPLAN','WAYPLAN_CREATED'
      )
      and loc.review_status='ACCEPTED'
      and loc.latitude between 9 and 29
      and loc.longitude between 92 and 102
      and upper(coalesce(loc.coordinate_source,'')) ~ '^(GOOGLE_|DATA_ENTRY_MANUAL_|MANAGEMENT_POSTAL_VALIDATED_)'
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
      and not exists (
        select 1
        from public.be_wayplan_membership_v40 m
        where m.delivery_way_id=d.delivery_way_id
          and m.membership_status in ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
      )
  ), limited as (
    select *
    from candidates
    order by created_at desc
    limit greatest(coalesce(p_limit,200),1)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'delivery_way_id',delivery_way_id,'waybill_no',waybill_no,
      'pickup_id',pickup_id,'pickup_way_id',pickup_way_id,
      'merchant_name',merchant_name,'merchant_code',merchant_code,
      'merchant_source',case when merchant_code is not null then 'SAVED' else 'UNRESOLVED' end,
      'recipient_name',recipient_name,'recipient_phone',recipient_phone,
      'township',township,'address',address,'cod_amount',cod_amount,
      'delivery_fee',delivery_fee,'parcel_weight_kg',parcel_weight_kg,
      'dispatch_status',dispatch_status,'warehouse_status',warehouse_status,
      'wayplan_status',wayplan_status,'created_at',created_at,'updated_at',updated_at,
      'delivery_region',delivery_region,'delivery_route_mode',delivery_route_mode,
      'location_required',location_required,'service_provider_code',service_provider_code,
      'latitude',latitude,'longitude',longitude,
      'metadata',jsonb_build_object(
        'source','be_dispatch_ready_queue_v19/V67_FAST',
        'registered_data_entry',true,
        'financial_validation_status','OK',
        'canonical_warehouse_status',warehouse_status,
        'delivery_attempt_status',delivery_attempt_status,
        'dispatch_status',dispatch_status,'wayplan_status',wayplan_status,
        'location_required',location_required,
        'location_review_status',location_review_status,
        'location_match_level',location_match_level,
        'location_coordinate_source',location_coordinate_source
      )
    ) order by created_at desc
  ),'[]'::jsonb)
  into v_rows
  from limited;

  return jsonb_build_object(
    'ok',true,'enabled',true,'region_code',v_region,'queue',v_rows,
    'count',jsonb_array_length(v_rows),'build','WAYPLAN_REGION_QUEUE_V67_FAST'
  );
end;
$function$;

create or replace function public.be_multi_van_queue(p_region text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_queue jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  v_queue := public.be_dispatch_ready_queue_v19(10000,p_region);
  return v_queue || jsonb_build_object('build','MULTI_VAN_QUEUE_V67_FAST');
end;
$function$;

grant execute on function public.be_dispatch_ready_queue_v19(integer,text) to authenticated;
grant execute on function public.be_multi_van_queue(text) to authenticated;
