insert into public.be_accounting_periods(period_code,period_start,period_end,status)
values
('2099-01',date '2099-01-01',date '2099-01-31','OPEN'),
('2099-02',date '2099-02-01',date '2099-02-28','CLOSED')
on conflict (period_code) do update set status=excluded.status;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_closed_event uuid := gen_random_uuid();
  v_unbalanced_event uuid := gen_random_uuid();
  v_result jsonb;
  v_journal uuid;
  v_count integer;
  v_debit numeric;
  v_credit numeric;
begin
  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,accounting_version,
    total_amount,review_status,input_fingerprint
  ) values (
    v_event,date '2099-01-05','TEST','test_source','balanced-1','DELIVERY_REVENUE_RECOGNIZED','V1',
    14000,'APPROVED','fp-balanced-1'
  );

  insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
  select v_event,id,1,14000,0,'Bank receipt' from public.be_chart_of_accounts where account_code='1100'
  union all
  select v_event,id,2,0,10000,'Merchant liability' from public.be_chart_of_accounts where account_code='2100'
  union all
  select v_event,id,3,0,4000,'Delivery revenue' from public.be_chart_of_accounts where account_code='4000';

  v_result := public.be_accounting_post_event_v1(v_event);
  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'balanced posting failed: %',v_result;
  end if;

  v_journal := (v_result->>'journal_id')::uuid;
  select count(*),coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into v_count,v_debit,v_credit
  from public.be_journal_lines where journal_id=v_journal;

  if v_count<>3 or v_debit<>14000 or v_credit<>14000 then
    raise exception 'posted journal lines invalid: count %, debit %, credit %',v_count,v_debit,v_credit;
  end if;

  v_result := public.be_accounting_post_event_v1(v_event);
  if coalesce(v_result->>'code','')<>'ALREADY_POSTED' then
    raise exception 'duplicate call did not return ALREADY_POSTED: %',v_result;
  end if;
  select count(*) into v_count from public.be_journal_entries where source_event_id=v_event;
  if v_count<>1 then
    raise exception 'duplicate journal created: %',v_count;
  end if;

  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,accounting_version,
    total_amount,review_status,input_fingerprint
  ) values (
    v_closed_event,date '2099-02-05','TEST','test_source','closed-1','TEST_EVENT','V1',
    100,'APPROVED','fp-closed-1'
  );
  insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount)
  select v_closed_event,id,1,100,0 from public.be_chart_of_accounts where account_code='1100'
  union all
  select v_closed_event,id,2,0,100 from public.be_chart_of_accounts where account_code='3000';

  v_result := public.be_accounting_post_event_v1(v_closed_event);
  if coalesce(v_result->>'code','')<>'PERIOD_CLOSED' then
    raise exception 'closed period was not rejected: %',v_result;
  end if;

  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,accounting_version,
    total_amount,review_status,input_fingerprint
  ) values (
    v_unbalanced_event,date '2099-01-06','TEST','test_source','unbalanced-1','TEST_EVENT','V1',
    100,'APPROVED','fp-unbalanced-1'
  );
  insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount)
  select v_unbalanced_event,id,1,100,0 from public.be_chart_of_accounts where account_code='1100'
  union all
  select v_unbalanced_event,id,2,0,90 from public.be_chart_of_accounts where account_code='3000';

  v_result := public.be_accounting_post_event_v1(v_unbalanced_event);
  if coalesce(v_result->>'code','')<>'JOURNAL_NOT_BALANCED' then
    raise exception 'unbalanced event was not rejected: %',v_result;
  end if;

  begin
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount)
    select v_unbalanced_event,id,3,10,10 from public.be_chart_of_accounts where account_code='1100';
    raise exception 'both-sided line unexpectedly accepted';
  exception
    when check_violation then null;
  end;
end $$;
