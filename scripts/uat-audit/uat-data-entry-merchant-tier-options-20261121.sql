-- Hosted UAT only: original merchant-tier configuration lookup, with V57 create permission check.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $target$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Not shadow-mode UAT'; END IF;
IF to_regprocedure('public.be_data_entry_merchant_tier_access_v13(text)') IS NOT NULL THEN RAISE EXCEPTION 'Merchant tier function already exists'; END IF;
IF (SELECT count(*) FROM public.be_merchant_financial_profiles_v2 WHERE merchant_id='UAT-QA')<>1 THEN RAISE EXCEPTION 'Synthetic merchant profile missing'; END IF;
END $target$;
CREATE FUNCTION public.be_data_entry_merchant_tier_access_v13(p_merchant_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_merchant_id text := upper(nullif(btrim(coalesce(p_merchant_id,'')),''));
  v_create_access jsonb := public.be_data_entry_actor_access_v57('create',false);
  v_update_access jsonb := public.be_data_entry_actor_access_v57('update',false);
  v_profile_tier text;
  v_registered boolean := false;
  v_any_profile boolean := false;
  v_rules jsonb := '{}'::jsonb;
begin
  if not coalesce((v_create_access->>'allowed')::boolean,false) then
    return jsonb_build_object(
      'ok',false,'message','Data Entry create access is required.','access',v_create_access
    );
  end if;
  if v_merchant_id is null then
    return jsonb_build_object('ok',false,'message','Merchant ID is required.','access',v_create_access);
  end if;

  select upper(btrim(m.customer_tier)) into v_profile_tier
  from public.be_merchant_financial_profiles_v2 m
  where upper(btrim(m.merchant_id))=v_merchant_id
    and m.is_active
    and m.effective_from<=public.be_business_date()
    and (m.effective_to is null or m.effective_to>=public.be_business_date())
  order by m.effective_from desc,m.updated_at desc nulls last
  limit 1;
  v_registered := found;

  select exists(
    select 1 from public.be_merchant_financial_profiles_v2 m
    where upper(btrim(m.merchant_id))=v_merchant_id
  ) into v_any_profile;
  if v_any_profile and not v_registered then
    return jsonb_build_object(
      'ok',false,
      'message','This merchant profile is inactive, expired, or blocked and cannot be overridden from Data Entry.',
      'merchant_id',v_merchant_id,
      'access',v_create_access
    );
  end if;

  select coalesce(jsonb_object_agg(r.customer_tier,r.rule),'{}'::jsonb)
  into v_rules
  from (
    select t.customer_tier,jsonb_build_object(
      'included_kg',min(t.included_kg),
      'extra_per_kg',min(t.extra_per_kg),
      'commitment_min_ways',max(t.commitment_min_ways),
      'commitment_refund_per_way',max(t.commitment_refund_per_way)
    ) as rule
    from public.be_parcel_tariffs_v2 t
    where t.status='ACTIVE'
      and t.effective_from<=public.be_business_date()
      and (t.effective_to is null or t.effective_to>=public.be_business_date())
    group by t.customer_tier
  ) r;

  return jsonb_build_object(
    'ok',true,
    'build','DATA_ENTRY_MERCHANT_TIER_ACCESS_V13_20260902',
    'merchant_id',v_merchant_id,
    'registered',v_registered,
    'profile_tier',v_profile_tier,
    'resolved_customer_tier',coalesce(v_profile_tier,'STANDARD'),
    'can_override_profile_tier',v_registered and coalesce((v_update_access->>'allowed')::boolean,false),
    'can_select_tier',(not v_registered) or coalesce((v_update_access->>'allowed')::boolean,false),
    'tier_rules',v_rules,
    'create_access',v_create_access,
    'update_access',v_update_access
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_merchant_tier_access_v13(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_merchant_tier_access_v13(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
