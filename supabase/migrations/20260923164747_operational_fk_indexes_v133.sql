create index if not exists idx_be_data_entry_register_rows_batch_id
  on public.be_data_entry_register_rows (batch_id);

create index if not exists idx_be_data_entry_upload_rows_batch_id
  on public.be_data_entry_upload_rows (batch_id);

create index if not exists idx_be_warehouse_inventory_rows_parcel_id
  on public.be_warehouse_inventory_rows (parcel_id);

create index if not exists idx_be_wayplan_batches_upload_code
  on public.be_wayplan_batches (upload_code);

create index if not exists idx_be_wayplan_stops_wayplan_route_id
  on public.be_wayplan_stops (wayplan_route_id);
