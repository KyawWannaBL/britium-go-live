-- Britium Express | non-destructive production performance repair
-- Observed PostgREST SQLSTATE 57014 at 2026-11-20T13:11:24Z
-- in be_warehouse_provider_transfer_preview_v1() metadata LATERAL lookups.
-- Existing btree on delivery_way_id does not support upper(delivery_way_id).
-- Only indexes, no status changes, no parcel writes, no authorization changes.
CREATE INDEX IF NOT EXISTS be_warehouse_receipts_upper_way_updated_v230_idx
  ON public.be_warehouse_receipts_v36
  (upper(delivery_way_id), updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS be_data_entry_provider_upper_way_pickup_updated_v230_idx
  ON public.be_data_entry_parcel_details
  (upper(delivery_way_id), upper(pickup_id), updated_at DESC NULLS LAST);

-- Read-only verification after execution:
-- SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
--   AND indexname IN
--   ('be_warehouse_receipts_upper_way_updated_v230_idx',
--    'be_data_entry_provider_upper_way_pickup_updated_v230_idx');
