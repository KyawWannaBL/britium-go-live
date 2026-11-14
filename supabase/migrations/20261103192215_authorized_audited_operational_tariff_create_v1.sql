create or replace function public.be_delivery_tariff_create_v1(
 p_township text, p_zone text, p_zone_code text, p_tier text,
 p_base_fee numeric, p_included_kg numeric, p_extra_per_kg numeric,
 p_note text default null
) returns jsonb language plpgsql security definer
set search_path = 'public','auth','pg_temp'
as $fn$
declare v_township text := nullif(btrim(p_township),'');
 v_zone text := nullif(btrim(p_zone),'');
 v_zone_code text := upper(nullif(btrim(p_zone_code),''));
 v_tier text := upper(nullif(btrim(p_tier),''));
 v_key text;
 v_new jsonb;
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='28000'; end if;
 if not public.be_tariff_access_allowed(true) then raise exception 'TARIFF_WRITE_NOT_AUTHORIZED' using errcode='42501'; end if;
 if v_township is null or length(v_township)>140 or v_zone is null or length(v_zone)>100
    or v_zone_code not in ('YGN','MDY','NPT','OTHER') then
    raise exception 'VALID_TOWNSHIP_AND_ZONE_REQUIRED' using errcode='22023';
 end if;
 if v_tier is null or not exists(select 1 from public.be_customer_tier_master_v13 where upper(customer_tier)=v_tier and active)
 then raise exception 'ACTIVE_CUSTOMER_TIER_REQUIRED' using errcode='22023'; end if;
 if p_base_fee is null or p_included_kg is null or p_extra_per_kg is null
    or p_base_fee<0 or p_included_kg<0 or p_extra_per_kg<0
    or p_base_fee>100000000 or p_included_kg>10000 or p_extra_per_kg>1000000
 then raise exception 'INVALID_TARIFF_AMOUNTS' using errcode='22023'; end if;
 v_key:=lower(regexp_replace(v_township,'[[:space:]]+',' ','g'));
 perform pg_advisory_xact_lock(hashtextextended('be_delivery_tariff_create_v1:'||v_key||':'||v_tier,0));
 if exists(select 1 from public.be_delivery_tariff_master_v13 t
  where lower(regexp_replace(btrim(t.township),'[[:space:]]+',' ','g'))=v_key
    and upper(t.customer_tier)=v_tier and lower(t.status)='active')
 then raise exception 'ACTIVE_TOWNSHIP_TIER_TARIFF_EXISTS' using errcode='23505'; end if;
 insert into public.be_delivery_tariff_master_v13
 (township,township_key,zone,zone_code,customer_tier,base_fee,included_kg,extra_per_kg,status,note,source)
 values(v_township,v_key,v_zone,v_zone_code,v_tier,p_base_fee,p_included_kg,p_extra_per_kg,'active',p_note,'TARIFF_PORTAL_MANUAL_V1')
 returning to_jsonb(be_delivery_tariff_master_v13.*) into v_new;
 insert into public.be_audit_log(action,table_name,record_id,old_values,new_values,performed_by,performed_at)
 values('INSERT','be_delivery_tariff_master_v13',v_new->>'id',null,v_new,auth.uid(),now());
 return jsonb_build_object('ok',true,'tariff',v_new);
end
$fn$;
revoke all on function public.be_delivery_tariff_create_v1(text,text,text,text,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.be_delivery_tariff_create_v1(text,text,text,text,numeric,numeric,numeric,text) to authenticated;