begin;

create or replace function public.be_accounting_runtime_flag_v1(
  p_key text
)
returns boolean
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select coalesce((
    select boolean_value
    from public.be_accounting_runtime_config
    where config_key=upper(btrim(coalesce(p_key,'')))
    limit 1
  ),false)
$$;

revoke all on function public.be_accounting_runtime_flag_v1(text)
from public,anon,authenticated;
grant execute on function public.be_accounting_runtime_flag_v1(text)
to service_role;

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
  if not public.be_accounting_can_v1('journal_post') then
    return jsonb_build_object(
      'ok',false,
      'code','UNAUTHORIZED',
      'message','Your account is not authorized to post accounting journals.'
    );
  end if;

  if not public.be_accounting_runtime_flag_v1('GL_POSTING_ENABLED') then
    return jsonb_build_object(
      'ok',false,
      'code','POSTING_DISABLED',
      'message','General Ledger posting is disabled by the ERP rollout gate.'
    );
  end if;

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





create or replace function public.be_accounting_sync_run_v1(
  p_from date,
  p_to date,
  p_sources text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_sources text[];
  v_source text;
  v_result jsonb;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_status text;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if not public.be_accounting_runtime_flag_v1('ACCOUNTING_SYNC_ENABLED') then
    return jsonb_build_object(
      'ok',false,
      'code','SYNC_DISABLED',
      'message','Accounting synchronization is disabled by the ERP rollout gate.'
    );
  end if;

  v_sources := case
    when p_sources is null or cardinality(p_sources)=0 then
      array[
        'DELIVERY',
        'COD',
        'MERCHANT',
        'RIDER_COMMISSION',
        'MANUAL_FINANCE',
        'ADMIN_HR',
        'BRANCH_FINANCE'
      ]
    else p_sources
  end;

  insert into public.be_accounting_sync_runs(
    id,source_scope,period_from,period_to,status,started_by,metadata
  ) values (
    v_run_id,
    array_to_string(v_sources,','),
    p_from,
    p_to,
    'RUNNING',
    auth.uid(),
    jsonb_build_object('sources',to_jsonb(v_sources))
  );

  foreach v_source in array v_sources
  loop
    v_source := upper(btrim(coalesce(v_source,'')));

    begin
      case v_source
        when 'DELIVERY' then
          v_result := public.be_accounting_sync_delivery_v1(p_from,p_to);
        when 'COD' then
          v_result := public.be_accounting_sync_cod_v1(p_from,p_to);
        when 'MERCHANT' then
          v_result := public.be_accounting_sync_merchant_settlements_v1(p_from,p_to);
        when 'RIDER_COMMISSION' then
          v_result := public.be_accounting_sync_rider_commissions_v1(p_from,p_to);
        when 'MANUAL_FINANCE' then
          v_result := public.be_accounting_sync_manual_finance_v1(p_from,p_to);
        when 'ADMIN_HR' then
          v_result := public.be_accounting_sync_hr_assets_v1(p_from,p_to);
        when 'BRANCH_FINANCE' then
          v_result := public.be_accounting_sync_branch_finance_v1(p_from,p_to);
        else
          v_result := jsonb_build_object(
            'ok',false,
            'code','UNSUPPORTED_SOURCE',
            'source',v_source
          );
      end case;

      if coalesce((v_result->>'ok')::boolean,false) then
        v_scanned := v_scanned + coalesce((v_result->>'scanned')::integer,0);
        v_synced := v_synced + coalesce((v_result->>'synced')::integer,0);
        v_skipped := v_skipped
          + coalesce((v_result->>'skipped')::integer,0)
          + coalesce((v_result->>'held')::integer,0)
          + coalesce((v_result->>'needs_review')::integer,0);
      else
        v_failed := v_failed+1;
        insert into public.be_accounting_sync_errors(
          sync_run_id,source_system,source_table,error_code,error_message,source_snapshot
        ) values (
          v_run_id,
          'ACCOUNTING_SYNC',
          lower(v_source),
          coalesce(v_result->>'code','ADAPTER_FAILED'),
          coalesce(v_result->>'message',v_result::text),
          jsonb_build_object('source',v_source,'result',v_result)
        );
      end if;
    exception
      when others then
        v_failed := v_failed+1;
        insert into public.be_accounting_sync_errors(
          sync_run_id,source_system,source_table,error_code,error_message,source_snapshot
        ) values (
          v_run_id,
          'ACCOUNTING_SYNC',
          lower(v_source),
          sqlstate,
          sqlerrm,
          jsonb_build_object('source',v_source,'period_from',p_from,'period_to',p_to)
        );
    end;
  end loop;

  v_status := case when v_failed>0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end;

  update public.be_accounting_sync_runs
  set status=v_status,
      scanned_count=v_scanned,
      synced_count=v_synced,
      skipped_count=v_skipped,
      failed_count=v_failed,
      completed_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)
        || jsonb_build_object(
          'sources',to_jsonb(v_sources),
          'completed_status',v_status
        )
  where id=v_run_id;

  return jsonb_build_object(
    'ok',true,
    'code','SYNC_RUN_COMPLETE',
    'run_id',v_run_id,
    'status',v_status,
    'scanned',v_scanned,
    'synced',v_synced,
    'skipped',v_skipped,
    'failed',v_failed
  );
exception
  when others then
    update public.be_accounting_sync_runs
    set status='FAILED',
        failed_count=greatest(failed_count,1),
        completed_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object('fatal_error',sqlerrm,'sqlstate',sqlstate)
    where id=v_run_id;

    raise;
end;
$$;



revoke all on function public.be_accounting_post_event_v1(uuid)
from public,anon;
grant execute on function public.be_accounting_post_event_v1(uuid)
to authenticated,service_role;

revoke all on function public.be_accounting_sync_run_v1(date,date,text[])
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_run_v1(date,date,text[])
to service_role;

comment on function public.be_accounting_runtime_flag_v1(text) is
  'Internal database rollout-gate lookup. Missing flags fail closed.';
comment on function public.be_accounting_post_event_v1(uuid) is
  'Posts only approved balanced events when GL_POSTING_ENABLED is true.';
comment on function public.be_accounting_sync_run_v1(date,date,text[]) is
  'Runs accounting synchronization only when ACCOUNTING_SYNC_ENABLED is true.';

commit;
