-- Controlled rollback for FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04
rollback;
begin;

do $rollback$
declare
  v_definition text;
begin
  select function_definition into v_definition
  from public.be_financial_v2_function_backup_v61_8_1
  where build='PRE_FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_2026_08_04'
  order by backup_id desc
  limit 1;

  if v_definition is null then
    raise exception 'ABORT: V61.8.1 function backup is missing.';
  end if;

  execute v_definition;
end
$rollback$;

insert into public.be_audit_events(action,resource_type,resource_id,details,created_at)
select
  'FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_ROLLBACK',
  'function',
  'be_calculate_parcel_financial_v2',
  jsonb_build_object(
    'build','FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_ROLLBACK_2026_08_04',
    'tariff_rows_changed',false,
    'historical_rows_changed',false,
    'financial_writes_enabled',false
  ),
  now()
where to_regclass('public.be_audit_events') is not null;

commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_PAYMENT_SETTLEMENT_V61_8_1_ROLLBACK_2026_08_04',
  'function_restored',true,
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'financial_writes_enabled',false
));
