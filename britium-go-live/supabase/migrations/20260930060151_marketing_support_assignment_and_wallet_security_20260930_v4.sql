
begin;

create or replace function public.be_marketing_support_assignment_upsert_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_merchant_id text:=nullif(btrim(coalesce(p_payload->>'merchant_id',p_payload->>'merchant_code','')),'');
  v_employee_email text:=lower(nullif(btrim(coalesce(p_payload->>'employee_email','')),''));
  v_employee_id text:=nullif(btrim(coalesce(p_payload->>'employee_id','')),'');
  v_employee_name text:=nullif(btrim(coalesce(p_payload->>'employee_name','')),'');
  v_effective_from date:=coalesce(nullif(p_payload->>'effective_from','')::date,current_date);
  v_merchant record;
  v_emp record;
  v_id uuid;
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('financial_reports')
    or exists(
      select 1 from public.be_user_account_registry u
      where u.auth_user_id=auth.uid()
        and upper(coalesce(u.role,'')) in ('MARKETING','MARKETER','SUPER_ADMIN','MANAGER')
    )
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if v_merchant_id is null then
    return jsonb_build_object('ok',false,'code','MERCHANT_REQUIRED');
  end if;

  select *
  into v_merchant
  from public.merchants m
  where upper(coalesce(m.merchant_code,''))=upper(v_merchant_id)
     or m.id::text=v_merchant_id
  order by m.updated_at desc nulls last
  limit 1;

  if not found or not coalesce(v_merchant.is_active,true) then
    return jsonb_build_object('ok',false,'code','ACTIVE_MERCHANT_NOT_FOUND');
  end if;

  if v_employee_email is not null then
    select *
    into v_emp
    from public.be_employee_master e
    where lower(coalesce(e.email,''))=v_employee_email
      and coalesce(e.is_active,true)
      and upper(coalesce(e.status,'ACTIVE')) not in ('INACTIVE','RESIGNED','TERMINATED')
    order by e.updated_at desc nulls last
    limit 1;
  elsif v_employee_id is not null then
    select *
    into v_emp
    from public.be_employee_master e
    where e.employee_id=v_employee_id or e.employee_code=v_employee_id
      and coalesce(e.is_active,true)
      and upper(coalesce(e.status,'ACTIVE')) not in ('INACTIVE','RESIGNED','TERMINATED')
    order by e.updated_at desc nulls last
    limit 1;
  else
    return jsonb_build_object('ok',false,'code','EMPLOYEE_REQUIRED');
  end if;

  if not found then
    return jsonb_build_object('ok',false,'code','ACTIVE_EMPLOYEE_NOT_FOUND');
  end if;

  v_employee_id:=coalesce(nullif(v_emp.employee_id,''),nullif(v_emp.employee_code,''),v_emp.id::text);
  v_employee_email:=lower(coalesce(nullif(v_emp.email,''),v_employee_email));
  v_employee_name:=coalesce(v_employee_name,nullif(v_emp.employee_name,''),nullif(v_emp.full_name,''),nullif(v_emp.name,''),v_employee_email);

  update public.be_merchant_referral_assignments
  set effective_to=v_effective_from-1,
      active=true,
      updated_at=now(),
      notes=concat_ws(E'\n',notes,'Superseded by marketing support assignment on '||v_effective_from::text)
  where merchant_id=coalesce(nullif(v_merchant.merchant_code,''),v_merchant.id::text)
    and active
    and effective_from<=v_effective_from
    and (effective_to is null or effective_to>=v_effective_from)
    and lower(coalesce(referrer_email,''))<>v_employee_email;

  insert into public.be_merchant_referral_assignments(
    merchant_id,merchant_code,merchant_name,
    referrer_employee_id,referrer_email,referrer_name,
    effective_from,effective_to,active,created_by,notes,created_at,updated_at
  ) values (
    coalesce(nullif(v_merchant.merchant_code,''),v_merchant.id::text),
    v_merchant.merchant_code,
    coalesce(nullif(v_merchant.merchant_name,''),nullif(v_merchant.name,''),nullif(v_merchant.business_name,''),v_merchant.merchant_code),
    v_employee_id,v_employee_email,v_employee_name,
    v_effective_from,null,true,
    coalesce(auth.jwt()->>'email','system'),
    'Marketing support commission assignment: 100 MMK per successfully delivered parcel per month while both employee and merchant remain active.',
    now(),now()
  )
  returning id into v_id;

  insert into public.be_employee_commission_eligibility(
    employee_id,employee_email,employee_name,employed_from,employed_to,employment_status,source,notes,created_at,updated_at
  )
  select v_employee_id,v_employee_email,v_employee_name,
         coalesce(v_emp.created_at::date,v_effective_from),null,'ACTIVE','HR_SYNC',
         'Auto-linked from active employee master for marketing-support commission',now(),now()
  where not exists(
    select 1 from public.be_employee_commission_eligibility e
    where lower(e.employee_email)=v_employee_email
  );

  return jsonb_build_object(
    'ok',true,'assignment_id',v_id,
    'merchant_code',v_merchant.merchant_code,
    'merchant_name',coalesce(v_merchant.merchant_name,v_merchant.name,v_merchant.business_name),
    'employee_id',v_employee_id,'employee_email',v_employee_email,'employee_name',v_employee_name,
    'rate_mmk_per_delivered_parcel',100,
    'accrual','MONTHLY',
    'policy_version','COMMISSION_2026_09_30'
  );
end;
$$;

revoke all on function public.be_marketing_support_assignment_upsert_v1(jsonb)
from public,anon;
grant execute on function public.be_marketing_support_assignment_upsert_v1(jsonb)
to authenticated,service_role;

revoke all on function public.be_refresh_party_wallets_v1()
from public,anon;
grant execute on function public.be_refresh_party_wallets_v1()
to authenticated,service_role;

revoke all on function public.be_refresh_marketing_support_commission_month(date)
from public,anon;
grant execute on function public.be_refresh_marketing_support_commission_month(date)
to authenticated,service_role;

commit;
