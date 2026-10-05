create or replace function public.be_guard_warehouse_ready_duplicate_receive_v194()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.warehouse_status = 'WAREHOUSE_READY'
     and new.warehouse_status = 'RECEIVED'
     and old.ready_at is not null
     and upper(coalesce(new.staging_zone,'')) = 'INTAKE'
  then
    new.warehouse_status := old.warehouse_status;
    new.staging_zone := old.staging_zone;
    new.ready_at := old.ready_at;
    new.ready_by := old.ready_by;
  end if;
  return new;
end;
$$;

create or replace trigger trg_be_guard_warehouse_ready_duplicate_receive_v194
before update on public.be_warehouse_receipts_v36
for each row
execute function public.be_guard_warehouse_ready_duplicate_receive_v194();
