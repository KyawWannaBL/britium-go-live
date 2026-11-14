create or replace function public.be_marketing_merchant_master_center_v1(
  p_search text default null,
  p_status text default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text:=public.be_current_role();
  v_rows jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('marketing','marketer','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.merchant_code),'[]'::jsonb)
  into v_rows
  from (
    select
      m.merchant_code,m.merchant_name,m.business_type,m.contact_person,m.phone_primary,m.phone_secondary,
      m.email,m.address_mm,m.address_line_1,m.township,m.city,m.region_state,m.customer_tier,
      m.allowed_cargo_weight_kg,m.monthly_commitment_parcels,m.commitment_discount_mmk,m.status,
      m.created_at,m.updated_at
    from public.be_master_merchants m
    where (nullif(btrim(coalesce(p_status,'')),'') is null or upper(coalesce(m.status,''))=upper(p_status))
      and (
        nullif(btrim(coalesce(p_search,'')),'') is null
        or m.merchant_code ilike '%'||p_search||'%'
        or m.merchant_name ilike '%'||p_search||'%'
        or coalesce(m.contact_person,'') ilike '%'||p_search||'%'
        or coalesce(m.phone_primary,'') ilike '%'||p_search||'%'
      )
    order by m.merchant_code
    limit greatest(1,least(coalesce(p_limit,500),2000))
  ) q;

  return jsonb_build_object('ok',true,'rows',v_rows,'build','MARKETING_MERCHANT_MASTER_V1');
end
$function$;

revoke all on function public.be_marketing_merchant_master_center_v1(text,text,integer) from public,anon;
grant execute on function public.be_marketing_merchant_master_center_v1(text,text,integer) to authenticated,service_role;

create or replace function public.be_marketing_merchant_master_upsert_v1(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text:=public.be_current_role();
  v_code text:=upper(btrim(coalesce(p_payload->>'merchant_code','')));
  v_name text:=btrim(coalesce(p_payload->>'merchant_name',''));
  v_status text:=upper(coalesce(nullif(btrim(p_payload->>'status'),''),'ACTIVE'));
  v_actor text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('marketing','marketer','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if v_code !~ '^[A-Z0-9]{3}$' then return jsonb_build_object('ok',false,'code','MERCHANT_CODE_MUST_BE_3_ALPHANUMERIC'); end if;
  if v_name='' then return jsonb_build_object('ok',false,'code','MERCHANT_NAME_REQUIRED'); end if;
  if v_status not in ('ACTIVE','INACTIVE','SUSPENDED') then return jsonb_build_object('ok',false,'code','INVALID_STATUS'); end if;

  insert into public.be_master_merchants(
    merchant_code,merchant_name,business_type,contact_person,phone_primary,phone_secondary,email,
    address_mm,address_line_1,township,city,region_state,customer_tier,allowed_cargo_weight_kg,
    monthly_commitment_parcels,commitment_discount_mmk,status,created_at,updated_at
  ) values(
    v_code,v_name,nullif(p_payload->>'business_type',''),nullif(p_payload->>'contact_person',''),
    nullif(p_payload->>'phone_primary',''),nullif(p_payload->>'phone_secondary',''),nullif(p_payload->>'email',''),
    nullif(p_payload->>'address_mm',''),nullif(p_payload->>'address_line_1',''),nullif(p_payload->>'township',''),
    nullif(p_payload->>'city',''),nullif(p_payload->>'region_state',''),
    upper(coalesce(nullif(p_payload->>'customer_tier',''),'STANDARD')),
    coalesce(nullif(p_payload->>'allowed_cargo_weight_kg','')::numeric,3),
    coalesce(nullif(p_payload->>'monthly_commitment_parcels','')::integer,0),
    coalesce(nullif(p_payload->>'commitment_discount_mmk','')::numeric,0),
    v_status,now(),now()
  )
  on conflict (merchant_code) do update set
    merchant_name=excluded.merchant_name,business_type=excluded.business_type,contact_person=excluded.contact_person,
    phone_primary=excluded.phone_primary,phone_secondary=excluded.phone_secondary,email=excluded.email,
    address_mm=excluded.address_mm,address_line_1=excluded.address_line_1,township=excluded.township,
    city=excluded.city,region_state=excluded.region_state,customer_tier=excluded.customer_tier,
    allowed_cargo_weight_kg=excluded.allowed_cargo_weight_kg,
    monthly_commitment_parcels=excluded.monthly_commitment_parcels,
    commitment_discount_mmk=excluded.commitment_discount_mmk,status=excluded.status,updated_at=now();

  insert into public.be_masterdata_merchants(
    merchant_id,merchant_code,merchant_name,contact_phone,pickup_address,pickup_township,pickup_city,
    payment_profile,service_profile,tariff_tier,status,created_at,updated_at
  ) values(
    v_code,v_code,v_name,nullif(p_payload->>'phone_primary',''),
    coalesce(nullif(p_payload->>'address_line_1',''),nullif(p_payload->>'address_mm','')),
    nullif(p_payload->>'township',''),nullif(p_payload->>'city',''),
    coalesce(nullif(p_payload->>'payment_profile',''),'COD'),
    coalesce(nullif(p_payload->>'service_profile',''),'STANDARD'),
    upper(coalesce(nullif(p_payload->>'customer_tier',''),'STANDARD')),
    v_status,now(),now()
  )
  on conflict (merchant_id) do update set
    merchant_code=excluded.merchant_code,merchant_name=excluded.merchant_name,contact_phone=excluded.contact_phone,
    pickup_address=excluded.pickup_address,pickup_township=excluded.pickup_township,pickup_city=excluded.pickup_city,
    payment_profile=excluded.payment_profile,service_profile=excluded.service_profile,tariff_tier=excluded.tariff_tier,
    status=excluded.status,updated_at=now();

  insert into public.be_merchant_master(merchant_code,merchant_name,contact_phone,pickup_township,pickup_address,created_at)
  values(v_code,v_name,nullif(p_payload->>'phone_primary',''),nullif(p_payload->>'township',''),
         coalesce(nullif(p_payload->>'address_line_1',''),nullif(p_payload->>'address_mm','')),now())
  on conflict (merchant_code) do update set
    merchant_name=excluded.merchant_name,contact_phone=excluded.contact_phone,
    pickup_township=excluded.pickup_township,pickup_address=excluded.pickup_address;

  insert into public.be_master_data_rows(dataset_key,record_key,payload,status,created_at,updated_at,updated_by_email,deleted_at)
  values('merchant_master',v_code,
    p_payload || jsonb_build_object('merchant_code',v_code,'merchant_name',v_name,'status',lower(v_status)),
    lower(v_status),now(),now(),v_actor,case when v_status='INACTIVE' then now() else null end)
  on conflict (dataset_key,record_key) do update set
    payload=excluded.payload,status=excluded.status,updated_at=now(),updated_by_email=v_actor,
    deleted_at=case when v_status='INACTIVE' then now() else null end;

  return jsonb_build_object('ok',true,'merchant_code',v_code,'merchant_name',v_name,'status',v_status,'synchronized',true);
end
$function$;

revoke all on function public.be_marketing_merchant_master_upsert_v1(jsonb) from public,anon;
grant execute on function public.be_marketing_merchant_master_upsert_v1(jsonb) to authenticated,service_role;

create or replace function public.be_supervisor_workforce_master_center_v1(
  p_type text default null,
  p_status text default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public','auth','pg_temp'
as $function$
declare
  v_role text:=public.be_current_role();
  v_rows jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('supervisor','manager','operation_manager','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.workforce_type,q.workforce_code),'[]'::jsonb)
  into v_rows
  from (
    select 'RIDER'::text workforce_type,r.rider_code workforce_code,coalesce(r.rider_name,r.name,r.rider_code) workforce_name,
           coalesce(r.phone_primary,r.phone) phone,r.assigned_zone,r.branch_code,r.employment_type,r.status,
           null::text license_no,null::text assigned_fleet_id,r.created_at,r.updated_at
    from public.be_master_riders r
    union all
    select 'DRIVER',d.driver_code,coalesce(d.driver_name,d.name,d.driver_code),coalesce(d.phone_primary,d.phone),
           null,d.branch_code,null,d.status,d.license_no,d.assigned_fleet_id,d.created_at,d.updated_at
    from public.be_master_drivers d
    union all
    select 'HELPER',h.helper_code,coalesce(h.helper_name,h.name,h.helper_code),coalesce(h.phone_primary,h.phone),
           h.assigned_zone,h.branch_code,h.employment_type,h.status,null,null,h.created_at,h.updated_at
    from public.be_master_helpers h
  ) q
  where (nullif(btrim(coalesce(p_type,'')),'') is null or q.workforce_type=upper(p_type))
    and (nullif(btrim(coalesce(p_status,'')),'') is null or upper(coalesce(q.status,''))=upper(p_status))
    and (nullif(btrim(coalesce(p_search,'')),'') is null
      or q.workforce_code ilike '%'||p_search||'%' or q.workforce_name ilike '%'||p_search||'%'
      or coalesce(q.phone,'') ilike '%'||p_search||'%');

  return jsonb_build_object('ok',true,'rows',v_rows,'build','SUPERVISOR_WORKFORCE_MASTER_V1');
end
$function$;

revoke all on function public.be_supervisor_workforce_master_center_v1(text,text,text) from public,anon;
grant execute on function public.be_supervisor_workforce_master_center_v1(text,text,text) to authenticated,service_role;

create or replace function public.be_supervisor_workforce_master_upsert_v1(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_temp'
as $function$
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
$function$;

revoke all on function public.be_supervisor_workforce_master_upsert_v1(jsonb) from public,anon;
grant execute on function public.be_supervisor_workforce_master_upsert_v1(jsonb) to authenticated,service_role;
