do $$
begin
  if to_regclass('public.wallet_accounts') is null then
    create table public.wallet_accounts (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid,
      owner_email text,
      account_type text,
      currency_code text default 'MMK',
      status text default 'ACTIVE',
      metadata jsonb default '{}',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  end if;

  if to_regclass('public.commission_runs') is null then
    create table public.commission_runs (
      id uuid primary key default gen_random_uuid(),
      run_code text,
      beneficiary_type text,
      period_start date,
      period_end date,
      status text,
      total_amount numeric,
      approved_by uuid,
      approved_at timestamptz,
      metadata jsonb default '{}',
      created_at timestamptz default now()
    );
  end if;

  if to_regclass('public.commission_items') is null then
    create table public.commission_items (
      id uuid primary key default gen_random_uuid(),
      commission_run_id uuid,
      wallet_account_id uuid,
      beneficiary_user_id uuid,
      beneficiary_name text,
      role_scope text,
      trip_count integer,
      base_amount numeric,
      bonus_amount numeric,
      deduction_amount numeric,
      net_amount numeric,
      metadata jsonb default '{}',
      created_at timestamptz default now()
    );
  end if;

  if to_regclass('public.wallet_transactions') is null then
    create table public.wallet_transactions (
      id uuid primary key default gen_random_uuid(),
      wallet_account_id uuid,
      txn_type text,
      direction text,
      amount numeric,
      status text,
      approval_status text,
      reference_no text,
      external_ref text,
      approved_by uuid,
      approved_at timestamptz,
      description text,
      metadata jsonb default '{}',
      created_at timestamptz default now()
    );
  end if;

  if to_regclass('public.branch_offices') is null then
    create table public.branch_offices (
      id uuid primary key default gen_random_uuid(),
      branch_code text,
      branch_name text,
      is_active boolean default true
    );
  end if;

  if to_regclass('public.branch_office_finance_entries') is null then
    create table public.branch_office_finance_entries (
      id uuid primary key default gen_random_uuid(),
      branch_office_id uuid,
      entry_type text,
      amount numeric,
      entry_date date,
      category text,
      notes text,
      related_transaction_id uuid,
      created_at timestamptz default now()
    );
  end if;
end $$;

do $$
declare
  v_wallet uuid := gen_random_uuid();
  v_run uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_tx uuid := gen_random_uuid();
  v_result jsonb;
  v_event uuid;
begin
  insert into public.wallet_accounts(id,account_type,currency_code,status)
  values (v_wallet,'RIDER','MMK','ACTIVE');

  insert into public.commission_runs(
    id,run_code,beneficiary_type,period_start,period_end,status,total_amount,approved_at
  ) values (
    v_run,'TST-COMM-'||substr(v_run::text,1,8),'RIDER',
    date '2099-05-01',date '2099-05-08','APPROVED',3000,
    timestamptz '2099-05-08 09:00:00+00'
  );

  insert into public.commission_items(
    id,commission_run_id,wallet_account_id,beneficiary_user_id,beneficiary_name,
    role_scope,trip_count,base_amount,bonus_amount,deduction_amount,net_amount,created_at
  ) values (
    v_item,v_run,v_wallet,gen_random_uuid(),'Test Rider','RIDER',10,3000,0,0,3000,
    timestamptz '2099-05-08 08:00:00+00'
  );

  insert into public.wallet_transactions(
    id,wallet_account_id,txn_type,direction,amount,status,approval_status,
    reference_no,approved_at,description,metadata,created_at
  ) values (
    v_tx,v_wallet,'COMMISSION_PAYMENT','OUT',3000,'POSTED','APPROVED',
    'TST-PAYOUT-'||substr(v_tx::text,1,8),timestamptz '2099-05-08 11:00:00+00',
    'Rider commission payout',jsonb_build_object('beneficiary_name','Test Rider'),
    timestamptz '2099-05-08 10:00:00+00'
  );

  v_result := public.be_accounting_sync_rider_commissions_v1(date '2099-05-08',date '2099-05-08');
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'rider commission sync failed: %',v_result;
  end if;

  select id into v_event from public.be_accounting_events
  where source_system='RIDER_COMMISSION' and source_record_id=v_item::text
    and event_type='RIDER_COMMISSION_ACCRUED';

  if v_event is null then raise exception 'commission accrual event missing'; end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='5000' and l.debit_amount=3000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='2200' and l.credit_amount=3000
  ) then raise exception 'commission accrual mapping incorrect'; end if;

  select id into v_event from public.be_accounting_events
  where source_system='RIDER_COMMISSION' and source_record_id=v_tx::text
    and event_type='RIDER_COMMISSION_PAID';

  if v_event is null then raise exception 'commission payment event missing'; end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='2200' and l.debit_amount=3000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1100' and l.credit_amount=3000
  ) then raise exception 'commission payment mapping incorrect'; end if;
end $$;

do $$
declare
  v_dept text := 'FIN-TST-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
  v_source uuid;
  v_result jsonb;
  v_event uuid;
begin
  insert into public.finance_daily_logs(
    entry_date,department_code,fuel_and_tolls_spent,source_mode,metadata
  ) values (
    date '2099-05-09',v_dept,5000,'ADJUSTMENT',
    jsonb_build_object('funding_account_code','1010','reference','FUEL-TST-001')
  ) returning id into v_source;

  v_result := public.be_accounting_sync_manual_finance_v1(date '2099-05-09',date '2099-05-09');
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'manual Finance sync failed: %',v_result;
  end if;

  select id into v_event from public.be_accounting_events
  where source_system='FINANCE_MANUAL' and source_record_id=v_source::text
    and event_type='FUEL_AND_TOLLS_EXPENSE';

  if v_event is null then raise exception 'fuel expense event missing'; end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='5100' and l.debit_amount=5000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1010' and l.credit_amount=5000
  ) then raise exception 'fuel expense mapping incorrect'; end if;
