-- Read-only verifier for ADMIN_HR_LEGACY_RPC_LOCKDOWN_V56_1_2026_07_31

select jsonb_pretty(
  jsonb_build_object(
    'build', 'ADMIN_HR_LEGACY_RPC_LOCKDOWN_V56_1_2026_07_31',
    'backup_rows', (
      select count(*)
      from public.be_rpc_security_backup_v56
      where build = 'ADMIN_HR_LEGACY_RPC_LOCKDOWN_V56_1_2026_07_31'
    ),

    'save_public_execute',
      has_function_privilege('public', 'public.be_hr_employee_save(jsonb,text)', 'execute'),
    'save_anon_execute',
      case when to_regrole('anon') is null then null
           else has_function_privilege('anon', 'public.be_hr_employee_save(jsonb,text)', 'execute') end,
    'save_authenticated_execute',
      case when to_regrole('authenticated') is null then null
           else has_function_privilege('authenticated', 'public.be_hr_employee_save(jsonb,text)', 'execute') end,

    'save_audited_public_execute',
      has_function_privilege('public', 'public.be_hr_employee_save_audited(jsonb,text)', 'execute'),
    'save_audited_anon_execute',
      case when to_regrole('anon') is null then null
           else has_function_privilege('anon', 'public.be_hr_employee_save_audited(jsonb,text)', 'execute') end,
    'save_audited_authenticated_execute',
      case when to_regrole('authenticated') is null then null
           else has_function_privilege('authenticated', 'public.be_hr_employee_save_audited(jsonb,text)', 'execute') end,

    'delete_public_execute',
      has_function_privilege('public', 'public.be_hr_employee_delete(text,text)', 'execute'),
    'delete_anon_execute',
      case when to_regrole('anon') is null then null
           else has_function_privilege('anon', 'public.be_hr_employee_delete(text,text)', 'execute') end,
    'delete_authenticated_execute',
      case when to_regrole('authenticated') is null then null
           else has_function_privilege('authenticated', 'public.be_hr_employee_delete(text,text)', 'execute') end,

    'delete_audited_public_execute',
      has_function_privilege('public', 'public.be_hr_employee_delete_audited(text,text)', 'execute'),
    'delete_audited_anon_execute',
      case when to_regrole('anon') is null then null
           else has_function_privilege('anon', 'public.be_hr_employee_delete_audited(text,text)', 'execute') end,
    'delete_audited_authenticated_execute',
      case when to_regrole('authenticated') is null then null
           else has_function_privilege('authenticated', 'public.be_hr_employee_delete_audited(text,text)', 'execute') end,

    'snapshot_public_execute',
      has_function_privilege('public', 'public.be_admin_hr_snapshot()', 'execute'),
    'snapshot_anon_execute',
      case when to_regrole('anon') is null then null
           else has_function_privilege('anon', 'public.be_admin_hr_snapshot()', 'execute') end,
    'snapshot_authenticated_execute',
      case when to_regrole('authenticated') is null then null
           else has_function_privilege('authenticated', 'public.be_admin_hr_snapshot()', 'execute') end,

    'service_role_mutation_execute',
      case when to_regrole('service_role') is null then null
           else (
             has_function_privilege('service_role', 'public.be_hr_employee_save(jsonb,text)', 'execute')
             and has_function_privilege('service_role', 'public.be_hr_employee_save_audited(jsonb,text)', 'execute')
             and has_function_privilege('service_role', 'public.be_hr_employee_delete(text,text)', 'execute')
             and has_function_privilege('service_role', 'public.be_hr_employee_delete_audited(text,text)', 'execute')
           ) end
  )
);
