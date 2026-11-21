-- Britium Express | Read-only final merchant advance offset diagnostics
-- Safe on production/UAT, including UAT lacking advance schema.
SELECT current_database() AS db_name,
       to_regclass('public.be_finance_advance_batches_v1') IS NOT NULL AS advance_batches_exist,
       to_regclass('public.be_finance_advance_final_offset_reviews_v1') IS NOT NULL AS offset_review_exists,
       to_regclass('public.be_finance_settlement_batches_v3') IS NOT NULL AS normal_settlement_exist,
       to_regclass('public.be_warehouse_receipts_v36') IS NOT NULL AS receipts_exist,
       to_regprocedure('public.be_finance_assert_internal_v3()') IS NOT NULL AS finance_auth_exists,
       to_regprocedure('public.be_finance_advance_final_offset_prepare_v1(uuid,text)') IS NOT NULL AS offset_prepare_exists;

WITH cases(test_case,normal_entitlement,advance_paid) AS (
 VALUES ('DELIVERED_BALANCE_DUE',100000::numeric,90000::numeric),
        ('OVERADVANCE_RECOVERY',80000::numeric,90000::numeric),
        ('ZERO_PAYABLE_RECOVERY',0::numeric,90000::numeric),
        ('NEGATIVE_ENTITLEMENT',-10000::numeric,90000::numeric),
        ('EXACT_OFFSET',90000::numeric,90000::numeric)
), balances AS (
 SELECT test_case,normal_entitlement,advance_paid,
        least(greatest(normal_entitlement,0),advance_paid) AS offset_amount,
        greatest(normal_entitlement,0)-least(greatest(normal_entitlement,0),advance_paid) AS remaining_payable,
        advance_paid-least(greatest(normal_entitlement,0),advance_paid) AS overadvance_recovery,
        greatest(-normal_entitlement,0) AS separate_receivable
 FROM cases
)
SELECT *, (offset_amount+remaining_payable=greatest(normal_entitlement,0)
       AND offset_amount+overadvance_recovery=advance_paid
       AND separate_receivable=greatest(-normal_entitlement,0)
       AND offset_amount>=0 AND remaining_payable>=0
       AND overadvance_recovery>=0 AND separate_receivable>=0) AS invariant_pass
FROM balances ORDER BY test_case;
