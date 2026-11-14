-- Pricing authority: tariff image supplied and approved on 23 October 2026.
-- Existing destination base tariffs match the image. This patches prospective
-- STANDARD calculations only; negotiated tiers and persisted quotes stay intact.
create or replace function public.be_image_tariff_weight_surcharge_v1(
 p_zone text,p_township text,p_tier text,p_weight numeric,p_included numeric,p_fallback_per_kg bigint
) returns bigint language sql immutable set search_path=public,pg_temp as $weight$
 with input as (
  select ceil(greatest(0::numeric,coalesce(p_weight,0))) w,
   greatest(0::numeric,coalesce(p_included,0)) included,
   upper(btrim(coalesce(p_zone,''))) zone
 ) select case
  when upper(btrim(coalesce(p_tier,'')))='STANDARD' and zone in ('YGN','YANGON') then
   (greatest(0::numeric,least(w,10)-3)*500
    +greatest(0::numeric,least(w,20)-10)*700
    +greatest(0::numeric,least(w,30)-20)*1000
    +greatest(0::numeric,w-30)*1500)::bigint
  when upper(btrim(coalesce(p_tier,'')))='STANDARD' and
   (zone in ('MDY','NPT') or (zone='BRANCH' and btrim(p_township) in ('မန္တလေး','နေပြည်တော်'))) then
   (greatest(0::numeric,w-3)*1500)::bigint
  else ceil(greatest(0::numeric,w-included)*coalesce(p_fallback_per_kg,0))::bigint
 end from input;
$weight$;
comment on function public.be_image_tariff_weight_surcharge_v1(text,text,text,numeric,numeric,bigint) is
 '23 Oct 2026 user-approved tariff image: STANDARD Yangon marginal weight bands and MDY/NPT 1500 MMK/kg above 3kg. Unspecified provider and negotiated tier rules retained.';

do $patch$
declare
 target regprocedure := 'public.be_calculate_parcel_financial_v2_v61_8_2_legacy(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'::regprocedure;
 definition text;
 old_expression text := 'v_weight_surcharge := ceil(v_extra * coalesce(v_tariff.extra_per_kg,0))::bigint;';
 new_expression text := 'v_weight_surcharge := public.be_image_tariff_weight_surcharge_v1(v_tariff.tariff_zone_code,v_tariff.township,v_tier,v_chargeable,v_tariff.included_kg,v_tariff.extra_per_kg);';
begin
 select pg_get_functiondef(target) into definition;
 if strpos(definition,new_expression)>0 then return; end if;
 if strpos(definition,old_expression)=0
    or (length(definition)-length(replace(definition,old_expression,'')))/length(old_expression)<>1 then
  raise exception 'Image tariff patch requires one expected weight expression; review calculator before applying';
 end if;
 execute replace(definition,old_expression,new_expression);
end;
$patch$;
