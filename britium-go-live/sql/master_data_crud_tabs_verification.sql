-- Verify Master Data CRUD Tabs Patch

select public.be_master_data_healthcheck();

select
  dataset_key,
  display_name_en,
  category,
  primary_key,
  row_count
from (
  select
    t.dataset_key,
    t.display_name_en,
    t.category,
    t.primary_key,
    count(r.*) filter (where r.deleted_at is null) as row_count,
    t.sort_order
  from public.be_master_data_tabs t
  left join public.be_master_data_rows r on r.dataset_key = t.dataset_key
  where t.active = true
  group by t.dataset_key, t.display_name_en, t.category, t.primary_key, t.sort_order
) s
order by sort_order;

-- Check snapshot shape for frontend
select
  public.be_master_data_page_snapshot() ? 'datasets' as has_datasets,
  public.be_master_data_page_snapshot() ? 'records_by_dataset' as has_records_by_dataset,
  jsonb_array_length(public.be_master_data_page_snapshot()->'datasets') as dataset_count;

-- Smoke test upsert/delete using a safe test row
select public.be_master_data_upsert_record(
  p_dataset_key => 'service_types',
  p_record_key => 'TEST_SERVICE_DO_NOT_USE',
  p_payload => jsonb_build_object(
    'service_type', 'TEST_SERVICE_DO_NOT_USE',
    'name_en', 'Test Service',
    'name_mm', 'စမ်းသပ်ဝန်ဆောင်မှု',
    'description', 'Safe smoke test row',
    'is_active', 'No'
  ),
  p_actor_email => 'uat-smoke-test'
);

select public.be_master_data_delete_record(
  p_dataset_key => 'service_types',
  p_record_key => 'TEST_SERVICE_DO_NOT_USE',
  p_actor_email => 'uat-smoke-test'
);
