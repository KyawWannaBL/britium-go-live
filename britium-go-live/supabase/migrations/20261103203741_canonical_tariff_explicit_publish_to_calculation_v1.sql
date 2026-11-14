
create or replace function public.be_delivery_tariff_publish_v1(p_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $fn$
declare
 c public.be_delivery_tariff_master_v13%rowtype;
 a public.be_parcel_tariffs_v2%rowtype;
 d date:=public.be_business_date();
 v_new public.be_parcel_tariffs_v2%rowtype;
 v_old jsonb;
begin
 if auth.uid() is null or not public.be_tariff_access_allowed(true) then
  raise exception 'TARIFF_WRITE_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into c from public.be_delivery_tariff_master_v13 where id=p_id for update;
 if not found then raise exception 'CANONICAL_TARIFF_NOT_FOUND';end if;
 if lower(coalesce(c.status,'')) <> 'active' then raise exception 'CANONICAL_RATE_NOT_ACTIVE';end if;
 if nullif(trim(c.township),'') is null or nullif(trim(c.customer_tier),'') is null or c.zone_code not in ('YGN','MDY','NPT','OTHER') then
  raise exception 'CANONICAL_TARIFF_INCOMPLETE';end if;
 if c.base_fee<0 or c.extra_per_kg<0 or c.included_kg<0
 or c.base_fee<>trunc(c.base_fee) or c.extra_per_kg<>trunc(c.extra_per_kg) then
  raise exception 'NON_INTEGER_OR_NEGATIVE_TARIFF';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('be_tariff_publish:'||lower(trim(c.township))||':'||upper(c.customer_tier),0));
 select * into a from public.be_parcel_tariffs_v2
 where lower(trim(township))=lower(trim(c.township)) and upper(customer_tier)=upper(c.customer_tier)
 and upper(status)='ACTIVE' and effective_to is null for update;
 if found then
  if a.base_tariff=c.base_fee and a.included_kg=c.included_kg and a.extra_per_kg=c.extra_per_kg
  and a.tariff_zone_code=c.zone_code and a.commitment_min_ways=c.commitment_min_ways
  and a.commitment_refund_per_way=c.commitment_refund_per_way then
   return jsonb_build_object('ok',true,'already_active',true,'township',c.township,'tier',c.customer_tier,'effective_from',a.effective_from,'calculation_tariff_id',a.id);
  end if;
  if a.effective_from>=d then raise exception 'CURRENT_DAY_RATE_ALREADY_EXISTS_REQUIRES_FINANCE_REVIEW';end if;
  v_old:=to_jsonb(a);
  update public.be_parcel_tariffs_v2 set effective_to=d-1,updated_at=now()
  where id=a.id;
 end if;
 if exists(select 1 from public.be_parcel_tariffs_v2 where township=c.township and upper(customer_tier)=upper(c.customer_tier) and effective_from=d)
 then raise exception 'CALCULATION_RATE_VERSION_EXISTS_FOR_BUSINESS_DATE';end if;
 insert into public.be_parcel_tariffs_v2
 (township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,status,effective_from,note)
 values(c.township,upper(c.customer_tier),c.zone,c.zone_code,c.base_fee::bigint,c.included_kg,c.extra_per_kg::bigint,
 coalesce(c.commitment_min_ways,0),coalesce(c.commitment_refund_per_way,0),'ACTIVE',d,
 'Explicitly published from canonical tariff ID '||c.id::text)
 returning * into v_new;
 insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
 values('PUBLISH','be_parcel_tariffs_v2',v_new.id::text,v_old,to_jsonb(v_new),auth.uid(),now());
 return jsonb_build_object('ok',true,'already_active',false,'calculation_tariff_id',v_new.id,'effective_from',d,'township',c.township,'tier',c.customer_tier);
end $fn$;
revoke all on function public.be_delivery_tariff_publish_v1(uuid) from public,anon;
grant execute on function public.be_delivery_tariff_publish_v1(uuid) to authenticated;
