-- UAT ONLY: original internal delivery Way ID alias JSON normalization helper.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $gate$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_delivery_way_id_aliases_v33)<>0 THEN RAISE EXCEPTION 'Not empty isolated UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR to_regprocedure('public.be_rewrite_delivery_way_aliases_jsonb(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Already installed or mutations enabled'; END IF;
END $gate$;
CREATE FUNCTION public.be_rewrite_delivery_way_aliases_jsonb(p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_text text;
  v_alias record;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  v_text := p_value::text;
  FOR v_alias IN
    SELECT alias_way_id,canonical_way_id
      FROM public.be_delivery_way_id_aliases_v33
     WHERE position(alias_way_id in v_text)>0
  LOOP
    v_text := replace(v_text,v_alias.alias_way_id,v_alias.canonical_way_id);
  END LOOP;
  RETURN v_text::jsonb;
END;
$function$
;
REVOKE ALL ON FUNCTION public.be_rewrite_delivery_way_aliases_jsonb(jsonb) FROM PUBLIC, anon, authenticated;
COMMIT;
