
create or replace function public.be_marketing_merchant_delete_v1(p_merchant_code text)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_role text:=public.be_current_role();
  v_code text:=upper(btrim(coalesce(p_merchant_code,'')));
  v_old jsonb;
  v_actor text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED'); end if;
  if v_role not in ('marketing','marketer','superadmin','super_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if v_code='' then return jsonb_build_object('ok',false,'code','MERCHANT_CODE_REQUIRED'); end if;

  select to_jsonb(m) into v_old from public.be_master_merchants m where m.merchant_code=v_code for update;
  if v_old is null then return jsonb_build_object('ok',false,'code','MERCHANT_NOT_FOUND'); end if;

  update public.be_master_merchants set status='INACTIVE',updated_at=now() where merchant_code=v_code;
  update public.be_masterdata_merchants set status='INACTIVE',updated_at=now() where merchant_id=v_code or merchant_code=v_code;
  update public.be_master_data_rows
     set status='DELETED',deleted_at=coalesce(deleted_at,now()),updated_at=now(),updated_by_email=v_actor
   where dataset_key='merchant_master' and record_key=v_code;

  insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
  values('DELETE','be_master_merchants',v_code,v_old,jsonb_build_object('status','INACTIVE'),auth.uid(),now());

  return jsonb_build_object('ok',true,'merchant_code',v_code,'soft_deleted',true);
end $$;
revoke all on function public.be_marketing_merchant_delete_v1(text) from public;
grant execute on function public.be_marketing_merchant_delete_v1(text) to authenticated;
