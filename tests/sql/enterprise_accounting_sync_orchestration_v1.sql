do $$
declare
  v_event uuid;
  v_upsert jsonb;
  v_post jsonb;
  v_change jsonb;
  v_bank uuid;
  v_capital uuid;
  v_run jsonb;
  v_run_id uuid;
  v_failed integer;
begin
  insert into public.be_accounting_periods(period_code,period_start,period_end,status)
  values ('2099-06',date '2099-06-01',date '2099-06-30','OPEN')
  on conflict (period_code) do update set status='OPEN';

  v_upsert := public.be_accounting_upsert_event_v1(
    'ORCHESTRATION_TEST','test_source','SRC-CHANGE-001','TEST_EVENT','V1',
    date '2099-06-02','Source change test','MMK',100,
    jsonb_build_object('source_reference','SRC-CHANGE-001'),
    'fingerprint-v1','APPROVED',now(),'{}'::jsonb
  );

  if not coalesce((v_upsert->>'ok')::boolean,false) then
    raise exception 'initial event upsert failed: %',v_upsert;
  end if;

  v_event := (v_upsert->>'event_id')::uuid;

  select id into v_bank from public.be_chart_of_accounts where account_code='1100';
  select id into v_capital from public.be_chart_of_accounts where account_code='3000';

  delete from public.be_accounting_event_lines where event_id=v_event;
  insert into public.be_accounting_event_lines(
    event_id,account_id,sequence_no,debit_amount,credit_amount
  ) values
    (v_event,v_bank,1,100,0),
    (v_event,v_capital,2,0,100);

  update public.be_accounting_events
  set review_status='APPROVED'
  where id=v_event;

  v_post := public.be_accounting_post_event_v1(v_event);
  if not coalesce((v_post->>'ok')::boolean,false) then
    raise exception 'test posting failed: %',v_post;
  end if;

  v_change := public.be_accounting_upsert_event_v1(
    'ORCHESTRATION_TEST','test_source','SRC-CHANGE-001','TEST_EVENT','V1',
    date '2099-06-02','Source change test','MMK',125,
    jsonb_build_object('source_reference','SRC-CHANGE-001','changed',true),
    'fingerprint-v2','REVIEW_PENDING',now(),'{}'::jsonb
  );

  if coalesce(v_change->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
    raise exception 'posted source drift was not detected: %',v_change;
  end if;

  if (select count(*) from public.be_journal_entries where source_event_id=v_event)<>1 then
    raise exception 'source drift mutated or duplicated posted journal';
  end if;

  v_run := public.be_accounting_sync_run_v1(
    date '2099-06-01',
    date '2099-06-30',
    array['DELIVERY','UNSUPPORTED_SOURCE','MERCHANT']
  );

  if not coalesce((v_run->>'ok')::boolean,false) then
    raise exception 'sync run did not complete: %',v_run;
  end if;

  if coalesce((v_run->>'status'),'')<>'COMPLETED_WITH_ERRORS' then
    raise exception 'partial failure did not produce COMPLETED_WITH_ERRORS: %',v_run;
  end if;

  v_run_id := (v_run->>'run_id')::uuid;
  v_failed := coalesce((v_run->>'failed')::integer,0);

  if v_failed<1 then
    raise exception 'unsupported source was not counted as failure: %',v_run;
  end if;

  if not exists (
    select 1
    from public.be_accounting_sync_errors
    where sync_run_id=v_run_id
      and error_code='UNSUPPORTED_SOURCE'
  ) then
    raise exception 'unsupported source failure was not persisted';
  end if;

  if (select status from public.be_accounting_sync_runs where id=v_run_id)<>'COMPLETED_WITH_ERRORS' then
    raise exception 'sync run status was not persisted';
  end if;
end $$;
