begin;

CREATE OR REPLACE FUNCTION public.be_accounting_approve_and_post_event_v1(p_event_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_review jsonb;
  v_post jsonb;
begin
  if not public.be_accounting_can_v1('journal_post') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;
  v_review := public.be_accounting_review_event_v1(p_event_id,'APPROVE',p_note);
  if not coalesce((v_review->>'ok')::boolean,false) then return v_review; end if;
  v_post := public.be_accounting_post_event_v1(p_event_id);
  return v_post||jsonb_build_object('review',v_review);
end;
$function$


CREATE OR REPLACE FUNCTION public.be_accounting_balance_sheet_v1(p_as_of date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  with b as (
    select a.account_code,a.account_name,a.account_type,a.report_group,
      sum(l.debit_amount) debit,sum(l.credit_amount) credit
    from public.be_journal_entries j
    join public.be_journal_lines l on l.journal_id=j.id
    join public.be_chart_of_accounts a on a.id=l.account_id
    where j.status='POSTED' and j.accounting_date<=p_as_of
      and a.account_type in ('ASSET','LIABILITY','EQUITY')
    group by a.account_code,a.account_name,a.account_type,a.report_group
  ), x as (
    select *,
      case when account_type='ASSET' then debit-credit else credit-debit end amount
    from b
  ), pnl as (
    select
      coalesce(sum(case when a.account_type='REVENUE' then l.credit_amount-l.debit_amount else 0 end),0)
      -coalesce(sum(case when a.account_type in ('COGS','EXPENSE') then l.debit_amount-l.credit_amount else 0 end),0)
      as current_earnings
    from public.be_journal_entries j
    join public.be_journal_lines l on l.journal_id=j.id
    join public.be_chart_of_accounts a on a.id=l.account_id
    where j.status='POSTED' and j.accounting_date<=p_as_of
  ), s as (
    select
      coalesce(sum(amount) filter(where account_type='ASSET'),0) assets,
      coalesce(sum(amount) filter(where account_type='LIABILITY'),0) liabilities,
      coalesce(sum(amount) filter(where account_type='EQUITY'),0) equity
    from x
  )
  select case when not public.be_accounting_can_v1('finance_review')
    then jsonb_build_object('ok',false,'code','UNAUTHORIZED')
    else jsonb_build_object(
      'ok',true,'as_of',p_as_of,
      'assets',(select assets from s),
      'liabilities',(select liabilities from s),
      'equity',(select equity from s),
      'current_earnings',(select current_earnings from pnl),
      'liabilities_and_equity',(select liabilities+equity from s)+(select current_earnings from pnl),
      'difference',(select assets-liabilities-equity from s)-(select current_earnings from pnl),
      'rows',coalesce((select jsonb_agg(to_jsonb(x) order by account_code) from x),'[]'::jsonb)
    ) end;
$function$


CREATE OR REPLACE FUNCTION public.be_accounting_general_ledger_v1(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_account_code text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select case when not public.be_accounting_can_v1('finance_review')
    then jsonb_build_object('ok',false,'code','UNAUTHORIZED')
    else jsonb_build_object(
      'ok',true,
      'rows',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.accounting_date desc,q.journal_number desc,q.sequence_no)
        from (
          select j.id as journal_id,j.journal_number,j.accounting_date,j.description as journal_description,
                 j.source_event_id,j.posted_by,j.posted_at,j.reversal_of_journal_id,j.replacement_for_journal_id,
                 l.sequence_no,a.account_code,a.account_name,a.account_type,a.report_group,
                 l.description,l.debit_amount,l.credit_amount,l.branch_code,l.merchant_id,
                 l.rider_or_employee_id,l.source_reference,l.cost_center
          from public.be_journal_entries j
          join public.be_journal_lines l on l.journal_id=j.id
          join public.be_chart_of_accounts a on a.id=l.account_id
          where j.status='POSTED'
            and (p_from is null or j.accounting_date>=p_from)
            and (p_to is null or j.accounting_date<=p_to)
            and (nullif(btrim(coalesce(p_account_code,'')),'') is null or a.account_code=p_account_code)
            and (
              nullif(btrim(coalesce(p_search,'')),'') is null
              or j.journal_number ilike '%'||p_search||'%'
              or coalesce(l.source_reference,'') ilike '%'||p_search||'%'
              or coalesce(l.description,'') ilike '%'||p_search||'%'
            )
          order by j.accounting_date desc,j.journal_number desc,l.sequence_no
          limit greatest(1,least(coalesce(p_limit,1000),5000))
        ) q
      ),'[]'::jsonb)
    ) end;
