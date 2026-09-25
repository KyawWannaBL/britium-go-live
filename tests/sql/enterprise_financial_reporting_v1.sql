do $$
declare
  v_cash uuid;
  v_ar uuid;
  v_asset uuid;
  v_accum_dep uuid;
  v_capital uuid;
  v_revenue uuid;
  v_fuel uuid;
  v_rent uuid;
  v_dep_exp uuid;
  v_tb jsonb;
  v_pl jsonb;
  v_bs jsonb;
begin
  select id into v_cash from public.be_chart_of_accounts where account_code='1000';
  select id into v_ar from public.be_chart_of_accounts where account_code='1220';
  select id into v_asset from public.be_chart_of_accounts where account_code='1540';
  select id into v_accum_dep from public.be_chart_of_accounts where account_code='1590';
  select id into v_capital from public.be_chart_of_accounts where account_code='3000';
  select id into v_revenue from public.be_chart_of_accounts where account_code='4000';
  select id into v_fuel from public.be_chart_of_accounts where account_code='5100';
  select id into v_rent from public.be_chart_of_accounts where account_code='6200';
  select id into v_dep_exp from public.be_chart_of_accounts where account_code='6500';

  delete from public.be_journal_lines
  where journal_id in (
    select id from public.be_journal_entries where journal_number like 'RPT-209703-%'
  );
  delete from public.be_journal_entries where journal_number like 'RPT-209703-%';

  insert into public.be_journal_entries(id,journal_number,accounting_date,description,status,currency_code)
  values
    ('97000000-0000-4000-8000-000000000001','RPT-209703-001',date '2097-03-01','Opening capital','POSTED','MMK'),
    ('97000000-0000-4000-8000-000000000002','RPT-209703-002',date '2097-03-05','Delivery revenue','POSTED','MMK'),
    ('97000000-0000-4000-8000-000000000003','RPT-209703-003',date '2097-03-06','Fuel expense','POSTED','MMK'),
    ('97000000-0000-4000-8000-000000000004','RPT-209703-004',date '2097-03-07','Rent expense','POSTED','MMK'),
    ('97000000-0000-4000-8000-000000000005','RPT-209703-005',date '2097-03-08','Office equipment','POSTED','MMK'),
    ('97000000-0000-4000-8000-000000000006','RPT-209703-006',date '2097-03-31','Depreciation','POSTED','MMK');

  insert into public.be_journal_lines(journal_id,account_id,sequence_no,debit_amount,credit_amount)
  values
    ('97000000-0000-4000-8000-000000000001',v_cash,1,2500000,0),
    ('97000000-0000-4000-8000-000000000001',v_capital,2,0,2500000),
    ('97000000-0000-4000-8000-000000000002',v_ar,1,1000000,0),
    ('97000000-0000-4000-8000-000000000002',v_revenue,2,0,1000000),
    ('97000000-0000-4000-8000-000000000003',v_fuel,1,200000,0),
    ('97000000-0000-4000-8000-000000000003',v_cash,2,0,200000),
    ('97000000-0000-4000-8000-000000000004',v_rent,1,100000,0),
    ('97000000-0000-4000-8000-000000000004',v_cash,2,0,100000),
    ('97000000-0000-4000-8000-000000000005',v_asset,1,1200000,0),
    ('97000000-0000-4000-8000-000000000005',v_cash,2,0,1200000),
    ('97000000-0000-4000-8000-000000000006',v_dep_exp,1,200000,0),
    ('97000000-0000-4000-8000-000000000006',v_accum_dep,2,0,200000);

  v_tb := public.be_accounting_trial_balance_v1(date '2097-03-01',date '2097-03-31');
  if (v_tb->>'difference')::numeric <> 0
     or (v_tb->>'period_debit')::numeric <> 5200000
     or (v_tb->>'period_credit')::numeric <> 5200000 then
    raise exception 'trial balance failed: %',v_tb;
  end if;

  v_pl := public.be_accounting_profit_loss_v1(date '2097-03-01',date '2097-03-31');
  if (v_pl->>'total_revenue')::numeric <> 1000000
     or (v_pl->>'total_cogs')::numeric <> 200000
     or (v_pl->>'gross_profit')::numeric <> 800000
     or (v_pl->>'ebitda')::numeric <> 700000
     or (v_pl->>'depreciation')::numeric <> 200000
     or (v_pl->>'ebit')::numeric <> 500000
     or (v_pl->>'net_income')::numeric <> 500000 then
    raise exception 'P&L equations failed: %',v_pl;
  end if;

  v_bs := public.be_accounting_balance_sheet_v1(date '2097-03-31');
  if (v_bs->>'total_assets')::numeric <> 3000000
     or (v_bs->>'total_liabilities')::numeric <> 0
     or (v_bs->>'total_equity')::numeric <> 3000000
     or (v_bs->>'balance_difference')::numeric <> 0
     or coalesce((v_bs->>'balanced')::boolean,false) is not true then
    raise exception 'balance sheet equation failed: %',v_bs;
  end if;

  if (v_bs->>'net_fixed_assets')::numeric <> 1000000 then
    raise exception 'accumulated depreciation did not reduce fixed assets: %',v_bs;
  end if;
end $$;
