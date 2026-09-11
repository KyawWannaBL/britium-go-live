-- BRITIUM DATA ENTRY FINANCIAL V2
-- VERIFY MERCHANT FINANCIAL PROFILE CONTROLLED IMPORT V58.1
-- READ ONLY.

with approved_profiles(merchant_id, merchant_name, customer_tier, effective_from, counterparty_type) as (
  values
    ('BBW', 'Baby World', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('LOS', 'Lady OS', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('UQD', 'Unique/Diva', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('FFU', 'Food For U', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('MEL', 'Mee Lay', 'ROYAL', date '2026-07-31', 'MERCHANT'),
    ('HMS', 'Hla Myittar Shin', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('HAM', 'HAIM', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('MBO', 'MaBel OS', 'STANDARD', date '2026-07-31', 'MERCHANT'),
    ('PRE', 'PREMIER', 'STANDARD', date '2026-07-31', 'MERCHANT')
),
profile_check as (
  select
    a.*,
    p.merchant_id is not null as exists_in_profile,
    p.customer_tier as stored_tier,
    p.is_active as stored_active,
    p.effective_from as stored_effective_from,
    p.effective_to as stored_effective_to,
    p.counterparty_type as stored_counterparty_type,
    p.merchant_name as stored_merchant_name,
    (
      p.merchant_id is not null
      and p.customer_tier = a.customer_tier
      and p.is_active
      and p.effective_from = a.effective_from
      and p.effective_to is null
      and p.counterparty_type = a.counterparty_type
      and p.merchant_name = a.merchant_name
    ) as exact_match
  from approved_profiles a
  left join public.be_merchant_financial_profiles_v2 p using (merchant_id)
),
tariff_check as (
  select
    t.customer_tier,
    count(*) as active_tariffs,
    count(distinct lower(btrim(t.township))) as active_townships
  from public.be_parcel_tariffs_v2 t
  where t.status = 'ACTIVE'
    and t.effective_from <= public.be_business_date()
    and (t.effective_to is null or t.effective_to >= public.be_business_date())
    and t.customer_tier in (select distinct customer_tier from approved_profiles)
  group by t.customer_tier
)
select jsonb_pretty(
  jsonb_build_object(
    'build', 'MERCHANT_FINANCIAL_PROFILES_V58_1_VERIFY_2026_07_31',
    'target_profiles', (select count(*) from approved_profiles),
    'exact_profile_matches', (select count(*) from profile_check where exact_match),
    'missing_profiles', (select count(*) from profile_check where not exists_in_profile),
    'conflicting_profiles', (select count(*) from profile_check where exists_in_profile and not exact_match),
    'backup_rows', (
      select count(*)
      from public.be_merchant_financial_profiles_v2_backup_v58_1
      where backup_build = 'MERCHANT_FINANCIAL_PROFILES_V58_1_2026_07_31'
    ),
    'audit_rows', (
      select count(*)
      from public.be_audit_events
      where action_code = 'MERCHANT_PROFILE_APPROVED'
        and entity_type = 'MERCHANT_FINANCIAL_PROFILE'
        and request_id like 'V58_1:MANAGEMENT-APPROVAL-2026-07-31:%'
    ),
    'active_tariffs_by_tier', (
      select coalesce(jsonb_agg(to_jsonb(t) order by customer_tier), '[]'::jsonb)
      from tariff_check t
    ),
    'profiles', (
      select jsonb_agg(to_jsonb(p) order by merchant_id)
      from profile_check p
    ),
    'all_gates_pass',
      (select count(*) = 9 from profile_check where exact_match)
      and (select count(*) = 9
             from public.be_merchant_financial_profiles_v2_backup_v58_1
            where backup_build = 'MERCHANT_FINANCIAL_PROFILES_V58_1_2026_07_31')
      and (select count(*) = 9
             from public.be_audit_events
            where action_code = 'MERCHANT_PROFILE_APPROVED'
              and entity_type = 'MERCHANT_FINANCIAL_PROFILE'
              and request_id like 'V58_1:MANAGEMENT-APPROVAL-2026-07-31:%')
      and not exists (
        select 1 from (select distinct customer_tier from approved_profiles) a
        where not exists (select 1 from tariff_check t where t.customer_tier = a.customer_tier and t.active_tariffs > 0)
      )
  )
);
