-- Master Data Go-Live Verification

select public.be_master_data_healthcheck();

select
  (select count(*) from public.be_master_data_tabs where active) as datasets,
  (select count(*) from public.be_master_data_columns) as columns,
  (select count(*) from public.be_master_data_rows where deleted_at is null) as rows,
  (select count(*) from public.be_v_master_merchants) as merchants,
  (select count(*) from public.be_v_master_workforce) as workforce,
  (select count(*) from public.be_v_master_fleets) as fleets,
  (select count(*) from public.be_v_master_townships) as townships;

select public.be_master_data_snapshot(null, null, 20, 0)->'counts' as snapshot_counts;

-- Test one editable row. This creates/updates a UAT-only service type.
select public.be_master_data_upsert_row(
  'service_types',
  'UAT_TEST_SERVICE',
  jsonb_build_object(
    'service_type', 'UAT_TEST_SERVICE',
    'name_en', 'UAT Test Service',
    'name_mm', 'UAT Test Service',
    'description', 'Created by go-live master data verification',
    'is_active', true
  ),
  'ACTIVE',
  'testadmin@britiumexpress.com'
);

select public.be_master_data_delete_row(
  'service_types',
  'UAT_TEST_SERVICE',
  'testadmin@britiumexpress.com'
);

select public.be_master_data_sync_to_live_tables(null, 'testadmin@britiumexpress.com');
