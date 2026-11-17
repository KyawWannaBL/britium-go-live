-- Original fleet catalog predecessor for approved August 28 reconciliation.
-- Values verified against production catalog read-only; no vehicle records copied.
insert into public.be_master_data_tabs
(dataset_key,sheet_name,display_name_en,display_name_mm,category,primary_key,sort_order,active)
values
('fleet_master','Fleet_Master (EN)','Fleet Master','Fleet Master','Fleet','fleet_id',6,true)
on conflict (dataset_key) do nothing;
do $fleet_catalog$
begin
 if not exists (
  select 1 from public.be_master_data_tabs
  where dataset_key='fleet_master' and sheet_name='Fleet_Master (EN)'
    and primary_key='fleet_id' and active
 ) then
  raise exception 'FLEET_MASTER_CATALOG_MISMATCH';
 end if;
end $fleet_catalog$;
