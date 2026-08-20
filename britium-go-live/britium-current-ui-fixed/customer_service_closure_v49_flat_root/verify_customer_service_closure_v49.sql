select jsonb_build_object(
  'customer_service_closure_v49', jsonb_build_object(
    'snapshot_rpc', to_regprocedure('public.be_cs_closure_snapshot_v49(text,integer)')::text,
    'sync_rpc', to_regprocedure('public.be_cs_closure_sync_v49(text)')::text,
    'record_contact_rpc', to_regprocedure('public.be_cs_record_customer_contact_v49(text,text,text,text,text,text,text,text)')::text,
    'close_rpc', to_regprocedure('public.be_cs_close_communication_v49(text,text,text,text)')::text,
    'escalate_rpc', to_regprocedure('public.be_cs_escalate_closure_v49(text,text,text,text,text)')::text,
    'status_rpc', to_regprocedure('public.be_cs_closure_status_v49(text)')::text,
    'closure_table', to_regclass('public.be_cs_closure_v49')::text,
    'event_table', to_regclass('public.be_cs_closure_events_v49')::text,
    'workflow', 'DELIVERY FINAL -> FINANCE CLEAR -> CUSTOMER CONTACT -> CLOSED / ESCALATED'
  )
) as verification;

select public.be_cs_closure_snapshot_v49('ALL', 25);
