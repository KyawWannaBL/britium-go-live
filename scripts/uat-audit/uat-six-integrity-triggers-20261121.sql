-- Britium Express / hosted isolated UAT ONLY / six original low-dependency Data Entry integrity triggers.
-- DOES NOT restore October 2026 write epoch, finance projection, address history, or full trigger sets.
-- No public/app DML granted. Preserve financial mutation shadow and all synthetic fixtures.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $uat_guard$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not validated branch UAT'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 OR (SELECT count(*) FROM public.be_wayplan_dispatches)<>2 OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 THEN RAISE EXCEPTION 'UAT shadow/fixture baseline drift'; END IF;
 IF to_regclass('public.be_data_entry_parcels') IS NULL THEN RAISE EXCEPTION 'Canonical parcel table missing'; END IF;
 IF to_regprocedure('public.be_branch_full_registration_guard_v1()') IS NOT NULL THEN RAISE EXCEPTION 'Function already exists: be_branch_full_registration_guard_v1()'; END IF;
 IF to_regprocedure('public.be_enforce_canonical_delivery_way_id_v134()') IS NOT NULL THEN RAISE EXCEPTION 'Function already exists: be_enforce_canonical_delivery_way_id_v134()'; END IF;
 IF to_regprocedure('public.be_guard_terminal_parcel_status_coherence_v194()') IS NOT NULL THEN RAISE EXCEPTION 'Function already exists: be_guard_terminal_parcel_status_coherence_v194()'; END IF;
 IF to_regprocedure('public.update_be_data_entry_updated_at()') IS NOT NULL THEN RAISE EXCEPTION 'Function already exists: update_be_data_entry_updated_at()'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='be_branch_registration_guard_details_v1') THEN RAISE EXCEPTION 'Trigger exists: be_data_entry_parcel_details.be_branch_registration_guard_details_v1'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='be_data_entry_canonical_delivery_way_id_v134') THEN RAISE EXCEPTION 'Trigger exists: be_data_entry_parcel_details.be_data_entry_canonical_delivery_way_id_v134'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='trg_be_data_entry_updated_at') THEN RAISE EXCEPTION 'Trigger exists: be_data_entry_parcel_details.trg_be_data_entry_updated_at'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='trg_be_guard_terminal_parcel_status_coherence_v194') THEN RAISE EXCEPTION 'Trigger exists: be_data_entry_parcel_details.trg_be_guard_terminal_parcel_status_coherence_v194'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcels'::regclass AND tgname='be_branch_registration_guard_parcels_v1') THEN RAISE EXCEPTION 'Trigger exists: be_data_entry_parcels.be_branch_registration_guard_parcels_v1'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_waybill_ledger'::regclass AND tgname='be_branch_registration_guard_ledger_v1') THEN RAISE EXCEPTION 'Trigger exists: be_waybill_ledger.be_branch_registration_guard_ledger_v1'; END IF;
END $uat_guard$;
CREATE FUNCTION public.be_branch_full_registration_guard_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_role text; v_branch text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_role:=replace(lower(coalesce(public.be_current_role(),'')),'-','_');
  SELECT upper(branch_code) INTO v_branch
  FROM public.be_user_account_registry
  WHERE auth_user_id=auth.uid() AND coalesce(active,true) AND coalesce(is_active,true)
    AND lower(status) IN ('active','enabled') LIMIT 1;
  -- Both branch-specific roles and any staff physically assigned to a non-HQ
  -- branch (including legacy data_entry/encoder users) must not register parcels.
  IF v_role IN ('branch_manager','branch_office_manager','branch_office',
                'branch_staff','branch_admin')
     OR (v_branch IS NOT NULL AND v_branch<>'YGN'
         AND v_role NOT IN ('superadmin','super_admin','app_owner','sys')) THEN
    RAISE EXCEPTION 'BRANCH_FULL_REGISTRATION_DISABLED_USE_INBOUND_OR_PICKUP_TEMP_QR'
      USING errcode='42501';
  END IF;
  RETURN NEW;
END $function$
;
REVOKE EXECUTE ON FUNCTION public.be_branch_full_registration_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_enforce_canonical_delivery_way_id_v134()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if nullif(btrim(coalesce(new.delivery_way_id,'')),'') is null
     or upper(btrim(new.delivery_way_id)) like 'P%' then
    if nullif(btrim(coalesce(new.pickup_id,'')),'') is not null
       and coalesce(new.parcel_sequence,0) > 0 then
      new.delivery_way_id :=
        public.be_allocate_delivery_way_id(new.pickup_id,new.parcel_sequence);
    end if;
  end if;
  return new;
end
$function$
;
REVOKE EXECUTE ON FUNCTION public.be_enforce_canonical_delivery_way_id_v134() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_guard_terminal_parcel_status_coherence_v194()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if upper(coalesce(new.parcel_status,''))='RTO'
     and upper(coalesce(new.way_management_status,''))='DELIVERED' then
    new.way_management_status := 'RTO';
  elsif upper(coalesce(new.parcel_status,''))='DELIVERED'
     and upper(coalesce(new.way_management_status,''))='RTO' then
    new.way_management_status := 'DELIVERED';
  end if;
  return new;
end;
$function$
;
REVOKE EXECUTE ON FUNCTION public.be_guard_terminal_parcel_status_coherence_v194() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.update_be_data_entry_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.update_be_data_entry_updated_at() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.update_be_data_entry_updated_at() SET search_path TO pg_catalog,public,pg_temp;
CREATE TRIGGER be_branch_registration_guard_details_v1 BEFORE INSERT ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION be_branch_full_registration_guard_v1();
CREATE TRIGGER be_data_entry_canonical_delivery_way_id_v134 BEFORE INSERT OR UPDATE OF delivery_way_id, pickup_id, parcel_sequence ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION be_enforce_canonical_delivery_way_id_v134();
CREATE TRIGGER trg_be_data_entry_updated_at BEFORE UPDATE ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION update_be_data_entry_updated_at();
CREATE TRIGGER trg_be_guard_terminal_parcel_status_coherence_v194 BEFORE INSERT OR UPDATE ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION be_guard_terminal_parcel_status_coherence_v194();
CREATE TRIGGER be_branch_registration_guard_parcels_v1 BEFORE INSERT ON be_data_entry_parcels FOR EACH ROW EXECUTE FUNCTION be_branch_full_registration_guard_v1();
CREATE TRIGGER be_branch_registration_guard_ledger_v1 BEFORE INSERT ON be_waybill_ledger FOR EACH ROW EXECUTE FUNCTION be_branch_full_registration_guard_v1();
NOTIFY pgrst,'reload schema';
COMMIT;
