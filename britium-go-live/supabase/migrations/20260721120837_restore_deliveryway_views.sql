begin;

create or replace function public.be_delivery_safe_timestamptz(
  p_value text
)
returns timestamptz
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v is null then
    return null;
  end if;

  return v::timestamptz;
exception
  when others then
    return null;
end;
$$;

drop view if exists public.be_v_rider_workflow_jobs cascade;
drop view if exists public.be_v_rider_delivery_jobs cascade;
drop view if exists public.be_v_enterprise_dispatch_jobs cascade;

create view public.be_v_enterprise_dispatch_jobs as
with source_rows as (
  select
    to_jsonb(q) as j
  from public.be_v_supervisor_pickup_queue q
),
normalized as (
  select
    j,

    coalesce(
      public.be_extract_pickupway_id_from_json(j),
      public.be_normalize_pickupway_id(j ->> 'pickup_way_id'),
      public.be_normalize_pickupway_id(j ->> 'pickup_id')
    ) as pickup_way_id,

    coalesce(
      public.be_delivery_safe_numeric(j ->> 'expected_parcels'),
      public.be_delivery_safe_numeric(j ->> 'expected_parcel_count'),
      public.be_delivery_safe_numeric(j ->> 'parcel_count'),
      1
    ) as fallback_count

  from source_rows
),
pickup_rows as (
  select
    j,
    pickup_way_id,
    public.be_pickupway_total_parcel_count(
      pickup_way_id,
      fallback_count
    ) as generated_delivery_count
  from normalized
  where pickup_way_id is not null
),
expanded as (
  select
    p.j,
    p.pickup_way_id,
    p.generated_delivery_count,
    gs.delivery_sequence::integer as delivery_sequence,
    public.be_make_deliveryway_id(
      p.pickup_way_id,
      gs.delivery_sequence::integer
    ) as delivery_way_id
  from pickup_rows p
  cross join lateral generate_series(
    1,
    p.generated_delivery_count
  ) as gs(delivery_sequence)
)
select
  e.delivery_way_id as tracking_no,
  e.delivery_way_id,
  e.delivery_way_id as waybill_no,

  e.pickup_way_id as pickup_id,
  e.pickup_way_id,
  public.be_delivery_json_first_text(
    e.j,
    array['request_code', 'pickup_request_code']
  ) as request_code,

  e.delivery_sequence,
  e.generated_delivery_count as delivery_count,

  public.be_delivery_json_first_text(
    e.j,
    array['merchant_code', 'sender_code', 'customer_code']
  ) as merchant_code,

  coalesce(
    public.be_delivery_json_first_text(
      e.j,
      array['merchant_name', 'sender_name', 'customer_name']
    ),
    'Unknown merchant'
  ) as merchant_name,

  coalesce(
    public.be_delivery_json_first_text(
      e.j,
      array[
        'recipient_name',
        'receiver_name',
        'consignee_name',
        'customer_name'
      ]
    ),
    'Recipient ' || lpad(e.delivery_sequence::text, 3, '0')
  ) as recipient_name,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'recipient_phone',
      'receiver_phone',
      'delivery_phone',
      'pickup_phone',
      'phone_number',
      'phone'
    ]
  ) as recipient_phone,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'recipient_phone',
      'receiver_phone',
      'delivery_phone',
      'pickup_phone',
      'phone_number',
      'phone'
    ]
  ) as phone_number,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'recipient_address',
      'receiver_address',
      'delivery_address',
      'pickup_address',
      'address'
    ]
  ) as recipient_address,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'recipient_address',
      'receiver_address',
      'delivery_address',
      'pickup_address',
      'address'
    ]
  ) as delivery_address,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'recipient_address',
      'receiver_address',
      'delivery_address',
      'pickup_address',
      'address'
    ]
  ) as address,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'delivery_township',
      '_first_text(
    e.j,
   recipient_township',
      'pickup_township',
      'township'
    ]
  ) as delivery_township,

  public.be_delivery_json_first_text(
    e.j,
    array[
      'delivery_township',
      'recipient_township',
      'pickup_township',
      'township'
    ]
  ) as township,

  public.be_delivery_json_first_text(
    e.j,
    array['delivery_city', 'pickup_city', 'city']
  ) as city,

  public.be_delivery_json_first_text(
    e.j,
    array['assigned_rider_email', 'rider_email']
  ) as assigned_rider_email,

  public.be_delivery_json_first_text(
    e.j,
    array['assigned_rider_code', 'rider_code']
  ) as assigned_rider_code,

  public.be_delivery_json_first_text(
    e.j,
    array['assigned_rider_code', 'rider_code']
  ) as rider_code,

  public.be_delivery_json_first_text(
    e.j,
    array['assigned_rider_name', 'assigned_rider', 'rider_name']
  ) as assigned_rider,

  coalesce(
    upper(
      public.be_delivery_json_first_text(
        e.j,
        array[
          'delivery_status',
          'rider_status',
          'pickup_status',
          'status'
        ]
      )
    ),
    'PENDING_ASSIGNMENT'
  ) as delivery_status,

  coalesce(
    upper(
      public.be_delivery_json_first_text(
        e.j,
        array[
          'dispatch_status',
          'workflow_stage',
          'pickup_status',
          'status'
        ]
      )
    ),
    'PENDING_ASSIGNMENT'
  ) as dispatch_status,

  upper(
    public.be_delivery_json_first_text(
      e.j,
      array['pickup_status', 'status']
    )
  ) as pickup_status,

  upper(e.j ->> 'workflow_stage') as workflow_stage,
  upper(e.j ->> 'supervisor_status') as supervisor_status,
  upper(e.j ->> 'rider_status') as rider_status,
  upper(e.j ->> 'status') as status,

  public.be_delivery_safe_timestamptz(
    e.j ->> 'assigned_at'
  ) as assigned_at,

  public.be_delivery_safe_timestamptz(
    e.j ->> 'created_at'
  ) as created_at,

  public.be_delivery_safe_timestamptz(
    e.j ->> 'updated_at'
  ) as updated_at,

  public.be_delivery_json_first_text(
    e.j,
    array['vehicle_type', 'assigned_vehicle_type']
  ) as vehicle_type,

  e.generated_delivery_count as expected_parcels,
  e.generated_delivery_count as parcel_count,

  public.be_delivery_json_first_text(
    e.j,
    array['payment_terms', 'payment_term']
  ) as payment_terms,

  public.be_delivery_json_first_text(
    e.j,
    array['payment_type', 'payment_method']
  ) as payment_type,

  coalesce(
    public.be_delivery_safe_numeric(e.j ->> 'cod_amount'),
    public.be_delivery_safe_numeric(e.j ->> 'total_cod'),
    public.be_delivery_safe_numeric(e.j ->> 'rider_cod_amount'),
    0
  ) as cod_amount,

  coalesce(
    public.be_delivery_safe_numeric(e.j ->> 'item_price'),
    public.be_delivery_safe_numeric(e.j ->> 'declared_value'),
    0
  ) as item_price,

  coalesce(
    public.be_delivery_safe_numeric(e.j ->> 'delivery_fee'),
    public.be_delivery_safe_numeric(e.j ->> 'estimated_tariff'),
    0
  ) as delivery_fee,

  public.be_delivery_safe_numeric(
    public.be_delivery_json_first_text(
      e.j,
      array['lat', 'latitude', 'delivery_lat']
    )
  ) as lat,

  public.be_delivery_safe_numeric(
    public.be_delivery_json_first_text(
      e.j,
      array['lng', 'lon', 'longitude', 'delivery_lng']
    )
  ) as lng,

  public.be_delivery_safe_numeric(
    public.be_delivery_json_first_text(
      e.j,
      array['lat', 'latitude', 'delivery_lat']
    )
  ) as latitude,

  public.be_delivery_safe_numeric(
    public.be_delivery_json_first_text(
      e.j,
      array['lng', 'lon', 'longitude', 'delivery_lng']
    )
  ) as longitude,

  public.be_delivery_json_first_text(
    e.j,
    array['wayplan_code', 'route_code']
  ) as wayplan_code,

  e.delivery_sequence as route_sequence,
  e.delivery_sequence as stop_sequence,

  'be_v_supervisor_pickup_queue'::text as pickup_source_table,
  'generated_from_pickupway_count'::text as delivery_source_table,

  e.pickup_way_id || '#' || e.delivery_way_id
    as delivery_line_key

