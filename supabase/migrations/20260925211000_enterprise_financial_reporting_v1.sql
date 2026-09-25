begin;

create or replace view public.be_v_trial_balance_v1
with (security_invoker=true)
as
select
  a.id as account_id,
  a.account_code,
  a.account_name,
  a.account_type,
  a.normal_balance,
  a.report_group,
  coalesce(sum(l.debit_amount),0)::numeric(18,2) as total_debit,
  coalesce(sum(l.credit_amount),0)::numeric(18,2) as total_credit,
  (
    case
      when a.normal_balance='DEBIT'
        then coalesce(sum(l.debit_amount-l.credit_amount),0)
      else coalesce(sum(l.credit_amount-l.debit_amount),0)
    end
  )::numeric(18,2) as normal_balance_amount
from public.be_chart_of_accounts a
left join public.be_journal_lines l on l.account_id=a.id
left join public.be_journal_entries j
  on j.id=l.journal_id
 and j.status in ('POSTED','REVERSED')
group by
  a.id,a.account_code,a.account_name,a.account_type,a.normal_balance,a.report_group;

create or replace function public.be_accounting_trial_balance_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_period_debit numeric(18,2);
  v_period_credit numeric(18,2);
  v_rows jsonb;
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('ledger_admin')
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  with account_activity as (
    select
      a.id as account_id,
      a.account_code,
      a.account_name,
      a.account_type,
      a.normal_balance,
      a.report_group,
      coalesce(sum(l.debit_amount) filter (where j.accounting_date<p_from),0)::numeric(18,2) as opening_debit,
      coalesce(sum(l.credit_amount) filter (where j.accounting_date<p_from),0)::numeric(18,2) as opening_credit,
      coalesce(sum(l.debit_amount) filter (where j.accounting_date between p_from and p_to),0)::numeric(18,2) as period_debit,
      coalesce(sum(l.credit_amount) filter (where j.accounting_date between p_from and p_to),0)::numeric(18,2) as period_credit
    from public.be_chart_of_accounts a
    left join public.be_journal_lines l on l.account_id=a.id
    left join public.be_journal_entries j
      on j.id=l.journal_id
     and j.status in ('POSTED','REVERSED')
     and j.accounting_date<=p_to
    group by
      a.id,a.account_code,a.account_name,a.account_type,a.normal_balance,a.report_group
  ),
  active as (
    select *,
      case when normal_balance='DEBIT'
        then opening_debit-opening_credit
        else opening_credit-opening_debit
      end as opening_balance,
      case when normal_balance='DEBIT'
        then (opening_debit+period_debit)-(opening_credit+period_credit)
        else (opening_credit+period_credit)-(opening_debit+period_debit)
      end as closing_balance
    from account_activity
    where opening_debit<>0 or opening_credit<>0 or period_debit<>0 or period_credit<>0
  )
  select
    coalesce(sum(period_debit),0)::numeric(18,2),
    coalesce(sum(period_credit),0)::numeric(18,2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'account_id',account_id,
          'account_code',account_code,
          'account_name',account_name,
          'account_type',account_type,
          'normal_balance',normal_balance,
          'report_group',report_group,
          'opening_debit',opening_debit,
          'opening_credit',opening_credit,
          'opening_balance',opening_balance,
          'period_debit',period_debit,
          'period_credit',period_credit,
          'closing_balance',closing_balance
        )
        order by account_code
      ),
      '[]'::jsonb
    )
  into v_period_debit,v_period_credit,v_rows
  from active;

  return jsonb_build_object(
    'ok',true,
    'code','OK',
    'date_from',p_from,
    'date_to',p_to,
    'period_debit',v_period_debit,
    'period_credit',v_period_credit,
    'difference',v_period_debit-v_period_credit,
    'rows',v_rows
  );
end;
$$;

