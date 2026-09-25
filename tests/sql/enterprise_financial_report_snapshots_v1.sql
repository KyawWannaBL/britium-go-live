do $$
declare
  v_period uuid := '97000000-0000-4000-8000-000000000099';
  v_first jsonb;
  v_second jsonb;
  v_hash text;
  v_cash uuid;
  v_capital uuid;
begin
  insert into public.be_accounting_periods(
    id,period_code,period_start,period_end,status,closed_at,close_reason
  ) values (
    v_period,'2097-03',date '2097-03-01',date '2097-03-31','CLOSED',now(),'snapshot test'
  )
  on conflict (id) do update
  set status='CLOSED',closed_at=now(),close_reason='snapshot test';

  delete from public.be_financial_report_snapshots
  where accounting_period_id=v_period and report_type='MONTHLY_STATEMENTS';

  v_first := public.be_accounting_period_snapshot_v1(v_period);

  if not coalesce((v_first->>'ok')::boolean,false) then
    raise exception 'snapshot creation failed: %',v_first;
  end if;

  v_hash := v_first->>'content_hash';
  if coalesce(v_hash,'')='' then
    raise exception 'snapshot hash missing';
  end if;

  select id into v_cash from public.be_chart_of_accounts where account_code='1000';
  select id into v_capital from public.be_chart_of_accounts where account_code='3000';

  delete from public.be_journal_lines
  where journal_id='97000000-0000-4000-8000-000000000098';
  delete from public.be_journal_entries
  where id='97000000-0000-4000-8000-000000000098';

  insert into public.be_journal_entries(
    id,journal_number,accounting_date,description,status,currency_code
  ) values (
    '97000000-0000-4000-8000-000000000098',
    'RPT-209704-001',
    date '2097-04-01',
    'Later period capital',
    'POSTED',
    'MMK'
  );

  insert into public.be_journal_lines(
    journal_id,account_id,sequence_no,debit_amount,credit_amount
  ) values
    ('97000000-0000-4000-8000-000000000098',v_cash,1,999999,0),
    ('97000000-0000-4000-8000-000000000098',v_capital,2,0,999999);

  v_second := public.be_accounting_period_snapshot_v1(v_period);

  if v_second->>'content_hash' <> v_hash then
    raise exception 'closed period snapshot changed after later posting: first %, second %',v_hash,v_second->>'content_hash';
  end if;

  if (select count(*) from public.be_financial_report_snapshots
      where accounting_period_id=v_period and report_type='MONTHLY_STATEMENTS')<>1 then
    raise exception 'closed period snapshot duplicated';
  end if;
end $$;
