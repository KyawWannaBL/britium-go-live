begin;

create index if not exists be_journal_entries_replacement_idx
on public.be_journal_entries(replacement_for_journal_id);

drop policy if exists finance_daily_logs_insert_v1 on public.finance_daily_logs;
create policy finance_daily_logs_insert_v1 on public.finance_daily_logs
for insert to authenticated
with check (
  (select public.be_accounting_can_v1('finance_entry'))
  and created_by=(select auth.uid())
);

drop policy if exists admin_assets_and_hr_logs_insert_v1 on public.admin_assets_and_hr_logs;
create policy admin_assets_and_hr_logs_insert_v1 on public.admin_assets_and_hr_logs
for insert to authenticated
with check (
  (select public.be_accounting_can_v1('asset_entry'))
  and created_by=(select auth.uid())
);

revoke execute on function public.be_accounting_current_role_v1() from authenticated;

comment on function public.be_accounting_current_role_v1() is
  'Internal server-side role resolver used by be_accounting_can_v1. Not exposed directly to authenticated clients.';

commit;
