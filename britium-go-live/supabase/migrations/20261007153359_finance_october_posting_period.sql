-- Configure the current monthly posting period without reopening any closed period.
DO $period$
DECLARE existing public.be_accounting_periods%rowtype; created public.be_accounting_periods%rowtype;
BEGIN
 LOCK TABLE public.be_accounting_periods IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO existing FROM public.be_accounting_periods WHERE period_code='2026-10';
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM public.be_accounting_periods WHERE id<>existing.id AND period_start<='2026-10-31'::date AND period_end>='2026-10-01'::date) THEN
   RAISE EXCEPTION 'October overlaps another accounting period; manual reconciliation required';
  END IF;
  IF existing.period_start<>'2026-10-01'::date OR existing.period_end<>'2026-10-31'::date THEN
   RAISE EXCEPTION 'October period code already has different dates';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.be_accounting_periods WHERE period_start<='2026-10-31'::date AND period_end>='2026-10-01'::date) THEN
   RAISE EXCEPTION 'October overlaps an existing accounting period; manual reconciliation required';
  END IF;
  INSERT INTO public.be_accounting_periods(period_code,period_start,period_end,status,metadata)
  VALUES('2026-10','2026-10-01','2026-10-31','OPEN',jsonb_build_object('source','finance_october_posting_period','reason','Repair missing accounting period blocking October Finance posting'))
  RETURNING * INTO created;
  PERFORM public.be_accounting_write_audit_v1('be_accounting_periods',created.id,'CONFIGURE_PERIOD',NULL,to_jsonb(created),'Configure missing October 2026 monthly period for independent Finance review and posting',NULL,jsonb_build_object('source','finance_october_posting_period'));
 END IF;
END $period$;

