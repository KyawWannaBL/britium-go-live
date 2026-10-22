CREATE OR REPLACE FUNCTION public.be_hr_employee_delete(p_employee_id text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
begin
  update public.be_employee_master
  set
    is_active = false,
    status = 'inactive',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_by', p_actor_email,
      'deleted_at', now()
    ),
    updated_at = now()
  where employee_id = p_employee_id
     or id::text = p_employee_id
     or email = p_employee_id;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'deleted_rows', v_count
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.be_hr_employee_delete_audited(p_employee_id text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_before jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  select to_jsonb(e)
  into v_before
  from public.be_employee_master e
  where e.employee_id = p_employee_id
     or e.email = p_employee_id
     or e.id::text = p_employee_id
  limit 1;

  v_result := public.be_hr_employee_delete(p_employee_id, p_actor_email);

  perform public.be_write_governance_audit(
    'ADMIN_HR',
    'EMPLOYEE_DELETED',
    'be_employee_master',
    p_employee_id,
    p_actor_email,
    coalesce(v_before, '{}'::jsonb),
    v_result,
    jsonb_build_object(
      'source', 'be_hr_employee_delete_audited'
    )
  );

  return v_result;
end;
$function$;


CREATE OR REPLACE FUNCTION public.be_hr_employee_save(p_record jsonb, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_email text := nullif(coalesce(p_record->>'email', p_record->>'account'), '');
  v_employee_id text := nullif(coalesce(p_record->>'employee_id', p_record->>'employee_code'), '');
begin
  if v_email is null and v_employee_id is null then
    raise exception 'employee_id or email is required';
  end if;

  select id
  into v_id
  from public.be_employee_master
  where (
      v_email is not null
      and email is not null
      and lower(email) = lower(v_email)
    )
    or (
      v_employee_id is not null
      and employee_id = v_employee_id
    )
  order by updated_at desc nulls last
  limit 1;

  if v_id is null then
    insert into public.be_employee_master (
      id,
      employee_id,
      employee_code,
      account,
      email,
      display_name,
      full_name,
      name,
      designation,
      role_label,
      app_role,
      role_id,
      department,
      branch_code,
      workforce_type,
      phone_e164,
      status,
      is_active,
      force_password_change,
      metadata,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      coalesce(v_employee_id, 'EMP-' || to_char(now(), 'YYYYMMDDHH24MISSMS')),
      nullif(p_record->>'employee_code', ''),
      nullif(p_record->>'account', ''),
      v_email,
      coalesce(nullif(p_record->>'display_name', ''), nullif(p_record->>'full_name', ''), nullif(p_record->>'name', '')),
      coalesce(nullif(p_record->>'full_name', ''), nullif(p_record->>'display_name', ''), nullif(p_record->>'name', '')),
      coalesce(nullif(p_record->>'name', ''), nullif(p_record->>'full_name', ''), nullif(p_record->>'display_name', '')),
      nullif(p_record->>'designation', ''),
      nullif(p_record->>'role_label', ''),
      nullif(p_record->>'app_role', ''),
      nullif(p_record->>'role_id', ''),
      nullif(p_record->>'department', ''),
      coalesce(nullif(p_record->>'branch_code', ''), 'YGN'),
      nullif(p_record->>'workforce_type', ''),
      nullif(coalesce(p_record->>'phone_e164', p_record->>'phone'), ''),
      coalesce(nullif(p_record->>'status', ''), 'active'),
      coalesce((p_record->>'is_active')::boolean, true),
      coalesce((p_record->>'force_password_change')::boolean, false),
      p_record || jsonb_build_object('updated_by', p_actor_email),
      now(),
      now()
    )
    returning id into v_id;
  else
    update public.be_employee_master
    set
      employee_id = coalesce(v_employee_id, employee_id),
      employee_code = coalesce(nullif(p_record->>'employee_code', ''), employee_code),
      account = coalesce(nullif(p_record->>'account', ''), account),
      email = coalesce(v_email, email),
      display_name = coalesce(nullif(p_record->>'display_name', ''), nullif(p_record->>'full_name', ''), display_name),
      full_name = coalesce(nullif(p_record->>'full_name', ''), nullif(p_record->>'display_name', ''), full_name),
      name = coalesce(nullif(p_record->>'name', ''), nullif(p_record->>'full_name', ''), name),
      designation = coalesce(nullif(p_record->>'designation', ''), designation),
      role_label = coalesce(nullif(p_record->>'role_label', ''), role_label),
      app_role = coalesce(nullif(p_record->>'app_role', ''), app_role),
      role_id = coalesce(nullif(p_record->>'role_id', ''), role_id),
      department = coalesce(nullif(p_record->>'department', ''), department),
      branch_code = coalesce(nullif(p_record->>'branch_code', ''), branch_code, 'YGN'),
      workforce_type = coalesce(nullif(p_record->>'workforce_type', ''), workforce_type),
      phone_e164 = coalesce(nullif(coalesce(p_record->>'phone_e164', p_record->>'phone'), ''), phone_e164),
      status = coalesce(nullif(p_record->>'status', ''), status, 'active'),
      is_active = coalesce((p_record->>'is_active')::boolean, is_active, true),
      force_password_change = coalesce((p_record->>'force_password_change')::boolean, force_password_change, false),
      metadata = coalesce(metadata, '{}'::jsonb) || p_record || jsonb_build_object('updated_by', p_actor_email),
      updated_at = now()
    where id = v_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'employee_id', coalesce(v_employee_id, p_record->>'employee_id'),
    'email', v_email
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.be_hr_employee_save_audited(p_record jsonb, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
  v_employee_id text;
  v_email text;
  v_before jsonb := '{}'::jsonb;
begin
  v_employee_id := nullif(coalesce(p_record->>'employee_id', p_record->>'employee_code'), '');
  v_email := nullif(coalesce(p_record->>'email', p_record->>'account'), '');

  select to_jsonb(e)
  into v_before
  from public.be_employee_master e
  where (v_employee_id is not null and e.employee_id = v_employee_id)
     or (v_email is not null and lower(e.email) = lower(v_email))
  order by e.updated_at desc nulls last
  limit 1;

  v_result := public.be_hr_employee_save(p_record, p_actor_email);

  perform public.be_write_governance_audit(
    'ADMIN_HR',
    case when v_before is null then 'EMPLOYEE_CREATED' else 'EMPLOYEE_UPDATED' end,
    'be_employee_master',
    coalesce(v_result->>'employee_id', v_employee_id, v_email),
    p_actor_email,
    coalesce(v_before, '{}'::jsonb),
    p_record || v_result,
    jsonb_build_object(
      'email', v_email,
      'source', 'be_hr_employee_save_audited'
    )
  );

  return v_result;
end;
$function$;
