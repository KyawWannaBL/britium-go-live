-- Britium Express advance settlement dependency preflight, READ ONLY
-- Run on hgijdyfwmvskchsruknp first, then compare to production.
WITH required(kind,object_name) AS (
 VALUES
 ('table','public.be_data_entry_parcel_details'),
 ('table','public.be_warehouse_receipts_v36'),
 ('table','public.be_pickup_parcel_verifications'),
 ('table','public.be_finance_settlement_batches_v3'),
 ('table','public.be_finance_settlement_batch_items_v3'),
 ('table','public.be_finance_settlement_disputes_v3'),
 ('table','public.be_finance_settlement_parcel_control_v3'),
 ('table','public.be_finance_settlement_payments_v3'),
 ('view','public.be_v_finance_merchant_settlement_queue_v2'),
 ('function','public.be_finance_assert_internal_v3()'),
 ('function','public.be_finance_advance_preview_v1(text,integer)'),
 ('function','public.be_finance_advance_final_reconciliation_preview_v1(text,integer)')
)
SELECT kind,object_name,
 CASE WHEN kind='function' THEN to_regprocedure(object_name) IS NOT NULL
 ELSE to_regclass(object_name) IS NOT NULL END AS present
FROM required ORDER BY kind,object_name;
-- A missing candidate advance function is expected BEFORE installation;
-- any missing operational dependency is a blocker.
