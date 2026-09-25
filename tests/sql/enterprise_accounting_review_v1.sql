do $$
declare
  v_approve uuid := gen_random_uuid();
  v_hold uuid := gen_random_uuid();
  v_reject uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,
    accounting_version,total_amount,review_status,input_fingerprint
  ) values
    (v_approve,date '2099-07-01','TEST_REVIEW','test','approve','TEST','V1',100,'REVIEW_PENDING','fp-a'),
    (v_hold,date '2099-07-01','TEST_REVIEW','test','hold','TEST','V1',100,'REVIEW_PENDING','fp-h'),
    (v_reject,date '2099-07-01','TEST_REVIEW','test','reject','TEST','V1',100,'REVIEW_PENDING','fp-r');

  v_result := public.be_accounting_review_event_v1(v_approve,'APPROVE','Reviewed against source');
  if coalesce(v_result->>'code','')<>'APPROVED'
     or (select review_status from public.be_accounting_events where id=v_approve)<>'APPROVED' then
    raise exception 'approve transition failed: %',v_result;
  end if;

  v_result := public.be_accounting_review_event_v1(v_hold,'HOLD','Waiting for COD reconciliation');
  if coalesce(v_result->>'code','')<>'HELD'
     or (select review_status from public.be_accounting_events where id=v_hold)<>'HELD' then
    raise exception 'hold transition failed: %',v_result;
  end if;

  v_result := public.be_accounting_review_event_v1(v_reject,'REJECT','Source record invalid');
  if coalesce(v_result->>'code','')<>'REJECTED'
     or (select review_status from public.be_accounting_events where id=v_reject)<>'REJECTED' then
    raise exception 'reject transition failed: %',v_result;
  end if;

  if not exists (
    select 1 from public.audit_logs
    where record_id=v_approve and action='APPROVE'
  ) or not exists (
    select 1 from public.audit_logs
    where record_id=v_hold and action='HOLD'
  ) or not exists (
    select 1 from public.audit_logs
    where record_id=v_reject and action='REJECT'
  ) then
    raise exception 'review actions were not audited';
  end if;

  v_result := public.be_accounting_review_event_v1(v_approve,'APPROVE','second review');
  if coalesce(v_result->>'code','')<>'INVALID_STATE' then
    raise exception 'already reviewed event was allowed to transition again: %',v_result;
  end if;
end $$;

do $$
declare
  v_uid uuid := '55555555-5555-4555-8555-555555555555';
  v_event uuid := gen_random_uuid();
begin
  insert into public.be_user_account_registry(auth_user_id,role,active)
  values (v_uid,'rider',true)
  on conflict do nothing;

  insert into public.be_accounting_events(
    id,event_date,source_system,source_table,source_record_id,event_type,
    accounting_version,total_amount,review_status,input_fingerprint
  ) values (
    v_event,date '2099-07-01','TEST_REVIEW','test','unauthorized','TEST','V1',
    100,'REVIEW_PENDING','fp-u'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_uid::text,'role','authenticated')::text,
    true
  );
  set local role authenticated;

  if public.be_accounting_review_event_v1(v_event,'APPROVE','unauthorized')->>'code' <> 'UNAUTHORIZED' then
    raise exception 'unauthorized user could review accounting event';
  end if;
end $$;
