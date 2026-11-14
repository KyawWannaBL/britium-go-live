create or replace function public.be_delivery_tariff_list_v2()
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp
as $fn$
declare v_rows jsonb;
begin
 if auth.uid() is null or not public.be_tariff_access_allowed(false) then
  raise exception 'TARIFF_READ_NOT_AUTHORIZED' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.township,t.customer_tier,t.id),'[]'::jsonb)
 into v_rows from public.be_delivery_tariff_master_v13 t;
 return v_rows;
end
$fn$;
revoke all on function public.be_delivery_tariff_list_v2() from public,anon;
grant execute on function public.be_delivery_tariff_list_v2() to authenticated;