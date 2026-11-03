-- READ ONLY: production Finance tariff ID allocator incident, PR #257 / #258
-- Never call nextval(), setval(), ALTER SEQUENCE, INSERT, UPDATE, DELETE here.
-- Execute as an authorized database reviewer during a controlled change window.
-- Sequence last_value is a snapshot, not proof of safety under concurrent writes.
select
  count(*) as tariff_row_count,
  max(id) as highest_existing_tariff_id,
  count(*) filter(where id = 763) as conflicting_id_763_exists,
  count(*) filter(where id = 764) as existing_id_764_exists
from public.be_parcel_tariffs_v2;

select schemaname,sequencename,start_value,min_value,max_value,
       increment_by,cycle,cache_size,last_value
from pg_catalog.pg_sequences
where schemaname='public'
  and sequencename='be_parcel_tariffs_v2_id_seq';

-- Check current/default allocation metadata without consuming a sequence value.
select column_default, is_nullable, data_type
from information_schema.columns
where table_schema='public'
  and table_name='be_parcel_tariffs_v2'
  and column_name='id';

select count(*) as active_approved_royal_rate_count
from public.be_parcel_tariffs_v2
where customer_tier='STANDARD' and status='ACTIVE'
  and effective_from<=public.be_business_date()
  and (effective_to is null or effective_to>=public.be_business_date())
  and public.be_approved_tariff_lookup_key(township)='MMR007014';

select public.be_calculate_parcel_financial_v2(
  'ထန်းတပင်','STANDARD','ITEM_PRICE_PLUS_DECLARED_DELIVERY',
  20000,5000,null,0,0,0,0,0,5,0
) as approved_royal_calculation;

-- DBA release gate:
-- 1. Coordinate tariff writes and inspect sequence ownership + allocation history.
-- 2. Perform only an approved, audited sequence-alignment operation if needed.
-- 3. Re-run diagnostics and ensure new allocations cannot collide.
-- 4. Apply the reviewed PR #257 migration using authorized deployment controls.
-- 5. Run verify_royal_finance_tariff_sync_readonly.sql and
--    verify_royal_tariff_calculation_postdeploy.sql; validate COD/settlement.
