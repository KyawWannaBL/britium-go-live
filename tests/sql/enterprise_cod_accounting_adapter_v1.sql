update public.be_accounting_runtime_config
set boolean_value=true
where config_key='GL_POSTING_ENABLED';

do $$
begin
  if to_regclass('public.be_finance_cod_settlements_v48') is null then
    create table public.be_finance_cod_settlements_v48 (
      delivery_way_id text,
      wayplan_id text,
      rider_code text,
      rider_name text,
      expected_cod numeric,
      reported_collected numeric,
      rider_remittance numeric,
      settled_amount numeric,
      settlement_status text,
      variance_type text,
      variance_amount numeric,
      remittance_reference text,
      remitted_at timestamptz,
      hold_code text,
      hold_note text,
      held_at timestamptz,
      settlement_reference text,
      settled_at timestamptz,
      delivered_at timestamptz,
      created_at timestamptz,
      updated_at timestamptz,
      metadata jsonb
    );
  end if;
end $$;

delete from public.be_finance_cod_settlements_v48
where delivery_way_id in ('TST-COD-001','TST-COD-HOLD-001');

delete from public.be_accounting_event_lines
where event_id in (
  select id from public.be_accounting_events
  where source_system='COD'
    and source_table='be_finance_cod_settlements_v48'
    and source_record_id in ('TST-COD-001','TST-COD-HOLD-001')
);
delete from public.be_accounting_source_links
where source_system='COD'
  and source_table='be_finance_cod_settlements_v48'
  and source_record_id in ('TST-COD-001','TST-COD-HOLD-001');
delete from public.be_accounting_events
where source_system='COD'
  and source_table='be_finance_cod_settlements_v48'
  and source_record_id in ('TST-COD-001','TST-COD-HOLD-001');

insert into public.be_finance_cod_settlements_v48(
  delivery_way_id,wayplan_id,rider_code,rider_name,
  expected_cod,reported_collected,rider_remittance,settled_amount,
  settlement_status,settlement_reference,settled_at,delivered_at,
  created_at,updated_at,metadata
) values (
  'TST-COD-001','WP-TST-001','R001','Rider One',
  14000,14000,14000,14000,
  'SETTLED','SET-TST-001',timestamptz '2099-05-06 10:00:00+00',
  timestamptz '2099-05-06 09:00:00+00',
  timestamptz '2099-05-06 08:00:00+00',timestamptz '2099-05-06 10:00:00+00','{}'
),(
  'TST-COD-HOLD-001','WP-TST-002','R002','Rider Two',
  9000,9000,0,0,
  'HOLD_EXCEPTION',null,null,timestamptz '2099-05-06 11:00:00+00',
  timestamptz '2099-05-06 10:30:00+00',timestamptz '2099-05-06 11:00:00+00',
  jsonb_build_object('hold_code','FIELD_EXCEPTION')
);

do $$
declare
  v_result jsonb;
  v_collect uuid;
  v_remit uuid;
  v_hold uuid;
  v_dr numeric;
  v_cr numeric;
  v_rev_lines integer;
begin
  v_result := public.be_accounting_sync_cod_v1(date '2099-05-06',date '2099-05-06');

  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'COD sync failed: %',v_result;
  end if;

  select id into v_collect
  from public.be_accounting_events
  where source_system='COD'
    and source_record_id='TST-COD-001'
    and event_type='COD_COLLECTED';

  if v_collect is null then
    raise exception 'COD collection event missing';
  end if;

  select coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into v_dr,v_cr
  from public.be_accounting_event_lines
  where event_id=v_collect;

  if v_dr<>14000 or v_cr<>14000 then
    raise exception 'COD collection proposal invalid: debit %, credit %',v_dr,v_cr;
  end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_collect and a.account_code='1210' and l.debit_amount=14000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_collect and a.account_code='1200' and l.credit_amount=14000
  ) then
    raise exception 'COD collection account mapping incorrect';
  end if;

  select id into v_remit
  from public.be_accounting_events
  where source_system='COD'
    and source_record_id='TST-COD-001'
    and event_type='RIDER_COD_REMITTED';

  if v_remit is null then
    raise exception 'COD remittance event missing';
  end if;

  select coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into v_dr,v_cr
  from public.be_accounting_event_lines
  where event_id=v_remit;

  if v_dr<>14000 or v_cr<>14000 then
    raise exception 'COD remittance proposal invalid: debit %, credit %',v_dr,v_cr;
  end if;

  select count(*) into v_rev_lines
  from public.be_accounting_event_lines l
  join public.be_chart_of_accounts a on a.id=l.account_id
  where l.event_id=v_remit
    and a.account_type='REVENUE';

  if v_rev_lines<>0 then
    raise exception 'COD remittance incorrectly contains revenue lines';
  end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_remit and a.account_code='1100' and l.debit_amount=14000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_remit and a.account_code='1210' and l.credit_amount=14000
  ) then
    raise exception 'COD remittance account mapping incorrect';
  end if;

  select id into v_hold
  from public.be_accounting_events
  where source_system='COD'
    and source_record_id='TST-COD-HOLD-001'
    and event_type='COD_COLLECTED';

  if v_hold is null then
    raise exception 'held COD event missing';
  end if;

  if (select review_status from public.be_accounting_events where id=v_hold)<>'HELD' then
    raise exception 'HOLD_EXCEPTION event is not HELD';
  end if;

  if public.be_accounting_post_event_v1(v_hold)->>'code' <> 'EVENT_NOT_APPROVED' then
    raise exception 'held COD event unexpectedly became posting eligible';
  end if;
end $$;

update public.be_accounting_runtime_config
set boolean_value=false
where config_key='GL_POSTING_ENABLED';
