begin;

create unique index if not exists be_journal_entries_reversal_of_uq
on public.be_journal_entries(reversal_of_journal_id)
where reversal_of_journal_id is not null;

create or replace function public.be_accounting_write_audit_v1(
  p_table_name text,
  p_record_id uuid,
  p_action text,
  p_old_data jsonb,
  p_new_data jsonb,
  p_reason text default null,
  p_related_journal_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
begin
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
    reason,
    related_journal_id,
    metadata,
    "timestamp"
  ) values (
    auth.uid(),
    upper(coalesce(p_action,'ACCOUNTING')),
    coalesce(nullif(p_table_name,''),'ACCOUNTING'),
    p_record_id::text,
    'success',
    p_old_data,
    p_new_data,
    p_reason,
    now(),
    coalesce(nullif(p_table_name,''),'ACCOUNTING'),
    p_record_id,
    p_old_data,
    p_new_data,
    auth.uid(),
    p_reason,
    p_related_journal_id,
    coalesce(p_metadata,'{}'::jsonb),
    now()
  );
end;
$$;

revoke all on function public.be_accounting_write_audit_v1(text,uuid,text,jsonb,jsonb,text,uuid,jsonb)
from public, anon, authenticated;

create or replace function public.be_accounting_reverse_journal_v1(
  p_journal_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_original public.be_journal_entries%rowtype;
  v_period public.be_accounting_periods%rowtype;
  v_existing public.be_journal_entries%rowtype;
  v_reversal_id uuid := gen_random_uuid();
  v_reversal_number text;
  v_reversal_date date;
  v_line_count integer;
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED');
  end if;

  select *
  into v_original
  from public.be_journal_entries
  where id=p_journal_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','JOURNAL_NOT_FOUND','journal_id',p_journal_id);
  end if;

  if v_original.reversal_of_journal_id is not null then
    return jsonb_build_object('ok',false,'code','REVERSAL_OF_REVERSAL_NOT_ALLOWED','journal_id',p_journal_id);
  end if;

  select *
  into v_existing
  from public.be_journal_entries
  where reversal_of_journal_id=v_original.id
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',true,
      'code','ALREADY_REVERSED',
      'journal_id',v_existing.id,
      'journal_number',v_existing.journal_number,
      'reversal_of_journal_id',v_original.id
    );
  end if;

  select *
  into v_period
  from public.be_accounting_periods
  where id=v_original.accounting_period_id;

  if found and v_period.status='OPEN' then
    v_reversal_date := v_original.accounting_date;
  else
    select *
    into v_period
    from public.be_accounting_periods
    where current_date between period_start and period_end
      and status='OPEN'
    order by period_start desc
    limit 1;

    if not found then
      return jsonb_build_object(
        'ok',false,
        'code','REVERSAL_PERIOD_CLOSED',
        'journal_id',v_original.id,
        'message','Original period is closed and no current open accounting period is configured.'
      );
    end if;

    v_reversal_date := current_date;
  end if;

  select count(*)::integer
  into v_line_count
  from public.be_journal_lines
  where journal_id=v_original.id;

  if v_line_count=0 then
    return jsonb_build_object('ok',false,'code','ORIGINAL_JOURNAL_HAS_NO_LINES','journal_id',v_original.id);
  end if;

  v_reversal_number := 'REV-'||v_original.journal_number;

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
    reversal_of_journal_id,
    currency_code,
    metadata
  ) values (
    v_reversal_id,
    v_reversal_number,
    v_reversal_date,
    'Reversal: '||coalesce(v_original.description,v_original.journal_number),
    null,
    v_period.id,
    'POSTED',
    auth.uid(),
    now(),
    v_original.id,
    v_original.currency_code,
    jsonb_build_object(
      'reason',btrim(p_reason),
      'original_journal_id',v_original.id,
      'original_journal_number',v_original.journal_number
    )
  );

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
    v_reversal_id,
    account_id,
    sequence_no,
    credit_amount,
    debit_amount,
    branch_code,
    merchant_id,
    rider_or_employee_id,
    source_reference,
    cost_center,
    'Reversal: '||coalesce(description,''),
    coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reversal_of_line_id',id)
  from public.be_journal_lines
  where journal_id=v_original.id
  order by sequence_no;

  if v_original.source_event_id is not null then
    update public.be_accounting_events
    set review_status='REVERSED',
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'reversed_by_journal_id',v_reversal_id,
          'reversal_reason',btrim(p_reason),
          'reversed_at',now()
        )
    where id=v_original.source_event_id;
  end if;

  perform public.be_accounting_write_audit_v1(
    'be_journal_entries',
    v_original.id,
    'REVERSE',
    to_jsonb(v_original),
    jsonb_build_object(
      'original_journal_id',v_original.id,
      'reversal_journal_id',v_reversal_id,
      'reversal_journal_number',v_reversal_number
    ),
    btrim(p_reason),
    v_reversal_id,
    jsonb_build_object('function','be_accounting_reverse_journal_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'code','REVERSED',
    'journal_id',v_reversal_id,
    'journal_number',v_reversal_number,
    'reversal_of_journal_id',v_original.id,
    'accounting_date',v_reversal_date
  );
end;
$$;

create or replace function public.be_accounting_correct_source_v1(
  p_table_name text,
  p_record_id uuid,
  p_reason text,
  p_replacement jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_table text := lower(btrim(coalesce(p_table_name,'')));
  v_reason text := btrim(coalesce(p_reason,''));
  v_payload jsonb := coalesce(p_replacement,'{}'::jsonb);
  v_fin public.finance_daily_logs%rowtype;
  v_hr public.admin_assets_and_hr_logs%rowtype;
  v_new_id uuid;
  v_old_json jsonb;
  v_new_json jsonb;
  v_linked_journal uuid;
  v_reverse jsonb;
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if v_reason='' then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED');
  end if;

  if v_table='finance_daily_logs' then
    select * into v_fin
    from public.finance_daily_logs
    where id=p_record_id
    for update;

    if not found then
      return jsonb_build_object('ok',false,'code','SOURCE_NOT_FOUND','table_name',v_table,'record_id',p_record_id);
    end if;

    if v_fin.soft_deleted_at is not null then
      return jsonb_build_object('ok',false,'code','ALREADY_CORRECTED','record_id',v_fin.id);
    end if;

    v_old_json := to_jsonb(v_fin);

    if v_fin.accounting_event_id is not null then
      select posted_journal_id into v_linked_journal
      from public.be_accounting_events
      where id=v_fin.accounting_event_id;

      if v_linked_journal is not null then
        v_reverse := public.be_accounting_reverse_journal_v1(v_linked_journal,v_reason);
        if not coalesce((v_reverse->>'ok')::boolean,false) then
          return jsonb_build_object('ok',false,'code','REVERSAL_FAILED','reversal',v_reverse);
        end if;
      end if;
    end if;

    perform set_config('be.accounting_override','on',true);

    update public.finance_daily_logs
    set soft_deleted_at=now(),
        soft_deleted_by=auth.uid(),
        override_reason=v_reason
    where id=v_fin.id;

    insert into public.finance_daily_logs(
      entry_date,
      department_code,
      delivery_fees_collected,
      cod_handling_fees,
      surcharges,
      rider_commissions_accrued,
      fuel_and_tolls_spent,
      packaging_supplies_spent,
      petty_cash_expenses,
      cod_cash_collected_in_hand,
      accounts_receivable_invoiced,
      accounts_payable_incurred,
      source_mode,
      accounting_event_id,
      is_locked,
      created_by,
      version_no,
      metadata
    ) values (
      coalesce(nullif(v_payload->>'entry_date','')::date,v_fin.entry_date),
      coalesce(nullif(btrim(v_payload->>'department_code'),''),v_fin.department_code),
      coalesce(nullif(v_payload->>'delivery_fees_collected','')::numeric,v_fin.delivery_fees_collected),
      coalesce(nullif(v_payload->>'cod_handling_fees','')::numeric,v_fin.cod_handling_fees),
      coalesce(nullif(v_payload->>'surcharges','')::numeric,v_fin.surcharges),
      coalesce(nullif(v_payload->>'rider_commissions_accrued','')::numeric,v_fin.rider_commissions_accrued),
      coalesce(nullif(v_payload->>'fuel_and_tolls_spent','')::numeric,v_fin.fuel_and_tolls_spent),
      coalesce(nullif(v_payload->>'packaging_supplies_spent','')::numeric,v_fin.packaging_supplies_spent),
      coalesce(nullif(v_payload->>'petty_cash_expenses','')::numeric,v_fin.petty_cash_expenses),
      coalesce(nullif(v_payload->>'cod_cash_collected_in_hand','')::numeric,v_fin.cod_cash_collected_in_hand),
      coalesce(nullif(v_payload->>'accounts_receivable_invoiced','')::numeric,v_fin.accounts_receivable_invoiced),
      coalesce(nullif(v_payload->>'accounts_payable_incurred','')::numeric,v_fin.accounts_payable_incurred),
      'ADJUSTMENT',
      null,
      true,
      auth.uid(),
      v_fin.version_no+1,
      coalesce(v_fin.metadata,'{}'::jsonb)
        ||coalesce(v_payload->'metadata','{}'::jsonb)
        ||jsonb_build_object(
          'corrects_source_id',v_fin.id,
          'correction_reason',v_reason,
          'correction_at',now()
        )
    )
    returning id into v_new_id;

    perform set_config('be.accounting_override','off',true);

    select to_jsonb(t) into v_new_json
    from public.finance_daily_logs t
    where id=v_new_id;

  elsif v_table='admin_assets_and_hr_logs' then
    select * into v_hr
    from public.admin_assets_and_hr_logs
    where id=p_record_id
    for update;

    if not found then
      return jsonb_build_object('ok',false,'code','SOURCE_NOT_FOUND','table_name',v_table,'record_id',p_record_id);
    end if;

    if v_hr.soft_deleted_at is not null then
      return jsonb_build_object('ok',false,'code','ALREADY_CORRECTED','record_id',v_hr.id);
    end if;

    v_old_json := to_jsonb(v_hr);

    if v_hr.accounting_event_id is not null then
      select posted_journal_id into v_linked_journal
      from public.be_accounting_events
      where id=v_hr.accounting_event_id;

      if v_linked_journal is not null then
        v_reverse := public.be_accounting_reverse_journal_v1(v_linked_journal,v_reason);
        if not coalesce((v_reverse->>'ok')::boolean,false) then
          return jsonb_build_object('ok',false,'code','REVERSAL_FAILED','reversal',v_reverse);
        end if;
      end if;
    end if;

    perform set_config('be.accounting_override','on',true);

    update public.admin_assets_and_hr_logs
    set soft_deleted_at=now(),
        soft_deleted_by=auth.uid(),
        override_reason=v_reason
    where id=v_hr.id;

    insert into public.admin_assets_and_hr_logs(
      entry_date,
      department_code,
      asset_name,
      asset_category,
      acquisition_date,
      acquisition_cost,
      residual_value,
      useful_life_months,
      warehouse_overtime,
      base_payroll_accrual,
      facility_rent,
      utilities_admin_cost,
      source_mode,
      accounting_event_id,
      fixed_asset_id,
      is_locked,
      created_by,
      version_no,
      metadata
    ) values (
      coalesce(nullif(v_payload->>'entry_date','')::date,v_hr.entry_date),
      coalesce(nullif(btrim(v_payload->>'department_code'),''),v_hr.department_code),
      coalesce(nullif(v_payload->>'asset_name',''),v_hr.asset_name),
      coalesce(nullif(v_payload->>'asset_category',''),v_hr.asset_category),
      coalesce(nullif(v_payload->>'acquisition_date','')::date,v_hr.acquisition_date),
      coalesce(nullif(v_payload->>'acquisition_cost','')::numeric,v_hr.acquisition_cost),
      coalesce(nullif(v_payload->>'residual_value','')::numeric,v_hr.residual_value),
      coalesce(nullif(v_payload->>'useful_life_months','')::integer,v_hr.useful_life_months),
      coalesce(nullif(v_payload->>'warehouse_overtime','')::numeric,v_hr.warehouse_overtime),
      coalesce(nullif(v_payload->>'base_payroll_accrual','')::numeric,v_hr.base_payroll_accrual),
      coalesce(nullif(v_payload->>'facility_rent','')::numeric,v_hr.facility_rent),
      coalesce(nullif(v_payload->>'utilities_admin_cost','')::numeric,v_hr.utilities_admin_cost),
      'ADJUSTMENT',
      null,
      null,
      true,
      auth.uid(),
      v_hr.version_no+1,
      coalesce(v_hr.metadata,'{}'::jsonb)
        ||coalesce(v_payload->'metadata','{}'::jsonb)
        ||jsonb_build_object(
          'corrects_source_id',v_hr.id,
          'correction_reason',v_reason,
          'correction_at',now()
        )
    )
    returning id into v_new_id;

    perform set_config('be.accounting_override','off',true);

    select to_jsonb(t) into v_new_json
    from public.admin_assets_and_hr_logs t
    where id=v_new_id;
  else
    return jsonb_build_object(
      'ok',false,
      'code','UNSUPPORTED_SOURCE_TABLE',
      'table_name',v_table
    );
  end if;

  perform public.be_accounting_write_audit_v1(
    v_table,
    p_record_id,
    'UPDATE',
    v_old_json,
    v_new_json,
    v_reason,
    null,
    jsonb_build_object(
      'function','be_accounting_correct_source_v1',
      'replacement_id',v_new_id,
      'reversal',v_reverse
    )
  );

  return jsonb_build_object(
    'ok',true,
    'code','CORRECTED',
    'table_name',v_table,
    'original_id',p_record_id,
    'replacement_id',v_new_id,
    'reversal',v_reverse
  );
exception
  when others then
    perform set_config('be.accounting_override','off',true);
    raise;
end;
$$;

create or replace function public.be_accounting_post_depreciation_v1(
  p_period_end date
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_period_start date;
  v_period_end date;
  v_period_id uuid;
  v_asset public.be_fixed_asset_register%rowtype;
  v_dep_account uuid;
  v_accum_account uuid;
  v_prior numeric(18,2);
  v_base numeric(18,2);
  v_monthly numeric(18,2);
  v_remaining numeric(18,2);
  v_dep numeric(18,2);
  v_accum numeric(18,2);
  v_nbv numeric(18,2);
  v_event_id uuid;
  v_version text;
  v_fingerprint text;
  v_post jsonb;
  v_journal_id uuid;
  v_posted integer := 0;
  v_skipped integer := 0;
  v_total numeric(18,2) := 0;
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if p_period_end is null then
    return jsonb_build_object('ok',false,'code','PERIOD_REQUIRED');
  end if;

  v_period_start := date_trunc('month',p_period_end::timestamp)::date;
  v_period_end := (date_trunc('month',p_period_end::timestamp)+interval '1 month - 1 day')::date;

  select id into v_period_id
  from public.be_accounting_periods
  where v_period_end between period_start and period_end
    and status='OPEN'
  order by period_start desc
  limit 1;

  if v_period_id is null then
    return jsonb_build_object(
      'ok',false,
      'code','PERIOD_NOT_OPEN',
      'period_start',v_period_start,
      'period_end',v_period_end
    );
  end if;

  select id into v_dep_account
  from public.be_chart_of_accounts
  where account_code='6500' and is_active and is_postable;

  select id into v_accum_account
  from public.be_chart_of_accounts
  where account_code='1590' and is_active and is_postable;

  if v_dep_account is null or v_accum_account is null then
    return jsonb_build_object('ok',false,'code','DEPRECIATION_ACCOUNTS_NOT_CONFIGURED');
  end if;

  for v_asset in
    select *
    from public.be_fixed_asset_register
    where status in ('ACTIVE','FULLY_DEPRECIATED')
      and acquisition_date<=v_period_end
      and (disposed_at is null or disposed_at>=v_period_start)
    order by asset_code
    for update
  loop
    if exists (
      select 1
      from public.be_asset_depreciation_schedule
      where asset_id=v_asset.id
        and period_start=v_period_start
        and period_end=v_period_end
    ) then
      v_skipped := v_skipped+1;
      continue;
    end if;

    select coalesce(sum(depreciation_amount),0)
    into v_prior
    from public.be_asset_depreciation_schedule
    where asset_id=v_asset.id
      and status='POSTED'
      and period_end<v_period_start;

    v_base := greatest(v_asset.acquisition_cost-v_asset.residual_value,0);
    v_remaining := greatest(v_base-v_prior,0);

    if v_remaining<=0 then
      update public.be_fixed_asset_register
      set status='FULLY_DEPRECIATED',
          updated_at=now()
      where id=v_asset.id;
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_monthly := round(v_base/v_asset.useful_life_months,2);
    v_dep := least(v_monthly,v_remaining);
    v_accum := v_prior+v_dep;
    v_nbv := greatest(v_asset.acquisition_cost-v_accum,v_asset.residual_value);
    v_event_id := gen_random_uuid();
    v_version := 'STRAIGHT_LINE_V1:'||to_char(v_period_start,'YYYY-MM');
    v_fingerprint := encode(
      extensions.digest(
        concat_ws('|',
          v_asset.id::text,
          v_asset.acquisition_cost::text,
          v_asset.residual_value::text,
          v_asset.useful_life_months::text,
          v_period_start::text,
          v_period_end::text,
          v_dep::text
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.be_accounting_events(
      id,
      event_date,
      source_system,
      source_table,
      source_record_id,
      source_reference,
      event_type,
      accounting_version,
      description,
      currency_code,
      total_amount,
      review_status,
      source_snapshot,
      input_fingerprint,
      created_by,
      reviewed_by,
      reviewed_at,
      metadata
    ) values (
      v_event_id,
      v_period_end,
      'FIXED_ASSET',
      'be_fixed_asset_register',
      v_asset.id::text,
      v_asset.asset_code,
      'DEPRECIATION',
      v_version,
      'Monthly depreciation - '||v_asset.asset_name,
      'MMK',
      v_dep,
      'APPROVED',
      jsonb_build_object(
        'asset_id',v_asset.id,
        'asset_code',v_asset.asset_code,
        'acquisition_cost',v_asset.acquisition_cost,
        'residual_value',v_asset.residual_value,
        'useful_life_months',v_asset.useful_life_months,
        'period_start',v_period_start,
        'period_end',v_period_end
      ),
      v_fingerprint,
      auth.uid(),
      auth.uid(),
      now(),
      jsonb_build_object('depreciation_method','STRAIGHT_LINE')
    );

    insert into public.be_accounting_event_lines(
      event_id,account_id,sequence_no,debit_amount,credit_amount,branch_code,description
    ) values
      (v_event_id,v_dep_account,1,v_dep,0,v_asset.branch_code,'Depreciation expense - '||v_asset.asset_code),
      (v_event_id,v_accum_account,2,0,v_dep,v_asset.branch_code,'Accumulated depreciation - '||v_asset.asset_code);

    v_post := public.be_accounting_post_event_v1(v_event_id);

    if not coalesce((v_post->>'ok')::boolean,false) then
      raise exception 'DEPRECIATION_POST_FAILED: %',v_post;
    end if;

    v_journal_id := (v_post->>'journal_id')::uuid;

    insert into public.be_accounting_source_links(
      source_system,
      source_table,
      source_record_id,
      event_type,
      accounting_version,
      input_fingerprint,
      event_id,
      journal_id,
      source_updated_at,
      metadata
    ) values (
      'FIXED_ASSET',
      'be_fixed_asset_register',
      v_asset.id::text,
      'DEPRECIATION',
      v_version,
      v_fingerprint,
      v_event_id,
      v_journal_id,
      v_asset.updated_at,
      jsonb_build_object('period_start',v_period_start,'period_end',v_period_end)
    );

    insert into public.be_asset_depreciation_schedule(
      asset_id,
      period_start,
      period_end,
      depreciation_amount,
      accumulated_depreciation,
      net_book_value,
      journal_id,
      status,
      metadata
    ) values (
      v_asset.id,
      v_period_start,
      v_period_end,
      v_dep,
      v_accum,
      v_nbv,
      v_journal_id,
      'POSTED',
      jsonb_build_object('accounting_version',v_version)
    );

    if v_nbv<=v_asset.residual_value then
      update public.be_fixed_asset_register
      set status='FULLY_DEPRECIATED',
          updated_at=now()
      where id=v_asset.id;
    end if;

    v_posted := v_posted+1;
    v_total := v_total+v_dep;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'code','DEPRECIATION_POSTED',
    'period_start',v_period_start,
    'period_end',v_period_end,
    'posted_count',v_posted,
    'skipped_count',v_skipped,
    'total_depreciation',v_total
  );
end;
$$;

create or replace function public.be_accounting_close_period_v1(
  p_period_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_period public.be_accounting_periods%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_blockers integer;
  v_unbalanced integer;
begin
  if not public.be_accounting_can_v1('ledger_admin') then
    return jsonb_build_object('ok',false,'code','UNAUTHORIZED');
  end if;

  if nullif(btrim(coalesce(p_reason,'')),'') is null then
    return jsonb_build_object('ok',false,'code','REASON_REQUIRED');
  end if;

  select *
  into v_period
  from public.be_accounting_periods
  where id=p_period_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'code','PERIOD_NOT_FOUND','period_id',p_period_id);
  end if;

  if v_period.status='CLOSED' then
    return jsonb_build_object('ok',true,'code','ALREADY_CLOSED','period_id',v_period.id);
  end if;

  select count(*)::integer
  into v_blockers
  from public.be_accounting_events
  where event_date between v_period.period_start and v_period.period_end
    and review_status in ('DRAFT','REVIEW_PENDING','APPROVED','NEEDS_REVIEW','HELD','SYNC_FAILED');

  select count(*)::integer
  into v_unbalanced
  from (
    select j.id
    from public.be_journal_entries j
    left join public.be_journal_lines l on l.journal_id=j.id
    where j.accounting_period_id=v_period.id
      and j.status='POSTED'
    group by j.id
    having coalesce(sum(l.debit_amount),0)<=0
       or coalesce(sum(l.credit_amount),0)<=0
       or coalesce(sum(l.debit_amount),0)<>coalesce(sum(l.credit_amount),0)
  ) q;

  if v_blockers>0 or v_unbalanced>0 then
    return jsonb_build_object(
      'ok',false,
      'code','CLOSE_BLOCKED',
      'period_id',v_period.id,
      'unresolved_event_count',v_blockers,
      'unbalanced_journal_count',v_unbalanced
    );
  end if;

  v_before := to_jsonb(v_period);

  update public.be_accounting_periods
  set status='CLOSED',
      closed_by=auth.uid(),
      closed_at=now(),
      close_reason=btrim(p_reason),
      updated_at=now()
  where id=v_period.id;

  select to_jsonb(p) into v_after
  from public.be_accounting_periods p
  where id=v_period.id;

  perform public.be_accounting_write_audit_v1(
    'be_accounting_periods',
    v_period.id,
    'CLOSE_PERIOD',
    v_before,
    v_after,
    btrim(p_reason),
    null,
    jsonb_build_object('function','be_accounting_close_period_v1')
  );

  return jsonb_build_object(
    'ok',true,
    'code','CLOSED',
    'period_id',v_period.id,
    'period_code',v_period.period_code,
    'closed_at',(v_after->>'closed_at')
  );
end;
$$;

revoke all on function public.be_accounting_reverse_journal_v1(uuid,text) from public, anon;
revoke all on function public.be_accounting_correct_source_v1(text,uuid,text,jsonb) from public, anon;
revoke all on function public.be_accounting_post_depreciation_v1(date) from public, anon;
revoke all on function public.be_accounting_close_period_v1(uuid,text) from public, anon;

grant execute on function public.be_accounting_reverse_journal_v1(uuid,text) to authenticated, service_role;
grant execute on function public.be_accounting_correct_source_v1(text,uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.be_accounting_post_depreciation_v1(date) to authenticated, service_role;
grant execute on function public.be_accounting_close_period_v1(uuid,text) to authenticated, service_role;

comment on function public.be_accounting_reverse_journal_v1(uuid,text) is
  'Creates an immutable reversing journal; never edits or deletes the original posted journal.';
comment on function public.be_accounting_correct_source_v1(text,uuid,text,jsonb) is
  'Superadmin accounting correction workflow: reverse linked posted journal, soft-correct source, and create a locked replacement version.';
comment on function public.be_accounting_post_depreciation_v1(date) is
  'Posts idempotent monthly straight-line fixed-asset depreciation journals.';
comment on function public.be_accounting_close_period_v1(uuid,text) is
  'Closes an accounting period only when unresolved events and unbalanced journals are zero.';

commit;
