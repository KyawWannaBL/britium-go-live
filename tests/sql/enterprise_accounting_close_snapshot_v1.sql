do $$
declare
  v_period uuid := '97000000-0000-4000-8000-000000000097';
  v_journal uuid := '97000000-0000-4000-8000-000000000096';
  v_cash uuid;
  v_capital uuid;
  v_result jsonb;
  v_snapshot_count integer;
begin
  select id into v_cash from public.be_chart_of_accounts where account_code='1000';
  select id into v_capital from public.be_chart_of_accounts where account_code='3000';

  delete from public.be_financial_report_snapshots
  where accounting_period_id=v_period;

  delete from public.be_journal_lines
  where journal_id=v_journal;

  delete from public.be_journal_entries
  where id=v_journal;

  delete from public.be_accounting_events
  where event_date between date '2097-05-01' and date '2097-05-31'
    and source_system='CLOSE_SNAPSHOT_TEST';

  delete from public.be_accounting_periods
  where id=v_period;

  insert into public.be_accounting_periods(
    id,period_code,period_start,period_end,status
  ) values (
    v_period,'2097-05',date '2097-05-01',date '2097-05-31','OPEN'
  );

  insert into public.be_journal_entries(
    id,journal_number,accounting_date,description,
    accounting_period_id,status,currency_code,metadata
  ) values (
    v_journal,
    'CLOSE-SNAPSHOT-209705-001',
    date '2097-05-01',
    'Close snapshot seed',
    v_period,
    'POSTED',
    'MMK',
    jsonb_build_object('entry_kind','OPENING_BALANCE')
  );

  insert into public.be_journal_lines(
    journal_id,account_id,sequence_no,debit_amount,credit_amount
  ) values
    (v_journal,v_cash,1,500000,0),
    (v_journal,v_capital,2,0,500000);

  v_result := public.be_accounting_close_period_v1(
    v_period,
    'Formal close snapshot contract test'
  );

  if not coalesce((v_result->>'ok')::boolean,false)
     or coalesce(v_result->>'code','')<>'CLOSED' then
    raise exception 'period close failed: %',v_result;
  end if;

  if coalesce(v_result->>'snapshot_id','')='' then
    raise exception 'period close did not return snapshot_id: %',v_result;
  end if;

  select count(*) into v_snapshot_count
  from public.be_financial_report_snapshots
  where accounting_period_id=v_period
    and report_type='MONTHLY_STATEMENTS';

  if v_snapshot_count<>1 then
    raise exception 'period close did not create exactly one snapshot: %',v_snapshot_count;
  end if;

  if (select status from public.be_accounting_periods where id=v_period)<>'CLOSED' then
    raise exception 'period did not remain CLOSED';
  end if;
end $$;
