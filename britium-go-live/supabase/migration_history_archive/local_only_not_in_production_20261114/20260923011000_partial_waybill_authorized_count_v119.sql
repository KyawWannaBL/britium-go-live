-- V119: partial waybill helper must use the authorized pickup ceiling, not a stale Rider verified count.
-- This permits printing the completed subset while incomplete parcel sequences remain pending.

do $migration$
declare
  v_def text;
  v_old text := $old$
  v_expected_count := greatest(
    coalesce(
      case when v_os_evidence then nullif(v_pickup.verified_parcels,0) else v_pickup.verified_parcels end,
      nullif(to_jsonb(v_pickup) ->> 'expected_parcels', '')::integer,
      nullif(to_jsonb(v_pickup) ->> 'expected_parcel_count', '')::integer,
      1
    ),
    1
  );
$old$;
  v_new text := $new$
  v_expected_count := greatest(
    coalesce(v_pickup.verified_parcels,0),
    coalesce(nullif(to_jsonb(v_pickup) ->> 'expected_parcels', '')::integer,0),
    coalesce(nullif(to_jsonb(v_pickup) ->> 'expected_parcel_count', '')::integer,0),
    coalesce(nullif(to_jsonb(v_pickup) ->> 'parcel_count', '')::integer,0),
    1
  );
$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='be_data_entry_create_ready_waybill_rows_v1'
  limit 1;

  if v_def is null then
    raise exception 'private.be_data_entry_create_ready_waybill_rows_v1 was not found';
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'Expected partial-waybill count block was not found; aborting V119 patch';
  end if;

  execute replace(v_def,v_old,v_new);
end
$migration$;

comment on function private.be_data_entry_create_ready_waybill_rows_v1(text,jsonb,text)
is 'V119: partial waybill creation uses the authorized pickup quantity ceiling instead of a stale Rider verified count.';
