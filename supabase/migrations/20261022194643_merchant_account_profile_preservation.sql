-- Preserve existing operational profiles when Marketing edits master details.
-- The snapshot intentionally does not expose these fields, so omission must not reset them.
do $migration$
declare v_definition text;
begin
 select pg_get_functiondef('public.be_marketing_merchant_master_upsert_v1(jsonb)'::regprocedure) into v_definition;
 if position('ACCOUNT_PROFILE_PRESERVE_V1' in v_definition)>0 then return;end if;
 if position('payment_profile=excluded.payment_profile,service_profile=excluded.service_profile' in v_definition)=0 then
  raise exception 'Merchant master definition changed; review profile preservation patch before applying';
 end if;
 v_definition:=replace(v_definition,
 'payment_profile=excluded.payment_profile,service_profile=excluded.service_profile',
 $replacement$payment_profile=case when p_payload ? 'payment_profile' then excluded.payment_profile else be_masterdata_merchants.payment_profile end,
    service_profile=case when p_payload ? 'service_profile' then excluded.service_profile else be_masterdata_merchants.service_profile end /* ACCOUNT_PROFILE_PRESERVE_V1 */$replacement$);
 execute v_definition;
end
$migration$;

-- Explicit create/update prevents a typed existing code from silently replacing another merchant.
do $migration$
declare v_definition text;
begin
 select pg_get_functiondef('public.be_marketing_merchant_master_upsert_v1(jsonb)'::regprocedure) into v_definition;
 if position('MERCHANT_ACTION_GUARD_V1' in v_definition)>0 then return;end if;
 if position('  insert into public.be_master_merchants(' in v_definition)=0 then
  raise exception 'Merchant insert definition changed; review action guard before applying';
 end if;
 v_definition:=replace(v_definition,'  insert into public.be_master_merchants(',
 $replacement$  -- MERCHANT_ACTION_GUARD_V1: preserve legacy UPSERT callers, validate explicit screen intent.
  perform pg_advisory_xact_lock(hashtextextended('MERCHANT_MASTER:'||v_code,0));
  if upper(coalesce(p_payload->>'record_action','UPSERT')) not in ('CREATE','UPDATE','UPSERT') then
    return jsonb_build_object('ok',false,'code','INVALID_RECORD_ACTION');
  end if;
  if upper(p_payload->>'record_action')='CREATE' and exists(select 1 from public.be_master_merchants where merchant_code=v_code) then
    return jsonb_build_object('ok',false,'code','MERCHANT_CODE_ALREADY_EXISTS');
  end if;
  if upper(p_payload->>'record_action')='UPDATE' and not exists(select 1 from public.be_master_merchants where merchant_code=v_code) then
    return jsonb_build_object('ok',false,'code','MERCHANT_NOT_FOUND');
  end if;
  insert into public.be_master_merchants($replacement$);
 execute v_definition;
end
$migration$;

-- Deactivating a merchant revokes linked portal access; reactivation requires explicit login review.
create or replace function public.be_sync_merchant_login_access_status_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
 update public.be_merchant_accounts set merchant_name=new.merchant_name,updated_at=now()
 where merchant_code=new.merchant_code;
 if lower(coalesce(new.status,'active')) in ('inactive','suspended','deleted','disabled') then
  update public.be_user_account_registry r set status=lower(new.status),active=false,is_active=false,updated_at=now()
  where exists(select 1 from public.be_merchant_accounts a where a.merchant_code=new.merchant_code and a.auth_user_id=r.auth_user_id);
  update public.profiles p set status=lower(new.status),is_active=false,updated_at=now()
  where exists(select 1 from public.be_merchant_accounts a where a.merchant_code=new.merchant_code and a.auth_user_id=p.id);
  update public.be_merchant_accounts set status='INACTIVE',updated_at=now() where merchant_code=new.merchant_code;
 end if;
 return new;
end
$function$;
revoke all on function public.be_sync_merchant_login_access_status_v1() from public,anon,authenticated;
drop trigger if exists be_sync_merchant_login_access_status_v1 on public.be_master_merchants;
create trigger be_sync_merchant_login_access_status_v1 after update of merchant_name,status on public.be_master_merchants
for each row execute function public.be_sync_merchant_login_access_status_v1();
