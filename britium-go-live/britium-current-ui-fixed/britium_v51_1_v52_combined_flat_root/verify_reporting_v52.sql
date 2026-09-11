-- Britium Express V52 verification
select jsonb_build_object(
  'build', 'REPORTING_V52_CERTIFIED_RECONCILED_EXPORT_2026-07-30',
  'certified_snapshot_rpc', to_regprocedure('public.be_reporting_certified_snapshot_v52(date,date,text,text,text,text,text,integer)')::text,
  'generate_report_rpc', to_regprocedure('public.be_reporting_generate_v52(text,date,date,text,text,text,text,text,text)')::text,
  'revalidate_report_rpc', to_regprocedure('public.be_reporting_revalidate_v52(uuid)')::text,
  'review_report_rpc', to_regprocedure('public.be_reporting_review_v52(uuid,text,text,text,text)')::text,
  'register_export_rpc', to_regprocedure('public.be_reporting_register_export_v52(uuid,text,text,text,integer,text,text)')::text,
  'run_status_rpc', to_regprocedure('public.be_reporting_run_status_v52(uuid)')::text,
  'recent_runs_rpc', to_regprocedure('public.be_reporting_recent_runs_v52(integer)')::text,
  'run_table', to_regclass('public.be_reporting_runs_v52')::text,
  'export_table', to_regclass('public.be_reporting_exports_v52')::text,
  'certification_source', to_regclass('public.be_final_sync_cases_v50')::text,
  'workflow', 'V50 CERTIFIED DATA -> FILTERED REPORT -> INDEPENDENT REVIEW -> CONTROLLED EXPORT'
) as reporting_v52_verification;

select public.be_reporting_certified_snapshot_v52(
  current_date - 30,
  current_date,
  null,
  null,
  null,
  null,
  null,
  100
) as certified_reporting_preview;