$function$


CREATE OR REPLACE FUNCTION public.be_accounting_profit_loss_v1(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  with b as (
    select a.account_code,a.account_name,a.account_type,a.report_group,
      sum(l.debit_amount) debit,sum(l.credit_amount) credit
    from public.be_journal_entries j
    join public.be_journal_lines l on l.journal_id=j.id
    join public.be_chart_of_accounts a on a.id=l.account_id
    where j.status='POSTED'
      and j.accounting_date between p_from and p_to
      and a.account_type in ('REVENUE','COGS','EXPENSE')
    group by a.account_code,a.account_name,a.account_type,a.report_group
  ), x as (
    select *,
      case when account_type='REVENUE' then credit-debit else debit-credit end amount
    from b
  ), s as (
    select
      coalesce(sum(amount) filter(where account_type='REVENUE'),0) revenue,
      coalesce(sum(amount) filter(where account_type='COGS'),0) cogs,
      coalesce(sum(amount) filter(where account_type='EXPENSE'),0) opex
    from x
  )
  select case when not public.be_accounting_can_v1('finance_review')
    then jsonb_build_object('ok',false,'code','UNAUTHORIZED')
    else jsonb_build_object(
      'ok',true,'from',p_from,'to',p_to,
      'revenue',(select revenue from s),'cogs',(select cogs from s),'operating_expenses',(select opex from s),
      'gross_profit',(select revenue-cogs from s),'net_profit',(select revenue-cogs-opex from s),
      'rows',coalesce((select jsonb_agg(to_jsonb(x) order by account_code) from x),'[]'::jsonb)
    ) end;
$function$


CREATE OR REPLACE FUNCTION public.be_accounting_review_event_v1(p_event_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_event public.be_accounting_events%rowtype;
  v_decision text := upper(btrim(coalesce(p_decision,'')));
  v_status text;
begin
  if not public.be_accounting_can_v1('finance_review') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  select * into v_event from public.be_accounting_events where id=p_event_id for update;
  if not found then
    return jsonb_build_object('ok',false,'code','EVENT_NOT_FOUND','event_id',p_event_id);
  end if;

  if v_event.review_status='POSTED' or v_event.posted_journal_id is not null then
    return jsonb_build_object('ok',true,'code','ALREADY_POSTED','event_id',v_event.id,'journal_id',v_event.posted_journal_id);
  end if;

  v_status := case v_decision
    when 'APPROVE' then 'APPROVED'
    when 'APPROVED' then 'APPROVED'
    when 'HOLD' then 'HELD'
    when 'HELD' then 'HELD'
    when 'REJECT' then 'REJECTED'
    when 'REJECTED' then 'REJECTED'
    when 'INVESTIGATE' then 'NEEDS_REVIEW'
    when 'NEEDS_REVIEW' then 'NEEDS_REVIEW'
    else null
  end;

  if v_status is null then
    return jsonb_build_object('ok',false,'code','INVALID_DECISION','decision',v_decision);
  end if;

  if v_status in ('HELD','REJECTED','NEEDS_REVIEW')
     and nullif(btrim(coalesce(p_note,'')),'') is null then
    return jsonb_build_object('ok',false,'code','NOTE_REQUIRED','status',v_status);
  end if;

  update public.be_accounting_events
  set review_status=v_status,
      reviewed_by=auth.uid(),
      reviewed_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'last_review_note',coalesce(p_note,''),
        'last_review_decision',v_status
      ),
      updated_at=now()
  where id=v_event.id;

  perform public.be_accounting_write_audit_v1(
    'be_accounting_events',v_event.id,'REVIEW',
    jsonb_build_object('review_status',v_event.review_status,'reviewed_by',v_event.reviewed_by,'reviewed_at',v_event.reviewed_at),
    jsonb_build_object('review_status',v_status,'reviewed_by',auth.uid(),'reviewed_at',now()),
    p_note,v_event.posted_journal_id,
    jsonb_build_object('function','be_accounting_review_event_v1','decision',v_status)
  );

  return jsonb_build_object('ok',true,'code',v_status,'event_id',v_event.id,'review_status',v_status);
end;
$function$


CREATE OR REPLACE FUNCTION public.be_accounting_review_queue_v1(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
  select case when not public.be_accounting_can_v1('finance_review')
    then jsonb_build_object('ok',false,'code','UNAUTHORIZED')
    else jsonb_build_object(
      'ok',true,
      'rows',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.event_date desc,q.created_at desc)
        from (
          select e.*,
                 coalesce((select sum(l.debit_amount) from public.be_accounting_event_lines l where l.event_id=e.id),0) debit_total,
                 coalesce((select sum(l.credit_amount) from public.be_accounting_event_lines l where l.event_id=e.id),0) credit_total,
                 coalesce((
                   select jsonb_agg(jsonb_build_object(
                     'sequence_no',l.sequence_no,'account_code',a.account_code,'account_name',a.account_name,
                     'debit_amount',l.debit_amount,'credit_amount',l.credit_amount,'description',l.description
                   ) order by l.sequence_no)
                   from public.be_accounting_event_lines l
                   join public.be_chart_of_accounts a on a.id=l.account_id
                   where l.event_id=e.id
                 ),'[]'::jsonb) lines
          from public.be_accounting_events e
          where (p_from is null or e.event_date>=p_from)
            and (p_to is null or e.event_date<=p_to)
            and (nullif(btrim(coalesce(p_status,'')),'') is null or e.review_status=upper(p_status))
          order by e.event_date desc,e.created_at desc
          limit greatest(1,least(coalesce(p_limit,500),2000))
        ) q
      ),'[]'::jsonb)
    ) end;
