-- V42: Resolve Wayplan merchant identity from the three-character merchant code embedded in canonical Delivery WayIDs.
-- Existing saved merchant names remain authoritative. No parcel identifiers are rewritten.

create or replace function public.be_wayplan_resolve_merchant_identity(
  p_way_id text,
  p_saved_name text default null
)
returns table (
  merchant_code text,
  merchant_name text,
  merchant_source text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with parsed as (
    select
      case
        when upper(btrim(coalesce(p_way_id, ''))) ~ '^D[0-9]{4}-[A-Z0-9]{3}-[0-9]+$'
        then (regexp_match(
          upper(btrim(coalesce(p_way_id, ''))),
          '^D[0-9]{4}-([A-Z0-9]{3})-[0-9]+$'
        ))[1]
        else null
      end as merchant_code,
      nullif(btrim(coalesce(p_saved_name, '')), '') as saved_name
  ),
  master_match as (
    select nullif(btrim(r.payload->>'merchant_name'), '') as merchant_name
      from parsed p
      join public.be_v_master_data_live_rows r
        on r.dataset_key in ('merchant_master', 'merchants')
       and upper(coalesce(
             nullif(btrim(r.payload->>'merchant_code'), ''),
             r.record_key
           )) = p.merchant_code
     where p.merchant_code is not null
     order by r.record_key
     limit 1
  )
  select
    p.merchant_code,
    case
      when p.saved_name is not null then p.saved_name
      else coalesce(m.merchant_name, '')
    end as merchant_name,
    case
      when p.saved_name is not null then 'SAVED'
      when p.merchant_code is not null and m.merchant_name is not null then 'WAY_ID_MERCHANT_MASTER'
      else 'UNRESOLVED'
    end as merchant_source
    from parsed p
    left join master_match m on true;
$$;

revoke all on function public.be_wayplan_resolve_merchant_identity(text, text) from public, anon;
grant execute on function public.be_wayplan_resolve_merchant_identity(text, text) to authenticated;

create or replace function public.be_multi_van_queue(p_region text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_queue jsonb;
  v_rows jsonb;
begin
  perform public.be_multi_van_context();
  v_queue := public.be_dispatch_ready_queue_v19(10000, p_region);

  select coalesce(
    jsonb_agg(
      q.r
      || jsonb_build_object(
        'latitude', l.latitude,
        'longitude', l.longitude,
        'merchant_code', mi.merchant_code,
        'merchant_name', coalesce(mi.merchant_name, ''),
        'merchant_source', mi.merchant_source
      )
      order by q.ord
    ),
    '[]'::jsonb
  )
  into v_rows
  from jsonb_array_elements(v_queue->'queue') with ordinality as q(r, ord)
  join public.be_delivery_location_registry l
    on l.delivery_way_id = q.r->>'delivery_way_id'
  left join lateral public.be_wayplan_resolve_merchant_identity(
    q.r->>'delivery_way_id',
    q.r->>'merchant_name'
  ) mi on true;

  return v_queue || jsonb_build_object('queue', v_rows);
end
$$;

revoke all on function public.be_multi_van_queue(text) from public, anon;
grant execute on function public.be_multi_van_queue(text) to authenticated;
