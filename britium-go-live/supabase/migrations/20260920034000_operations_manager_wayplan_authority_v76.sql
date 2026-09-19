-- V76: make Supervisor/Wayplan authority use the Production account registry.
-- The Operations Manager account is already registered with elevated authority, but
-- legacy V39/V43 permission helpers only inspected stale JWT/profile role fields.

create or replace function public.be_is_super_admin_v39()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_claims jsonb := '{}'::jsonb;
  v_uid text := '';
  v_email text := '';
  v_role text := '';
  v_registry_role text := '';
begin
  if session_user = 'postgres' then
    return true;
  end if;

  -- V76: authoritative role source. This includes active registry roles and
  -- explicit superadmin delegations.
  begin
    v_registry_role := regexp_replace(lower(coalesce(public.be_current_role(),'')), '[^a-z0-9]+', '', 'g');
  exception when others then
    v_registry_role := '';
  end;

  if v_registry_role in ('superadmin','systemadmin','appowner') then
    return true;
  end if;

  begin
    v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;

  v_uid := coalesce(v_claims ->> 'sub', '');
  v_email := lower(coalesce(v_claims ->> 'email', ''));
  v_role := coalesce(
    v_claims -> 'app_metadata' ->> 'role',
    v_claims -> 'user_metadata' ->> 'role',
    v_claims ->> 'app_role',
    v_claims ->> 'role',
    ''
  );

  if regexp_replace(lower(v_role), '[^a-z0-9]+', '', 'g') in ('superadmin','systemadmin','appowner') then
    return true;
  end if;

  if to_regclass('public.profiles') is not null then
    begin
      execute $q$
        select coalesce(
          nullif(to_jsonb(p) ->> 'role', ''),
          nullif(to_jsonb(p) ->> 'user_role', ''),
          nullif(to_jsonb(p) ->> 'access_role', ''),
          nullif(to_jsonb(p) ->> 'portal_role', ''),
          ''
        )
        from public.profiles p
        where ($1 <> '' and (
          coalesce(to_jsonb(p) ->> 'id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'user_id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'auth_user_id', '') = $1
        ))
        or ($2 <> '' and lower(coalesce(to_jsonb(p) ->> 'email', '')) = $2)
        limit 1
      $q$ into v_role using v_uid, v_email;
    exception when others then
      v_role := coalesce(v_role, '');
    end;
  end if;

  return regexp_replace(lower(coalesce(v_role, '')), '[^a-z0-9]+', '', 'g')
    in ('superadmin','systemadmin','appowner');
end;
$function$;

create or replace function public.be_wayplan_review_role_v43()
returns text
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_claims jsonb := '{}'::jsonb;
  v_role text := '';
  v_registry_role text := '';
  v_uid text := '';
  v_email text := '';
