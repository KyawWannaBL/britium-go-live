create or replace function public.be_tariff_rights_manage_v1(p_role text, p_allowed boolean)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $fn$
declare
 v_role text:=lower(replace(trim(coalesce(p_role,'')),'-','_'));
begin
 if auth.uid() is null
 or lower(replace(coalesce(public.be_current_role(),''),'-','_')) not in ('superadmin','super_admin') then
  raise exception 'SUPERADMIN_REQUIRED' using errcode='42501';
 end if;
 if v_role not in ('finance','finance_manager','operation_manager','data_entry') then
  raise exception 'INVALID_ROLE' using errcode='22023';
 end if;
 if p_allowed is null then
  raise exception 'TARIFF_PERMISSION_VALUE_REQUIRED' using errcode='22023';
 end if;
 insert into public.be_tariff_write_rights_v1(role_code,can_manage,updated_by,updated_at)
 values(v_role,p_allowed,auth.uid(),now())
 on conflict(role_code) do update
 set can_manage=excluded.can_manage,updated_by=excluded.updated_by,updated_at=now();
 return jsonb_build_object('ok',true,'role',v_role,'allowed',p_allowed);
end
$fn$;
revoke all on function public.be_tariff_rights_manage_v1(text,boolean) from public,anon;
grant execute on function public.be_tariff_rights_manage_v1(text,boolean) to authenticated;
insert into public.be_tariff_write_rights_v1(role_code,can_manage,updated_at)
values('data_entry',true,now())
on conflict(role_code) do nothing;