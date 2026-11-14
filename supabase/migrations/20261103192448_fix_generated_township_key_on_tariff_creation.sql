do $patch$
declare src text;
begin
 select pg_get_functiondef(oid) into src from pg_proc
 where proname='be_delivery_tariff_create_v1' and pg_get_function_identity_arguments(oid) like 'p_township text%';
 if src is null then raise exception 'NO_CREATE_FN'; end if;
 if position('(township,township_key,zone,zone_code,customer_tier,base_fee,included_kg,extra_per_kg,status,note,source)' in src)=0 then raise exception 'UNEXPECTED_DDL_BODY';end if;
 src := replace(src,
 '(township,township_key,zone,zone_code,customer_tier,base_fee,included_kg,extra_per_kg,status,note,source)',
 '(township,zone,zone_code,customer_tier,base_fee,included_kg,extra_per_kg,status,note,source)');
 src := replace(src,
 'values(v_township,v_key,v_zone,v_zone_code,v_tier,p_base_fee,p_included_kg,p_extra_per_kg,',
 'values(v_township,v_zone,v_zone_code,v_tier,p_base_fee,p_included_kg,p_extra_per_kg,');
 execute src;
end $patch$;