create or replace function public.be_accounting_profit_loss_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_revenue numeric(18,2) := 0;
  v_cogs numeric(18,2) := 0;
  v_opex numeric(18,2) := 0;
  v_depreciation numeric(18,2) := 0;
  v_gross numeric(18,2) := 0;
  v_ebitda numeric(18,2) := 0;
  v_ebit numeric(18,2) := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('ledger_admin')
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  with movements as (
    select
      a.id as account_id,
      a.account_code,
      a.account_name,
      a.account_type,
      a.report_group,
      coalesce(sum(l.debit_amount),0)::numeric(18,2) as debit,
      coalesce(sum(l.credit_amount),0)::numeric(18,2) as credit,
      case
        when a.account_type='REVENUE'
          then coalesce(sum(l.credit_amount-l.debit_amount),0)
        when a.account_type in ('COGS','EXPENSE')
          then coalesce(sum(l.debit_amount-l.credit_amount),0)
        else 0
      end::numeric(18,2) as amount
    from public.be_chart_of_accounts a
    join public.be_journal_lines l on l.account_id=a.id
    join public.be_journal_entries j on j.id=l.journal_id
    where j.status in ('POSTED','REVERSED')
      and j.accounting_date between p_from and p_to
      and a.account_type in ('REVENUE','COGS','EXPENSE')
    group by a.id,a.account_code,a.account_name,a.account_type,a.report_group
  )
  select
    coalesce(sum(amount) filter (where account_type='REVENUE'),0)::numeric(18,2),
    coalesce(sum(amount) filter (where account_type='COGS'),0)::numeric(18,2),
    coalesce(sum(amount) filter (
      where account_type='EXPENSE' and report_group<>'DEPRECIATION'
    ),0)::numeric(18,2),
    coalesce(sum(amount) filter (
      where account_type='EXPENSE' and report_group='DEPRECIATION'
    ),0)::numeric(18,2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'account_id',account_id,
          'account_code',account_code,
          'account_name',account_name,
          'account_type',account_type,
          'report_group',report_group,
          'debit',debit,
          'credit',credit,
          'amount',amount
        )
        order by account_type,account_code
      ),
      '[]'::jsonb
    )
  into v_revenue,v_cogs,v_opex,v_depreciation,v_rows
  from movements;

  v_gross := v_revenue-v_cogs;
  v_ebitda := v_gross-v_opex;
  v_ebit := v_ebitda-v_depreciation;

  return jsonb_build_object(
    'ok',true,
    'code','OK',
    'date_from',p_from,
    'date_to',p_to,
    'total_revenue',v_revenue,
    'total_cogs',v_cogs,
    'gross_profit',v_gross,
    'operating_expenses_before_depreciation',v_opex,
    'ebitda',v_ebitda,
    'depreciation',v_depreciation,
    'ebit',v_ebit,
    'non_operating_items',0,
    'net_income',v_ebit,
    'rows',v_rows
  );
end;
$$;

create or replace function public.be_accounting_balance_sheet_v1(
  p_as_of date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_assets numeric(18,2) := 0;
  v_liabilities numeric(18,2) := 0;
  v_equity_accounts numeric(18,2) := 0;
  v_current_earnings numeric(18,2) := 0;
  v_equity numeric(18,2) := 0;
  v_gross_fixed numeric(18,2) := 0;
  v_accum_dep numeric(18,2) := 0;
  v_net_fixed numeric(18,2) := 0;
  v_difference numeric(18,2) := 0;
  v_rows jsonb := '[]'::jsonb;
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('ledger_admin')
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if p_as_of is null then
    return jsonb_build_object('ok',false,'code','INVALID_AS_OF_DATE');
  end if;

  with balances as (
    select
      a.id as account_id,
      a.account_code,
      a.account_name,
      a.account_type,
      a.normal_balance,
      a.report_group,
      coalesce(sum(l.debit_amount),0)::numeric(18,2) as debit,
      coalesce(sum(l.credit_amount),0)::numeric(18,2) as credit,
      case
        when a.account_type='ASSET'
          then coalesce(sum(l.debit_amount-l.credit_amount),0)
        when a.account_type in ('LIABILITY','EQUITY','REVENUE')
          then coalesce(sum(l.credit_amount-l.debit_amount),0)
        when a.account_type in ('COGS','EXPENSE')
          then coalesce(sum(l.debit_amount-l.credit_amount),0)
        else 0
      end::numeric(18,2) as presentation_balance
    from public.be_chart_of_accounts a
    join public.be_journal_lines l on l.account_id=a.id
    join public.be_journal_entries j on j.id=l.journal_id
    where j.status in ('POSTED','REVERSED')
      and j.accounting_date<=p_as_of
    group by a.id,a.account_code,a.account_name,a.account_type,a.normal_balance,a.report_group
  )
  select
    coalesce(sum(presentation_balance) filter (where account_type='ASSET'),0)::numeric(18,2),
    coalesce(sum(presentation_balance) filter (where account_type='LIABILITY'),0)::numeric(18,2),
    coalesce(sum(presentation_balance) filter (where account_type='EQUITY'),0)::numeric(18,2),
    (
      coalesce(sum(presentation_balance) filter (where account_type='REVENUE'),0)
      - coalesce(sum(presentation_balance) filter (where account_type='COGS'),0)
      - coalesce(sum(presentation_balance) filter (where account_type='EXPENSE'),0)
    )::numeric(18,2),
    coalesce(sum(presentation_balance) filter (
      where account_type='ASSET' and report_group='FIXED_ASSETS'
    ),0)::numeric(18,2),
    coalesce(sum(-presentation_balance) filter (
      where account_type='ASSET' and report_group='ACCUMULATED_DEPRECIATION'
    ),0)::numeric(18,2),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'account_id',account_id,
          'account_code',account_code,
          'account_name',account_name,
          'account_type',account_type,
          'normal_balance',normal_balance,
          'report_group',report_group,
          'debit',debit,
          'credit',credit,
          'balance',presentation_balance
        )
        order by account_type,account_code
      ) filter (where account_type in ('ASSET','LIABILITY','EQUITY')),
      '[]'::jsonb
    )
  into
    v_assets,
    v_liabilities,
    v_equity_accounts,
    v_current_earnings,
    v_gross_fixed,
    v_accum_dep,
    v_rows
  from balances;

  v_net_fixed := v_gross_fixed-v_accum_dep;
  v_equity := v_equity_accounts+v_current_earnings;
  v_difference := v_assets-v_liabilities-v_equity;

  return jsonb_build_object(
    'ok',true,
    'code','OK',
    'as_of',p_as_of,
    'total_assets',v_assets,
    'total_liabilities',v_liabilities,
    'equity_accounts',v_equity_accounts,
    'current_period_earnings',v_current_earnings,
    'total_equity',v_equity,
    'gross_fixed_assets',v_gross_fixed,
    'accumulated_depreciation',v_accum_dep,
    'net_fixed_assets',v_net_fixed,
    'balance_difference',v_difference,
    'balanced',abs(v_difference)<0.005,
    'rows',v_rows
  );
