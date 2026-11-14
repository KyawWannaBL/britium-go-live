do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='be_warehouse_scan_lifecycle_snapshot_v158'
  limit 1;

  v_def := replace(
    v_def,
    'nullif(s.e->>''dispatch_scan_at'','''') is not null as already_scanned',
    'exists(select 1 from public.be_dispatch_scans_v39 ds where upper(ds.delivery_way_id)=s.way_id and ds.scan_status=''SCANNED'') as already_scanned'
  );

  v_def := replace(
    v_def,
    'else coalesce(nullif(e->>''dispatch_workflow_stage'',''''),
          case
            when upper(coalesce(e->>''warehouse_status'',e->>''warehouse_scan_status'','''')) in (''WAREHOUSE_READY'',''READY_FOR_DELIVERY'') then ''READY_FOR_WAYPLAN''
            when upper(coalesce(e->>''warehouse_status'',e->>''warehouse_scan_status'',''''))=''RECEIVED'' then ''RECEIVED''
            else ''PENDING''
          end)',
    'else case
            when upper(coalesce(e->>''warehouse_status'',e->>''warehouse_scan_status'','''')) in (''WAREHOUSE_READY'',''READY_FOR_DELIVERY'',''RETURN_SCANNED'') then ''READY_FOR_WAYPLAN''
            when upper(coalesce(e->>''warehouse_status'',e->>''warehouse_scan_status'',''''))=''RECEIVED'' then ''RECEIVED''
            else coalesce(nullif(e->>''dispatch_workflow_stage'',''''),''PENDING'')
          end'
  );

  execute v_def;
end $$;