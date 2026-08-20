-- Controlled rollback for Financial V2 township alias V61.4.1
-- Restores the exact pre-V61.4.1 core calculation function from the migration backup.
rollback;
begin;
do $rollback$
declare
  v_definition text;
begin
  select function_definition
  into v_definition
  from public.be_financial_v2_function_backup_v61_4_1
  where build='PRE_FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_2026_08_03'
    and function_signature='public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)'
  order by backed_up_at desc, backup_id desc
  limit 1;

  if v_definition is null then
    raise exception 'ABORT: pre-V61.4.1 function backup was not found.';
  end if;

  execute v_definition;
end
$rollback$;
commit;

select jsonb_pretty(jsonb_build_object(
  'ok',true,
  'build','FINANCIAL_V2_TOWNSHIP_ALIAS_V61_4_1_ROLLBACK_2026_08_03',
  'core_restored_from_backup',true,
  'tariff_rows_changed',false,
  'historical_rows_changed',false,
  'mutation_mode',(select mutation_mode from public.be_data_entry_financial_v2_runtime_v58 where singleton)
));
