-- Shared, authenticated, read-only workforce profile source.
-- No employee names, roles, authentication identities or assignments are overwritten.
create or replace function public.be_my_unified_workforce_profile_v1()
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp
as $$
declare
 v_uid uuid:=auth.uid();
 v_registry public.be_user_account_registry%rowtype;
 v_mobile public.be_mobile_workforce_accounts%rowtype;
 v_registry_count integer;
 v_mobile_count integer;
begin
 if v_uid is null then raise exception using errcode='42501',message='Authentication required'; end if;
 select count(*) into v_registry_count from public.be_user_account_registry where auth_user_id=v_uid;
 select count(*) into v_mobile_count from public.be_mobile_workforce_accounts where auth_user_id=v_uid;
 if v_registry_count>1 or v_mobile_count>1 then
   raise exception 'Duplicate workforce identity mapping; administrator review required';
 end if;
 if v_registry_count=0 and v_mobile_count=0 then
   raise exception 'No workforce profile linked to authenticated account';
 end if;
 select * into v_registry from public.be_user_account_registry where auth_user_id=v_uid;
 select * into v_mobile from public.be_mobile_workforce_accounts where auth_user_id=v_uid;
 if v_registry_count=1 and (coalesce(v_registry.active,true)=false or coalesce(v_registry.is_active,true)=false) then
   raise exception 'Workforce account inactive';
 end if;
 if v_mobile_count=1 and (coalesce(v_mobile.active,true)=false or coalesce(v_mobile.is_active,true)=false) then
   raise exception 'Mobile workforce account inactive';
 end if;
 return jsonb_build_object(
  'ok',true,'auth_user_id',v_uid,
  'employee_code',coalesce(nullif(v_registry.worker_code,''),nullif(v_registry.user_code,''),nullif(v_mobile.employee_code,''),nullif(v_mobile.workforce_code,''),nullif(v_mobile.worker_code,'')),
  'full_name',coalesce(nullif(v_registry.full_name,''),nullif(v_registry.display_name,''),nullif(v_mobile.full_name,''),nullif(v_mobile.display_name,''),nullif(v_mobile.name,'')),
  'email',coalesce(nullif(v_registry.email,''),nullif(v_registry.user_email,''),nullif(v_mobile.email,''),nullif(v_mobile.user_email,'')),
  'phone',coalesce(nullif(v_registry.phone_number,''),nullif(v_mobile.phone,''),nullif(v_mobile.phone_number,'')),
  'branch_code',coalesce(nullif(v_registry.branch_code,''),nullif(v_mobile.branch_code,'')),
  'department',v_registry.department,
  'enterprise_role',coalesce(nullif(v_registry.role_code,''),nullif(v_registry.role,'')),
  'mobile_role',coalesce(nullif(v_mobile.role_type,''),nullif(v_mobile.role,'')),
  'active',true,
  'requires_review',v_registry_count=0 or v_mobile_count=0 or
     (nullif(btrim(coalesce(v_registry.full_name,v_registry.display_name,'')),'') is not null and
       lower(btrim(coalesce(v_registry.full_name,v_registry.display_name,''))) <>
       lower(btrim(coalesce(v_mobile.full_name,v_mobile.display_name,v_mobile.name,'')))),
  'source','ENTERPRISE_REGISTRY_WITH_MOBILE_WORKFORCE_FALLBACK'
 );
end;
$$;
revoke all on function public.be_my_unified_workforce_profile_v1() from PUBLIC, anon;
grant execute on function public.be_my_unified_workforce_profile_v1() to authenticated;
