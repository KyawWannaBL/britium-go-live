begin;

alter table public.audit_logs
  add column if not exists actor_id uuid null,
  add column if not exists actor_email text null,
  add column if not exists entity_type text,
  add column if not exists entity_id text null,
  add column if not exists status text default 'success',
  add column if not exists before_data jsonb null,
  add column if not exists after_data jsonb null,
  add column if not exists notes text null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists table_name text null,
  add column if not exists record_id uuid null,
  add column if not exists old_data jsonb null,
  add column if not exists new_data jsonb null,
  add column if not exists performed_by uuid null,
  add column if not exists reason text null,
  add column if not exists request_id text null,
  add column if not exists source_ip inet null,
  add column if not exists user_agent text null,
  add column if not exists related_journal_id uuid null,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists "timestamp" timestamptz default now();

update public.audit_logs
set entity_type=coalesce(nullif(entity_type,''),nullif(table_name,''),'ACCOUNTING')
where entity_type is null or btrim(entity_type)='';

update public.audit_logs
set table_name=coalesce(nullif(table_name,''),nullif(entity_type,''),'ACCOUNTING')
where table_name is null or btrim(table_name)='';

update public.audit_logs
set created_at=coalesce(created_at,"timestamp",now())
where created_at is null;

update public.audit_logs
set "timestamp"=coalesce("timestamp",created_at,now())
where "timestamp" is null;

alter table public.audit_logs
  alter column entity_type set default 'ACCOUNTING',
  alter column entity_type set not null,
  alter column status set default 'success',
  alter column created_at set default now(),
  alter column "timestamp" set default now(),
  alter column "timestamp" set not null,
  alter column metadata set default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='audit_logs_related_journal_id_fkey'
      and conrelid='public.audit_logs'::regclass
  ) then
    alter table public.audit_logs
      add constraint audit_logs_related_journal_id_fkey
      foreign key (related_journal_id)
      references public.be_journal_entries(id)
      on delete restrict;
  end if;
end $$;

create index if not exists audit_logs_record_idx on public.audit_logs(table_name,record_id,"timestamp" desc);
create index if not exists audit_logs_journal_idx on public.audit_logs(related_journal_id);

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
    actor_id,
    action,
    entity_type,
    entity_id,
    status,
    before_data,
    after_data,
    notes,
    created_at,
    table_name,
    record_id,
    old_data,
    new_data,
    performed_by,
    related_journal_id,
    metadata,
    "timestamp"
  ) values (
    auth.uid(),
    'POST',
    'be_accounting_events',
    v_event.id::text,
    'success',
    jsonb_build_object('review_status',v_event.review_status,'posted_journal_id',v_event.posted_journal_id),
    jsonb_build_object('review_status','POSTED','posted_journal_id',v_journal_id,'journal_number',v_journal_number),
    'Posted by be_accounting_post_event_v1',
    now(),
    'be_accounting_events',
    v_event.id,
    jsonb_build_object('review_status',v_event.review_status,'posted_journal_id',v_event.posted_journal_id),
    jsonb_build_object('review_status','POSTED','posted_journal_id',v_journal_id,'journal_number',v_journal_number),
    auth.uid(),
    v_journal_id,
    jsonb_build_object('posting_function','be_accounting_post_event_v1'),
    now()
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
  'Atomically posts one approved accounting event and writes both legacy Britium and ERP audit fields.';

commit;
