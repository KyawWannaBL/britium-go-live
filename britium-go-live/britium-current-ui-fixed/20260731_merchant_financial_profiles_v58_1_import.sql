-- BRITIUM DATA ENTRY FINANCIAL V2
-- MERCHANT FINANCIAL PROFILE CONTROLLED IMPORT V58.1
-- PRODUCTION WRITE. Run the dry-run SQL first and require ready_for_import = true.
-- Approval: MANAGEMENT-APPROVAL-2026-07-31
-- Approved by: Kyaw Wanna (md@britiumexpress.com)

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create temp table tmp_v58_1_approved_profiles (
  merchant_id text primary key,
  merchant_name text not null,
  customer_tier text not null,
  is_active boolean not null,
  effective_from date not null,
  effective_to date,
  counterparty_type text not null,
  approval_reference text not null,
  approved_by text not null
) on commit drop;

insert into tmp_v58_1_approved_profiles values
    ('BBW', 'Baby World', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('LOS', 'Lady OS', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('UQD', 'Unique/Diva', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('FFU', 'Food For U', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('MEL', 'Mee Lay', 'ROYAL', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('HMS', 'Hla Myittar Shin', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('HAM', 'HAIM', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('MBO', 'MaBel OS', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)'),
    ('PRE', 'PREMIER', 'STANDARD', true, date '2026-07-31', null::date, 'MERCHANT', 'MANAGEMENT-APPROVAL-2026-07-31', 'Kyaw Wanna (md@britiumexpress.com)');

do $v58_1_checks$
declare
  v_count integer;
begin
  if to_regclass('public.be_merchant_financial_profiles_v2') is null then
    raise exception 'Required table public.be_merchant_financial_profiles_v2 is missing';
  end if;
  if to_regclass('public.be_parcel_tariffs_v2') is null then
    raise exception 'Required table public.be_parcel_tariffs_v2 is missing';
  end if;
  if to_regclass('public.be_audit_events') is null then
    raise exception 'Required table public.be_audit_events is missing';
  end if;
  if to_regclass('public.be_v_master_data_live_rows') is null then
    raise exception 'Required merchant master view is missing';
  end if;
  if to_regprocedure('public.be_master_data_unwrap_payload(jsonb)') is null then
    raise exception 'Required merchant master unwrap function is missing';
  end if;

  select count(*) into v_count from tmp_v58_1_approved_profiles;
  if v_count <> 9 then raise exception 'Expected exactly 9 approved profiles, found %', v_count; end if;

  if exists (
    select 1 from tmp_v58_1_approved_profiles
    where customer_tier not in ('STANDARD','ROYAL','COMMITMENT')
       or counterparty_type not in ('MERCHANT','ONLINE_SELLER','CUSTOMER_ACCOUNT')
       or effective_to is not null and effective_to < effective_from
  ) then
    raise exception 'Approved profile staging contains an invalid tier, counterparty type, or effective period';
  end if;

  if exists (
    with merchant_master as (
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
    )
    select 1
    from tmp_v58_1_approved_profiles a
    where not exists (
      select 1
      from merchant_master m
      where m.merchant_code = upper(a.merchant_id)
        and m.contract_status = 'ACTIVE'
        and lower(regexp_replace(btrim(m.merchant_name), '[[:space:]]+', ' ', 'g'))
          = lower(regexp_replace(btrim(a.merchant_name), '[[:space:]]+', ' ', 'g'))
    )
  ) then
    raise exception 'Merchant master identity, active contract, or approved name validation failed';
  end if;

  if exists (
    select 1
    from (select distinct customer_tier from tmp_v58_1_approved_profiles) s
    where not exists (
      select 1 from public.be_parcel_tariffs_v2 t
      where t.customer_tier = s.customer_tier
        and t.status = 'ACTIVE'
        and t.effective_from <= public.be_business_date()
        and (t.effective_to is null or t.effective_to >= public.be_business_date())
    )
  ) then
    raise exception 'At least one approved tier has no active production tariff';
  end if;

  if exists (
    select 1
    from public.be_merchant_financial_profiles_v2 p
    join tmp_v58_1_approved_profiles a using (merchant_id)
    where p.customer_tier is distinct from a.customer_tier
       or p.is_active is distinct from a.is_active
       or p.effective_from is distinct from a.effective_from
       or p.effective_to is distinct from a.effective_to
       or p.counterparty_type is distinct from a.counterparty_type
       or p.merchant_name is distinct from a.merchant_name
  ) then
    raise exception 'A target merchant already has a conflicting financial profile; import aborted without overwrite';
  end if;
end
$v58_1_checks$;

lock table public.be_merchant_financial_profiles_v2 in share row exclusive mode;

create table if not exists public.be_merchant_financial_profiles_v2_backup_v58_1 (
  backup_build text not null,
  merchant_id text not null,
  row_existed boolean not null,
  row_data jsonb,
  backed_up_at timestamptz not null default now(),
  primary key (backup_build, merchant_id)
);

revoke all on table public.be_merchant_financial_profiles_v2_backup_v58_1 from public, anon, authenticated;
grant all on table public.be_merchant_financial_profiles_v2_backup_v58_1 to service_role;

insert into public.be_merchant_financial_profiles_v2_backup_v58_1 (
  backup_build, merchant_id, row_existed, row_data
)
select
  'MERCHANT_FINANCIAL_PROFILES_V58_1_2026_07_31',
  a.merchant_id,
  p.merchant_id is not null,
  case when p.merchant_id is null then null else to_jsonb(p) end
from tmp_v58_1_approved_profiles a
left join public.be_merchant_financial_profiles_v2 p using (merchant_id)
on conflict (backup_build, merchant_id) do nothing;

insert into public.be_merchant_financial_profiles_v2 (
  merchant_id,
  customer_tier,
  is_active,
  effective_from,
  effective_to,
  updated_at,
  updated_by,
  merchant_name,
  counterparty_type
)
select
  a.merchant_id,
  a.customer_tier,
  a.is_active,
  a.effective_from,
  a.effective_to,
  now(),
  auth.uid(),
  a.merchant_name,
  a.counterparty_type
from tmp_v58_1_approved_profiles a
where not exists (
  select 1 from public.be_merchant_financial_profiles_v2 p
  where p.merchant_id = a.merchant_id
);

insert into public.be_audit_events (
  module_code,
  action_code,
  entity_type,
  entity_id,
  actor_user_id,
  actor_employee_id,
  branch_code,
  before_value,
  after_value,
  reason,
  request_id,
  created_at
)
select
  'DATA_ENTRY_FINANCIAL_V2',
  'MERCHANT_PROFILE_APPROVED',
  'MERCHANT_FINANCIAL_PROFILE',
  a.merchant_id,
  auth.uid(),
  null,
  null,
  b.row_data,
  to_jsonb(p) || jsonb_build_object(
    'approval_reference', a.approval_reference,
    'approved_by', a.approved_by
  ),
  'Approved merchant financial tier under ' || a.approval_reference || ' by ' || a.approved_by,
  'V58_1:' || a.approval_reference || ':' || a.merchant_id,
  now()
from tmp_v58_1_approved_profiles a
join public.be_merchant_financial_profiles_v2 p using (merchant_id)
join public.be_merchant_financial_profiles_v2_backup_v58_1 b
  on b.backup_build = 'MERCHANT_FINANCIAL_PROFILES_V58_1_2026_07_31'
 and b.merchant_id = a.merchant_id
where not exists (
  select 1
  from public.be_audit_events e
  where e.request_id = 'V58_1:' || a.approval_reference || ':' || a.merchant_id
    and e.action_code = 'MERCHANT_PROFILE_APPROVED'
    and e.entity_type = 'MERCHANT_FINANCIAL_PROFILE'
    and e.entity_id = a.merchant_id
);

do $v58_1_postcheck$
declare
  v_match integer;
begin
  select count(*) into v_match
  from tmp_v58_1_approved_profiles a
  join public.be_merchant_financial_profiles_v2 p using (merchant_id)
  where p.customer_tier = a.customer_tier
    and p.is_active = a.is_active
    and p.effective_from = a.effective_from
    and p.effective_to is not distinct from a.effective_to
    and p.counterparty_type = a.counterparty_type
    and p.merchant_name = a.merchant_name;

  if v_match <> 9 then
    raise exception 'Post-import profile verification failed: expected 9 exact matches, found %', v_match;
  end if;
end
$v58_1_postcheck$;

commit;

select jsonb_pretty(jsonb_build_object(
  'ok', true,
  'build', 'MERCHANT_FINANCIAL_PROFILES_V58_1_2026_07_31',
  'approval_reference', 'MANAGEMENT-APPROVAL-2026-07-31',
  'approved_by', 'Kyaw Wanna (md@britiumexpress.com)',
  'message', 'Nine approved merchant financial profiles imported or confirmed idempotently.'
));
