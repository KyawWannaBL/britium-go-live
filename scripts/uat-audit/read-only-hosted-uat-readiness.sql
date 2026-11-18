-- Britium Express UAT: READ-ONLY structural preflight.
-- Execute ONLY against isolated Supabase hgijdyfwmvskchsruknp.
-- This is not a substitute for authenticated branch and workflow testing.
WITH requirements(name, object_name, kind) AS (
  VALUES
    ('branch directory','public.be_branch_offices','table'),
    ('account registry','public.be_user_account_registry','table'),
    ('territory assignments','public.be_employee_territory_assignments','table'),
    ('Data Entry parcels','public.be_data_entry_parcel_details','table'),
    ('Waybill ledger','public.be_waybill_ledger','table'),
    ('wayplan membership','public.be_wayplan_membership_v40','table'),
    ('warehouse receipts','public.be_v_warehouse_receipt_v39','view'),
    ('dispatch ready queue','public.be_v_dispatch_ready_queue','view')
)
SELECT
  name,
  object_name,
  to_regclass(object_name) IS NOT NULL AS present,
  CASE WHEN kind='table' THEN (
    SELECT c.relrowsecurity FROM pg_class c WHERE c.oid=to_regclass(object_name)
  ) ELSE NULL END AS rls_enabled,
  kind
FROM requirements ORDER BY name;

SELECT count(*)::integer AS auth_accounts
FROM auth.users;

SELECT
  to_regprocedure('public.be_employee_can_access_territory(uuid,text,text,text)') IS NOT NULL
    AS territory_acl_exists,
  to_regprocedure('public.be_customer_service_can_manage_pickup_request(text,text,text)') IS NOT NULL
    AS customer_service_acl_exists;

-- Separate mandatory end-to-end UAT:
-- 1 Auth Admin invites 16 planned users; verify real mailbox and completed invite.
-- 2 Bind actual auth UUIDs to MDY/ISN role and territory in app registry.
-- 3 Assert anonymous/inactive denial, cross-branch denial, manager oversight.
-- 4 Save one UAT-only parcel; print canonical Way ID; verify warehouse receipt.
-- 5 Create/review wayplan; assign rider/driver/helper; accept and dispatch scan.
-- 6 Upload rider proof, confirm returns/settlements without production writes.
