-- BRITIUM DATA ENTRY FINANCIAL V2
-- MERCHANT IDENTITY + TIER APPROVAL EXPORT V58.0
-- READ ONLY. No persistent production changes.

with merchant_master as (
  select
    md5(payload::text) as master_source_hash,
    coalesce(
      nullif(btrim(payload ->> 'merchant_id'), ''),
      nullif(btrim(payload ->> 'merchant_code'), ''),
      nullif(btrim(payload ->> 'code'), ''),
      nullif(btrim(payload ->> 'customer_id'), '')
    ) as master_key,
    coalesce(
      nullif(btrim(payload ->> 'merchant_code'), ''),
      nullif(btrim(payload ->> 'code'), '')
    ) as merchant_code,
    coalesce(
      nullif(btrim(payload ->> 'merchant_name'), ''),
      nullif(btrim(payload ->> 'display_name'), ''),
      nullif(btrim(payload ->> 'name'), '')
    ) as merchant_name,
    nullif(btrim(payload ->> 'contract_status'), '') as contract_status,
    nullif(btrim(payload ->> 'standard_allowance_kg'), '')::numeric as standard_allowance_kg,
    payload
  from (
    select public.be_master_data_unwrap_payload(to_jsonb(r)) as payload
    from public.be_v_master_data_live_rows r
    where r.dataset_key = 'merchant_master'
  ) s
),
parcel_usage as (
  select
    btrim(p.merchant_id::text) as parcel_merchant_id,
    lower(regexp_replace(btrim(p.merchant_id::text), '[[:space:]]+', ' ', 'g')) as normalized_name,
    count(*) as parcel_rows,
    min(p.created_at) as first_seen_at,
    max(p.created_at) as last_seen_at
  from public.parcels p
  where nullif(btrim(p.merchant_id::text), '') is not null
  group by btrim(p.merchant_id::text)
),
pickup_usage as (
  select
    nullif(btrim(p.merchant_code), '') as merchant_code,
    max(nullif(btrim(p.merchant_name), '')) as pickup_merchant_name,
    count(*) as pickup_rows,
    min(p.created_at) as first_seen_at,
    max(p.created_at) as last_seen_at
  from public.be_portal_pickup_requests p
  where nullif(btrim(p.merchant_code), '') is not null
  group by nullif(btrim(p.merchant_code), '')
),
master_export as (
  select
    'MERCHANT_MASTER'::text as source_type,
    m.master_source_hash,
    m.master_key,
    m.merchant_code,
    m.merchant_name,
    m.contract_status,
    m.standard_allowance_kg,
    coalesce(pu.pickup_rows, 0) as observed_pickup_rows,
    pu.pickup_merchant_name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'parcel_merchant_id', x.parcel_merchant_id,
            'parcel_rows', x.parcel_rows,
            'first_seen_at', x.first_seen_at,
            'last_seen_at', x.last_seen_at
          )
          order by x.parcel_rows desc, x.parcel_merchant_id
        )
        from parcel_usage x
        where x.normalized_name = lower(
          regexp_replace(btrim(coalesce(m.merchant_name, '')), '[[:space:]]+', ' ', 'g')
        )
      ),
      '[]'::jsonb
    ) as exact_name_parcel_candidates,
    coalesce(
      (
        select sum(x.parcel_rows)
        from parcel_usage x
        where x.normalized_name = lower(
          regexp_replace(btrim(coalesce(m.merchant_name, '')), '[[:space:]]+', ' ', 'g')
        )
      ),
      0
    ) as exact_name_parcel_rows,
    null::text as canonical_profile_merchant_id,
    null::text as approved_customer_tier,
    public.be_business_date() as effective_from,
    null::date as effective_to,
    'MERCHANT'::text as counterparty_type,
    null::text as approval_reference,
    null::text as approved_by,
    null::text as review_notes
  from merchant_master m
  left join pickup_usage pu
    on upper(pu.merchant_code) = upper(m.merchant_code)
),
parcel_only as (
  select
    'PARCEL_ONLY'::text as source_type,
    md5(('PARCEL_ONLY:' || p.parcel_merchant_id)::text) as master_source_hash,
    p.parcel_merchant_id as master_key,
    null::text as merchant_code,
    p.parcel_merchant_id as merchant_name,
    null::text as contract_status,
    null::numeric as standard_allowance_kg,
    0::bigint as observed_pickup_rows,
    null::text as pickup_merchant_name,
    jsonb_build_array(
      jsonb_build_object(
        'parcel_merchant_id', p.parcel_merchant_id,
        'parcel_rows', p.parcel_rows,
        'first_seen_at', p.first_seen_at,
        'last_seen_at', p.last_seen_at
      )
    ) as exact_name_parcel_candidates,
    p.parcel_rows as exact_name_parcel_rows,
    null::text as canonical_profile_merchant_id,
    null::text as approved_customer_tier,
    public.be_business_date() as effective_from,
    null::date as effective_to,
    'MERCHANT'::text as counterparty_type,
    null::text as approval_reference,
    null::text as approved_by,
    'No exact merchant-master name match. Manual crosswalk required.'::text as review_notes
  from parcel_usage p
  where not exists (
    select 1
    from merchant_master m
    where lower(regexp_replace(btrim(coalesce(m.merchant_name, '')), '[[:space:]]+', ' ', 'g'))
      = p.normalized_name
  )
),
combined as (
  select * from master_export
  union all
  select * from parcel_only
)
select
  source_type,
  master_source_hash,
  master_key,
  merchant_code,
  merchant_name,
  contract_status,
  standard_allowance_kg,
  observed_pickup_rows,
  pickup_merchant_name,
  exact_name_parcel_candidates,
  exact_name_parcel_rows
from combined
order by
  case source_type when 'MERCHANT_MASTER' then 1 else 2 end,
  coalesce(merchant_code, ''),
  merchant_name;

-- Summary result set.
with merchant_master as (
  select public.be_master_data_unwrap_payload(to_jsonb(r)) as payload
  from public.be_v_master_data_live_rows r
  where r.dataset_key = 'merchant_master'
),
parcel_ids as (
  select distinct btrim(merchant_id::text) as merchant_id
  from public.parcels
  where nullif(btrim(merchant_id::text), '') is not null
)
select jsonb_pretty(
  jsonb_build_object(
    'build', 'MERCHANT_IDENTITY_TIER_APPROVAL_EXPORT_V58_0_2026_07_31',
    'merchant_master_rows', (select count(*) from merchant_master),
    'distinct_live_parcel_merchant_ids', (select count(*) from parcel_ids),
    'existing_financial_profiles', (
      select count(*) from public.be_merchant_financial_profiles_v2
    ),
    'required_tiers', jsonb_build_array('STANDARD','ROYAL','COMMITMENT'),
    'automatic_default_tier_allowed', false,
    'financial_v2_save_import_activation_allowed', false
  )
);
