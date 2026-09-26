-- Enterprise accounting portal backend contract v1
do $$
begin
  if to_regprocedure('public.be_accounting_submit_finance_daily_v1(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb)') is null then
    raise exception 'be_accounting_submit_finance_daily_v1 missing';
  end if;
  if to_regprocedure('public.be_accounting_review_event_v1(uuid,text,text)') is null then
    raise exception 'be_accounting_review_event_v1 missing';
  end if;
end $$;

do $$
declare
  v_submit jsonb;
  v_source uuid;
  v_event uuid;
  v_review jsonb;
begin
  delete from public.finance_daily_logs
  where entry_date=date '2099-06-01' and department_code='FINANCE_UI_TEST';

  v_submit := public.be_accounting_submit_finance_daily_v1(
    date '2099-06-01',
    'FINANCE_UI_TEST',
    0,0,0,0,
    5000,0,0,0,0,0,
    '1010',
    '{"test":true}'::jsonb
  );

  if not coalesce((v_submit->>'ok')::boolean,false) then
    raise exception 'finance submit failed: %',v_submit;
  end if;

  v_source := (v_submit->>'source_id')::uuid;

  if not exists (
    select 1 from public.finance_daily_logs
    where id=v_source and is_locked and fuel_and_tolls_spent=5000
  ) then
    raise exception 'submitted finance source not locked/persisted';
  end if;

  v_event := nullif(v_submit->>'event_id','')::uuid;
  if v_event is null then
    select accounting_event_id into v_event
    from public.finance_daily_logs where id=v_source;
  end if;

  if v_event is null then
    raise exception 'finance submission did not create accounting event';
  end if;

  v_review := public.be_accounting_review_event_v1(v_event,'APPROVE','UI contract test');
  if not coalesce((v_review->>'ok')::boolean,false) then
    raise exception 'review action failed: %',v_review;
  end if;

  if (select review_status from public.be_accounting_events where id=v_event)<>'APPROVED' then
    raise exception 'review status did not become APPROVED';
  end if;
end $$;
