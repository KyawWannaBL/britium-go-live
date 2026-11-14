
create or replace function public.be_tariff_delete_v1(p_tier text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_old jsonb; v_tier text:=nullif(btrim(p_tier),'');
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'service_role' then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if not public.be_tariff_access_allowed(true) then
    raise exception using errcode='42501',message='TARIFF_WRITE_NOT_AUTHORIZED';
  end if;
  select to_jsonb(t) into v_old from public.be_tariff_master t where t.tier_name=v_tier for update;
  if v_old is null then raise exception using errcode='P0002',message='TARIFF_NOT_FOUND'; end if;
  delete from public.be_tariff_master where tier_name=v_tier;
  insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
  values('DELETE','be_tariff_master',v_tier,v_old,null,auth.uid(),now());
  return jsonb_build_object('ok',true,'tier',v_tier);
end $$;

create or replace function public.be_delivery_tariff_delete_v1(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare v_old jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(),'')<>'service_role' then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if not public.be_tariff_access_allowed(true) then
    raise exception using errcode='42501',message='TARIFF_WRITE_NOT_AUTHORIZED';
  end if;
  select to_jsonb(t) into v_old from public.be_delivery_tariff_master_v13 t where t.id=p_id for update;
  if v_old is null then raise exception using errcode='P0002',message='DELIVERY_TARIFF_NOT_FOUND'; end if;
  delete from public.be_delivery_tariff_master_v13 where id=p_id;
  insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
  values('DELETE','be_delivery_tariff_master_v13',p_id::text,v_old,null,auth.uid(),now());
  return jsonb_build_object('ok',true,'id',p_id);
end $$;

revoke all on function public.be_tariff_delete_v1(text) from public;
grant execute on function public.be_tariff_delete_v1(text) to authenticated;
revoke all on function public.be_delivery_tariff_delete_v1(uuid) from public;
grant execute on function public.be_delivery_tariff_delete_v1(uuid) to authenticated;
