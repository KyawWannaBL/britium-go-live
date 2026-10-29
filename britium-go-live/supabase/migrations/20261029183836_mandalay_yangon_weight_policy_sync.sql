CREATE OR REPLACE FUNCTION public.be_image_tariff_weight_surcharge_v1(p_zone text, p_township text, p_tier text, p_weight numeric, p_included numeric, p_fallback_per_kg bigint)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ with input as (select ceil(greatest(0::numeric,coalesce(p_weight,0))) w,greatest(0::numeric,coalesce(p_included,0)) included,upper(btrim(coalesce(p_zone,''))) zone) select case when upper(btrim(coalesce(p_tier,'')))='STANDARD' and (zone in('YGN','YANGON','MDY','MANDALAY') or (zone='BRANCH' and btrim(coalesce(p_township,'')) in('မန္တလေး','Mandalay'))) then (greatest(0::numeric,least(w,10)-3)*500+greatest(0::numeric,least(w,20)-10)*700+greatest(0::numeric,least(w,30)-20)*1000+greatest(0::numeric,w-30)*1500)::bigint when upper(btrim(coalesce(p_tier,'')))='STANDARD' and (zone='NPT' or (zone='BRANCH' and btrim(p_township)='နေပြည်တော်')) then (greatest(0::numeric,w-3)*1500)::bigint else ceil(greatest(0::numeric,w-included)*coalesce(p_fallback_per_kg,0))::bigint end from input; $function$
;
