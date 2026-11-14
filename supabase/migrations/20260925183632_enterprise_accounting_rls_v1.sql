begin;

create or replace function public.be_accounting_current_role_v1()
returns text
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := '';
begin
  if auth.role()='service_role' then
    return 'service_role';
  end if;

  if v_uid is null then
    if session_user in ('postgres','supabase_admin') then
      return 'database_admin';
    end if;
    return '';
  end if;

  if to_regclass('public.be_user_account_registry') is not null then
    execute $q$
      select lower(replace(coalesce(role::text,''),'-','_'))
      from public.be_user_account_registry
      where auth_user_id=$1
        and coalesce(active,false)
      limit 1
    $q$
    into v_role
    using v_uid;
  end if;

  if nullif(v_role,'') is not null then
    return v_role;
  end if;

  if to_regprocedure('public.be_current_user_role()') is not null then
    execute $q$
      select lower(replace(coalesce(public.be_current_user_role()::text,''),'-','_'))
    $q$ into v_role;
  elsif to_regprocedure('public.be_current_role()') is not null then
    execute $q$
      select lower(replace(coalesce(public.be_current_role()::text,''),'-','_'))
    $q$ into v_role;
  end if;

  return coalesce(v_role,'');
end;
$$;

create or replace function public.be_accounting_can_v1(p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_role text := public.be_accounting_current_role_v1();
  v_cap text := lower(btrim(coalesce(p_capability,'')));
  v_is_super boolean := v_role in ('super_admin','superadmin','app_owner','sys','database_admin','service_role');
  v_is_finance boolean := v_role in ('finance','finance_user','accountant','finance_admin','finance_manager','finm','bil','ar');
  v_is_admin_hr boolean := v_role in ('admin','hr','admin_hr_user','administrator');
begin
  if v_is_super then
    return true;
  end if;

  return case v_cap
    when 'finance_entry' then v_is_finance
    when 'finance_review' then v_is_finance
    when 'journal_post' then v_is_finance
    when 'asset_entry' then v_is_admin_hr
    when 'period_close' then false
    when 'ledger_admin' then false
    else false
  end;
end;
$$;

revoke all on function public.be_accounting_current_role_v1() from public, anon;
revoke all on function public.be_accounting_can_v1(text) from public, anon;
grant execute on function public.be_accounting_current_role_v1() to authenticated, service_role;
grant execute on function public.be_accounting_can_v1(text) to authenticated, service_role;

create or replace function public.be_force_locked_submission_v1()
returns trigger
language plpgsql
set search_path=public,auth,pg_temp
as $$
begin
  new.is_locked := true;
  new.submitted_at := coalesce(new.submitted_at, now());
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

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



revoke all on function public.be_accounting_post_event_v1(uuid) from public, anon;
grant execute on function public.be_accounting_post_event_v1(uuid) to authenticated, service_role;

revoke all on public.be_chart_of_accounts from anon, authenticated;
revoke all on public.be_accounting_periods from anon, authenticated;
revoke all on public.be_accounting_events from anon, authenticated;
revoke all on public.be_accounting_event_lines from anon, authenticated;
revoke all on public.be_journal_entries from anon, authenticated;
revoke all on public.be_journal_lines from anon, authenticated;
revoke all on public.be_accounting_source_links from anon, authenticated;
revoke all on public.be_fixed_asset_register from anon, authenticated;
revoke all on public.be_asset_depreciation_schedule from anon, authenticated;
revoke all on public.be_financial_report_snapshots from anon, authenticated;
revoke all on public.finance_daily_logs from anon, authenticated;
revoke all on public.admin_assets_and_hr_logs from anon, authenticated;

grant select on public.be_chart_of_accounts to authenticated;
grant select on public.be_accounting_periods to authenticated;
grant select on public.be_accounting_events to authenticated;
grant select on public.be_accounting_event_lines to authenticated;
grant select on public.be_journal_entries to authenticated;
grant select on public.be_journal_lines to authenticated;
grant select on public.be_accounting_source_links to authenticated;
grant select on public.be_fixed_asset_register to authenticated;
grant select on public.be_asset_depreciation_schedule to authenticated;
grant select on public.be_financial_report_snapshots to authenticated;
grant select,insert on public.finance_daily_logs to authenticated;
grant select,insert on public.admin_assets_and_hr_logs to authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists be_coa_select_v1 on public.be_chart_of_accounts;
create policy be_coa_select_v1 on public.be_chart_of_accounts
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('asset_entry')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_accounting_periods_select_v1 on public.be_accounting_periods;
create policy be_accounting_periods_select_v1 on public.be_accounting_periods
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_accounting_events_select_v1 on public.be_accounting_events;
create policy be_accounting_events_select_v1 on public.be_accounting_events
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_accounting_event_lines_select_v1 on public.be_accounting_event_lines;
create policy be_accounting_event_lines_select_v1 on public.be_accounting_event_lines
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_journal_entries_select_v1 on public.be_journal_entries;
create policy be_journal_entries_select_v1 on public.be_journal_entries
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_journal_lines_select_v1 on public.be_journal_lines;
create policy be_journal_lines_select_v1 on public.be_journal_lines
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_accounting_source_links_select_v1 on public.be_accounting_source_links;
create policy be_accounting_source_links_select_v1 on public.be_accounting_source_links
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_fixed_asset_register_select_v1 on public.be_fixed_asset_register;
create policy be_fixed_asset_register_select_v1 on public.be_fixed_asset_register
for select to authenticated
using (
  public.be_accounting_can_v1('asset_entry')
  or public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_asset_depreciation_select_v1 on public.be_asset_depreciation_schedule;
create policy be_asset_depreciation_select_v1 on public.be_asset_depreciation_schedule
for select to authenticated
using (
  public.be_accounting_can_v1('asset_entry')
  or public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists be_financial_report_snapshots_select_v1 on public.be_financial_report_snapshots;
create policy be_financial_report_snapshots_select_v1 on public.be_financial_report_snapshots
for select to authenticated
using (
  public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists finance_daily_logs_select_v1 on public.finance_daily_logs;
create policy finance_daily_logs_select_v1 on public.finance_daily_logs
for select to authenticated
using (
  public.be_accounting_can_v1('finance_entry')
  or public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists finance_daily_logs_insert_v1 on public.finance_daily_logs;
create policy finance_daily_logs_insert_v1 on public.finance_daily_logs
for insert to authenticated
with check (
  public.be_accounting_can_v1('finance_entry')
  and created_by=auth.uid()
);

drop policy if exists admin_assets_and_hr_logs_select_v1 on public.admin_assets_and_hr_logs;
create policy admin_assets_and_hr_logs_select_v1 on public.admin_assets_and_hr_logs
for select to authenticated
using (
  public.be_accounting_can_v1('asset_entry')
  or public.be_accounting_can_v1('finance_review')
  or public.be_accounting_can_v1('ledger_admin')
);

drop policy if exists admin_assets_and_hr_logs_insert_v1 on public.admin_assets_and_hr_logs;
create policy admin_assets_and_hr_logs_insert_v1 on public.admin_assets_and_hr_logs
for insert to authenticated
with check (
  public.be_accounting_can_v1('asset_entry')
  and created_by=auth.uid()
);

drop policy if exists be_accounting_audit_select_v1 on public.audit_logs;
create policy be_accounting_audit_select_v1 on public.audit_logs
for select to authenticated
using (
  public.be_accounting_can_v1('ledger_admin')
  or (
    public.be_accounting_can_v1('finance_review')
    and coalesce(table_name,entity_type,'') in (
      'be_accounting_events',
      'be_journal_entries',
      'be_journal_lines',
      'finance_daily_logs',
      'admin_assets_and_hr_logs',
      'be_fixed_asset_register',
      'be_accounting_periods'
    )
  )
);

comment on function public.be_accounting_can_v1(text) is
  'Server-side accounting capability resolver. Uses Britium account registry/server role helpers; never user_metadata.';

commit;