end $$;

do $$
declare
  v_dept text := 'HR-TST-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
  v_source uuid;
  v_asset uuid;
  v_result jsonb;
  v_event uuid;
begin
  insert into public.be_fixed_asset_register(
    asset_code,asset_name,category,acquisition_date,acquisition_cost,residual_value,useful_life_months
  ) values (
    'IT-TST-'||substr(replace(gen_random_uuid()::text,'-',''),1,10),
    'Capitalized Laptop','IT_INFRASTRUCTURE',date '2099-05-09',1200000,0,36
  ) returning id into v_asset;

  insert into public.admin_assets_and_hr_logs(
    entry_date,department_code,asset_name,asset_category,acquisition_date,acquisition_cost,
    residual_value,useful_life_months,warehouse_overtime,base_payroll_accrual,
    fixed_asset_id,metadata
  ) values (
    date '2099-05-09',v_dept,'Capitalized Laptop','IT_INFRASTRUCTURE',date '2099-05-09',1200000,
    0,36,50000,100000,v_asset,
    jsonb_build_object(
      'funding_account_code','1100',
      'capitalization_threshold_mmk',500000,
      'reference','ASSET-TST-001'
    )
  ) returning id into v_source;

  v_result := public.be_accounting_sync_hr_assets_v1(date '2099-05-09',date '2099-05-09');
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'HR/assets sync failed: %',v_result;
  end if;

  select id into v_event from public.be_accounting_events
  where source_system='ADMIN_HR' and source_record_id=v_source::text
    and event_type='PAYROLL_ACCRUED';
  if v_event is null then raise exception 'payroll accrual missing'; end if;
  if not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='6000' and l.debit_amount=100000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='2300' and l.credit_amount=100000
  ) then raise exception 'payroll mapping incorrect'; end if;

  select id into v_event from public.be_accounting_events
  where source_system='ADMIN_HR' and source_record_id=v_source::text
    and event_type='WAREHOUSE_OVERTIME_ACCRUED';
  if v_event is null then raise exception 'overtime accrual missing'; end if;
  if not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='6100' and l.debit_amount=50000
  ) then raise exception 'overtime expense mapping incorrect'; end if;

  select id into v_event from public.be_accounting_events
  where source_system='ADMIN_HR' and source_record_id=v_source::text
    and event_type='FIXED_ASSET_ACQUIRED';
  if v_event is null then raise exception 'fixed asset acquisition event missing'; end if;
  if not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1530' and l.debit_amount=1200000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1100' and l.credit_amount=1200000
  ) then raise exception 'capitalized asset mapping incorrect'; end if;
end $$;

do $$
declare
  v_dept text := 'HR-LOW-'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
  v_source uuid;
  v_result jsonb;
  v_event uuid;
begin
  insert into public.admin_assets_and_hr_logs(
    entry_date,department_code,asset_name,asset_category,acquisition_date,acquisition_cost,
    residual_value,useful_life_months,metadata
  ) values (
    date '2099-05-09',v_dept,'Low Value Equipment','OFFICE_EQUIPMENT',date '2099-05-09',100000,
    0,12,
    jsonb_build_object(
      'funding_account_code','1100',
      'capitalization_threshold_mmk',500000,
      'reference','ASSET-TST-LOW'
    )
  ) returning id into v_source;

  v_result := public.be_accounting_sync_hr_assets_v1(date '2099-05-09',date '2099-05-09');

  select id into v_event from public.be_accounting_events
  where source_system='ADMIN_HR' and source_record_id=v_source::text
    and event_type='LOW_VALUE_ASSET_EXPENSED';

  if v_event is null then raise exception 'low-value asset expense event missing'; end if;
  if not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='6700' and l.debit_amount=100000
  ) then raise exception 'below-threshold asset was not expensed'; end if;
end $$;

do $$
declare
  v_branch uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid();
  v_result jsonb;
  v_event uuid;
begin
  insert into public.branch_offices(id,branch_code,branch_name,is_active)
  values (v_branch,'TST-BR-'||substr(v_branch::text,1,6),'Test Branch',true);

  insert into public.be_accounting_mappings(
    event_type,mapping_version,debit_account_code,credit_account_code,effective_from,is_active
  ) values (
    'BRANCH_EXPENSE_FUEL','BRANCH_V1','5100','1010',date '2099-01-01',true
  ) on conflict do nothing;

  insert into public.branch_office_finance_entries(
    id,branch_office_id,entry_type,amount,entry_date,category,notes
  ) values (
    v_entry,v_branch,'expense',7000,date '2099-05-09','fuel','Test branch fuel'
  );

  v_result := public.be_accounting_sync_branch_finance_v1(date '2099-05-09',date '2099-05-09');

  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'branch finance sync failed: %',v_result;
  end if;

  select id into v_event from public.be_accounting_events
  where source_system='BRANCH_FINANCE' and source_record_id=v_entry::text
    and event_type='BRANCH_EXPENSE_FUEL';

  if v_event is null then raise exception 'branch expense event missing'; end if;
  if not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='5100' and l.debit_amount=7000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1010' and l.credit_amount=7000
  ) then raise exception 'branch mapping was not applied'; end if;
end $$;
