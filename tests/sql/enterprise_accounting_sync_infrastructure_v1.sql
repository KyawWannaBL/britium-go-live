do $$
begin
  if to_regclass('public.be_accounting_sync_runs') is not null then
    delete from public.be_accounting_sync_errors
    where sync_run_id in (
      select id from public.be_accounting_sync_runs where source_scope='TEST_INFRA'
    );
    delete from public.be_accounting_sync_runs where source_scope='TEST_INFRA';
  end if;
end $$;

do $$
declare
  v_source_id text := 'src-'||gen_random_uuid()::text;
  v_first jsonb;
  v_second jsonb;
  v_event uuid;
  v_count integer;
begin
  v_first := public.be_accounting_upsert_event_v1(
    'TEST_INFRA',
    'test_source',
    v_source_id,
    'TEST_EVENT',
    'TEST_V1',
    date '2099-05-01',
    'Idempotency test',
    'MMK',
    1000,
    jsonb_build_object('amount',1000),
    'fingerprint-1',
    'REVIEW_PENDING',
    timestamptz '2099-05-01 01:00:00+00',
    '{}'::jsonb
  );

  if not coalesce((v_first->>'ok')::boolean,false)
     or not coalesce((v_first->>'created')::boolean,false) then
    raise exception 'first upsert did not create event: %',v_first;
  end if;

  v_second := public.be_accounting_upsert_event_v1(
    'TEST_INFRA',
    'test_source',
    v_source_id,
    'TEST_EVENT',
    'TEST_V1',
    date '2099-05-01',
    'Idempotency test',
    'MMK',
    1000,
    jsonb_build_object('amount',1000),
    'fingerprint-1',
    'REVIEW_PENDING',
    timestamptz '2099-05-01 01:00:00+00',
    '{}'::jsonb
  );

  if not coalesce((v_second->>'ok')::boolean,false)
     or coalesce((v_second->>'created')::boolean,true) then
    raise exception 'second identical upsert was not idempotent: %',v_second;
  end if;

  if (v_first->>'event_id')::uuid <> (v_second->>'event_id')::uuid then
    raise exception 'idempotent upsert returned different event ids';
  end if;

  v_event := (v_first->>'event_id')::uuid;

  select count(*) into v_count
  from public.be_accounting_events
  where id=v_event;

  if v_count<>1 then
    raise exception 'expected one event, got %',v_count;
  end if;

  select count(*) into v_count
  from public.be_accounting_source_links
  where source_system='TEST_INFRA'
    and source_table='test_source'
    and source_record_id=v_source_id
    and event_type='TEST_EVENT'
    and accounting_version='TEST_V1';

  if v_count<>1 then
    raise exception 'expected one source link, got %',v_count;
  end if;
end $$;

do $$
begin
  if to_regclass('public.be_accounting_sync_runs') is null then
    raise exception 'be_accounting_sync_runs missing';
  end if;
  if to_regclass('public.be_accounting_sync_errors') is null then
    raise exception 'be_accounting_sync_errors missing';
  end if;
  if to_regclass('public.be_accounting_mappings') is null then
    raise exception 'be_accounting_mappings missing';
  end if;
end $$;
