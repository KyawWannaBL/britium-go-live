-- Britium DeliveryWayID Correct Model Patch
-- -------------------------------------------------------------
-- Correct rule:
--   PickupWayID   = P<MMDD>-<MERCHANT/SENDER>-<TOTAL_3_DIGITS>
--   DeliveryWayID = D<MMDD>-<MERCHANT/SENDER>-<LINE_3_DIGITS>
-- Example:
--   P0624-BBG-013 produces D0624-BBG-001 ... D0624-BBG-013
--
-- This patch fixes the previous compatibility views that incorrectly set
-- delivery_way_id = pickup_way_id.
-- -------------------------------------------------------------

-- ---------- Safe helper functions ----------
create or replace function public.be_delivery_json_first_text(p_json jsonb, p_keys text[])
returns text
language plpgsql
immutable
as $$
declare
  k text;
  v text;
begin
  if p_json is null then
    return null;
  end if;

  foreach k in array p_keys loop
    if p_json ? k then
      v := nullif(trim(p_json ->> k), '');
      if v is not null then
        return v;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.be_delivery_safe_int(p_value text)
returns integer
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v is null then
    return null;
  end if;
  return floor(v::numeric)::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.be_delivery_safe_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if v is null then
    return null;
  end if;
  return v::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.be_normalize_pickupway_id(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := upper(trim(coalesce(p_value, '')));
begin
  if v ~ '^P[0-9]{4}-[A-Z0-9]+-[0-9]{3}$' then
    return v;
  end if;
  return null;
end;
$$;

create or replace function public.be_normalize_deliveryway_id(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v text := upper(trim(coalesce(p_value, '')));
begin
  if v ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$' then
    return v;
  end if;
  return null;
end;
$$;

create or replace function public.be_extract_pickupway_id_from_json(p_json jsonb)
returns text
language sql
immutable
as $$
  select coalesce(
    public.be_normalize_pickupway_id(public.be_delivery_json_first_text(p_json, array[
      'pickup_way_id', 'pickup_id', 'pickup_request_id', 'request_code',
      'pickup_request_code', 'pickup_waybill_id', 'parent_pickup_id',
      'parent_pickup_way_id', 'waybill_no', 'tracking_no', 'id'
    ])),
    case
      when public.be_delivery_json_first_text(p_json, array['delivery_way_id','delivery_id','tracking_no','waybill_no']) ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$'
      then null
      else null
    end
  );
$$;

create or replace function public.be_extract_deliveryway_id_from_json(p_json jsonb)
returns text
language sql
immutable
as $$
  select public.be_normalize_deliveryway_id(public.be_delivery_json_first_text(p_json, array[
    'delivery_way_id', 'delivery_id', 'tracking_no', 'waybill_no',
    'parcel_way_id', 'parcel_id', 'awb_no', 'barcode'
  ]));
$$;

create or replace function public.be_pickupway_total_parcel_count(
  p_pickup_way_id text,
  p_fallback_count numeric default null
)
returns integer
language plpgsql
immutable
as $$
declare
  v_id text := public.be_normalize_pickupway_id(p_pickup_way_id);
  v_suffix text;
  v_count integer;
  v_fallback integer;
begin
  if v_id is not null then
    v_suffix := substring(v_id from '-([0-9]{3})$');
    v_count := nullif(v_suffix::integer, 0);
  end if;

  v_fallback := greatest(1, least(999, coalesce(floor(p_fallback_count)::integer, 1)));

  -- Business rule from Britium: the final 3 digits of PickupWayID represent
  -- the delivery parcel count under the same sender pickup.
  return greatest(1, least(999, coalesce(v_count, v_fallback)));
exception when others then
  return 1;
end;
$$;

create or replace function public.be_make_deliveryway_id(
  p_pickup_way_id text,
  p_delivery_sequence integer
)
returns text
language plpgsql
immutable
as $$
declare
  v_pickup text := public.be_normalize_pickupway_id(p_pickup_way_id);
  v_seq integer := greatest(1, least(999, coalesce(p_delivery_sequence, 1)));
  v_mid text;
begin
  if v_pickup is null then
    return null;
  end if;

  -- Drop leading P and trailing -NNN, then prefix with D and the line sequence.
  v_mid := regexp_replace(v_pickup, '^P(.+)-[0-9]{3}$', '\1');
  return 'D' || v_mid || '-' || lpad(v_seq::text, 3, '0');
end;
$$;

-- ---------- Optional item/parcel line extractor ----------
-- Reads per-recipient parcel rows when the project has an item/parcel table.
-- If no item table exists, the delivery view below generates D-lines from
-- the PickupWayID final count.
create or replace function public.be_delivery_item_rows()
returns table(
  pickup_way_id text,
  existing_delivery_way_id text,
  delivery_sequence integer,
  recipient_name text,
  recipient_phone text,
  recipient_address text,
  delivery_township text,
  item_status text,
  cod_amount numeric,
  item_price numeric,
  delivery_fee numeric,
  lat numeric,
  lng numeric,
  created_at text,
  updated_at text,
  source_table text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_table text;
  v_reg regclass;
  v_sql text;
begin
  foreach v_table in array array[
    'public.be_portal_pickup_request_items',
    'public.be_pickup_request_items',
    'public.be_pickup_items',
    'public.be_parcel_items',
    'public.be_parcels',
    'public.be_waybills',
    'public.be_dispatch_job_items',
    'public.be_delivery_job_items'
  ] loop
    v_reg := to_regclass(v_table);

    if v_reg is not null then
      v_sql := format($q$
        with src as (
          select to_jsonb(t) as j
          from %s t
        ), norm as (
          select
            public.be_extract_pickupway_id_from_json(j) as pickup_way_id,
            public.be_extract_deliveryway_id_from_json(j) as existing_delivery_way_id,
            public.be_delivery_safe_int(public.be_delivery_json_first_text(j, array[
              'delivery_sequence','delivery_seq','line_no','line_number','parcel_no',
              'parcel_sequence','item_no','sequence_no','seq','stop_sequence','route_sequence'
            ])) as explicit_sequence,
            public.be_delivery_json_first_text(j, array['recipient_name','receiver_name','customer_name','consignee_name','name']) as recipient_name,
            public.be_delivery_json_first_text(j, array['recipient_phone','receiver_phone','phone_number','delivery_phone','customer_phone','phone']) as recipient_phone,
            public.be_delivery_json_first_text(j, array['recipient_address','receiver_address','delivery_address','customer_address','dropoff_address','address']) as recipient_address,
            public.be_delivery_json_first_text(j, array['delivery_township','destination_township','recipient_township','township']) as delivery_township,
            upper(public.be_delivery_json_first_text(j, array['delivery_status','dispatch_status','item_status','parcel_status','status'])) as item_status,
            public.be_delivery_safe_numeric(public.be_delivery_json_first_text(j, array['cod_amount','rider_cod_amount','amount','item_price','declared_value'])) as cod_amount,
            public.be_delivery_safe_numeric(public.be_delivery_json_first_text(j, array['item_price','declared_value','cod_amount','amount'])) as item_price,
            public.be_delivery_safe_numeric(public.be_delivery_json_first_text(j, array['delivery_fee','shipping_fee','fee'])) as delivery_fee,
            public.be_delivery_safe_numeric(public.be_delivery_json_first_text(j, array['lat','latitude','recipient_lat','delivery_lat','destination_lat'])) as lat,
            public.be_delivery_safe_numeric(public.be_delivery_json_first_text(j, array['lng','lon','longitude','recipient_lng','recipient_lon','delivery_lng','destination_lng'])) as lng,
            public.be_delivery_json_first_text(j, array['created_at','createdAt','submitted_at']) as created_at,
            public.be_delivery_json_first_text(j, array['updated_at','updatedAt','modified_at']) as updated_at
          from src
        ), numbered as (
          select
            n.*,
            row_number() over (
              partition by n.pickup_way_id
              order by n.explicit_sequence nulls last, n.existing_delivery_way_id nulls last, n.created_at nulls last, n.updated_at nulls last
            )::integer as rn
          from norm n
          where n.pickup_way_id is not null
        )
        select
          pickup_way_id,
          existing_delivery_way_id,
          coalesce(nullif(explicit_sequence, 0), rn)::integer as delivery_sequence,
          recipient_name,
          recipient_phone,
          recipient_address,
          delivery_township,
          item_status,
          cod_amount,
          item_price,
          delivery_fee,
          lat,
          lng,
          created_at,
          updated_at,
          %L::text as source_table
        from numbered
      $q$, v_reg, v_table);

      return query execute v_sql;
    end if;
  end loop;
end;
$$;

-- ---------- Rebuild delivery views with real DeliveryWayID values ----------
drop view if exists public.be_v_rider_delivery_jobs cascade;
drop view if exists public.be_v_enterprise_dispatch_jobs cascade;

create or replace view public.be_v_enterprise_dispatch_jobs as
with pickup_base as (
  select
    q.*,
    coalesce(public.be_extract_pickupway_id_from_json(to_jsonb(q)), public.be_normalize_pickupway_id(q.pickup_way_id), public.be_normalize_pickupway_id(q.pickup_id)) as parent_pickup_way_id,
    public.be_pickupway_total_parcel_count(
      coalesce(public.be_extract_pickupway_id_from_json(to_jsonb(q)), q.pickup_way_id, q.pickup_id),
      coalesce(public.be_delivery_safe_numeric(q.expected_parcels::text), public.be_delivery_safe_numeric(q.parcel_count::text), 1)
    ) as delivery_count
  from public.be_v_supervisor_pickup_queue q
), expanded as (
  select
    p.*,
    l.existing_delivery_way_id,
    l.delivery_sequence,
    l.recipient_name as item_recipient_name,
    l.recipient_phone as item_recipient_phone,
    l.recipient_address as item_recipient_address,
    l.delivery_township as item_delivery_township,
    l.item_status,
    l.cod_amount as item_cod_amount,
    l.item_price as item_price_line,
    l.delivery_fee as delivery_fee_line,
    l.lat as item_lat,
    l.lng as item_lng,
    l.source_table as delivery_source_table
  from pickup_base p
  join lateral (
    select
      i.existing_delivery_way_id,
      i.delivery_sequence,
      i.recipient_name,
      i.recipient_phone,
      i.recipient_address,
      i.delivery_township,
      i.item_status,
      i.cod_amount,
      i.item_price,
      i.delivery_fee,
      i.lat,
      i.lng,
      i.source_table
    from public.be_delivery_item_rows() i
    where i.pickup_way_id = p.parent_pickup_way_id

    union all

    select
      null::text as existing_delivery_way_id,
      gs.seq::integer as delivery_sequence,
      null::text as recipient_name,
      null::text as recipient_phone,
      null::text as recipient_address,
      null::text as delivery_township,
      null::text as item_status,
      null::numeric as cod_amount,
      null::numeric as item_price,
      null::numeric as delivery_fee,
      null::numeric as lat,
      null::numeric as lng,
      'generated_from_pickupway_count'::text as source_table
    from generate_series(1, p.delivery_count) as gs(seq)
    where not exists (
      select 1 from public.be_delivery_item_rows() i2
      where i2.pickup_way_id = p.parent_pickup_way_id
    )
  ) l on true
  where p.parent_pickup_way_id is not null
), final_rows as (
  select
    e.*,
    coalesce(e.existing_delivery_way_id, public.be_make_deliveryway_id(e.parent_pickup_way_id, e.delivery_sequence)) as final_delivery_way_id
  from expanded e
)
select
  final_delivery_way_id as tracking_no,
  final_delivery_way_id as delivery_way_id,
  final_delivery_way_id as waybill_no,
  parent_pickup_way_id as pickup_id,
  parent_pickup_way_id as pickup_way_id,
  request_code,
  delivery_sequence,
  delivery_count,
  merchant_code,
  merchant_name,
  coalesce(item_recipient_name, concat('Recipient ', lpad(delivery_sequence::text, 3, '0'))) as recipient_name,
  coalesce(item_recipient_phone, pickup_phone) as recipient_phone,
  coalesce(item_recipient_phone, pickup_phone) as phone_number,
  coalesce(item_recipient_address, pickup_address) as recipient_address,
  coalesce(item_recipient_address, pickup_address) as delivery_address,
  coalesce(item_recipient_address, pickup_address) as address,
  coalesce(item_delivery_township, township) as delivery_township,
  coalesce(item_delivery_township, township) as township,
  city,
  assigned_rider_email,
  assigned_rider_code,
  assigned_rider_code as rider_code,
  assigned_rider,
  coalesce(item_status, rider_status, pickup_status, status, 'PENDING_ASSIGNMENT') as delivery_status,
  coalesce(workflow_stage, rider_status, pickup_status, status, 'PENDING_ASSIGNMENT') as dispatch_status,
  pickup_status,
  workflow_stage,
  supervisor_status,
  rider_status,
  status,
  assigned_at,
  created_at,
  updated_at,
  vehicle_type,
  expected_parcels,
  parcel_count,
  payment_terms,
  payment_type,
  coalesce(item_cod_amount, cod_amount) as cod_amount,
  coalesce(item_price_line, item_price) as item_price,
  coalesce(delivery_fee_line, delivery_fee) as delivery_fee,
  item_lat as lat,
  item_lng as lng,
  item_lat as latitude,
  item_lng as longitude,
  null::text as wayplan_code,
  delivery_sequence as route_sequence,
  delivery_sequence as stop_sequence,
  source_table as pickup_source_table,
  delivery_source_table,
  parent_pickup_way_id || '#' || final_delivery_way_id as delivery_line_key
from final_rows
where public.be_normalize_deliveryway_id(final_delivery_way_id) is not null;

create or replace view public.be_v_rider_delivery_jobs as
select *
from public.be_v_enterprise_dispatch_jobs
where public.be_normalize_deliveryway_id(delivery_way_id) is not null;


-- Recreate legacy rider workflow view only if an earlier cascade removed it.
do $$
begin
  if to_regclass('public.be_v_rider_workflow_jobs') is null then
    execute $workflow_view$
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
      from public.be_v_rider_delivery_jobs
    $workflow_view$;
  end if;
end;
$$;

-- ---------- Delivery healthcheck and RPC ----------
drop function if exists public.be_rider_delivery_page_healthcheck();
create or replace function public.be_rider_delivery_page_healthcheck()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_d_valid integer := 0;
  v_p_valid integer := 0;
  v_sample_pickup text;
  v_sample_delivery text;
  v_max_count integer;
begin
  select
    count(*)::integer,
    count(*) filter (where delivery_way_id ~ '^D[0-9]{4}-[A-Z0-9]+-[0-9]{3}$')::integer,
    count(distinct pickup_way_id) filter (where pickup_way_id ~ '^P[0-9]{4}-[A-Z0-9]+-[0-9]{3}$')::integer,
    min(pickup_way_id),
    min(delivery_way_id),
    max(delivery_count)::integer
  into v_total, v_d_valid, v_p_valid, v_sample_pickup, v_sample_delivery, v_max_count
  from public.be_v_rider_delivery_jobs;

  return jsonb_build_object(
    'ok', true,
    'view', 'public.be_v_rider_delivery_jobs',
    'pickupway_format', 'P0611-BRV-001',
    'deliveryway_format', 'D0611-BRV-001',
    'model', 'one pickup_way_id P... parent to many delivery_way_id D... lines',
    'total_delivery_rows', v_total,
    'valid_deliveryway_rows', v_d_valid,
    'valid_parent_pickupway_count', v_p_valid,
    'sample_pickup_way_id', v_sample_pickup,
    'sample_delivery_way_id', v_sample_delivery,
    'max_delivery_count_seen', coalesce(v_max_count, 0),
    'message', case
      when v_total = 0 then 'Objects are installed, but no delivery rows are visible yet.'
      when v_total <> v_d_valid then 'Some rows still have invalid DeliveryWayID values.'
      else 'DeliveryWayID bridge is ready. Delivery rows now use D-prefix IDs.'
    end
  );
end;
$$;

drop function if exists public.be_rider_delivery_jobs(text, text);
drop function if exists public.be_rider_delivery_jobs(text, text, text);
create or replace function public.be_rider_delivery_jobs(
  p_rider_email text default null,
  p_pickup_way_id text default null,
  p_delivery_way_id text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'count', count(*),
    'jobs', coalesce(jsonb_agg(to_jsonb(j) order by j.assigned_at desc nulls last, j.delivery_sequence asc), '[]'::jsonb)
  )
  from public.be_v_rider_delivery_jobs j
  where (p_rider_email is null or p_rider_email = '' or lower(coalesce(j.assigned_rider_email, '')) = lower(p_rider_email))
    and (p_pickup_way_id is null or p_pickup_way_id = '' or j.pickup_way_id = public.be_normalize_pickupway_id(p_pickup_way_id))
    and (p_delivery_way_id is null or p_delivery_way_id = '' or j.delivery_way_id = public.be_normalize_deliveryway_id(p_delivery_way_id));
$$;

-- ---------- Make delivery/COD RPCs accept a DeliveryWayID while still updating the parent PickupWayID ----------
drop function if exists public.be_rider_verify_delivery(text, text, text, text, numeric, text, text, text, text);
drop function if exists public.be_rider_verify_delivery(text, text, text, text, numeric, text, text, text, text, text);
create or replace function public.be_rider_verify_delivery(
  p_pickup_id text default null,
  p_rider_email text default null,
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_cod_collected_amount numeric default 0,
  p_remark text default null,
  p_proof_url text default null,
  p_pickup_way_id text default null,
  p_rider_code text default null,
  p_delivery_way_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_way_id text := coalesce(public.be_normalize_deliveryway_id(p_delivery_way_id), public.be_normalize_deliveryway_id(p_pickup_id));
  v_pickup_way_id text := coalesce(public.be_normalize_pickupway_id(p_pickup_way_id), public.be_normalize_pickupway_id(p_pickup_id));
begin
  if v_pickup_way_id is null and v_delivery_way_id is not null then
    select pickup_way_id into v_pickup_way_id
    from public.be_v_rider_delivery_jobs
    where delivery_way_id = v_delivery_way_id
    limit 1;
  end if;

  if v_pickup_way_id is null then
    raise exception 'Valid PickupWayID is required. Pass p_pickup_id/p_pickup_way_id as P.... and p_delivery_way_id as D....';
  end if;

  return public.be_rider_update_pickup_status(
    v_pickup_way_id,
    p_rider_email,
    p_rider_code,
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    jsonb_build_object(
      'delivery_way_id', v_delivery_way_id,
      'recipient_name', p_recipient_name,
      'recipient_phone', p_recipient_phone,
      'cod_collected_amount', coalesce(p_cod_collected_amount, 0),
      'cod_collected_at', case when coalesce(p_cod_collected_amount, 0) > 0 then now() else null end,
      'cod_settlement_status', case when coalesce(p_cod_collected_amount, 0) > 0 then 'PENDING_REMITTANCE' else null end,
      'delivery_verified_at', now(),
      'delivery_verified_by', p_rider_email,
      'remark', p_remark,
      'proof_url', p_proof_url
    )
  );
end;
$$;

drop function if exists public.be_rider_submit_cod_settlement(text, text, numeric, text, text, text);
drop function if exists public.be_rider_submit_cod_settlement(text, text, numeric, text, text, text, text);
create or replace function public.be_rider_submit_cod_settlement(
  p_pickup_id text default null,
  p_rider_email text default null,
  p_cod_amount numeric default 0,
  p_remark text default null,
  p_pickup_way_id text default null,
  p_rider_code text default null,
  p_delivery_way_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_way_id text := coalesce(public.be_normalize_deliveryway_id(p_delivery_way_id), public.be_normalize_deliveryway_id(p_pickup_id));
  v_pickup_way_id text := coalesce(public.be_normalize_pickupway_id(p_pickup_way_id), public.be_normalize_pickupway_id(p_pickup_id));
begin
  if v_pickup_way_id is null and v_delivery_way_id is not null then
    select pickup_way_id into v_pickup_way_id
    from public.be_v_rider_delivery_jobs
    where delivery_way_id = v_delivery_way_id
    limit 1;
  end if;

  if v_pickup_way_id is null then
    raise exception 'Valid PickupWayID is required for COD settlement.';
  end if;

  return public.be_rider_update_pickup_status(
    v_pickup_way_id,
    p_rider_email,
    p_rider_code,
    'COD_SUBMITTED',
    null,
    null,
    jsonb_build_object(
      'delivery_way_id', v_delivery_way_id,
      'cod_collected_amount', coalesce(p_cod_amount, 0),
      'cod_settlement_status', 'SUBMITTED_TO_FINANCE',
      'cod_handover_submitted_at', now(),
      'remark', p_remark
    )
  );
end;
$$;

grant execute on function public.be_delivery_json_first_text(jsonb, text[]) to anon, authenticated, service_role;
grant execute on function public.be_delivery_safe_int(text) to anon, authenticated, service_role;
grant execute on function public.be_delivery_safe_numeric(text) to anon, authenticated, service_role;
grant execute on function public.be_normalize_pickupway_id(text) to anon, authenticated, service_role;
grant execute on function public.be_normalize_deliveryway_id(text) to anon, authenticated, service_role;
grant execute on function public.be_extract_pickupway_id_from_json(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_extract_deliveryway_id_from_json(jsonb) to anon, authenticated, service_role;
grant execute on function public.be_pickupway_total_parcel_count(text, numeric) to anon, authenticated, service_role;
grant execute on function public.be_make_deliveryway_id(text, integer) to anon, authenticated, service_role;
grant execute on function public.be_delivery_item_rows() to anon, authenticated, service_role;
grant select on public.be_v_enterprise_dispatch_jobs to anon, authenticated, service_role;
grant select on public.be_v_rider_delivery_jobs to anon, authenticated, service_role;
grant select on public.be_v_rider_workflow_jobs to anon, authenticated, service_role;
grant execute on function public.be_rider_delivery_page_healthcheck() to anon, authenticated, service_role;
grant execute on function public.be_rider_delivery_jobs(text, text, text) to anon, authenticated, service_role;
grant execute on function public.be_rider_verify_delivery(text, text, text, text, numeric, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.be_rider_submit_cod_settlement(text, text, numeric, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- ---------- Smoke tests ----------
-- select public.be_make_deliveryway_id('P0624-BBG-013', 1);  -- D0624-BBG-001
-- select public.be_make_deliveryway_id('P0624-BBG-013', 13); -- D0624-BBG-013
-- select public.be_rider_delivery_page_healthcheck();
-- select pickup_way_id, delivery_way_id, tracking_no, pickup_id, delivery_sequence, delivery_count, delivery_status
-- from public.be_v_rider_delivery_jobs
-- order by pickup_way_id, delivery_sequence
-- limit 50;
