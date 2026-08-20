-- Controlled rollback: restore the pre-V61.5 core calculation function.
rollback;
begin;

do $rollback$
declare
  v_definition text;
begin
  select function_definition into v_definition
  from public.be_financial_v2_function_backup_v61_5
  where build='PRE_FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_2026_08_03'
  order by backup_id desc
  limit 1;

  if v_definition is null then
    raise exception 'ABORT: pre-V61.5 function backup not found.';
  end if;

  execute v_definition;
end
$rollback$;

insert into public.be_audit_events(action,resource_type,resource_id,details,created_at)
select 'FINANCIAL_V2_ALL_PAYMENT_TYPES_V61_5_ROLLBACK','function','be_calculate_parcel_financial_v2',jsonb_build_object('rolled_back',true,'tariff_rows_changed',false,'historical_rows_changed',false),now()
where to_regclass('public.be_audit_events') is not null;

commit;
