-- Run after final_synchronization_v50.sql
select jsonb_build_object(
  'final_sync_snapshot_rpc', to_regprocedure('public.be_final_sync_snapshot_v50(text,integer)')::text,
  'canonical_refresh_rpc', to_regprocedure('public.be_final_sync_refresh_v50(text)')::text,
  'assign_variance_rpc', to_regprocedure('public.be_final_sync_assign_variance_v50(bigint,text,text,text)')::text,
  'resolve_variance_rpc', to_regprocedure('public.be_final_sync_resolve_variance_v50(bigint,text,text)')::text,
  'certify_rpc', to_regprocedure('public.be_final_sync_certify_v50(text,text,text)')::text,
  'batch_certify_rpc', to_regprocedure('public.be_final_sync_certify_batch_v50(text[],text,text)')::text,
  'status_rpc', to_regprocedure('public.be_final_sync_status_v50(text)')::text,
  'case_table', to_regclass('public.be_final_sync_cases_v50')::text,
  'variance_table', to_regclass('public.be_final_sync_variances_v50')::text,
  'event_table', to_regclass('public.be_final_sync_events_v50')::text,
  'workflow', 'CANONICAL REFRESH -> VARIANCE RESOLUTION -> CERTIFIED FOR REPORTING'
) as final_synchronization_v50;

-- Refresh one known Wayplan, Pickup ID, or Way ID after installation.
-- select public.be_final_sync_refresh_v50('WP-20260730-053113');

select public.be_final_sync_snapshot_v50('ALL', 500);
