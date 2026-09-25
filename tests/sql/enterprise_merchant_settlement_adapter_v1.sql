do $$
begin
  if to_regclass('public.be_v_finance_merchant_settlement_queue_v2') is null then
    create table public.be_v_finance_merchant_settlement_queue_v2 (
      parcel_id uuid,
      delivery_way_id text,
      merchant_id text,
      merchant_name text,
      status text,
      customer_total_collection bigint,
      net_system_delivery_charge bigint,
      merchant_final_settlement_amount bigint,
      merchant_receivable bigint,
      settlement_direction text,
      validation_status text,
      calculation_version text,
      calculated_at timestamptz,
      settlement_eligible boolean,
      financial_settled_at timestamptz,
      financial_settlement_batch_id uuid,
      created_at timestamptz
    );
  elsif exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='be_v_finance_merchant_settlement_queue_v2' and c.relkind='r'
  ) then
    alter table public.be_v_finance_merchant_settlement_queue_v2
      add column if not exists financial_settled_at timestamptz,
      add column if not exists financial_settlement_batch_id uuid;
  end if;
end $$;

delete from public.be_v_finance_merchant_settlement_queue_v2
where delivery_way_id in ('TST-MSET-PAYABLE-001','TST-MSET-AR-001');

delete from public.be_accounting_event_lines
where event_id in (
  select id from public.be_accounting_events
  where source_system='MERCHANT_SETTLEMENT'
    and source_record_id in ('TST-MSET-PAYABLE-001','TST-MSET-AR-001')
);
delete from public.be_accounting_source_links
where source_system='MERCHANT_SETTLEMENT'
  and source_record_id in ('TST-MSET-PAYABLE-001','TST-MSET-AR-001');
delete from public.be_accounting_events
where source_system='MERCHANT_SETTLEMENT'
  and source_record_id in ('TST-MSET-PAYABLE-001','TST-MSET-AR-001');

insert into public.be_v_finance_merchant_settlement_queue_v2(
  parcel_id,delivery_way_id,merchant_id,merchant_name,status,
  customer_total_collection,net_system_delivery_charge,
  merchant_final_settlement_amount,merchant_receivable,
  settlement_direction,validation_status,calculation_version,
  calculated_at,settlement_eligible,financial_settled_at,
  financial_settlement_batch_id,created_at
) values
(
  gen_random_uuid(),'TST-MSET-PAYABLE-001','M010','Merchant Payable','delivered',
  14000,4000,10000,0,
  'PAY_MERCHANT','OK','CANONICAL_V4',
  timestamptz '2099-05-07 09:00:00+00',false,timestamptz '2099-05-07 12:00:00+00',
  gen_random_uuid(),timestamptz '2099-05-07 08:00:00+00'
),(
  gen_random_uuid(),'TST-MSET-AR-001','M011','Merchant Receivable','delivered',
  0,2000,-2000,2000,
  'MERCHANT_OWES_BRITIUM','OK','CANONICAL_V4',
  timestamptz '2099-05-07 09:30:00+00',false,timestamptz '2099-05-07 12:30:00+00',
  gen_random_uuid(),timestamptz '2099-05-07 08:30:00+00'
);

do $$
declare
  v_result jsonb;
  v_event uuid;
  v_rev_count integer;
begin
  v_result := public.be_accounting_sync_merchant_settlements_v1(date '2099-05-07',date '2099-05-07');

  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'merchant settlement sync failed: %',v_result;
  end if;

  select id into v_event
  from public.be_accounting_events
  where source_system='MERCHANT_SETTLEMENT'
    and source_record_id='TST-MSET-PAYABLE-001'
    and event_type='MERCHANT_PAYABLE_SETTLED';

  if v_event is null then
    raise exception 'merchant payable settlement event missing';
  end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='2100' and l.debit_amount=10000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1100' and l.credit_amount=10000
  ) then
    raise exception 'merchant payable payment mapping incorrect';
  end if;

  select count(*) into v_rev_count
  from public.be_accounting_event_lines l
  join public.be_chart_of_accounts a on a.id=l.account_id
  where l.event_id=v_event
    and a.account_type in ('REVENUE','COGS','EXPENSE');

  if v_rev_count<>0 then
    raise exception 'merchant payment incorrectly affects P&L';
  end if;

  select id into v_event
  from public.be_accounting_events
  where source_system='MERCHANT_SETTLEMENT'
    and source_record_id='TST-MSET-AR-001'
    and event_type='MERCHANT_RECEIVABLE_SETTLED';

  if v_event is null then
    raise exception 'merchant receivable settlement event missing';
  end if;

  if not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1100' and l.debit_amount=2000
  ) or not exists (
    select 1 from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1220' and l.credit_amount=2000
  ) then
    raise exception 'merchant receivable settlement mapping incorrect';
  end if;
end $$;
