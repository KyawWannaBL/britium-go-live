select jsonb_pretty(jsonb_build_object(
  'queue_v2', to_regclass('public.be_v_finance_merchant_settlement_queue_v2') is not null,
  'legacy_settle_rpc', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='be_finance_settle_batch_v2'
  ),
  'batches_table', to_regclass('public.be_finance_settlement_batches_v3') is not null,
  'items_table', to_regclass('public.be_finance_settlement_batch_items_v3') is not null,
  'payments_table', to_regclass('public.be_finance_settlement_payments_v3') is not null,
  'disputes_table', to_regclass('public.be_finance_settlement_disputes_v3') is not null,
  'snapshot_rpc', to_regprocedure('public.be_finance_settlement_snapshot_v3(text,text,integer)') is not null,
  'create_batch_rpc', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='be_finance_create_settlement_batch_v3'
  ),
  'payment_rpc', exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='be_finance_record_payment_v3'
  )
));

select
  n.nspname as schema_name,
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('be_finance_settle_batch_v2','be_finance_settlement_snapshot_v3','be_finance_create_settlement_batch_v3','be_finance_record_payment_v3')
order by p.proname;

select * from public.be_finance_settlement_access_v3 order by email;
