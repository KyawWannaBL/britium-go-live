-- Emergency rollback for branch intake rollout.
-- Preserves physical intake receipts and manifest audit history.
-- Run only if the new branch intake workflow must be disabled after activation.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.be_branch_generate_temp_qr_v1(text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.be_branch_intake_register_v1(text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.be_branch_intake_snapshot_v1(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.be_branch_evening_manifest_prepare_v1(text,uuid[],text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.be_branch_intake_scan_v1(uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.be_branch_temp_qr_link_way_v1(uuid,text) FROM authenticated;
DROP TRIGGER IF EXISTS be_branch_registration_guard_ledger_v1 ON public.be_waybill_ledger;
DROP TRIGGER IF EXISTS be_branch_registration_guard_parcels_v1 ON public.be_data_entry_parcels;
DROP TRIGGER IF EXISTS be_branch_registration_guard_details_v1 ON public.be_data_entry_parcel_details;
UPDATE public.be_role_authority_matrix
SET rights=jsonb_set(jsonb_set(coalesce(rights,'{}'::jsonb),
 '{modules,data_entry}', '{"view":true,"create":true,"update":true,"upload":true,"export":true}'::jsonb,true),
 '{modules,waybill}', '{"view":true,"create":true,"update":true,"upload":true,"export":true}'::jsonb,true)
WHERE role_id='branch_manager';
-- NEVER drop intake tables or delete manifests during rollback.
COMMIT;
