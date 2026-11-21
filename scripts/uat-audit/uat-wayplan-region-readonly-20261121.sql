-- Hosted UAT ONLY: Wayplan region master, not historic parcel data.
-- UAT: Yangon (including Insein) + Mandalay active; Naypyitaw inactive.
BEGIN;
SET LOCAL statement_timeout='30s';
DO $gate$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR
    (SELECT count(*) FROM auth.users)<>18 OR
    (SELECT count(*) FROM public.be_user_account_registry)<>18 OR
    (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16
 THEN RAISE EXCEPTION 'Not verified Mandalay/Insein hosted UAT'; END IF;
 IF to_regclass('public.be_wayplan_region_runtime_v19') IS NOT NULL OR
    to_regprocedure('public.be_wayplan_region_options_v19()') IS NOT NULL
 THEN RAISE EXCEPTION 'Wayplan region config already exists; refusing overwrite'; END IF;
END $gate$;
CREATE TABLE public.be_wayplan_region_runtime_v19 (
 region_code text NOT NULL,
 display_name text NOT NULL,
 branch_code text NOT NULL,
 is_active boolean NOT NULL DEFAULT false,
 map_enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid,
 change_reason text,
 CONSTRAINT be_wayplan_region_runtime_v19_pkey PRIMARY KEY (region_code),
 CONSTRAINT be_wayplan_region_runtime_v19_region_code_check
 CHECK (region_code=ANY(ARRAY['YANGON'::text,'MANDALAY'::text,'NAYPYITAW'::text]))
);
ALTER TABLE public.be_wayplan_region_runtime_v19 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_wayplan_region_runtime_v19 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.be_wayplan_region_runtime_v19 TO authenticated;
CREATE POLICY be_wayplan_region_runtime_v19_authenticated_read
 ON public.be_wayplan_region_runtime_v19 FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL);
INSERT INTO public.be_wayplan_region_runtime_v19
 (region_code,display_name,branch_code,is_active,map_enabled,change_reason)
VALUES
 ('YANGON','Yangon','YGN',true,true,'UAT test including Insein branch'),
 ('MANDALAY','Mandalay','MDY',true,true,'UAT test Mandalay branch'),
 ('NAYPYITAW','Naypyitaw','NPT',false,true,'Excluded from this UAT scope');
CREATE FUNCTION public.be_wayplan_region_options_v19()
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY INVOKER
 SET search_path TO 'public','auth','pg_temp'
AS $function$
DECLARE v_regions jsonb;
BEGIN
 IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication is required' USING ERRCODE='28000';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY CASE r.region_code WHEN 'YANGON' THEN 0 WHEN 'MANDALAY' THEN 1 ELSE 2 END),'[]'::jsonb)
 INTO v_regions
 FROM public.be_wayplan_region_runtime_v19 r;
 RETURN jsonb_build_object('ok',true,'regions',v_regions,'focus_region','YANGON','build','UAT_REGION_CONTROL_V19');
END
$function$;
REVOKE ALL ON FUNCTION public.be_wayplan_region_options_v19() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_wayplan_region_options_v19() TO authenticated;
DO $smoke$
DECLARE v_uid uuid; result jsonb;
BEGIN
 SELECT auth_user_id INTO v_uid FROM public.be_user_account_registry
 WHERE lower(replace(role_code,'-','_'))='branch_manager' AND branch_code='MDY' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',v_uid::text,true);
 result:=public.be_wayplan_region_options_v19();
 IF jsonb_array_length(result->'regions')<>3 OR
   (SELECT count(*) FROM public.be_wayplan_region_runtime_v19 WHERE is_active)<>2
 THEN RAISE EXCEPTION 'Region option smoke test failed'; END IF;
END $smoke$;
NOTIFY pgrst,'reload schema';
COMMIT;
