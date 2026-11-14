
delete from public.be_delivery_way_id_registry
where upper(pickup_id)='P0926-BCC-002'
  and parcel_sequence in (1,2);

insert into public.be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence)
values
  ('D0926-BCC-130','P0926-BCC-002',1),
  ('D0926-BCC-131','P0926-BCC-002',2);

update public.be_data_entry_parcel_details
set delivery_way_id = case parcel_sequence
    when 1 then 'D0926-BCC-130'
    when 2 then 'D0926-BCC-131'
  end,
  updated_at = now()
where upper(pickup_id)='P0926-BCC-002'
  and parcel_sequence in (1,2);

update public.be_pickup_parcel_verifications
set delivery_way_id = case parcel_sequence
    when 1 then 'D0926-BCC-130'
    when 2 then 'D0926-BCC-131'
  end,
  updated_at = now()
where upper(pickup_id)='P0926-BCC-002'
  and parcel_sequence in (1,2);
