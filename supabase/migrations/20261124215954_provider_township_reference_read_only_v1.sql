-- Authenticated read-only township territory reference; master RLS remains enabled.
CREATE OR REPLACE FUNCTION public.be_provider_township_territories_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare v_rows jsonb;
begin
 if auth.uid() is null then
   raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
    'township_name',t.township_name,
    'township_mm',t.township_mm,
    'township_name_en',t.township_name_en,
    'township_name_mm',t.township_name_mm,
    'city',t.city,
    'region',t.region
 ) order by t.region,t.township_name),'[]'::jsonb)
 into v_rows from public.be_masterdata_townships t;
 return jsonb_build_object('ok',true,'rows',v_rows);
end $function$
;
revoke all on function public.be_provider_township_territories_v1() from public,anon;
grant execute on function public.be_provider_township_territories_v1() to authenticated;
