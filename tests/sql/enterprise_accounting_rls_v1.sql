create table if not exists public.be_user_account_registry (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  role text not null,
  active boolean not null default true
);

do $$
declare
  v_finance uuid := '11111111-1111-4111-8111-111111111111';
  v_admin uuid := '22222222-2222-4222-8222-222222222222';
  v_super uuid := '33333333-3333-4333-8333-333333333333';
begin
  delete from public.be_user_account_registry
  where auth_user_id in (v_finance,v_admin,v_super);

  insert into public.be_user_account_registry(auth_user_id,role,active) values
    (v_finance,'finance',true),
    (v_admin,'admin',true),
    (v_super,'super_admin',true);
end $$;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","user_metadata":{"role":"super_admin"},"app_metadata":{"role":"super_admin"}}';

do $$
begin
  if not public.be_accounting_can_v1('finance_entry') then
    raise exception 'finance user lost finance_entry';
  end if;
  if not public.be_accounting_can_v1('journal_post') then
    raise exception 'finance user lost journal_post';
  end if;
  if public.be_accounting_can_v1('ledger_admin') then
    raise exception 'browser metadata spoof granted ledger_admin';
  end if;
end $$;

insert into public.finance_daily_logs(entry_date,department_code,fuel_and_tolls_spent)
values (date '2099-03-01','FINANCE',5000);

do $$
declare v_id uuid;
begin
  select id into v_id
  from public.finance_daily_logs
  where entry_date=date '2099-03-01' and department_code='FINANCE'
  order by created_at desc limit 1;

  if v_id is null then
    raise exception 'finance insert through RLS failed';
  end if;

  begin
    update public.finance_daily_logs set fuel_and_tolls_spent=7000 where id=v_id;
    raise exception 'finance direct update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm='finance direct update unexpectedly succeeded' then raise; end if;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","user_metadata":{"role":"finance"}}';

do $$
begin
  if not public.be_accounting_can_v1('asset_entry') then
    raise exception 'admin user lost asset_entry';
  end if;
  if public.be_accounting_can_v1('journal_post') then
    raise exception 'admin incorrectly gained journal_post';
  end if;

  begin
    insert into public.be_journal_entries(journal_number,accounting_date,status)
    values ('UNAUTHORIZED-TEST',date '2099-03-01','POSTED');
    raise exception 'admin direct journal insert unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm='admin direct journal insert unexpectedly succeeded' then raise; end if;
  end;
end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';

do $$
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    raise exception 'superadmin lost ledger_admin';
  end if;

  begin
    update public.be_journal_entries
    set description='direct mutation should fail'
    where source_event_id is not null;
    raise exception 'superadmin direct posted journal mutation unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm='superadmin direct posted journal mutation unexpectedly succeeded' then raise; end if;
  end;
end $$;
rollback;
