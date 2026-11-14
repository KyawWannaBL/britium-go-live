-- V118: zero verified_parcels must not collapse partial waybill readiness to one parcel.
-- Fall back to expected/authorized pickup quantities when verified_parcels is 0.

do $migration$
declare
  v_def text;
  v_old text := $old$
  v_expected_text := coalesce(
    case when v_os_evidence then nullif(nullif(v_pickup ->> 'verified_parcels',''),'0') else nullif(v_pickup ->> 'verified_parcels','') end,
    nullif(v_pickup ->> 'expected_parcels',''),
    nullif(v_pickup ->> 'expected_parcel_count','')
  );
$old$;
  v_new text := $new$
  v_expected_text := coalesce(
    nullif(nullif(v_pickup ->> 'verified_parcels',''),'0'),
    nullif(v_pickup ->> 'expected_parcels',''),
    nullif(v_pickup ->> 'expected_parcel_count',''),
    nullif(v_pickup ->> 'parcel_count','')
  );
$new$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='be_data_entry_financial_v2_create_ready_waybill'
  limit 1;

  if v_def is null then
    raise exception 'be_data_entry_financial_v2_create_ready_waybill was not found';
  end if;

  if position(v_old in v_def)=0 then
    raise exception 'Expected V58 waybill expected-count block was not found; aborting V118 patch';
  end if;

  execute replace(v_def,v_old,v_new);
end
$migration$;

comment on function public.be_data_entry_financial_v2_create_ready_waybill(jsonb)
is 'V118: zero verified_parcels falls back to expected pickup quantity so completed partial waybill batches remain eligible.';
