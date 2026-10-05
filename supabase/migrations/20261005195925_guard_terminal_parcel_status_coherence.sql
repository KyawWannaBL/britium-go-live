create or replace function public.be_guard_terminal_parcel_status_coherence_v194()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if upper(coalesce(new.parcel_status,''))='RTO'
     and upper(coalesce(new.way_management_status,''))='DELIVERED' then
    new.way_management_status := 'RTO';
  elsif upper(coalesce(new.parcel_status,''))='DELIVERED'
     and upper(coalesce(new.way_management_status,''))='RTO' then
    new.way_management_status := 'DELIVERED';
  end if;
  return new;
end;
$$;

create or replace trigger trg_be_guard_terminal_parcel_status_coherence_v194
before insert or update on public.be_data_entry_parcel_details
for each row
execute function public.be_guard_terminal_parcel_status_coherence_v194();
