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
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('supervisor','manager','operation_manager','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if v_type not in ('RIDER','DRIVER','HELPER') then return jsonb_build_object('ok',false,'code','INVALID_WORKFORCE_TYPE'); end if;
  if v_code !~ '^[A-Z0-9_-]{3,20}$' then return jsonb_build_object('ok',false,'code','INVALID_WORKFORCE_CODE'); end if;
  if v_name='' then return jsonb_build_object('ok',false,'code','WORKFORCE_NAME_REQUIRED'); end if;
  if v_status not in ('ACTIVE','INACTIVE','SUSPENDED') then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;

  if v_type='RIDER' then
    insert into public.be_master_riders(
      rider_id,rider_code,rider_name,name,phone_primary,phone,assigned_zone,branch_code,employment_type,status,created_at,updated_at
    ) values(
      v_code,v_code,v_name,v_name,nullif(p_payload->>'phone',''),nullif(p_payload->>'phone',''),
      nullif(p_payload->>'assigned_zone',''),nullif(p_payload->>'branch_code',''),
      coalesce(nullif(p_payload->>'employment_type',''),'FULL_TIME'),v_status,now(),now()
    )
    on conflict (rider_id) do update set
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
    on conflict (driver_id) do update set
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
    on conflict (helper_id) do update set
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

  return jsonb_build_object(
    'ok',true,'workforce_type',v_type,'workforce_code',v_code,'workforce_name',v_name,'status',v_status,
    'assignment_lists_synchronized',true
  );
end
$function$
