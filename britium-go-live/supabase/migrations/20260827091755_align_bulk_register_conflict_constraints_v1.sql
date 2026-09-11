alter table public.delivery_waybills
  add constraint delivery_waybills_delivery_way_id_bulk_key unique (delivery_way_id);
alter table public.be_data_entry_register_rows
  add constraint be_data_entry_register_rows_delivery_way_id_bulk_key unique (delivery_way_id);;
