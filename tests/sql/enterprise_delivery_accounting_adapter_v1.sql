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
      created_at timestamptz
    );
  end if;
end $$;

delete from public.be_v_finance_merchant_settlement_queue_v2
where delivery_way_id='TST-DELIVERY-CANONICAL-001';

delete from public.be_accounting_event_lines
where event_id in (
  select id from public.be_accounting_events
  where source_system='CANONICAL_FINANCE'
    and source_table='be_v_finance_merchant_settlement_queue_v2'
    and source_record_id='TST-DELIVERY-CANONICAL-001'
);
delete from public.be_accounting_source_links
where source_system='CANONICAL_FINANCE'
  and source_table='be_v_finance_merchant_settlement_queue_v2'
  and source_record_id='TST-DELIVERY-CANONICAL-001';
delete from public.be_accounting_events
where source_system='CANONICAL_FINANCE'
  and source_table='be_v_finance_merchant_settlement_queue_v2'
  and source_record_id='TST-DELIVERY-CANONICAL-001';

insert into public.be_v_finance_merchant_settlement_queue_v2(
  parcel_id,delivery_way_id,merchant_id,merchant_name,status,
  customer_total_collection,net_system_delivery_charge,
  merchant_final_settlement_amount,merchant_receivable,
  settlement_direction,validation_status,calculation_version,
  calculated_at,settlement_eligible,created_at
) values
(
  gen_random_uuid(),'TST-DELIVERY-CANONICAL-001','M001','Merchant One','delivered',
  14000,4000,10000,0,
  'PAY_MERCHANT','OK','CANONICAL_V4',
  timestamptz '2099-05-05 02:00:00+00',true,timestamptz '2099-05-05 01:00:00+00'
),
(
  gen_random_uuid(),'TST-DELIVERY-CANONICAL-001','M001','Merchant One','delivered',
  14000,4000,10000,0,
  'PAY_MERCHANT','OK','CANONICAL_V4',
  timestamptz '2099-05-05 02:00:00+00',true,timestamptz '2099-05-05 01:00:00+00'
);

do $$
declare
  v_result jsonb;
  v_event uuid;
  v_count integer;
  v_debit numeric;
  v_credit numeric;
  v_calc text;
begin
  v_result := public.be_accounting_sync_delivery_v1(date '2099-05-05',date '2099-05-05');

  if not coalesce((v_result->>'ok')::boolean,false) then
    raise exception 'delivery sync failed: %',v_result;
  end if;

  select count(*)
  into v_count
  from public.be_accounting_events
  where source_system='CANONICAL_FINANCE'
    and source_table='be_v_finance_merchant_settlement_queue_v2'
    and source_record_id='TST-DELIVERY-CANONICAL-001'
    and event_type='DELIVERY_REVENUE_RECOGNIZED';

  select id
  into v_event
  from public.be_accounting_events
  where source_system='CANONICAL_FINANCE'
    and source_table='be_v_finance_merchant_settlement_queue_v2'
    and source_record_id='TST-DELIVERY-CANONICAL-001'
    and event_type='DELIVERY_REVENUE_RECOGNIZED'
  limit 1;

  if v_count<>1 then
    raise exception 'expected exactly one canonical delivery event, got %',v_count;
  end if;

  select source_snapshot->>'calculation_version'
  into v_calc
  from public.be_accounting_events
  where id=v_event;

  if v_calc<>'CANONICAL_V4' then
    raise exception 'canonical calculation version not preserved: %',v_calc;
  end if;

  select coalesce(sum(debit_amount),0),coalesce(sum(credit_amount),0)
  into v_debit,v_credit
  from public.be_accounting_event_lines
  where event_id=v_event;

  if v_debit<>14000 or v_credit<>14000 then
    raise exception 'delivery proposal unbalanced: debit %, credit %',v_debit,v_credit;
  end if;

  if not exists (
    select 1
    from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='1200' and l.debit_amount=14000
  ) then
    raise exception 'COD clearing debit missing';
  end if;

  if not exists (
    select 1
    from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='2100' and l.credit_amount=10000
  ) then
    raise exception 'merchant payable credit missing';
  end if;

  if not exists (
    select 1
    from public.be_accounting_event_lines l
    join public.be_chart_of_accounts a on a.id=l.account_id
    where l.event_id=v_event and a.account_code='4000' and l.credit_amount=4000
  ) then
    raise exception 'delivery revenue credit missing';
  end if;
end $$;