begin
  if session_user = 'postgres' then
    return 'super_admin';
  end if;

  -- V76: prefer the centralized account registry/delegation resolver.
  begin
    v_registry_role := lower(regexp_replace(coalesce(public.be_current_role(), ''), '[^a-zA-Z0-9]+', '_', 'g'));
  exception when others then
    v_registry_role := '';
  end;

  if v_registry_role not in ('','guest') then
    return v_registry_role;
  end if;

  begin
    v_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_claims := '{}'::jsonb;
  end;

  v_uid := coalesce(v_claims ->> 'sub', '');
  v_email := lower(coalesce(v_claims ->> 'email', ''));
  v_role := coalesce(
    v_claims -> 'app_metadata' ->> 'role',
    v_claims -> 'user_metadata' ->> 'role',
    v_claims ->> 'app_role',
    v_claims ->> 'role',
    ''
  );

  if to_regclass('public.profiles') is not null then
    begin
      execute $q$
        select coalesce(
          nullif(to_jsonb(p) ->> 'role', ''),
          nullif(to_jsonb(p) ->> 'user_role', ''),
          nullif(to_jsonb(p) ->> 'access_role', ''),
          nullif(to_jsonb(p) ->> 'portal_role', ''),
          $3
        )
        from public.profiles p
        where ($1 <> '' and (
          coalesce(to_jsonb(p) ->> 'id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'user_id', '') = $1 or
          coalesce(to_jsonb(p) ->> 'auth_user_id', '') = $1
        ))
        or ($2 <> '' and lower(coalesce(to_jsonb(p) ->> 'email', '')) = $2)
        limit 1
      $q$ into v_role using v_uid, v_email, v_role;
    exception when others then
      null;
    end;
  end if;

  return lower(regexp_replace(coalesce(v_role, ''), '[^a-zA-Z0-9]+', '_', 'g'));
end;
$function$;

create or replace function public.be_wayplan_can_review_v43()
returns boolean
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text := regexp_replace(public.be_wayplan_review_role_v43(), '[^a-z0-9]+', '', 'g');
  v_super boolean := false;
begin
  if session_user = 'postgres' then return true; end if;

  begin
    v_super := public.be_is_super_admin_v39();
  exception when others then
    v_super := false;
  end;

  return coalesce(v_super,false) or v_role in (
    'superadmin','systemadmin','appowner','admin','administrator',
    'supervisor','operationssupervisor',
    'operationmanager','operationsmanager','opsmanager','operationsadmin',
    'management','director',
    'branchadmin','branchmanager','dispatchsupervisor'
  );
end;
$function$;

create or replace function public.be_wayplan_supervisor_assign_crew_v68(
  p_wayplan_id text,
  p_driver_code text,
  p_rider_code text default null,
  p_helper_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text:=lower(replace(coalesce(public.be_current_user_role(),''),'-','_'));
  v_review text;
  v_options jsonb;
  v_driver jsonb;
  v_rider jsonb;
  v_helper jsonb;
  v_actor text:=coalesce(auth.jwt()->>'email',auth.uid()::text);
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  if v_role not in (
    'superadmin','super_admin','app_owner','admin','supervisor',
    'operations','operations_admin','operation_manager','operations_manager','ops_manager',
    'management','director'
  ) then
    raise exception 'Supervisor or Operations Manager authority is required.';
  end if;

  select review_status into v_review
  from public.be_wayplan_review_v43
  where wayplan_id=p_wayplan_id;

  if v_review is null then raise exception 'Wayplan review record not found.'; end if;
  if upper(v_review) in ('DISPATCH_READY','DISPATCHED') then
    raise exception 'Crew editing is locked after the Wayplan is released to Dispatch.';
  end if;

  v_options:=public.be_wayplan_assignment_options_v44();

  select x into v_driver
  from jsonb_array_elements(v_options->'drivers') x
  where x->>'id'=p_driver_code;
  if v_driver is null then raise exception 'Choose an active Driver from the approved roster.'; end if;

  if nullif(p_rider_code,'') is not null then
    select x into v_rider
    from jsonb_array_elements(v_options->'riders') x
    where x->>'id'=p_rider_code;
    if v_rider is null then raise exception 'Choose an active Rider or leave Rider empty.'; end if;
  end if;

  if nullif(p_helper_code,'') is not null then
    select x into v_helper
    from jsonb_array_elements(v_options->'helpers') x
    where x->>'id'=p_helper_code;
    if v_helper is null then raise exception 'Choose an active Helper or leave Helper empty.'; end if;
  end if;

  if p_driver_code=coalesce(p_rider_code,'')
     or p_driver_code=coalesce(p_helper_code,'')
     or (nullif(p_rider_code,'') is not null and p_rider_code=coalesce(p_helper_code,'')) then
    raise exception 'Driver, Rider and Helper must be different people/codes.';
  end if;

  update public.be_wayplan_dispatches
  set driver_code=p_driver_code,
      driver_name=v_driver->>'name',
      rider_code=nullif(p_rider_code,''),
      rider_name=coalesce(v_rider->>'name',''),
      helper_code=nullif(p_helper_code,''),
      helper_name=coalesce(v_helper->>'name',''),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'supervisor_crew_updated_at',now(),
        'supervisor_crew_updated_by',v_actor
      ),
      updated_at=now()
  where wayplan_id=p_wayplan_id;

  update public.be_wayplan_dispatch_stops
  set rider_code=nullif(p_rider_code,''),
      rider_name=coalesce(v_rider->>'name',''),
      updated_at=now()
  where wayplan_id=p_wayplan_id;

  insert into public.be_audit_events(
    actor_id,actor_email,actor_role,action,resource_type,resource_id,details
  )
  values(
    auth.uid(),v_actor,public.be_current_user_role(),
    'SUPERVISOR_CREW_UPDATED_V76','WAYPLAN',p_wayplan_id,
    jsonb_build_object(
      'driver_code',p_driver_code,
      'rider_code',nullif(p_rider_code,''),
      'helper_code',nullif(p_helper_code,'')
    )
  );

  return jsonb_build_object(
    'ok',true,
    'wayplan_id',p_wayplan_id,
    'driver',v_driver,
    'rider',v_rider,
    'helper',v_helper,
    'review_status',v_review,
    'build','SUPERVISOR_CREW_ASSIGNMENT_AUTH_V76'
  );
end;
$function$;

grant execute on function public.be_is_super_admin_v39() to authenticated;
grant execute on function public.be_wayplan_review_role_v43() to authenticated;
grant execute on function public.be_wayplan_can_review_v43() to authenticated;
grant execute on function public.be_wayplan_supervisor_assign_crew_v68(text,text,text,text) to authenticated;