-- Merchant payouts use bank account 112003 and must be included in cash movements.
CREATE OR REPLACE FUNCTION public.be_accounting_periodic_report_v2(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_pl jsonb;
  v_bs jsonb;
  v_cash jsonb;
  v_channels jsonb;
  v_settlement jsonb;
  v_arap jsonb;
  v_controls jsonb;
  v_journals jsonb;
begin
  if not public.be_accounting_can_v1('financial_reports') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  if p_from is null or p_to is null or p_from>p_to then
    return jsonb_build_object('ok',false,'code','INVALID_PERIOD');
  end if;

  v_pl := public.be_accounting_profit_loss_v1(p_from,p_to);
  v_bs := public.be_accounting_balance_sheet_v1(p_to);

  select jsonb_build_object(
    'inflows',coalesce(sum(x.debits),0),
    'outflows',coalesce(sum(x.credits),0),
    'net_movement',coalesce(sum(x.debits-x.credits),0),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'account_code',a.account_code,'account_name',a.account_name,
      'inflows',x.debits,'outflows',x.credits,'net_movement',x.debits-x.credits
    ) order by a.account_code),'[]'::jsonb)
  )
  into v_cash
  from (
    select l.account_id,sum(l.debit_amount) debits,sum(l.credit_amount) credits
    from public.be_journal_entries j join public.be_journal_lines l on l.journal_id=j.id
    join public.be_chart_of_accounts ca on ca.id=l.account_id
    where j.status='POSTED' and j.accounting_date between p_from and p_to
      and ca.account_code in ('111001','111002','112001','112003','112005','112006','112007')
    group by l.account_id
  ) x
  join public.be_chart_of_accounts a on a.id=x.account_id;

  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(to_jsonb(q) order by q.payment_method,q.payment_mobile_number),'[]'::jsonb),
    'total_activity',coalesce(sum(q.total_activity),0)
  ) into v_channels
  from (
    select coalesce(payment_method,'UNSPECIFIED') payment_method,payment_mobile_number,
      count(*) submissions,
      sum(delivery_fees_collected+cod_handling_fees+surcharges+cod_cash_collected_in_hand
          +accounts_receivable_invoiced+accounts_payable_incurred
          +rider_commissions_accrued+fuel_and_tolls_spent+packaging_supplies_spent+petty_cash_expenses) total_activity
    from public.finance_daily_logs
    where entry_date between p_from and p_to and soft_deleted_at is null
    group by coalesce(payment_method,'UNSPECIFIED'),payment_mobile_number
  ) q;

  select jsonb_build_object(
    'ways',count(*),
    'expected_cod',coalesce(sum(expected_cod),0),
    'reported_collected',coalesce(sum(reported_collected),0),
    'rider_remittance',coalesce(sum(rider_remittance),0),
    'settled_amount',coalesce(sum(settled_amount),0),
    'delivery_fee',coalesce(sum(delivery_fee),0),
    'variance_amount',coalesce(sum(variance_amount),0),
    'open_or_held',count(*) filter(where coalesce(settlement_status,'') not in ('SETTLED','COMPLETED','PAID')),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'delivery_way_id',delivery_way_id,'wayplan_id',wayplan_id,'rider_name',rider_name,
      'expected_cod',expected_cod,'reported_collected',reported_collected,'rider_remittance',rider_remittance,
      'settled_amount',settled_amount,'delivery_fee',delivery_fee,'payment_mode',payment_mode,
      'proof_status',proof_status,'settlement_status',settlement_status,'variance_type',variance_type,
      'variance_amount',variance_amount,'settlement_reference',settlement_reference,'settled_at',settled_at
    ) order by coalesce(settled_at,remitted_at,delivered_at,created_at) desc),'[]'::jsonb)
  ) into v_settlement
  from public.be_finance_cod_settlements_v48
  where coalesce(settled_at,remitted_at,delivered_at,created_at)::date between p_from and p_to;

  select jsonb_build_object(
    'accounts_receivable_closing',coalesce(sum(case when a.account_code='113005' then l.debit_amount-l.credit_amount else 0 end),0),
    'accounts_payable_closing',coalesce(sum(case when a.account_code='211005' then l.credit_amount-l.debit_amount else 0 end),0),
    'rider_payable_closing',coalesce(sum(case when a.account_code='213001' then l.credit_amount-l.debit_amount else 0 end),0),
    'cod_pending_remittance_closing',coalesce(sum(case when a.account_code='212003' then l.credit_amount-l.debit_amount else 0 end),0)
  ) into v_arap
  from public.be_journal_entries j join public.be_journal_lines l on l.journal_id=j.id
  join public.be_chart_of_accounts a on a.id=l.account_id
  where j.status='POSTED' and j.accounting_date<=p_to
    and a.account_code in ('113005','211005','213001','212003');

  select jsonb_build_object(
    'review_pending',count(*) filter(where review_status='REVIEW_PENDING'),
    'held',count(*) filter(where review_status='HELD'),
    'needs_review',count(*) filter(where review_status='NEEDS_REVIEW'),
    'rejected',count(*) filter(where review_status='REJECTED'),
    'approved_not_posted',count(*) filter(where review_status='APPROVED' and posted_journal_id is null),
    'open_fraud_flags',(select count(*) from public.finance_fraud_flags where status='open'),
    'high_fraud_flags',(select count(*) from public.finance_fraud_flags where status='open' and lower(severity) in ('high','critical'))
  ) into v_controls
  from public.be_accounting_events
  where event_date between p_from and p_to;

  select jsonb_build_object(
    'posted_journals',count(*),
    'reversals',count(*) filter(where reversal_of_journal_id is not null),
    'replacements',count(*) filter(where replacement_for_journal_id is not null),
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'journal_number',journal_number,'accounting_date',accounting_date,'description',description,
      'source_event_id',source_event_id,'posted_by',posted_by,'posted_at',posted_at,
      'reversal_of_journal_id',reversal_of_journal_id,'replacement_for_journal_id',replacement_for_journal_id
    ) order by accounting_date desc,journal_number desc),'[]'::jsonb)
  ) into v_journals
  from public.be_journal_entries
  where status='POSTED' and accounting_date between p_from and p_to;

  return jsonb_build_object(
    'ok',true,'from',p_from,'to',p_to,'profit_and_loss',v_pl,'balance_sheet',v_bs,'cash_flow',v_cash,
    'payment_channels',v_channels,'cod_settlement',v_settlement,'receivables_payables',v_arap,
    'controls',v_controls,'journal_register',v_journals,
    'report_catalog',jsonb_build_array(
      'Profit & Loss','Cash Flow / Cash Movement','Balance Sheet','COD Settlement Summary',
      'Payment Channel Reconciliation','Cash & Wallet Position','Receivables & Payables Position',
      'Journal Register','Audit & Fraud Exception Report'
    )
  );
end;
$function$;
