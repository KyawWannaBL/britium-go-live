-- BRITIUM HOSTED UAT: deliberately restricted location-batch read for Data Entry Super Admin.
-- Original invoker function cannot work while location table has no client SELECT grant.
-- SECURITY DEFINER is limited to active global-scope Super Admin and known UAT parcel IDs.
BEGIN;
SET LOCAL statement_timeout='35s';
DO $guard$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL
   OR (SELECT count(*) FROM auth.users)<>18
   OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16
 THEN RAISE EXCEPTION 'Wrong UAT project'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW'
   OR (SELECT count(*) FROM public.be_delivery_location_registry)<>0
 THEN RAISE EXCEPTION 'Unexpected mutation mode or UAT location data'; END IF;
 IF to_regprocedure('public.be_delivery_location_batch_v10(text[])') IS NOT NULL
 THEN RAISE EXCEPTION 'Location batch already present'; END IF;
END $guard$;
CREATE FUNCTION public.be_delivery_location_batch_v10(p_delivery_way_ids text[])
 RETURNS SETOF public.be_delivery_location_registry
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_temp'
AS $function$
DECLARE
 v_actor uuid:=auth.uid();
 v_role text:=lower(replace(coalesce(public.be_current_role(),''),'-','_'));
BEGIN
 IF v_actor IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF cardinality(coalesce(p_delivery_way_ids,ARRAY[]::text[]))>500
 THEN RAISE EXCEPTION 'Too many requested Way IDs' USING ERRCODE='22023'; END IF;
 PERFORM public.be_data_entry_require_access_v57('view',false);
 IF v_role NOT IN ('super_admin','superadmin')
   OR NOT EXISTS (
      SELECT 1 FROM public.be_employee_territory_assignments a
      WHERE a.user_id=v_actor AND a.active AND a.can_read AND a.scope_type='GLOBAL'
   ) THEN RAISE EXCEPTION 'UAT_DATA_ENTRY_LOCATION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN QUERY
 SELECT l.*
 FROM public.be_delivery_location_registry l
 WHERE l.delivery_way_id=ANY(coalesce(p_delivery_way_ids,ARRAY[]::text[]))
 AND EXISTS (
    SELECT 1 FROM public.be_data_entry_parcel_details d
    JOIN public.be_portal_pickup_requests p ON p.pickup_id=d.pickup_id
    WHERE d.delivery_way_id=l.delivery_way_id
      AND p.branch_code IN ('ISN','MDY')
 );
END
$function$;
REVOKE ALL ON FUNCTION public.be_delivery_location_batch_v10(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.be_delivery_location_batch_v10(text[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