from expanded e
where public.be_normalize_deliveryway_id(
  e.delivery_way_id
) is not null;

create view public.be_v_rider_delivery_jobs as
select *
from public.be_v_enterprise_dispatch_jobs
where public.be_normalize_deliveryway_id(
  delivery_way_id
) is not null;

create view public.be_v_rider_workflow_jobs as
select
  pickup_id,
  pickup_way_id,
  request_code,
  merchant_code,
  merchant_name,
  township,
  city,
  address as pickup_address,
  assigned_rider_email,
  pickup_status,
  workflow_stage,
  supervisor_status,
  rider_status,
  assigned_at,
  vehicle_type,
  delivery_count as expected_parcels,
  payment_terms,
  payment_type,
  cod_amount,
  item_price,
  delivery_fee,
  delivery_way_id,
  tracking_no,
  waybill_no,
  delivery_sequence,
  delivery_status
from public.be_v_rider_delivery_jobs;

grant execute on function
  public.be_delivery_safe_timestamptz(text)
to anon, authenticated, service_role;

grant select on public.be_v_enterprise_dispatch_jobs
to anon, authenticated, service_role;

grant select on public.be_v_rider_delivery_jobs
to anon, authenticated, service_role;

grant select on public.be_v_rider_workflow_jobs
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
