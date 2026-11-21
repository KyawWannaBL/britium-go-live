BEGIN;
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users) <> 18 THEN RAISE EXCEPTION 'Not isolated UAT'; END IF;
IF to_regprocedure('public.be_data_entry_pickup_safe_numeric_v16(text,numeric)') IS NULL THEN RAISE EXCEPTION 'Numeric helper missing'; END IF;
END $guard$;
ALTER FUNCTION public.be_data_entry_pickup_safe_numeric_v16(text,numeric) SET search_path TO pg_catalog,public,pg_temp;
COMMIT;
