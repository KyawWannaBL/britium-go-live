-- HOSTED UAT ONLY: original territory and Data Entry pickup-guard dependencies.
-- Internal functions: no direct EXECUTE to browser roles. Fail-closed authenticated actor check.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not isolated hosted UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' THEN RAISE EXCEPTION 'Financial writes unexpectedly active'; END IF;
IF (SELECT count(*) FROM public.be_branch_offices WHERE active AND lower(authority_status)='approved')<>2 THEN RAISE EXCEPTION 'UAT branch approval baseline unexpected'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_normalize_territory_key') THEN RAISE EXCEPTION 'Existing helper be_normalize_territory_key'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_current_user_role') THEN RAISE EXCEPTION 'Existing helper be_current_user_role'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_employee_can_access_territory') THEN RAISE EXCEPTION 'Existing helper be_employee_can_access_territory'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_manager_assert_pickup_v1') THEN RAISE EXCEPTION 'Existing helper be_data_entry_manager_assert_pickup_v1'; END IF;
END $guard$;
CREATE FUNCTION public.be_normalize_territory_key(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9\u1000-\u109f]+', '', 'g') $function$
;
REVOKE ALL ON FUNCTION public.be_normalize_territory_key(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_current_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when exists(
      select 1 from public.be_superadmin_delegations_v65 d
      where d.target_auth_user_id=auth.uid() and d.active
    ) then 'superadmin'
    else coalesce(
      (select coalesce(nullif(role_code,''),nullif(app_role,''),nullif(user_role,''),role)
       from public.be_user_account_registry
       where auth_user_id=auth.uid()
         and coalesce(active,is_active,true)
         and lower(coalesce(status,'active')) in ('active','enabled')
       order by updated_at desc nulls last limit 1),
      'guest'
    )
  end
$function$
;
REVOKE ALL ON FUNCTION public.be_current_user_role() FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_employee_can_access_territory(p_branch_id uuid, p_branch_code text, p_township text, p_action text DEFAULT 'read'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text := lower(regexp_replace(btrim(coalesce(
    public.be_current_user_role(), public.be_current_role(), ''
  )), '[ _-]+', '_', 'g'));
  v_action text := lower(btrim(coalesce(p_action, 'read')));
  v_allowed boolean := false;
begin
  if v_uid is null then return false; end if;
  if v_role in ('super_admin','superadmin','app_owner','sys') then return true; end if;

  if v_action = 'read' then
    v_allowed := v_role in (
      'admin','operations_admin','operations','supervisor','wayplan_manager','dispatch',
      'warehouse_staff','warehouse','sorter','data_entry','encoder',
      'customer_service','cs','support','finance','finance_user','accountant','analyst',
      'driver','rider','branch_office','branch_manager','branch_staff','branch_admin'
    );
  elsif v_action = 'create' then
    v_allowed := v_role in (
      'admin','operations_admin','operations','supervisor','data_entry','encoder',
      'branch_office','branch_manager','branch_staff','branch_admin'
    );
  elsif v_action = 'update' then
    v_allowed := v_role in (
      'admin','operations_admin','operations','supervisor','wayplan_manager','dispatch',
      'warehouse_staff','warehouse','sorter','data_entry','encoder','driver','rider',
      'branch_office','branch_manager','branch_staff','branch_admin'
    );
  elsif v_action = 'delete' then
    v_allowed := v_role in ('admin','operations_admin');
  end if;

  if not v_allowed then return false; end if;

  return exists (
    select 1
    from public.be_employee_territory_assignments a
    where a.user_id = v_uid
      and a.active
      and case v_action
        when 'create' then a.can_create
        when 'update' then a.can_update
        when 'delete' then a.can_delete
        else a.can_read
      end
      and (
        a.scope_type = 'GLOBAL'
        or (a.scope_type = 'BRANCH' and (
          (p_branch_id is not null and a.branch_id = p_branch_id)
          or (nullif(btrim(p_branch_code), '') is not null
              and lower(btrim(a.branch_code)) = lower(btrim(p_branch_code)))
        ))
        or (a.scope_type = 'TOWNSHIP'
            and public.be_normalize_territory_key(a.township_key) = public.be_normalize_territory_key(p_township))
      )
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_employee_can_access_territory(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_manager_assert_pickup_v1(p_pickup_id text, p_action text DEFAULT 'read'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_branch text; v_role text:=replace(coalesce(public.be_current_role(),''),'-','_');
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING errcode='42501'; END IF;
 IF v_role NOT IN ('branch_manager','data_entry','encoder','supervisor') THEN RETURN;END IF;
 SELECT upper(branch_code) INTO v_branch FROM public.be_user_account_registry
 WHERE auth_user_id=auth.uid() AND active AND is_active AND lower(status)='active'
 AND replace(lower(role_code),'-','_')=v_role LIMIT 1;
 IF v_role<>'branch_manager' AND v_branch IS DISTINCT FROM 'MDY' THEN RETURN; END IF;
 IF v_branch IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.be_branch_offices
      WHERE upper(branch_code)=v_branch AND active AND lower(authority_status)='approved')
   OR nullif(btrim(p_pickup_id),'') IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.be_portal_pickup_requests p
      WHERE p.pickup_id=p_pickup_id AND upper(p.branch_code)=v_branch
      AND public.be_employee_can_access_territory(null::uuid,p.branch_code,coalesce(p.pickup_township,p.delivery_township),p_action))
 THEN RAISE EXCEPTION 'BRANCH_DATA_ENTRY_SCOPE_DENIED' USING errcode='42501';END IF;
END
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_manager_assert_pickup_v1(text,text) FROM PUBLIC, anon, authenticated;
COMMIT;