$function$


CREATE OR REPLACE FUNCTION public.be_accounting_submit_finance_daily_v1(p_entry_date date, p_department_code text, p_delivery_fees_collected numeric, p_cod_handling_fees numeric, p_surcharges numeric, p_rider_commissions_accrued numeric, p_fuel_and_tolls_spent numeric, p_packaging_supplies_spent numeric, p_petty_cash_expenses numeric, p_cod_cash_collected_in_hand numeric, p_accounts_receivable_invoiced numeric, p_accounts_payable_incurred numeric, p_funding_account_code text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_department text := upper(btrim(coalesce(p_department_code,'FINANCE')));
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
  v_funding_code text := btrim(coalesce(p_funding_account_code,''));
  v_source_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_existing public.finance_daily_logs%rowtype;
  v_upsert jsonb;
  v_fingerprint text;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_seq integer := 10;
  v_funding uuid;
  v_cash uuid;
  v_ar uuid;
  v_ap uuid;
  v_cod_pending uuid;
  v_delivery_rev uuid;
  v_cod_rev uuid;
  v_surcharge_rev uuid;
  v_rider_exp uuid;
  v_rider_payable uuid;
  v_fuel_exp uuid;
  v_packaging_exp uuid;
  v_petty_exp uuid;
  v_ar_offset uuid;
  v_ap_offset uuid;
  v_amount numeric(18,2);
begin
  if not public.be_accounting_can_v1('finance_entry') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if p_entry_date is null then
    return jsonb_build_object('ok',false,'code','ENTRY_DATE_REQUIRED');
  end if;
  if v_department='' then
    return jsonb_build_object('ok',false,'code','DEPARTMENT_REQUIRED');
  end if;

  if least(
    coalesce(p_delivery_fees_collected,0),coalesce(p_cod_handling_fees,0),
    coalesce(p_surcharges,0),coalesce(p_rider_commissions_accrued,0),
    coalesce(p_fuel_and_tolls_spent,0),coalesce(p_packaging_supplies_spent,0),
    coalesce(p_petty_cash_expenses,0),coalesce(p_cod_cash_collected_in_hand,0),
    coalesce(p_accounts_receivable_invoiced,0),coalesce(p_accounts_payable_incurred,0)
  ) < 0 then
    return jsonb_build_object('ok',false,'code','NEGATIVE_AMOUNT_NOT_ALLOWED');
  end if;

  if (
    coalesce(p_delivery_fees_collected,0)+coalesce(p_cod_handling_fees,0)+coalesce(p_surcharges,0)
    +coalesce(p_fuel_and_tolls_spent,0)+coalesce(p_packaging_supplies_spent,0)+coalesce(p_petty_cash_expenses,0)
  ) > 0 and v_funding_code='' then
    return jsonb_build_object('ok',false,'code','FUNDING_ACCOUNT_REQUIRED');
  end if;

  v_fingerprint := md5(jsonb_build_object(
    'entry_date',p_entry_date,'department_code',v_department,
    'delivery_fees_collected',coalesce(p_delivery_fees_collected,0),
    'cod_handling_fees',coalesce(p_cod_handling_fees,0),
    'surcharges',coalesce(p_surcharges,0),
    'rider_commissions_accrued',coalesce(p_rider_commissions_accrued,0),
    'fuel_and_tolls_spent',coalesce(p_fuel_and_tolls_spent,0),
    'packaging_supplies_spent',coalesce(p_packaging_supplies_spent,0),
    'petty_cash_expenses',coalesce(p_petty_cash_expenses,0),
    'cod_cash_collected_in_hand',coalesce(p_cod_cash_collected_in_hand,0),
    'accounts_receivable_invoiced',coalesce(p_accounts_receivable_invoiced,0),
    'accounts_payable_incurred',coalesce(p_accounts_payable_incurred,0),
    'funding_account_code',v_funding_code,
    'ar_offset_account_code',coalesce(v_metadata->>'ar_offset_account_code',''),
    'ap_offset_account_code',coalesce(v_metadata->>'ap_offset_account_code','')
  )::text);

  select * into v_existing
  from public.finance_daily_logs
  where entry_date=p_entry_date and department_code=v_department
    and version_no=1 and soft_deleted_at is null
  limit 1;

  if found then
    if coalesce(v_existing.metadata->>'input_fingerprint','')=v_fingerprint then
      return jsonb_build_object(
        'ok',true,'code','UNCHANGED','source_id',v_existing.id,
        'event_id',v_existing.accounting_event_id,'submission_no',v_existing.submission_no,
        'locked',v_existing.is_locked
      );
    end if;
    return jsonb_build_object(
      'ok',false,'code','SOURCE_DUPLICATE','source_id',v_existing.id,
      'submission_no',v_existing.submission_no,
      'message','A locked Finance submission already exists for this date and department.'
    );
  end if;

  if v_funding_code<>'' then
    select id into v_funding from public.be_chart_of_accounts
    where account_code=v_funding_code and is_active and is_postable;
    if v_funding is null then
      return jsonb_build_object('ok',false,'code','FUNDING_ACCOUNT_INVALID','account_code',v_funding_code);
    end if;
  end if;

  select id into v_cash from public.be_chart_of_accounts where account_code='1000' and is_active and is_postable;
  select id into v_ar from public.be_chart_of_accounts where account_code='1220' and is_active and is_postable;
  select id into v_ap from public.be_chart_of_accounts where account_code='2000' and is_active and is_postable;
  select id into v_cod_pending from public.be_chart_of_accounts where account_code='2500' and is_active and is_postable;
  select id into v_delivery_rev from public.be_chart_of_accounts where account_code='4000' and is_active and is_postable;
  select id into v_cod_rev from public.be_chart_of_accounts where account_code='4100' and is_active and is_postable;
  select id into v_surcharge_rev from public.be_chart_of_accounts where account_code='4200' and is_active and is_postable;
  select id into v_rider_exp from public.be_chart_of_accounts where account_code='5000' and is_active and is_postable;
  select id into v_rider_payable from public.be_chart_of_accounts where account_code='2200' and is_active and is_postable;
  select id into v_fuel_exp from public.be_chart_of_accounts where account_code='5100' and is_active and is_postable;
  select id into v_packaging_exp from public.be_chart_of_accounts where account_code='5200' and is_active and is_postable;
  select id into v_petty_exp from public.be_chart_of_accounts where account_code='6600' and is_active and is_postable;

  if coalesce(p_accounts_receivable_invoiced,0)>0 then
    if nullif(btrim(coalesce(v_metadata->>'ar_counterparty','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ar_reference','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ar_offset_account_code','')),'') is null then
      return jsonb_build_object('ok',false,'code','AR_DETAILS_REQUIRED');
    end if;
    select id into v_ar_offset from public.be_chart_of_accounts
    where account_code=v_metadata->>'ar_offset_account_code' and is_active and is_postable;
    if v_ar_offset is null then
      return jsonb_build_object('ok',false,'code','AR_OFFSET_ACCOUNT_INVALID');
    end if;
  end if;

  if coalesce(p_accounts_payable_incurred,0)>0 then
    if nullif(btrim(coalesce(v_metadata->>'ap_counterparty','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ap_reference','')),'') is null
       or nullif(btrim(coalesce(v_metadata->>'ap_offset_account_code','')),'') is null then
      return jsonb_build_object('ok',false,'code','AP_DETAILS_REQUIRED');
    end if;
    select id into v_ap_offset from public.be_chart_of_accounts
    where account_code=v_metadata->>'ap_offset_account_code' and is_active and is_postable;
    if v_ap_offset is null then
      return jsonb_build_object('ok',false,'code','AP_OFFSET_ACCOUNT_INVALID');
    end if;
  end if;

  v_upsert := public.be_accounting_upsert_event_v1(
    'FINANCE_MANUAL','finance_daily_logs',v_source_id::text,'FINANCE_DAILY_MANUAL','FINANCE_DAILY_V1',
    p_entry_date,'Manual Finance daily accounting submission','MMK',0,
    jsonb_build_object('source_reference',v_department||':'||p_entry_date::text),
    v_fingerprint,'REVIEW_PENDING',now(),
    jsonb_build_object('department_code',v_department,'input_fingerprint',v_fingerprint)
  );
  if not coalesce((v_upsert->>'ok')::boolean,false) then
    return v_upsert;
  end if;
  v_event_id := (v_upsert->>'event_id')::uuid;

  delete from public.be_accounting_event_lines where event_id=v_event_id;

  v_amount:=coalesce(p_delivery_fees_collected,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'Delivery fee collection funding'),
           (v_event_id,v_delivery_rev,v_seq+1,0,v_amount,'Delivery Service Revenue');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_cod_handling_fees,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'COD handling fee collection funding'),
           (v_event_id,v_cod_rev,v_seq+1,0,v_amount,'COD Handling Revenue');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_surcharges,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_funding,v_seq,v_amount,0,'Surcharge collection funding'),
           (v_event_id,v_surcharge_rev,v_seq+1,0,v_amount,'Surcharge Revenue');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_rider_commissions_accrued,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_rider_exp,v_seq,v_amount,0,'Rider Commission Expense'),
           (v_event_id,v_rider_payable,v_seq+1,0,v_amount,'Rider Commission Payable');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_fuel_and_tolls_spent,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_fuel_exp,v_seq,v_amount,0,'Fuel & Tolls Expense'),
           (v_event_id,v_funding,v_seq+1,0,v_amount,'Fuel/tolls funding source');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_packaging_supplies_spent,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_packaging_exp,v_seq,v_amount,0,'Packaging Supplies Expense'),
           (v_event_id,v_funding,v_seq+1,0,v_amount,'Packaging funding source');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_petty_cash_expenses,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata)
    values (v_event_id,v_petty_exp,v_seq,v_amount,0,coalesce(v_metadata->>'petty_cash_description','Petty Cash Expense'),v_metadata),
           (v_event_id,v_funding,v_seq+1,0,v_amount,'Petty cash funding source',v_metadata);
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_cod_cash_collected_in_hand,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description)
    values (v_event_id,v_cash,v_seq,v_amount,0,'COD Cash on Hand'),
           (v_event_id,v_cod_pending,v_seq+1,0,v_amount,'COD Pending Remittance');
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_accounts_receivable_invoiced,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata)
    values (v_event_id,v_ar,v_seq,v_amount,0,'Accounts Receivable - '||v_metadata->>'ar_counterparty',v_metadata),
           (v_event_id,v_ar_offset,v_seq+1,0,v_amount,'AR offset - '||v_metadata->>'ar_reference',v_metadata);
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  v_amount:=coalesce(p_accounts_payable_incurred,0);
  if v_amount>0 then
    insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata)
    values (v_event_id,v_ap_offset,v_seq,v_amount,0,'AP offset - '||v_metadata->>'ap_reference',v_metadata),
           (v_event_id,v_ap,v_seq+1,0,v_amount,'Accounts Payable - '||v_metadata->>'ap_counterparty',v_metadata);
    v_total_debit:=v_total_debit+v_amount; v_total_credit:=v_total_credit+v_amount; v_seq:=v_seq+10;
  end if;

  if v_total_debit=0 or v_total_debit<>v_total_credit then
    return jsonb_build_object('ok',false,'code','JOURNAL_NOT_BALANCED','debit',v_total_debit,'credit',v_total_credit);
  end if;

  update public.be_accounting_events
  set total_amount=v_total_debit,
      source_snapshot=jsonb_build_object(
        'source_reference',v_department||':'||p_entry_date::text,
        'department_code',v_department,'funding_account_code',v_funding_code,
        'total_debit',v_total_debit,'total_credit',v_total_credit
      )||v_metadata,
      updated_at=now()
  where id=v_event_id;

  insert into public.finance_daily_logs(
    id,entry_date,department_code,delivery_fees_collected,cod_handling_fees,surcharges,
    rider_commissions_accrued,fuel_and_tolls_spent,packaging_supplies_spent,petty_cash_expenses,
    cod_cash_collected_in_hand,accounts_receivable_invoiced,accounts_payable_incurred,
    source_mode,accounting_event_id,is_locked,submitted_at,created_by,metadata
  ) values (
    v_source_id,p_entry_date,v_department,coalesce(p_delivery_fees_collected,0),coalesce(p_cod_handling_fees,0),
    coalesce(p_surcharges,0),coalesce(p_rider_commissions_accrued,0),coalesce(p_fuel_and_tolls_spent,0),
    coalesce(p_packaging_supplies_spent,0),coalesce(p_petty_cash_expenses,0),
    coalesce(p_cod_cash_collected_in_hand,0),coalesce(p_accounts_receivable_invoiced,0),
    coalesce(p_accounts_payable_incurred,0),'MANUAL',v_event_id,true,now(),auth.uid(),
    v_metadata||jsonb_build_object('input_fingerprint',v_fingerprint,'funding_account_code',v_funding_code)
  );

  perform public.be_accounting_write_audit_v1(
    'finance_daily_logs',v_source_id,'SUBMIT',null,
    jsonb_build_object('event_id',v_event_id,'entry_date',p_entry_date,'department_code',v_department),
    null,null,jsonb_build_object('function','be_accounting_submit_finance_daily_v1')
  );

  return jsonb_build_object(
    'ok',true,'code','SUBMITTED','source_id',v_source_id,'event_id',v_event_id,
    'locked',true,'debit',v_total_debit,'credit',v_total_credit
  );
