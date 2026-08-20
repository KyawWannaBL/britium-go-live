-- Britium Data Entry V28
-- Fixes: null value in column "tracking_code" of relation "parcels" violates not-null constraint.
--
-- The Data Entry application uses Way ID as the parcel tracking identifier. This
-- BEFORE trigger fills tracking_code from way_id for every insert/update path,
-- including RPC saves, direct PostgREST fallback saves, bulk Save All, and
-- partial Waybill creation.

create or replace function public.be_fill_parcel_tracking_code_v28()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(new.tracking_code::text, '')), '') is null then
    new.tracking_code := coalesce(
      nullif(btrim(coalesce(new.way_id::text, '')), ''),
      'TRK-' || upper(substr(md5(clock_timestamp()::text || random()::text), 1, 20))
    );
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.parcels') is null then
    raise exception 'public.parcels does not exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'parcels'
      and column_name = 'tracking_code'
  ) then
    raise exception 'public.parcels.tracking_code does not exist';
  end if;

  execute 'drop trigger if exists be_parcels_fill_tracking_code_v28 on public.parcels';
  execute $trigger$
    create trigger be_parcels_fill_tracking_code_v28
    before insert or update of way_id, tracking_code
    on public.parcels
    for each row
    execute function public.be_fill_parcel_tracking_code_v28()
  $trigger$;
end;
$$;

-- Repair blank values if the column permits blanks. NULL values cannot normally
-- exist while the NOT NULL constraint is active, but this also handles older rows.
update public.parcels
set tracking_code = coalesce(
  nullif(btrim(coalesce(way_id::text, '')), ''),
  'TRK-' || upper(substr(md5(coalesce(id::text, '') || clock_timestamp()::text || random()::text), 1, 20))
)
where nullif(btrim(coalesce(tracking_code::text, '')), '') is null;

grant execute on function public.be_fill_parcel_tracking_code_v28() to authenticated;
grant execute on function public.be_fill_parcel_tracking_code_v28() to service_role;

notify pgrst, 'reload schema';

select
  to_regprocedure('public.be_fill_parcel_tracking_code_v28()')::text as tracking_code_trigger_function,
  (
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.parcels'::regclass
      and t.tgname = 'be_parcels_fill_tracking_code_v28'
      and not t.tgisinternal
  ) as tracking_code_trigger,
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'parcels'
      and column_name = 'tracking_code'
  ) as tracking_code_nullable,
  'tracking_code is auto-filled from way_id before every parcel save'::text as save_strategy;
