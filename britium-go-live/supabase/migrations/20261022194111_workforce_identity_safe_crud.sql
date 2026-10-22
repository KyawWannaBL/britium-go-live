-- Preserve existing internal IDs and history; explicit creates cannot overwrite a worker.
CREATE OR REPLACE FUNCTION public.be_supervisor_workforce_master_upsert_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_role text:=public.be_current_role();
  v_type text:=upper(btrim(coalesce(p_payload->>'workforce_type','')));
  v_code text:=upper(btrim(coalesce(p_payload->>'workforce_code','')));
  v_name text:=btrim(coalesce(p_payload->>'workforce_name',''));
  v_status text:=upper(coalesce(nullif(btrim(p_payload->>'status'),''),'ACTIVE'));
  v_dataset text;
  v_actor text:=lower(coalesce(auth.jwt()->>'email',''));
  v_payload jsonb;
  v_action text:=upper(coalesce(nullif(btrim(p_payload->>'record_action'),''),'UPSERT'));
  v_exists boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('supervisor','manager','operation_manager','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if v_type not in ('RIDER','DRIVER','HELPER') then return jsonb_build_object('ok',false,'code','INVALID_WORKFORCE_TYPE'); end if;
  if v_code !~ '^[A-Z0-9_-]{3,20}$' then return jsonb_build_object('ok',false,'code','INVALID_WORKFORCE_CODE'); end if;
  if v_name='' then return jsonb_build_object('ok',false,'code','WORKFORCE_NAME_REQUIRED'); end if;
  if v_status not in ('ACTIVE','INACTIVE','SUSPENDED') then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;

  if v_action not in ('CREATE','UPDATE','UPSERT') then return jsonb_build_object('ok',false,'code','INVALID_RECORD_ACTION'); end if;
  -- Serialize this code's create/edit/deactivate operations. Never identify people by phone.
  perform pg_advisory_xact_lock(hashtextextended('WORKFORCE:'||v_type||':'||v_code,0));
  if v_type='RIDER' then
    select exists(select 1 from public.be_master_riders where rider_code=v_code) into v_exists;
  elsif v_type='DRIVER' then
    select exists(select 1 from public.be_master_drivers where driver_code=v_code) into v_exists;
  else
    select exists(select 1 from public.be_master_helpers where helper_code=v_code) into v_exists;
  end if;
  if v_action='CREATE' and v_exists then return jsonb_build_object('ok',false,'code','WORKFORCE_CODE_EXISTS'); end if;
  if v_action='UPDATE' and not v_exists then return jsonb_build_object('ok',false,'code','WORKFORCE_NOT_FOUND'); end if;

  if v_type='RIDER' then
    insert into public.be_master_riders(
      rider_id,rider_code,rider_name,name,phone_primary,phone,assigned_zone,branch_code,employment_type,status,created_at,updated_at
    ) values(
      v_code,v_code,v_name,v_name,nullif(p_payload->>'phone',''),nullif(p_payload->>'phone',''),
      nullif(p_payload->>'assigned_zone',''),nullif(p_payload->>'branch_code',''),
      coalesce(nullif(p_payload->>'employment_type',''),'FULL_TIME'),v_status,now(),now()
    )
    on conflict (rider_code) do update set
      rider_code=excluded.rider_code,rider_name=excluded.rider_name,name=excluded.name,phone_primary=excluded.phone_primary,
      phone=excluded.phone,assigned_zone=excluded.assigned_zone,branch_code=excluded.branch_code,
      employment_type=excluded.employment_type,status=excluded.status,updated_at=now();
    v_dataset:='rider_master';
  elsif v_type='DRIVER' then
    insert into public.be_master_drivers(
      driver_id,driver_code,driver_name,name,phone_primary,phone,license_no,assigned_fleet_id,branch_code,status,created_at,updated_at
    ) values(
      v_code,v_code,v_name,v_name,nullif(p_payload->>'phone',''),nullif(p_payload->>'phone',''),
      nullif(p_payload->>'license_no',''),nullif(p_payload->>'assigned_fleet_id',''),
      nullif(p_payload->>'branch_code',''),v_status,now(),now()
    )
    on conflict (driver_code) do update set
      driver_code=excluded.driver_code,driver_name=excluded.driver_name,name=excluded.name,phone_primary=excluded.phone_primary,
      phone=excluded.phone,license_no=excluded.license_no,assigned_fleet_id=excluded.assigned_fleet_id,
      branch_code=excluded.branch_code,status=excluded.status,updated_at=now();
    v_dataset:='driver_master';
  else
    insert into public.be_master_helpers(
      helper_id,helper_code,helper_name,name,phone_primary,phone,assigned_zone,branch_code,employment_type,status,created_at,updated_at
    ) values(
      v_code,v_code,v_name,v_name,nullif(p_payload->>'phone',''),nullif(p_payload->>'phone',''),
      nullif(p_payload->>'assigned_zone',''),nullif(p_payload->>'branch_code',''),
      coalesce(nullif(p_payload->>'employment_type',''),'FULL_TIME'),v_status,now(),now()
    )
    on conflict (helper_code) do update set
      helper_code=excluded.helper_code,helper_name=excluded.helper_name,name=excluded.name,phone_primary=excluded.phone_primary,
      phone=excluded.phone,assigned_zone=excluded.assigned_zone,branch_code=excluded.branch_code,
      employment_type=excluded.employment_type,status=excluded.status,updated_at=now();
    v_dataset:='helper_master';
  end if;

  v_payload := p_payload || jsonb_build_object(
    'status',lower(v_status),
    case v_type when 'RIDER' then 'rider_name' when 'DRIVER' then 'driver_name' else 'helper_name' end,v_name,
    'phone_primary',nullif(p_payload->>'phone','')
  );

  insert into public.be_master_data_rows(dataset_key,record_key,payload,status,created_at,updated_at,updated_by_email,deleted_at)
  values(v_dataset,v_code,v_payload,lower(v_status),now(),now(),v_actor,case when v_status='INACTIVE' then now() else null end)
  on conflict (dataset_key,record_key) do update set
    payload=excluded.payload,status=excluded.status,updated_at=now(),updated_by_email=v_actor,
    deleted_at=case when v_status='INACTIVE' then now() else null end;

  -- Synchronize only existing, explicitly linked accounts; never infer identity from phone.
  update public.be_user_account_registry r set
    full_name=v_name,display_name=v_name,phone_number=nullif(p_payload->>'phone',''),
    status=case when v_status in ('INACTIVE','SUSPENDED') then lower(v_status) else r.status end,
    active=case when v_status in ('INACTIVE','SUSPENDED') then false else r.active end,
    is_active=case when v_status in ('INACTIVE','SUSPENDED') then false else r.is_active end,updated_at=now()
  where r.worker_code=v_code and upper(replace(coalesce(nullif(r.role_code,''),nullif(r.app_role,''),nullif(r.user_role,''),r.role),'-','_'))=v_type;
  update public.profiles p set full_name=v_name,phone=nullif(p_payload->>'phone',''),
    status=case when v_status in ('INACTIVE','SUSPENDED') then lower(v_status) else p.status end,
    is_active=case when v_status in ('INACTIVE','SUSPENDED') then false else p.is_active end,updated_at=now()
  where exists(select 1 from public.be_user_account_registry r where r.auth_user_id=p.id and r.worker_code=v_code
    and upper(replace(coalesce(nullif(r.role_code,''),nullif(r.app_role,''),nullif(r.user_role,''),r.role),'-','_'))=v_type);
  -- Restoring master availability does not silently unblock independently suspended logins.

  return jsonb_build_object(
    'ok',true,'workforce_type',v_type,'workforce_code',v_code,'workforce_name',v_name,'status',v_status,
    'assignment_lists_synchronized',true
  );
end
$function$;
-- HR employee write guards: match existing HR document authority; account roles remain separate.
CREATE OR REPLACE FUNCTION public.be_hr_employee_delete(p_employee_id text, p_actor_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_count integer := 0;
  v_id uuid;
begin

  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(public.be_current_role(),'') not in ('hr_admin','superadmin','super_admin','admin') then raise exception 'HR_EMPLOYEE_WRITE_NOT_AUTHORIZED' using errcode='42501'; end if;
  p_actor_email := lower(coalesce(auth.jwt()->>'email',''));
  select id into v_id from public.be_employee_master
  where employee_id=p_employee_id or id::text=p_employee_id or email=p_employee_id
  order by case when employee_id=p_employee_id then 0 when id::text=p_employee_id then 1 else 2 end limit 1;
  if exists(select 1 from public.be_employee_master e where e.id=v_id and e.auth_user_id=auth.uid()) then
    raise exception 'SELF_DEACTIVATION_NOT_ALLOWED' using errcode='42501';
  end if;
  if exists(select 1 from public.be_employee_master e join public.be_user_account_registry r on r.auth_user_id=e.auth_user_id
    where e.id=v_id and lower(replace(coalesce(nullif(r.role_code,''),nullif(r.app_role,''),nullif(r.user_role,''),r.role),'-','_'))
      in ('admin','superadmin','super_admin','app_owner','sys')) then
    raise exception 'PRIVILEGED_ACCOUNT_PROTECTED' using errcode='42501';
  end if;
  update public.be_employee_master
  set
    is_active = false,
    status = 'inactive',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_by', p_actor_email,
      'deleted_at', now()
    ),
    updated_at = now()
  where id=v_id;

  get diagnostics v_count = row_count;

  update public.be_user_account_registry r set
    full_name=coalesce(e.display_name,e.employee_name,r.full_name),display_name=coalesce(e.display_name,e.employee_name,r.display_name),phone_number=e.phone_primary,
    status=case when not e.is_active then lower(e.status) else r.status end,
    active=case when not e.is_active then false else r.active end,
    is_active=case when not e.is_active then false else r.is_active end,updated_at=now()
  from public.be_employee_master e where e.id=v_id and e.auth_user_id=r.auth_user_id;
  update public.profiles p set full_name=coalesce(e.display_name,e.employee_name,p.full_name),phone=e.phone_primary,
    status=case when not e.is_active then lower(e.status) else p.status end,
    is_active=case when not e.is_active then false else p.is_active end,updated_at=now()
  from public.be_employee_master e where e.id=v_id and e.auth_user_id=p.id;



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
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_before jsonb := '{}'::jsonb;
  v_result jsonb;
begin

  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(public.be_current_role(),'') not in ('hr_admin','superadmin','super_admin','admin') then raise exception 'HR_EMPLOYEE_WRITE_NOT_AUTHORIZED' using errcode='42501'; end if;
  p_actor_email := lower(coalesce(auth.jwt()->>'email',''));
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
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_email text := nullif(coalesce(p_record->>'email', p_record->>'account'), '');
  v_employee_id text := nullif(coalesce(p_record->>'employee_id', p_record->>'employee_code'), '');
begin

  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(public.be_current_role(),'') not in ('hr_admin','superadmin','super_admin','admin') then raise exception 'HR_EMPLOYEE_WRITE_NOT_AUTHORIZED' using errcode='42501'; end if;
  p_actor_email := lower(coalesce(auth.jwt()->>'email',''));

  -- Keep code/name/phone/status consistent regardless of which client submits the record.
  if p_record ? 'status' then
    if lower(btrim(p_record->>'status')) not in ('active','inactive','suspended') then raise exception 'INVALID_EMPLOYEE_STATUS'; end if;
    p_record := p_record || jsonb_build_object('status',lower(btrim(p_record->>'status')),'is_active',lower(btrim(p_record->>'status'))='active');
  end if;
  if p_record ? 'phone_primary' or p_record ? 'phone_e164' or p_record ? 'phone' then
    p_record := p_record || jsonb_build_object('phone_e164',coalesce(p_record->>'phone_primary',p_record->>'phone_e164',p_record->>'phone',''));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('HR_EMPLOYEE_WRITE',0));
  if v_email is null and v_employee_id is null then
    raise exception 'employee_id or email is required';
  end if;

  -- Prefer the stable employee identity; an email edit must never select somebody else.
  select id into v_id from public.be_employee_master
  where (v_employee_id is not null and employee_id=v_employee_id)
     or (v_employee_id is null and v_email is not null and lower(email)=lower(v_email))
  order by updated_at desc nulls last limit 1;
  if upper(coalesce(p_record->>'record_action','UPSERT'))='CREATE' and
     exists(select 1 from public.be_employee_master where employee_id=v_employee_id or employee_code=p_record->>'employee_code' or (v_email is not null and lower(email)=lower(v_email)))
  then raise exception 'EMPLOYEE_CODE_EXISTS'; end if;
  if upper(coalesce(p_record->>'record_action','UPSERT'))='UPDATE' and v_id is null then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  if v_id is not null and p_record ? 'employee_code' and exists(
    select 1 from public.be_employee_master where id=v_id and coalesce(nullif(employee_code,''),employee_id) is distinct from p_record->>'employee_code'
  ) then raise exception 'EMPLOYEE_CODE_IMMUTABLE'; end if;
  if exists(select 1 from public.be_employee_master where id is distinct from v_id and
     ((v_email is not null and lower(email)=lower(v_email)) or (nullif(p_record->>'employee_code','') is not null and employee_code=p_record->>'employee_code')))
  then raise exception 'EMPLOYEE_IDENTITY_CONFLICT'; end if;

  if lower(coalesce(p_record->>'status','active')) in ('inactive','suspended') or p_record->>'is_active'='false' then
  if exists(select 1 from public.be_employee_master e where e.id=v_id and e.auth_user_id=auth.uid()) then
    raise exception 'SELF_DEACTIVATION_NOT_ALLOWED' using errcode='42501';
  end if;
  if exists(select 1 from public.be_employee_master e join public.be_user_account_registry r on r.auth_user_id=e.auth_user_id
    where e.id=v_id and lower(replace(coalesce(nullif(r.role_code,''),nullif(r.app_role,''),nullif(r.user_role,''),r.role),'-','_'))
      in ('admin','superadmin','super_admin','app_owner','sys')) then
    raise exception 'PRIVILEGED_ACCOUNT_PROTECTED' using errcode='42501';
  end if;
  end if;

  if v_id is null then
    insert into public.be_employee_master (
      id,
      employee_id,
      employee_code,
      employee_name,
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
      phone_primary,
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
      coalesce(nullif(p_record->>'employee_name',''),nullif(p_record->>'display_name',''),nullif(p_record->>'full_name','')),
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
      employee_name = coalesce(nullif(p_record->>'employee_name',''),nullif(p_record->>'display_name',''),employee_name),
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
      phone_e164 = case when p_record ? 'phone_e164' then nullif(p_record->>'phone_e164','') else phone_e164 end,
      phone_primary = case when p_record ? 'phone_e164' then nullif(p_record->>'phone_e164','') else phone_primary end,
      status = coalesce(nullif(p_record->>'status', ''), status, 'active'),
      is_active = coalesce((p_record->>'is_active')::boolean, is_active, true),
      force_password_change = coalesce((p_record->>'force_password_change')::boolean, force_password_change, false),
      metadata = coalesce(metadata, '{}'::jsonb) || p_record || jsonb_build_object('updated_by', p_actor_email),
      updated_at = now()
    where id = v_id;
  end if;

  update public.be_user_account_registry r set
    full_name=coalesce(e.display_name,e.employee_name,r.full_name),display_name=coalesce(e.display_name,e.employee_name,r.display_name),phone_number=e.phone_primary,
    status=case when not e.is_active then lower(e.status) else r.status end,
    active=case when not e.is_active then false else r.active end,
    is_active=case when not e.is_active then false else r.is_active end,updated_at=now()
  from public.be_employee_master e where e.id=v_id and e.auth_user_id=r.auth_user_id;
  update public.profiles p set full_name=coalesce(e.display_name,e.employee_name,p.full_name),phone=e.phone_primary,
    status=case when not e.is_active then lower(e.status) else p.status end,
    is_active=case when not e.is_active then false else p.is_active end,updated_at=now()
  from public.be_employee_master e where e.id=v_id and e.auth_user_id=p.id;

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
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_employee_id text;
  v_email text;
  v_before jsonb := '{}'::jsonb;
begin

  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='28000'; end if;
  if coalesce(public.be_current_role(),'') not in ('hr_admin','superadmin','super_admin','admin') then raise exception 'HR_EMPLOYEE_WRITE_NOT_AUTHORIZED' using errcode='42501'; end if;
  p_actor_email := lower(coalesce(auth.jwt()->>'email',''));
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
