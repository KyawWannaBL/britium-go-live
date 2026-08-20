create extension if not exists pgcrypto;

create or replace function public.be_get_pickup_order_options(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(nullif(p_payload->>'limit','')::integer, 200), 500));
  v_branch text := upper(trim(coalesce(p_payload->>'branch_code','')));
  v_status text := upper(trim(coalesce(p_payload->>'status','')));
  v_search text := lower(trim(coalesce(p_payload->>'search','')));
  v_rows jsonb := '[]'::jsonb;
begin
  if to_regclass('public.be_portal_pickup_requests') is not null then
    execute $q$
      select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
      from (
        select
          coalesce(p.pickup_id, p.canonical_pickup_id, p.metadata->>'pickup_id') as pickup_id,
          coalesce(p.canonical_pickup_id, p.pickup_id, p.metadata->>'pickup_id') as canonical_pickup_id,
          p.merchant_code,
          coalesce(p.merchant_name, p.metadata->>'merchant_name', p.metadata->>'sender_name') as merchant_name,
          coalesce(p.branch_code, p.metadata->>'branch_code', 'HQ') as branch_code,
          coalesce(p.status, p.metadata->>'status', 'PICKUP_REQUESTED') as status,
          coalesce(p.pickup_township, p.township, p.metadata->>'pickup_township') as pickup_township,
          coalesce(p.pickup_city, p.city, p.metadata->>'pickup_city') as pickup_city,
          p.pickup_address,
          coalesce(p.contact_phone, p.customer_phone, p.metadata->>'sender_phone') as sender_phone,
          p.parcel_count,
          p.cod_amount,
          p.created_at
        from public.be_portal_pickup_requests p
        where coalesce(p.pickup_id, p.canonical_pickup_id, p.metadata->>'pickup_id') is not null
          and ($1 = '' or upper(coalesce(p.branch_code, p.metadata->>'branch_code', 'HQ')) = $1)
          and ($2 = '' or upper(coalesce(p.status, p.metadata->>'status', '')) = $2)
          and (
            $3 = ''
            or lower(coalesce(p.pickup_id, p.canonical_pickup_id, p.metadata->>'pickup_id','')) like '%' || $3 || '%'
            or lower(coalesce(p.merchant_code,'')) like '%' || $3 || '%'
            or lower(coalesce(p.merchant_name, p.metadata->>'merchant_name','')) like '%' || $3 || '%'
          )
        order by p.created_at desc nulls last
        limit $4
      ) x
    $q$
    into v_rows
    using v_branch, v_status, v_search, v_limit;
  end if;

  return jsonb_build_object('ok', true, 'rows', coalesce(v_rows, '[]'::jsonb), 'row_count', jsonb_array_length(coalesce(v_rows, '[]'::jsonb)));
end;
$$;

grant execute on function public.be_get_pickup_order_options(jsonb) to anon, authenticated;

-- Ensure rider app can resolve the same email-role access API.
-- This does not create users; it only verifies the function is exposed after schema reload.
grant execute on function public.be_resolve_user_access_by_email(text) to anon, authenticated;

notify pgrst, 'reload schema';
