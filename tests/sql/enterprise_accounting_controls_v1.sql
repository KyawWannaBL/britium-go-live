insert into public.be_accounting_periods(period_code,period_start,period_end,status)
values ('2099-04',date '2099-04-01',date '2099-04-30','OPEN')
on conflict (period_code) do update set status='OPEN',closed_at=null,closed_by=null,close_reason=null;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_post jsonb;
  v_reverse jsonb;
  v_journal uuid;
  v_reversal uuid;
  v_debit numeric;
  v_credit numeric;
  v_audit integer;
begin
  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,accounting_version,
    total_amount,review_status,input_fingerprint
  ) values (
    v_event,date '2099-04-05','TEST','test_source',v_event::text,'TEST_REVERSAL','V1',
    1000,'APPROVED','fp-'||v_event::text
  );

  insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount)
  select v_event,id,1,1000,0 from public.be_chart_of_accounts where account_code='1100'
  union all
  select v_event,id,2,0,1000 from public.be_chart_of_accounts where account_code='3000';

  v_post := public.be_accounting_post_event_v1(v_event);
  v_journal := (v_post->>'journal_id')::uuid;

  v_reverse := public.be_accounting_reverse_journal_v1(v_journal,'Correct source amount');
  if not coalesce((v_reverse->>'ok')::boolean,false) then
    raise exception 'reversal failed: %',v_reverse;
  end if;
  v_reversal := (v_reverse->>'journal_id')::uuid;

  if (select status from public.be_journal_entries where id=v_journal)<>'POSTED' then
    raise exception 'original journal status was mutated';
  end if;
  if (select reversal_of_journal_id from public.be_journal_entries where id=v_reversal)<>v_journal then
    raise exception 'reversal link missing';
  end if;

  select coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into v_debit,v_credit
  from public.be_journal_lines
  where journal_id=v_reversal;

  if v_debit<>1000 or v_credit<>1000 then
    raise exception 'reversal journal not balanced';
  end if;

  if not exists (
    select 1
    from public.be_journal_lines r
    join public.be_journal_lines o
      on o.journal_id=v_journal
     and o.sequence_no=r.sequence_no
    where r.journal_id=v_reversal
      and r.debit_amount=o.credit_amount
      and r.credit_amount=o.debit_amount
  ) then
    raise exception 'reversal lines did not invert original';
  end if;

  select count(*) into v_audit
  from public.audit_logs
  where action='REVERSE'
    and related_journal_id=v_reversal
    and reason='Correct source amount';

  if v_audit<>1 then
    raise exception 'reversal audit missing';
  end if;
end $$;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_source uuid;
  v_new_source uuid;
  v_post jsonb;
  v_correct jsonb;
  v_original_journal uuid;
  v_dept text := 'FIN_CORR_'||substr(replace(gen_random_uuid()::text,'-',''),1,8);
begin
  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,accounting_version,
    total_amount,review_status,input_fingerprint
  ) values (
    v_event,date '2099-04-15','FINANCE_MANUAL','finance_daily_logs',gen_random_uuid()::text,'FUEL_EXPENSE','V1',
    5000,'APPROVED','fp-'||v_event::text
  );

  insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount)
  select v_event,id,1,5000,0 from public.be_chart_of_accounts where account_code='5100'
  union all
  select v_event,id,2,0,5000 from public.be_chart_of_accounts where account_code='1010';

  insert into public.finance_daily_logs(
    entry_date,department_code,fuel_and_tolls_spent,accounting_event_id
  ) values (
    date '2099-04-15',v_dept,5000,v_event
  ) returning id into v_source;

  v_post := public.be_accounting_post_event_v1(v_event);
  v_original_journal := (v_post->>'journal_id')::uuid;

  v_correct := public.be_accounting_correct_source_v1(
    'finance_daily_logs',
    v_source,
    'Fuel voucher corrected',
    '{"fuel_and_tolls_spent":6000}'::jsonb
  );

  if not coalesce((v_correct->>'ok')::boolean,false) then
    raise exception 'source correction failed: %',v_correct;
  end if;

  v_new_source := (v_correct->>'replacement_id')::uuid;

  if (select soft_deleted_at is null from public.finance_daily_logs where id=v_source) then
    raise exception 'original source not soft-corrected';
  end if;
  if (select override_reason from public.finance_daily_logs where id=v_source)<>'Fuel voucher corrected' then
    raise exception 'override reason missing';
  end if;
  if (select fuel_and_tolls_spent from public.finance_daily_logs where id=v_new_source)<>6000 then
    raise exception 'replacement amount incorrect';
  end if;
  if (select version_no from public.finance_daily_logs where id=v_new_source)<>2 then
    raise exception 'replacement version incorrect';
  end if;
  if not (select is_locked from public.finance_daily_logs where id=v_new_source) then
    raise exception 'replacement source not locked';
  end if;
  if not exists (
    select 1 from public.be_journal_entries
    where reversal_of_journal_id=v_original_journal
  ) then
    raise exception 'correcting posted source did not reverse prior journal';
  end if;
