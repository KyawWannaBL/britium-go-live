
insert into public.be_delivery_way_id_registry(delivery_way_id,pickup_id,parcel_sequence)
select id,pickup_id,parcel_sequence
from (
  select distinct
    upper(btrim(delivery_way_id)) as id,
    upper(btrim(pickup_id)) as pickup_id,
    parcel_sequence
  from public.be_data_entry_parcel_details
  where upper(btrim(coalesce(delivery_way_id,''))) like 'D%'

  union

  select distinct
    upper(btrim(delivery_way_id)) as id,
    upper(btrim(pickup_id)) as pickup_id,
    parcel_sequence
  from public.be_pickup_parcel_verifications
  where upper(btrim(coalesce(delivery_way_id,''))) like 'D%'
) s
on conflict do nothing;

create or replace function public.be_enforce_canonical_delivery_way_id_v134()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if nullif(btrim(coalesce(new.delivery_way_id,'')),'') is null
     or upper(btrim(new.delivery_way_id)) like 'P%' then
    if nullif(btrim(coalesce(new.pickup_id,'')),'') is not null
       and coalesce(new.parcel_sequence,0) > 0 then
      new.delivery_way_id :=
        public.be_allocate_delivery_way_id(new.pickup_id,new.parcel_sequence);
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists be_data_entry_canonical_delivery_way_id_v134
  on public.be_data_entry_parcel_details;

create trigger be_data_entry_canonical_delivery_way_id_v134
before insert or update of delivery_way_id,pickup_id,parcel_sequence
on public.be_data_entry_parcel_details
for each row
execute function public.be_enforce_canonical_delivery_way_id_v134();

drop trigger if exists be_pickup_verification_canonical_delivery_way_id_v134
  on public.be_pickup_parcel_verifications;

create trigger be_pickup_verification_canonical_delivery_way_id_v134
before insert or update of delivery_way_id,pickup_id,parcel_sequence
on public.be_pickup_parcel_verifications
for each row
execute function public.be_enforce_canonical_delivery_way_id_v134();

update public.be_data_entry_parcel_details d
set delivery_way_id = public.be_allocate_delivery_way_id(d.pickup_id,d.parcel_sequence),
    updated_at = now()
where upper(btrim(coalesce(d.delivery_way_id,''))) like 'P%'
  and nullif(btrim(coalesce(d.pickup_id,'')),'') is not null
  and coalesce(d.parcel_sequence,0) > 0;

update public.be_pickup_parcel_verifications v
set delivery_way_id = public.be_allocate_delivery_way_id(v.pickup_id,v.parcel_sequence),
    updated_at = now()
where upper(btrim(coalesce(v.delivery_way_id,''))) like 'P%'
  and nullif(btrim(coalesce(v.pickup_id,'')),'') is not null
  and coalesce(v.parcel_sequence,0) > 0;
