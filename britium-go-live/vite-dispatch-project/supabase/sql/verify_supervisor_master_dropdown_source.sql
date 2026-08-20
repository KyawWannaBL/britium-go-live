-- Verify the exact source used by the Supervisor assignment dropdowns.
select
  jsonb_array_length(public.be_master_data_dropdown_snapshot()->'riders') as riders,
  jsonb_array_length(public.be_master_data_dropdown_snapshot()->'drivers') as drivers,
  jsonb_array_length(public.be_master_data_dropdown_snapshot()->'helpers') as helpers,
  jsonb_array_length(public.be_master_data_dropdown_snapshot()->'fleets') as fleets;

-- Preview what the Rider dropdown receives.
select public.be_master_data_dropdown_snapshot()->'riders' as rider_dropdown_options;

-- Preview what the Fleet dropdown receives.
select public.be_master_data_dropdown_snapshot()->'fleets' as fleet_dropdown_options;