end $$;

do $$
declare
  v_asset uuid;
  v_code text := 'TST-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);
  v_result jsonb;
  v_repeat jsonb;
  v_dep numeric;
  v_journal uuid;
  v_dr numeric;
  v_cr numeric;
begin
  insert into public.be_fixed_asset_register(
    asset_code,asset_name,category,acquisition_date,acquisition_cost,residual_value,useful_life_months
  ) values (
    v_code,'Test Vehicle','FLEET_VEHICLE',date '2099-04-01',12000000,0,60
  ) returning id into v_asset;

  v_result := public.be_accounting_post_depreciation_v1(date '2099-04-30');
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'depreciation run failed: %',v_result;
  end if;

  select depreciation_amount,journal_id
  into v_dep,v_journal
  from public.be_asset_depreciation_schedule
  where asset_id=v_asset and period_start=date '2099-04-01' and period_end=date '2099-04-30';

  if v_dep<>200000 then
    raise exception 'monthly depreciation expected 200000, got %',v_dep;
  end if;

  select
    coalesce(sum(case when a.account_code='6500' then l.debit_amount else 0 end),0),
    coalesce(sum(case when a.account_code='1590' then l.credit_amount else 0 end),0)
  into v_dr,v_cr
  from public.be_journal_lines l
  join public.be_chart_of_accounts a on a.id=l.account_id
  where l.journal_id=v_journal;

  if v_dr<>200000 or v_cr<>200000 then
    raise exception 'depreciation journal incorrect: debit %, credit %',v_dr,v_cr;
  end if;

  v_repeat := public.be_accounting_post_depreciation_v1(date '2099-04-30');

  if (select count(*) from public.be_asset_depreciation_schedule
      where asset_id=v_asset and period_start=date '2099-04-01' and period_end=date '2099-04-30')<>1 then
    raise exception 'duplicate depreciation schedule created';
  end if;
end $$;

do $$
declare
  v_period uuid;
  v_blocker uuid := gen_random_uuid();
  v_result jsonb;
begin
  delete from public.be_accounting_events
  where source_system='TEST_CLOSE' and source_table='test_close_source';

  delete from public.be_accounting_periods
  where period_code='TEST-CLOSE-2098-01';

  insert into public.be_accounting_periods(period_code,period_start,period_end,status)
  values ('TEST-CLOSE-2098-01',date '2098-01-01',date '2098-01-31','OPEN')
  returning id into v_period;

  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,accounting_version,
    total_amount,review_status,input_fingerprint
  ) values (
    v_blocker,date '2098-01-15','TEST_CLOSE','test_close_source',v_blocker::text,'TEST_BLOCKER','V1',
    0,'HELD','fp-'||v_blocker::text
  );

  v_result := public.be_accounting_close_period_v1(v_period,'Month close test');
  if coalesce(v_result->>'code','')<>'CLOSE_BLOCKED' then
    raise exception 'period close was not blocked: %',v_result;
  end if;

  update public.be_accounting_events
  set review_status='REJECTED'
  where id=v_blocker;

  v_result := public.be_accounting_close_period_v1(v_period,'Month close test resolved');
  if not coalesce((v_result->>'ok')::boolean,false)
     or coalesce(v_result->>'code','')<>'CLOSED' then
    raise exception 'period close failed after blocker resolved: %',v_result;
  end if;

  if (select status from public.be_accounting_periods where id=v_period)<>'CLOSED' then
    raise exception 'period status not CLOSED';
  end if;
end $$;
