create index if not exists be_warehouse_return_scans_way_upper_v194_idx
on public.be_warehouse_return_scans_v39 (upper(delivery_way_id));

create index if not exists be_dispatch_scans_way_upper_v194_idx
on public.be_dispatch_scans_v39 (upper(delivery_way_id));

create index if not exists be_delivery_attempt_way_upper_v194_idx
on public.be_delivery_attempt_state_v39 (upper(delivery_way_id));

create index if not exists be_data_entry_way_trim_upper_v194_idx
on public.be_data_entry_parcel_details (upper(btrim(delivery_way_id)))
where nullif(btrim(delivery_way_id),'') is not null;
