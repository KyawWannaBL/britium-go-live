do $$
begin
  if to_regclass('public.be_chart_of_accounts') is null then
    raise exception 'be_chart_of_accounts missing';
  end if;
  if to_regclass('public.be_journal_entries') is null then
    raise exception 'be_journal_entries missing';
  end if;
  if to_regclass('public.be_journal_lines') is null then
    raise exception 'be_journal_lines missing';
  end if;
  if to_regclass('public.be_accounting_events') is null then
    raise exception 'be_accounting_events missing';
  end if;
  if to_regclass('public.be_accounting_event_lines') is null then
    raise exception 'be_accounting_event_lines missing';
  end if;
  if to_regclass('public.be_accounting_periods') is null then
    raise exception 'be_accounting_periods missing';
  end if;
  if to_regclass('public.be_accounting_source_links') is null then
    raise exception 'be_accounting_source_links missing';
  end if;
  if to_regclass('public.audit_logs') is null then
    raise exception 'audit_logs missing';
  end if;
  if to_regclass('public.be_fixed_asset_register') is null then
    raise exception 'be_fixed_asset_register missing';
  end if;
  if to_regclass('public.be_asset_depreciation_schedule') is null then
    raise exception 'be_asset_depreciation_schedule missing';
  end if;
  if to_regclass('public.be_financial_report_snapshots') is null then
    raise exception 'be_financial_report_snapshots missing';
  end if;
end $$;

select account_code, account_name
from public.be_chart_of_accounts
where account_code in ('1000','1100','1200','2000','2100','2200','3000','4000','4100','5000','6000')
order by account_code;