end;
$$;

create or replace function public.be_accounting_reconciliation_v1(
  p_as_of date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_duplicates integer := 0;
  v_posted_without_journal integer := 0;
  v_journal_without_source integer := 0;
  v_unbalanced integer := 0;
  v_bs jsonb;
begin
  if not (
    public.be_accounting_can_v1('finance_review')
    or public.be_accounting_can_v1('ledger_admin')
  ) then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select count(*) into v_duplicates
  from (
    select source_system,source_table,source_record_id,event_type,accounting_version
    from public.be_accounting_source_links
    group by 1,2,3,4,5
    having count(*)>1
  ) d;

  select count(*) into v_posted_without_journal
  from public.be_accounting_events
  where review_status='POSTED' and posted_journal_id is null;

  select count(*) into v_journal_without_source
  from public.be_journal_entries
  where status in ('POSTED','REVERSED')
    and source_event_id is null
    and coalesce(metadata->>'entry_kind','') not in ('OPENING_BALANCE','MANUAL_JOURNAL','DEPRECIATION','REVERSAL')
    and journal_number not like 'RPT-%';

  select count(*) into v_unbalanced
  from (
    select j.id,
      coalesce(sum(l.debit_amount),0) as debit,
      coalesce(sum(l.credit_amount),0) as credit
    from public.be_journal_entries j
    join public.be_journal_lines l on l.journal_id=j.id
    where j.status in ('POSTED','REVERSED')
      and j.accounting_date<=p_as_of
    group by j.id
  ) x
  where debit<>credit or debit<=0;

  v_bs := public.be_accounting_balance_sheet_v1(p_as_of);

  return jsonb_build_object(
    'ok',true,
    'code','OK',
    'as_of',p_as_of,
    'duplicate_source_events',v_duplicates,
    'posted_events_without_journal',v_posted_without_journal,
    'journals_without_authorized_source',v_journal_without_source,
    'unbalanced_journals',v_unbalanced,
    'balance_sheet_difference',coalesce((v_bs->>'balance_difference')::numeric,0),
    'critical_difference_count',
      v_duplicates+v_posted_without_journal+v_unbalanced
      + case when abs(coalesce((v_bs->>'balance_difference')::numeric,0))>=0.005 then 1 else 0 end
  );
end;
$$;

revoke all on function public.be_accounting_trial_balance_v1(date,date) from public,anon;
revoke all on function public.be_accounting_profit_loss_v1(date,date) from public,anon;
revoke all on function public.be_accounting_balance_sheet_v1(date) from public,anon;
revoke all on function public.be_accounting_reconciliation_v1(date) from public,anon;

grant execute on function public.be_accounting_trial_balance_v1(date,date) to authenticated,service_role;
grant execute on function public.be_accounting_profit_loss_v1(date,date) to authenticated,service_role;
grant execute on function public.be_accounting_balance_sheet_v1(date) to authenticated,service_role;
grant execute on function public.be_accounting_reconciliation_v1(date) to authenticated,service_role;

grant select on public.be_v_trial_balance_v1 to authenticated,service_role;

comment on function public.be_accounting_profit_loss_v1(date,date) is
  'Ledger-grounded P&L. EBITDA excludes depreciation; EBIT subtracts depreciation.';
comment on function public.be_accounting_balance_sheet_v1(date) is
  'As-of-date Balance Sheet generated from posted ledger lines plus cumulative current earnings.';

commit;
