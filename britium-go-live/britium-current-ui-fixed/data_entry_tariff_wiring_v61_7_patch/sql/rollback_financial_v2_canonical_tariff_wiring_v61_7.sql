-- Controlled rollback for V61.7 canonical tariff wiring
rollback;
begin;
do $restore$
declare v_definition text;
begin
  select function_definition into v_definition
  from public.be_financial_v2_function_backup_v61_7
  where build='PRE_FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03'
  order by backed_up_at desc limit 1;
  if v_definition is null then raise exception 'ABORT: V61.7 resolver backup not found.'; end if;
  execute v_definition;
end
$restore$;

drop function if exists public.be_tariff_catalog_v61_7();
drop function if exists public.be_financial_v2_township_code_v61_7(text);
drop function if exists public.be_financial_v2_normalize_township_text_v61_7(text);
drop table if exists public.be_township_identity_v61_7;

delete from public.be_audit_events
where to_regclass('public.be_audit_events') is not null
  and action='FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7'
  and resource_id='be_parcel_tariffs_v2';
commit;
select jsonb_pretty(jsonb_build_object('ok',true,'build','ROLLBACK_FINANCIAL_V2_CANONICAL_TARIFF_WIRING_V61_7_2026_08_03','tariff_rows_changed',false,'historical_rows_changed',false));
