begin;

create unique index if not exists be_journal_entries_source_event_uq
on public.be_journal_entries(source_event_id)
where source_event_id is not null;

create or replace function public.be_accounting_post_event_v1(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_event public.be_accounting_events%rowtype;
  v_period public.be_accounting_periods%rowtype;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
  v_journal_id uuid;
  v_journal_number text;
  v_invalid_accounts integer;
begin
  select *
  into v_event
  from public.be_accounting_events
  where id=p_event_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','EVENT_NOT_FOUND','event_id',p_event_id);
  end if;

  if v_event.posted_journal_id is not null or v_event.review_status='POSTED' then
    select journal_number into v_journal_number
    from public.be_journal_entries
    where id=v_event.posted_journal_id;

    return jsonb_build_object(
      'ok',true,
      'code','ALREADY_POSTED',
      'event_id',v_event.id,
      'journal_id',v_event.posted_journal_id,
      'journal_number',v_journal_number
    );
  end if;

  if v_event.review_status<>'APPROVED' then
    return jsonb_build_object(
      'ok',false,
      'code','EVENT_NOT_APPROVED',
      'event_id',v_event.id,
      'status',v_event.review_status
    );
  end if;

  select *
  into v_period
  from public.be_accounting_periods
  where v_event.event_date between period_start and period_end
  order by period_start desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'ok',false,
      'code','PERIOD_NOT_CONFIGURED',
      'event_id',v_event.id,
      'accounting_date',v_event.event_date
    );
  end if;

  if v_period.status<>'OPEN' then
    return jsonb_build_object(
      'ok',false,
      'code','PERIOD_CLOSED',
      'event_id',v_event.id,
      'period_id',v_period.id,
      'period_code',v_period.period_code,
      'period_status',v_period.status
    );
  end if;

  select count(*)::integer
  into v_invalid_accounts
  from public.be_accounting_event_lines l
  join public.be_chart_of_accounts a on a.id=l.account_id
  where l.event_id=v_event.id
    and (not a.is_active or not a.is_postable);

  if v_invalid_accounts>0 then
    return jsonb_build_object(
      'ok',false,
      'code','ACCOUNT_NOT_POSTABLE',
      'event_id',v_event.id,
      'invalid_account_count',v_invalid_accounts
    );
  end if;

  select
    coalesce(sum(debit_amount),0),
    coalesce(sum(credit_amount),0)
  into v_debit,v_credit
  from public.be_accounting_event_lines
  where event_id=v_event.id;

  if v_debit<=0 or v_credit<=0 or v_debit<>v_credit then
    return jsonb_build_object(
      'ok',false,
      'code','JOURNAL_NOT_BALANCED',
      'event_id',v_event.id,
      'debit',v_debit,
      'credit',v_credit,
      'difference',v_debit-v_credit
    );
  end if;

  v_journal_id := gen_random_uuid();
  v_journal_number := 'JV-'||to_char(v_event.event_date,'YYYYMMDD')||'-'||
    upper(substr(replace(v_event.id::text,'-',''),1,12));

  begin
    insert into public.be_journal_entries(
      id,
      journal_number,
      accounting_date,
      description,
      source_event_id,
      accounting_period_id,
      status,
      posted_by,
      posted_at,
      currency_code,
      metadata
    ) values (
      v_journal_id,
      v_journal_number,
      v_event.event_date,
      coalesce(v_event.description,v_event.event_type),
      v_event.id,
      v_period.id,
      'POSTED',
      auth.uid(),
      now(),
      v_event.currency_code,
      jsonb_build_object(
        'source_system',v_event.source_system,
        'source_table',v_event.source_table,
        'source_record_id',v_event.source_record_id,
        'accounting_version',v_event.accounting_version
      )
    );
  exception
    when unique_violation then
      select id,journal_number
      into v_journal_id,v_journal_number
      from public.be_journal_entries
      where source_event_id=v_event.id
      limit 1;

      if v_journal_id is not null then
        update public.be_accounting_events
        set review_status='POSTED',
            posted_journal_id=v_journal_id,
            updated_at=now()
        where id=v_event.id;

        return jsonb_build_object(
          'ok',true,
          'code','ALREADY_POSTED',
          'event_id',v_event.id,
          'journal_id',v_journal_id,
          'journal_number',v_journal_number
        );
      end if;
      raise;
  end;

  insert into public.be_journal_lines(
    journal_id,
    account_id,
    sequence_no,
    debit_amount,
    credit_amount,
    branch_code,
    merchant_id,
    rider_or_employee_id,
    source_reference,
    cost_center,
    description,
    metadata
  )
  select
    v_journal_id,
    l.account_id,
    l.sequence_no,
    l.debit_amount,
    l.credit_amount,
    l.branch_code,
    l.merchant_id,
    l.rider_or_employee_id,
    v_event.source_reference,
    l.cost_center,
    l.description,
    l.metadata
  from public.be_accounting_event_lines l
  where l.event_id=v_event.id
  order by l.sequence_no;

  update public.be_accounting_events
  set review_status='POSTED',
      posted_journal_id=v_journal_id,
      updated_at=now()
  where id=v_event.id;

  update public.be_accounting_source_links
  set journal_id=v_journal_id,
      updated_at=now()
  where event_id=v_event.id
    and journal_id is null;

  insert into public.audit_logs(
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    related_journal_id,
    metadata
  ) values (
    'be_accounting_events',
    v_event.id,
    'POST',
    jsonb_build_object('review_status',v_event.review_status,'posted_journal_id',v_event.posted_journal_id),
    jsonb_build_object('review_status','POSTED','posted_journal_id',v_journal_id,'journal_number',v_journal_number),
    auth.uid(),
    v_journal_id,
    jsonb_build_object('posting_function','be_accounting_post_event_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'code','POSTED',
    'event_id',v_event.id,
    'journal_id',v_journal_id,
    'journal_number',v_journal_number,
    'debit',v_debit,
    'credit',v_credit
  );
end;
$$;

revoke all on function public.be_accounting_post_event_v1(uuid) from public, anon, authenticated;
grant execute on function public.be_accounting_post_event_v1(uuid) to service_role;

comment on function public.be_accounting_post_event_v1(uuid) is
  'Atomically posts one approved accounting event into a balanced immutable journal. Initially service-role only; authenticated capability grants are added by the accounting RLS migration.';

commit;
