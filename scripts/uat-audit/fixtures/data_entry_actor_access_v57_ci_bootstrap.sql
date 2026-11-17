-- CI-only original production Data Entry access guard, read-only source extraction.
-- Restore exact function logic before V29; no role elevation, no access-policy overrides.
CREATE OR REPLACE FUNCTION public.be_data_entry_actor_access_v57(p_action text DEFAULT 'view'::text, p_require_waybill boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_auth_role text := lower(coalesce(auth.role(), ''));
  v_action text := lower(btrim(coalesce(p_action, 'view')));
  v_registry record;
  v_matrix record;
  v_grant public.be_data_entry_access_grants_v57%rowtype;
  v_mode text := 'MATRIX_SHADOW';
  v_role text;
  v_data_entry_rights jsonb := '{}'::jsonb;
  v_waybill_rights jsonb := '{}'::jsonb;
  v_all_rights jsonb := '{}'::jsonb;
  v_module_allowed boolean := false;
  v_waybill_allowed boolean := true;
  v_matrix_allowed boolean := false;
  v_explicit_module_allowed boolean := true;
  v_explicit_waybill_allowed boolean := true;
  v_allowed boolean := false;
  v_reason text := null;
begin
  if v_action not in (
    'view', 'create', 'update', 'upload', 'export', 'approve', 'delete', 'admin'
  ) then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'reason_code', 'INVALID_ACTION',
      'message', 'Unsupported Data Entry permission action.'
    );
  end if;

  if v_auth_role = 'service_role' then
    return jsonb_build_object(
      'ok', true,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', true,
      'action', v_action,
      'require_waybill', coalesce(p_require_waybill, false),
      'actor_user_id', v_uid,
      'actor_role', 'service_role',
      'branch_code', null,
      'access_mode', 'SERVICE_ROLE',
      'source', 'service_role'
    );
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'reason_code', 'AUTHENTICATION_REQUIRED',
      'message', 'An authenticated production user is required.'
    );
  end if;

  select enforcement_mode
  into v_mode
  from public.be_data_entry_access_mode_v57
  where singleton
  limit 1;

  v_mode := coalesce(v_mode, 'MATRIX_SHADOW');

  select
    r.user_id::text as user_id,
    r.auth_user_id,
    lower(btrim(r.email)) as email,
    r.full_name,
    lower(replace(btrim(r.role), '-', '_')) as normalized_role,
    r.branch_code,
    lower(btrim(r.status)) as account_status
  into v_registry
  from public.be_user_account_registry r
  where r.auth_user_id = v_uid
  order by
    case when lower(btrim(r.status)) = 'active' then 0 else 1 end,
    r.user_id::text
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'access_mode', v_mode,
      'reason_code', 'ACCOUNT_REGISTRY_ROW_MISSING',
      'message', 'No production account-registry row is linked to the authenticated user.'
    );
  end if;

  if v_registry.account_status <> 'active' then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_registry.normalized_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'reason_code', 'ACCOUNT_NOT_ACTIVE',
      'message', 'The production account is not active.'
    );
  end if;

  select g.*
  into v_grant
  from public.be_data_entry_access_grants_v57 g
  where g.auth_user_id = v_uid
    and g.effective_from <= now()
    and (g.effective_to is null or g.effective_to > now())
    and g.grant_status in ('PENDING', 'APPROVED', 'DENIED')
  order by
    case g.grant_status
      when 'DENIED' then 0
      when 'PENDING' then 1
      when 'APPROVED' then 2
      else 3
    end,
    g.updated_at desc
  limit 1;

  if found and v_grant.grant_status = 'DENIED' then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_registry.normalized_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'explicit_grant_status', v_grant.grant_status,
      'explicit_grant_id', v_grant.grant_id,
      'reason_code', 'EXPLICIT_DATA_ENTRY_DENIAL',
      'message', 'This production identity is explicitly denied Data Entry access.'
    );
  end if;

  if v_mode = 'EXPLICIT_ONLY'
     and (v_grant.grant_status is distinct from 'APPROVED') then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_registry.normalized_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'explicit_grant_status', v_grant.grant_status,
      'reason_code', 'EXPLICIT_DATA_ENTRY_APPROVAL_REQUIRED',
      'message', 'An active approved Data Entry access grant is required.'
    );
  end if;

  v_role := v_registry.normalized_role;

  select
    m.role_id,
    m.role_name,
    m.authority_level,
    m.user_type,
    m.can_access_portal,
    m.is_active,
    coalesce(m.rights, '{}'::jsonb) as rights,
    coalesce(m.module_rights, '{}'::jsonb) as module_rights
  into v_matrix
  from public.be_role_authority_matrix m
  where lower(replace(btrim(m.role_id), '-', '_')) = v_role
    and m.is_active
    and m.can_access_portal
  order by m.authority_level desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
      'generated_at', now(),
      'allowed', false,
      'action', v_action,
      'actor_user_id', v_uid,
      'actor_employee_id', v_registry.user_id,
      'actor_email', v_registry.email,
      'actor_role', v_role,
      'branch_code', v_registry.branch_code,
      'access_mode', v_mode,
      'explicit_grant_status', v_grant.grant_status,
      'reason_code', 'ACTIVE_ROLE_MATRIX_ROW_MISSING',
      'message', 'The account role has no active portal authority profile.'
    );
  end if;

  v_all_rights := coalesce(v_matrix.rights #> '{modules,all}', '{}'::jsonb)
    || coalesce(v_matrix.module_rights #> '{modules,all}', '{}'::jsonb);
  v_data_entry_rights := coalesce(v_matrix.rights #> '{modules,data_entry}', '{}'::jsonb)
    || coalesce(v_matrix.module_rights #> '{modules,data_entry}', '{}'::jsonb);
  v_waybill_rights := coalesce(v_matrix.rights #> '{modules,waybill}', '{}'::jsonb)
    || coalesce(v_matrix.module_rights #> '{modules,waybill}', '{}'::jsonb);

  v_module_allowed :=
       coalesce((v_all_rights ->> 'admin')::boolean, false)
    or coalesce((v_all_rights ->> v_action)::boolean, false)
    or coalesce((v_data_entry_rights ->> 'admin')::boolean, false)
    or coalesce((v_data_entry_rights ->> v_action)::boolean, false);

  if coalesce(p_require_waybill, false) then
    v_waybill_allowed :=
         coalesce((v_all_rights ->> 'admin')::boolean, false)
      or coalesce((v_all_rights ->> v_action)::boolean, false)
      or coalesce((v_waybill_rights ->> 'admin')::boolean, false)
      or coalesce((v_waybill_rights ->> v_action)::boolean, false);
  end if;

  v_matrix_allowed := v_module_allowed and v_waybill_allowed;

  if v_mode = 'EXPLICIT_ONLY' then
    v_explicit_module_allowed :=
      v_action = any(coalesce(v_grant.allowed_actions, array[]::text[]))
      or 'admin' = any(coalesce(v_grant.allowed_actions, array[]::text[]));

    if coalesce(p_require_waybill, false) then
      v_explicit_waybill_allowed :=
        v_action = any(coalesce(v_grant.waybill_allowed_actions, array[]::text[]))
        or 'admin' = any(coalesce(v_grant.waybill_allowed_actions, array[]::text[]));
    end if;
  end if;

  v_allowed := v_matrix_allowed
    and v_explicit_module_allowed
    and v_explicit_waybill_allowed;

  if not v_module_allowed then
    v_reason := 'DATA_ENTRY_ACTION_NOT_ALLOWED';
  elsif not v_waybill_allowed then
    v_reason := 'WAYBILL_ACTION_NOT_ALLOWED';
  elsif not v_explicit_module_allowed then
    v_reason := 'EXPLICIT_DATA_ENTRY_ACTION_NOT_ALLOWED';
  elsif not v_explicit_waybill_allowed then
    v_reason := 'EXPLICIT_WAYBILL_ACTION_NOT_ALLOWED';
  end if;

  return jsonb_build_object(
    'ok', v_allowed,
    'build', 'DATA_ENTRY_EXPLICIT_ACCESS_SHADOW_V57_7_2026_07_31',
    'generated_at', now(),
    'allowed', v_allowed,
    'action', v_action,
    'require_waybill', coalesce(p_require_waybill, false),
    'actor_user_id', v_uid,
    'actor_employee_id', v_registry.user_id,
    'actor_email', v_registry.email,
    'actor_name', v_registry.full_name,
    'actor_role', v_role,
    'role_name', v_matrix.role_name,
    'authority_level', v_matrix.authority_level,
    'branch_code', v_registry.branch_code,
    'account_status', v_registry.account_status,
    'access_mode', v_mode,
    'explicit_grant_status', v_grant.grant_status,
    'explicit_grant_id', v_grant.grant_id,
    'data_entry_rights', v_data_entry_rights,
    'waybill_rights', v_waybill_rights,
    'all_rights', v_all_rights,
    'reason_code', v_reason,
    'source', case
      when v_mode = 'EXPLICIT_ONLY'
        then 'be_user_account_registry+be_role_authority_matrix+be_data_entry_access_grants_v57'
      else 'be_user_account_registry+be_role_authority_matrix+explicit_deny_override'
    end
  );
end;
$function$;
REVOKE ALL ON FUNCTION public.be_data_entry_actor_access_v57(text,boolean) FROM PUBLIC, anon, authenticated;
