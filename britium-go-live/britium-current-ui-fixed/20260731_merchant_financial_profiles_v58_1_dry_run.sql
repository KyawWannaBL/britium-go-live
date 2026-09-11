-- BRITIUM DATA ENTRY FINANCIAL V2
-- MERCHANT FINANCIAL PROFILE CONTROLLED IMPORT V58.1
-- DRY RUN ONLY. No persistent production changes.
-- Approval: MANAGEMENT-APPROVAL-2026-07-31
-- Approved by: Kyaw Wanna (md@britiumexpress.com)

with approved_profiles(
  merchant_id,
  merchant_name,
  customer_tier,
  is_active,
  effective_from,
  effective_to,
  counterparty_type,
  approval_reference,
  approved_by
) as (
  values
    ('BBW', 'Baby World', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('LOS', 'Lady OS', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('UQD', 'Unique/Diva', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('FFU', 'Food For U', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('MEL', 'Mee Lay', 'ROYAL', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('HMS', 'Hla Myittar Shin', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('HAM', 'HAIM', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('MBO', 'MaBel OS', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('PRE', 'PREMIER', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)')
),
merchant_master as (
  select
    upper(coalesce(
      nullif(btrim(payload ->> 'merchant_code'), ''),
      nullif(btrim(payload ->> 'code'), '')
    )) as merchant_code,
    coalesce(
      nullif(btrim(payload ->> 'merchant_name'), ''),
      nullif(btrim(payload ->> 'display_name'), ''),
      nullif(btrim(payload ->> 'name'), '')
    ) as merchant_name,
    upper(coalesce(nullif(btrim(payload ->> 'contract_status'), ''), '')) as contract_status
  from (
    select public.be_master_data_unwrap_payload(to_jsonb(r)) as payload
    from public.be_v_master_data_live_rows r
    where r.dataset_key = 'merchant_master'
  ) s
),
current_profiles as (
  select p.*
  from public.be_merchant_financial_profiles_v2 p
  join approved_profiles a on a.merchant_id = p.merchant_id
),
validation as (
  select
    (select count(*) from approved_profiles) as approved_rows,
    (select count(*) from (
       select merchant_id from approved_profiles group by merchant_id having count(*) > 1
     ) d) as duplicate_merchant_ids,
    (select count(*) from approved_profiles
      where customer_tier not in ('STANDARD','ROYAL','COMMITMENT')) as invalid_tiers,
    (select count(*) from approved_profiles
      where counterparty_type not in ('MERCHANT','ONLINE_SELLER','CUSTOMER_ACCOUNT')) as invalid_counterparty_types,
    (select count(*) from approved_profiles
      where merchant_id is null or btrim(merchant_id) = ''
         or merchant_name is null or btrim(merchant_name) = '') as missing_required_values,
    (select count(*)
       from approved_profiles a
      where not exists (
        select 1 from merchant_master m
        where m.merchant_code = upper(a.merchant_id)
      )) as missing_master_merchants,
    (select count(*)
       from approved_profiles a
      where exists (
        select 1 from merchant_master m
        where m.merchant_code = upper(a.merchant_id)
      )
        and not exists (
          select 1 from merchant_master m
          where m.merchant_code = upper(a.merchant_id)
            and m.contract_status = 'ACTIVE'
        )) as inactive_master_contracts,
    (select count(*)
       from approved_profiles a
      where exists (
        select 1 from merchant_master m
        where m.merchant_code = upper(a.merchant_id)
          and m.contract_status = 'ACTIVE'
      )
        and not exists (
          select 1 from merchant_master m
          where m.merchant_code = upper(a.merchant_id)
            and m.contract_status = 'ACTIVE'
            and lower(regexp_replace(btrim(m.merchant_name), '[[:space:]]+', ' ', 'g'))
              = lower(regexp_replace(btrim(a.merchant_name), '[[:space:]]+', ' ', 'g'))
        )) as master_name_mismatches,
    (select count(*) from current_profiles) as existing_target_profiles,
    (select count(*)
       from current_profiles p
       join approved_profiles a using (merchant_id)
      where p.customer_tier is distinct from a.customer_tier
         or p.is_active is distinct from a.is_active
         or p.effective_from is distinct from a.effective_from
         or p.effective_to is distinct from a.effective_to
         or p.counterparty_type is distinct from a.counterparty_type
         or p.merchant_name is distinct from a.merchant_name
    ) as conflicting_existing_profiles,
    (select count(*)
       from (select distinct customer_tier from approved_profiles) t
      where not exists (
        select 1
        from public.be_parcel_tariffs_v2 x
        where x.customer_tier = t.customer_tier
          and x.status = 'ACTIVE'
          and x.effective_from <= public.be_business_date()
          and (x.effective_to is null or x.effective_to >= public.be_business_date())
      )) as tiers_without_active_tariff
)

select jsonb_pretty(
  jsonb_build_object(
    'build', 'MERCHANT_FINANCIAL_PROFILES_V58_1_DRY_RUN_2026_07_31',
    'approval_reference', 'MANAGEMENT-APPROVAL-2026-07-31',
    'approved_by', 'Kyaw Wanna (md@britiumexpress.com)',
    'validation', to_jsonb(v),
    'ready_for_import',
      v.approved_rows = 9
      and v.duplicate_merchant_ids = 0
      and v.invalid_tiers = 0
      and v.invalid_counterparty_types = 0
      and v.missing_required_values = 0
      and v.missing_master_merchants = 0
      and v.inactive_master_contracts = 0
      and v.master_name_mismatches = 0
      and v.conflicting_existing_profiles = 0
      and v.tiers_without_active_tariff = 0,
    'approved_profiles',
      (select jsonb_agg(to_jsonb(a) order by merchant_id) from approved_profiles a),
    'active_tariffs_by_tier',
      (select coalesce(jsonb_agg(to_jsonb(x) order by customer_tier), '[]'::jsonb)
         from (
           select customer_tier, count(*) as active_tariffs,
                  count(distinct lower(btrim(township))) as active_townships
           from public.be_parcel_tariffs_v2
           where status = 'ACTIVE'
             and effective_from <= public.be_business_date()
             and (effective_to is null or effective_to >= public.be_business_date())
             and customer_tier in (select distinct customer_tier from approved_profiles)
           group by customer_tier
         ) x),
    'current_target_profiles',
      (select coalesce(jsonb_agg(to_jsonb(p) order by merchant_id), '[]'::jsonb)
         from current_profiles p)
  )
)
from validation v;
