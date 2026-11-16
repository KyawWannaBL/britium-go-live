-- Read-only UAT preflight: do not create a partial Data Entry or Waybill table.
-- Safe on databases where all referenced business objects are absent.
WITH required(object_name, object_kind) AS (
  VALUES
    ('public.be_data_entry_parcel_details','table'),
    ('public.be_waybill_ledger','table'),
    ('public.be_data_entry_financial_v2_runtime_v58','table'),
    ('public.be_parcel_tariffs_v2','table'),
    ('public.be_master_data_rows','table'),
    ('public.be_dispatch_scans_v39','table'),
    ('public.be_branch_offices','table'),
    ('public.be_user_account_registry','table')
), status AS (
 SELECT object_name, object_kind, to_regclass(object_name) IS NOT NULL AS exists_in_schema
 FROM required
)
SELECT * FROM status ORDER BY object_name;
