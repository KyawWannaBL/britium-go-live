-- Britium production remediation V56
-- Read-only backend inventory for the remaining Financial V2, Mobile, HR,
-- Accounts, Business Development, and Marketing workstreams.
-- This script does not create, update, or delete production data.

-- 1. Required contract existence summary.
with required(module_code, function_name) as (
  values
    ('DATA_ENTRY_V2', 'be_data_entry_financial_v2_schema'),
    ('DATA_ENTRY_V2', 'be_data_entry_financial_v2_snapshot'),
    ('DATA_ENTRY_V2', 'be_data_entry_financial_v2_calculate'),
    ('DATA_ENTRY_V2', 'be_data_entry_financial_v2_save'),
    ('DATA_ENTRY_V2', 'be_data_entry_financial_v2_import'),
    ('DATA_ENTRY_V2', 'be_data_entry_financial_v2_create_waybill'),
    ('BUSINESS_DEVELOPMENT', 'be_business_development_command_v54'),
    ('MARKETING_ANALYTICS', 'be_live_marketing_snapshot_v54'),
    ('MARKETING_PORTAL', 'be_marketing_portal_snapshot_v54'),
    ('MOBILE_OPERATIONS', 'be_mobile_operations_snapshot_v54'),
    ('MOBILE_OPERATIONS', 'be_mobile_operations_create_support_v54'),
    ('MOBILE_OPERATIONS', 'be_mobile_operations_safe_resync_v54'),
    ('MOBILE_OPERATIONS', 'be_mobile_operations_retry_event_v54'),
    ('MOBILE_OPERATIONS', 'be_mobile_operations_reset_pin_request_v54'),
    ('MOBILE_OPERATIONS', 'be_mobile_operations_unlock_account_v54'),
    ('ADMIN_HR', 'be_hr_employee_create_v54'),
    ('ADMIN_HR', 'be_hr_employee_update_v54'),
    ('ADMIN_HR', 'be_hr_employee_set_status_v54'),
    ('ADMIN_HR', 'be_hr_employee_transfer_department_v54'),
    ('ADMIN_HR', 'be_hr_employee_change_branch_v54'),
    ('ADMIN_HR', 'be_hr_employee_assign_position_v54'),
    ('ADMIN_HR', 'be_hr_employee_assign_app_role_v54'),
    ('ADMIN_HR', 'be_hr_employee_link_account_v54'),
    ('ADMIN_HR', 'be_hr_employee_reset_access_v54'),
    ('ADMIN_HR', 'be_hr_employee_history_v54'),
    ('ACCOUNTS', 'be_account_request_create_v54'),
    ('ACCOUNTS', 'be_account_request_review_v54'),
    ('ACCOUNTS', 'be_account_profile_update_v54'),
    ('ACCOUNTS', 'be_account_role_assign_v54'),
    ('ACCOUNTS', 'be_account_permission_assign_v54'),
    ('ACCOUNTS', 'be_account_branch_restrict_v54'),
    ('ACCOUNTS', 'be_account_expiry_set_v54'),
    ('ACCOUNTS', 'be_account_login_history_v54'),
    ('ACCOUNTS', 'be_account_audit_history_v54')
), found as (
  select
    r.module_code,
    r.function_name,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = r.function_name
    ) as exists_in_public
  from required r
)
select jsonb_pretty(
  jsonb_build_object(
    'generated_at', now(),
    'modules', jsonb_object_agg(module_code, module_result order by module_code)
  )
)
from (
  select
    module_code,
    jsonb_build_object(
      'required', count(*),
      'present', count(*) filter (where exists_in_public),
      'missing', count(*) filter (where not exists_in_public),
      'functions', jsonb_agg(
        jsonb_build_object('name', function_name, 'exists', exists_in_public)
        order by function_name
      )
    ) as module_result
  from found
  group by module_code
) x;

-- 2. Existing and required Data Entry function signatures and definitions.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'be_data_entry_pickup_list_web_v16',
    'be_calculate_parcel_sheet_amounts',
    'be_calculate_parcel_amounts',
    'be_save_data_entry_parcel_sheet',
    'be_save_data_entry_parcel',
    'be_data_entry_confirm_waybill_v24',
    'be_data_entry_confirm_partial_waybill_v25',
    'be_data_entry_create_waybill_from_parcel_sheet',
    'be_data_entry_create_waybill_from_rows',
    'be_data_entry_create_waybill',
    'be_data_entry_financial_v2_schema',
    'be_data_entry_financial_v2_snapshot',
    'be_data_entry_financial_v2_calculate',
    'be_data_entry_financial_v2_save',
    'be_data_entry_financial_v2_import',
    'be_data_entry_financial_v2_create_waybill'
  )
order by p.proname, arguments;

-- 3. Structures used by current and target Data Entry.
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and (
    c.table_name in (
      'parcels',
      'be_data_entry_register_rows',
      'be_data_entry_parcel_details',
      'be_data_entry_registration_lines',
      'be_data_entry_registration_lines_v5',
      'be_parcel_waybills',
      'be_audit_events'
    )
    or c.table_name ilike '%tariff%'
  )
order by c.table_name, c.ordinal_position;

-- 4. Indexes and constraints relevant to parcel identity and idempotency.
select
  n.nspname as schema_name,
  t.relname as table_name,
  i.relname as index_name,
  ix.indisunique,
  ix.indisprimary,
  pg_get_indexdef(ix.indexrelid) as index_definition,
  pg_get_expr(ix.indpred, ix.indrelid) as predicate
from pg_index ix
join pg_class t on t.oid = ix.indrelid
join pg_class i on i.oid = ix.indexrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and (
    t.relname in (
      'parcels',
      'be_data_entry_register_rows',
      'be_data_entry_parcel_details',
      'be_parcel_waybills',
      'be_audit_events'
    )
    or t.relname ilike '%tariff%'
  )
order by t.relname, i.relname;

-- 5. RLS and policies for current browser-accessed protected tables.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'parcels',
    'be_data_entry_register_rows',
    'be_data_entry_parcel_details',
    'be_parcel_waybills'
  )
order by tablename, policyname;

-- 6. Existing definitions for remaining remediation contracts, when present.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname like 'be_business_development%'
    or p.proname like 'be_live_marketing%'
    or p.proname like 'be_marketing_%_v54'
    or p.proname like 'be_mobile_operations%'
    or p.proname like 'be_hr_employee%'
    or p.proname like 'be_account_%_v54'
    or p.proname = 'be_admin_hr_snapshot'
  )
order by p.proname, arguments;
