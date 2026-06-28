create extension if not exists pgcrypto;

create or replace function public.be_get_pickup_order_options(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch text := upper(trim(coalesce(p_payload->>'branch_code', '')));
  v_status text := upper(trim(coalesce(p_payload->>'status', p_payload->>'workflow_status', '')));
  v_search text := lower(trim(coalesce(p_payload->>'search', '')));
  v_limit integer := least(greatest(coalesce(nullif(p_payload->>'limit', '')::integer, 100), 1), 500);
  v_rows jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is null then
    return jsonb_build_object(
      'ok', true,
      'rows', '[]'::jsonb,
      'row_count', 0,
      'message', 'No pickup table found. Create pickup orders first from Create Delivery / CS Portal / Merchant Portal.'
    );
  end if;

  execute $q$
    select coalesce(jsonb_agg(row_payload order by row_payload->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'pickup_id', coalesce(
          nullif(r->>'pickup_id', ''),
          nullif(r->>'canonical_pickup_id', ''),
          nullif(r->'metadata'->>'pickup_id', ''),
          nullif(r->>'id', '')
        ),
        'canonical_pickup_id', coalesce(r->>'canonical_pickup_id', r->>'pickup_id', ''),
        'label',
          coalesce(nullif(r->>'pickup_id', ''), nullif(r->>'canonical_pickup_id', ''), nullif(r->'metadata'->>'pickup_id', ''), nullif(r->>'id', ''))
          || ' - '
          || coalesce(nullif(r->>'merchant_name', ''), nullif(r->>'sender_name', ''), nullif(r->>'merchant_code', ''), 'Merchant')
          || ' - '
          || coalesce(nullif(r->>'status', ''), 'PICKUP_REQUESTED'),
        'merchant_code', coalesce(r->>'merchant_code', r->'metadata'->>'merchant_code', ''),
        'merchant_name', coalesce(r->>'merchant_name', r->>'sender_name', r->'metadata'->>'merchant_name', ''),
        'contact_person', coalesce(r->>'contact_person', r->>'sender_name', ''),
        'contact_phone', coalesce(r->>'contact_phone', r->>'customer_phone', r->'metadata'->>'sender_phone', ''),
        'pickup_address', coalesce(r->>'pickup_address', ''),
        'pickup_township', coalesce(r->>'pickup_township', r->>'township', ''),
        'pickup_city', coalesce(r->>'pickup_city', r->>'city', ''),
        'delivery_township', coalesce(r->>'delivery_township', ''),
        'receiver_name', coalesce(r->>'receiver_name', ''),
        'receiver_phone', coalesce(r->>'receiver_phone', ''),
        'delivery_address', coalesce(r->>'delivery_address', ''),
        'branch_code', coalesce(r->>'branch_code', r->'metadata'->>'branch_code', 'HQ'),
        'status', coalesce(r->>'status', r->'metadata'->>'status', 'PICKUP_REQUESTED'),
        'workflow_status', coalesce(r->>'status', r->'metadata'->>'status', 'PICKUP_REQUESTED'),
        'assignment_status', coalesce(r->>'assignment_status', ''),
        'parcel_count', case when coalesce(r->>'parcel_count', '') ~ '^[0-9]+$' then (r->>'parcel_count')::integer else 0 end,
        'cod_amount', case when coalesce(r->>'cod_amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (r->>'cod_amount')::numeric else 0 end,
        'payment_terms', coalesce(r->>'payment_terms', ''),
        'service_type', coalesce(r->>'service_type', r->'metadata'->>'service_type', 'STANDARD'),
        'created_at', coalesce(r->>'created_at', ''),
        'raw', r
      ) as row_payload
      from (
        select to_jsonb(p) as r
        from public.be_portal_pickup_requests p
      ) src
      where coalesce(r->>'pickup_id', r->>'canonical_pickup_id', r->'metadata'->>'pickup_id', r->>'id', '') <> ''
        and ($1 = '' or upper(coalesce(r->>'branch_code', r->'metadata'->>'branch_code', '')) = $1)
        and ($2 = '' or upper(coalesce(r->>'status', r->'metadata'->>'status', '')) = $2 or upper(coalesce(r->>'assignment_status', '')) = $2)
        and (
          $3 = ''
          or lower(coalesce(r->>'pickup_id', '')) like '%' || $3 || '%'
          or lower(coalesce(r->>'canonical_pickup_id', '')) like '%' || $3 || '%'
          or lower(coalesce(r->>'merchant_code', '')) like '%' || $3 || '%'
          or lower(coalesce(r->>'merchant_name', '')) like '%' || $3 || '%'
          or lower(coalesce(r->>'sender_name', '')) like '%' || $3 || '%'
        )
      limit $4
    ) q
  $q$
  into v_rows
  using v_branch, v_status, v_search, v_limit;

  return jsonb_build_object(
    'ok', true,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'row_count', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)),
    'message', case when jsonb_array_length(coalesce(v_rows, '[]'::jsonb)) = 0 then 'No pickup order found. Create pickup first before Data Entry/Warehouse.' else 'Pickup orders loaded.' end
  );
end;
$$;

grant execute on function public.be_get_pickup_order_options(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
