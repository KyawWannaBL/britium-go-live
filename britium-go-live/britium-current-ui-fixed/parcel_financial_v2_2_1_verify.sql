-- PARCEL FINANCIAL V2.2.1 READ-ONLY VERIFICATION
-- Run after parcel_financial_v2_2_1_hardening.sql.

with quote as (
  select public.be_data_entry_financial_quote_v2(
    null,
    'မြောက်ဥက္ကလာပ',
    'STANDARD',
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    25000,
    6000,
    null,
    0,0,0,0,0,
    1
  ) as q
), defs as (
  select
    pg_get_functiondef('public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb)'::regprocedure) as save_def,
    pg_get_functiondef('public.be_finance_settle_batch_v2(text[],uuid,uuid)'::regprocedure) as batch_def
)
select jsonb_build_object(
  'build','PARCEL_FINANCIAL_V2_2_1_VERIFICATION_2026-07-31',
  'quote_test_ok',
    (q->>'validation_status'='OK'
     and (q->>'cod_amount')::bigint=31000
     and (q->>'net_system_delivery_charge')::bigint=4500
     and (q->>'delivery_difference')::bigint=1500
     and (q->>'merchant_final_settlement_amount')::bigint=26500),
  'quote',q,
  'save_does_not_write_actual_collect', position('actual_collect =' in save_def)=0,
  'batch_requires_authenticated_actor', position('Authenticated Finance user is required' in batch_def)>0,
  'batch_blocks_actor_spoof', position('Actor mismatch' in batch_def)>0,
  'batch_deduplicates_ids', position('array_agg(distinct' in lower(batch_def))>0,
  'public_can_execute_batch', has_function_privilege('public','public.be_finance_settle_batch_v2(text[],uuid,uuid)','EXECUTE'),
  'anon_can_execute_batch', has_function_privilege('anon','public.be_finance_settle_batch_v2(text[],uuid,uuid)','EXECUTE'),
  'authenticated_can_execute_batch', has_function_privilege('authenticated','public.be_finance_settle_batch_v2(text[],uuid,uuid)','EXECUTE'),
  'queue_rows',(select count(*) from public.be_v_finance_merchant_settlement_queue_v2),
  'ready_to_settle',(select count(*) from public.be_v_finance_merchant_settlement_queue_v2 where settlement_eligible),
  'review_required',(select count(*) from public.be_v_finance_merchant_settlement_queue_v2 where settlement_state='REVIEW_REQUIRED'),
  'deletes_rows',false
) as parcel_financial_v2_2_1_verification
from quote cross join defs;
