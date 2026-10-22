CREATE OR REPLACE FUNCTION public.be_marketing_merchant_master_upsert_v1(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
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
$function$
