select jsonb_build_object(
  'snapshot_rpc', to_regprocedure('public.be_finance_cod_snapshot_v48(text,integer)')::text,
  'sync_rpc', to_regprocedure('public.be_finance_cod_sync_v48(text)')::text,
  'record_remittance_rpc', to_regprocedure('public.be_finance_cod_record_remittance_v48(text,numeric,text,text,text,timestamptz,text,text,text)')::text,
  'hold_rpc', to_regprocedure('public.be_finance_cod_hold_v48(text,text,text,text)')::text,
  'settle_rpc', to_regprocedure('public.be_finance_cod_settle_v48(text,numeric,text,text,timestamptz,text,text)')::text,
  'batch_settle_rpc', to_regprocedure('public.be_finance_cod_settle_batch_v48(text[],text,text,text,text)')::text,
  'status_rpc', to_regprocedure('public.be_finance_cod_status_v48(text)')::text,
  'settlement_table', to_regclass('public.be_finance_cod_settlements_v48')::text,
  'event_table', to_regclass('public.be_finance_cod_events_v48')::text,
  'workflow', 'DELIVERED -> remittance/proof reconciliation -> variance hold or READY_TO_SETTLE -> SETTLED'
) as finance_cod_v48;

select public.be_finance_cod_snapshot_v48('ALL', 10);