end;
$function$



revoke execute on function public.be_accounting_post_event_v1(uuid) from authenticated;

revoke all on function public.be_accounting_submit_finance_daily_v1(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb) from public,anon,authenticated;
revoke all on function public.be_accounting_review_event_v1(uuid,text,text) from public,anon,authenticated;
revoke all on function public.be_accounting_approve_and_post_event_v1(uuid,text) from public,anon,authenticated;
revoke all on function public.be_accounting_general_ledger_v1(date,date,text,text,integer) from public,anon,authenticated;
revoke all on function public.be_accounting_profit_loss_v1(date,date) from public,anon,authenticated;
revoke all on function public.be_accounting_balance_sheet_v1(date) from public,anon,authenticated;
revoke all on function public.be_accounting_review_queue_v1(date,date,text,integer) from public,anon,authenticated;

grant execute on function public.be_accounting_submit_finance_daily_v1(date,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb) to authenticated,service_role;
grant execute on function public.be_accounting_review_event_v1(uuid,text,text) to authenticated,service_role;
grant execute on function public.be_accounting_approve_and_post_event_v1(uuid,text) to authenticated,service_role;
grant execute on function public.be_accounting_general_ledger_v1(date,date,text,text,integer) to authenticated,service_role;
grant execute on function public.be_accounting_profit_loss_v1(date,date) to authenticated,service_role;
grant execute on function public.be_accounting_balance_sheet_v1(date) to authenticated,service_role;
grant execute on function public.be_accounting_review_queue_v1(date,date,text,integer) to authenticated,service_role;
grant execute on function public.be_accounting_post_event_v1(uuid) to service_role;

commit;
