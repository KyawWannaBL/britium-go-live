begin;

create or replace function public.be_accounting_sync_rider_commissions_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_row jsonb;
  v_upsert jsonb;
  v_event_id uuid;
  v_amount numeric(18,2);
  v_fingerprint text;
  v_expense uuid;
  v_payable uuid;
  v_bank uuid;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_skipped integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if to_regclass('public.commission_runs') is null
     or to_regclass('public.commission_items') is null then
    return jsonb_build_object(
      'ok',true,'code','SOURCE_NOT_AVAILABLE','source','commission_runs/commission_items',
      'scanned',0,'synced',0,'skipped',0
    );
  end if;

  select id into v_expense from public.be_chart_of_accounts
  where account_code='5000' and is_active and is_postable;
  select id into v_payable from public.be_chart_of_accounts
  where account_code='2200' and is_active and is_postable;
  select id into v_bank from public.be_chart_of_accounts
  where account_code='1100' and is_active and is_postable;

  if v_expense is null or v_payable is null or v_bank is null then
    return jsonb_build_object('ok',false,'code','RIDER_COMMISSION_ACCOUNTS_NOT_CONFIGURED');
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select
        ci.id,
        ci.commission_run_id,
        ci.wallet_account_id,
        ci.beneficiary_user_id,
        ci.beneficiary_name,
        ci.role_scope,
        ci.net_amount,
        ci.created_at,
        cr.run_code,
        cr.status as run_status,
        cr.approved_at,
        cr.period_start,
        cr.period_end
      from public.commission_items ci
      join public.commission_runs cr on cr.id=ci.commission_run_id
      where upper(coalesce(cr.status,'')) in ('APPROVED','POSTED','COMPLETED','SETTLED')
        and coalesce(cr.approved_at,ci.created_at)::date between $1 and $2
        and coalesce(ci.net_amount,0)>0
      order by coalesce(cr.approved_at,ci.created_at),ci.id
    ) q
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_amount := round(greatest(coalesce(nullif(v_row->>'net_amount','')::numeric,0),0),2);
    v_fingerprint := md5(jsonb_build_object(
      'item_id',v_row->>'id',
      'run_id',v_row->>'commission_run_id',
      'amount',v_amount,
      'run_status',v_row->>'run_status',
      'approved_at',v_row->>'approved_at'
    )::text);

    v_upsert := public.be_accounting_upsert_event_v1(
      'RIDER_COMMISSION',
      'commission_items',
      v_row->>'id',
      'RIDER_COMMISSION_ACCRUED',
      'RIDER_COMMISSION_V1',
      coalesce(
        nullif(v_row->>'approved_at','')::timestamptz,
        nullif(v_row->>'created_at','')::timestamptz,
        now()
      )::date,
      'Approved rider commission accrual - '||coalesce(v_row->>'beneficiary_name',v_row->>'id'),
      'MMK',
      v_amount,
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',coalesce(v_row->>'run_code',v_row->>'id')),
      v_fingerprint,
      'REVIEW_PENDING',
      coalesce(nullif(v_row->>'approved_at','')::timestamptz,nullif(v_row->>'created_at','')::timestamptz),
      jsonb_build_object('adapter','be_accounting_sync_rider_commissions_v1')
    );

    if not coalesce((v_upsert->>'ok')::boolean,false) then
      raise exception 'RIDER_COMMISSION_ACCRUAL_UPSERT_FAILED: %',v_upsert;
    end if;

    if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
      v_skipped := v_skipped+1;
    else
      v_event_id := (v_upsert->>'event_id')::uuid;
      delete from public.be_accounting_event_lines where event_id=v_event_id;
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,
        rider_or_employee_id,description,metadata
      ) values
        (
          v_event_id,v_expense,10,v_amount,0,
          nullif(v_row->>'beneficiary_user_id',''),
          'Rider commission expense',
          jsonb_build_object('commission_run_id',v_row->>'commission_run_id')
        ),
        (
          v_event_id,v_payable,20,0,v_amount,
          nullif(v_row->>'beneficiary_user_id',''),
          'Rider commission payable',
          jsonb_build_object('commission_run_id',v_row->>'commission_run_id')
        );
      v_synced := v_synced+1;
    end if;
  end loop;

  if to_regclass('public.wallet_transactions') is not null then
    for v_row in execute $query$
      select to_jsonb(q)
      from (
        select
          wt.id,
          wt.wallet_account_id,
          wt.user_id,
          coalesce(nullif(wt.txn_type,''),nullif(wt.transaction_type,'')) as txn_type,
          wt.direction,
          wt.amount,
          wt.status,
          wt.approval_status,
          wt.reference_no,
          wt.external_ref,
          wt.approved_at,
          wt.description,
          wt.metadata,
          wt.created_at
        from public.wallet_transactions wt
        where upper(coalesce(nullif(wt.txn_type,''),nullif(wt.transaction_type,''),'')) in
          ('COMMISSION_PAYMENT','COMMISSION_PAYOUT','RIDER_COMMISSION_PAYMENT')
          and upper(coalesce(wt.status,'')) in ('POSTED','PAID','COMPLETED','SETTLED')
          and upper(coalesce(wt.approval_status,'APPROVED'))='APPROVED'
          and coalesce(wt.approved_at,wt.created_at)::date between $1 and $2
          and coalesce(wt.amount,0)>0
        order by coalesce(wt.approved_at,wt.created_at),wt.id
      ) q
    $query$
    using p_from,p_to
    loop
      v_scanned := v_scanned+1;
      v_amount := round(greatest(coalesce(nullif(v_row->>'amount','')::numeric,0),0),2);
      v_fingerprint := md5(jsonb_build_object(
        'transaction_id',v_row->>'id',
        'wallet_account_id',v_row->>'wallet_account_id',
        'amount',v_amount,
        'status',v_row->>'status',
        'approval_status',v_row->>'approval_status',
        'approved_at',v_row->>'approved_at'
      )::text);

      v_upsert := public.be_accounting_upsert_event_v1(
        'RIDER_COMMISSION',
        'wallet_transactions',
        v_row->>'id',
        'RIDER_COMMISSION_PAID',
        'RIDER_COMMISSION_V1',
        coalesce(
          nullif(v_row->>'approved_at','')::timestamptz,
          nullif(v_row->>'created_at','')::timestamptz,
          now()
        )::date,
        'Rider commission payment - '||coalesce(v_row->>'reference_no',v_row->>'id'),
        'MMK',
        v_amount,
        coalesce(v_row,'{}'::jsonb)||jsonb_build_object(
          'source_reference',coalesce(nullif(v_row->>'reference_no',''),v_row->>'id')
        ),
        v_fingerprint,
        'REVIEW_PENDING',
        coalesce(nullif(v_row->>'approved_at','')::timestamptz,nullif(v_row->>'created_at','')::timestamptz),
        jsonb_build_object('adapter','be_accounting_sync_rider_commissions_v1')
      );

      if not coalesce((v_upsert->>'ok')::boolean,false) then
        raise exception 'RIDER_COMMISSION_PAYMENT_UPSERT_FAILED: %',v_upsert;
      end if;

      if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
        v_skipped := v_skipped+1;
      else
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,
          rider_or_employee_id,description,metadata
        ) values
          (
            v_event_id,v_payable,10,v_amount,0,
            nullif(v_row->>'user_id',''),
            'Clear rider commission payable',
            jsonb_build_object('wallet_account_id',v_row->>'wallet_account_id')
          ),
          (
            v_event_id,v_bank,20,0,v_amount,
            nullif(v_row->>'user_id',''),
            'Rider commission payment from bank/cash',
            jsonb_build_object('wallet_account_id',v_row->>'wallet_account_id')
          );
        v_synced := v_synced+1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'ok',true,
    'code','RIDER_COMMISSION_SYNC_COMPLETE',
    'scanned',v_scanned,
    'synced',v_synced,
    'skipped',v_skipped
  );
end;
$$;

create or replace function public.be_accounting_sync_manual_finance_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_row public.finance_daily_logs%rowtype;
  v_upsert jsonb;
  v_event_id uuid;
  v_amount numeric(18,2);
  v_fingerprint text;
  v_funding_code text;
  v_funding_account uuid;
  v_expense_account uuid;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_needs_review integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  for v_row in
    select *
    from public.finance_daily_logs
    where entry_date between p_from and p_to
      and soft_deleted_at is null
      and (
        fuel_and_tolls_spent>0
        or packaging_supplies_spent>0
        or petty_cash_expenses>0
      )
    order by entry_date,created_at,id
  loop
    v_scanned := v_scanned+1;
    v_funding_code := upper(btrim(coalesce(v_row.metadata->>'funding_account_code','')));

    if v_funding_code='' then
      v_needs_review := v_needs_review+1;
      continue;
    end if;

    select id into v_funding_account
    from public.be_chart_of_accounts
    where account_code=v_funding_code and is_active and is_postable;

    if v_funding_account is null then
      v_needs_review := v_needs_review+1;
      continue;
    end if;

    if v_row.fuel_and_tolls_spent>0 then
      select id into v_expense_account from public.be_chart_of_accounts
      where account_code='5100' and is_active and is_postable;
      v_amount := v_row.fuel_and_tolls_spent;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','fuel_and_tolls_spent','amount',v_amount,
        'funding_account_code',v_funding_code,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'FINANCE_MANUAL','finance_daily_logs',v_row.id::text,
        'FUEL_AND_TOLLS_EXPENSE','MANUAL_FINANCE_V1',v_row.entry_date,
        'Finance fuel and tolls - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_manual_finance_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata
        ) values
          (v_event_id,v_expense_account,10,v_amount,0,'Fuel and tolls expense',jsonb_build_object('submission_no',v_row.submission_no)),
          (v_event_id,v_funding_account,20,0,v_amount,'Funding source',jsonb_build_object('funding_account_code',v_funding_code));
        update public.finance_daily_logs set accounting_event_id=v_event_id
        where id=v_row.id and accounting_event_id is null;
        v_synced := v_synced+1;
      end if;
    end if;

    if v_row.packaging_supplies_spent>0 then
      select id into v_expense_account from public.be_chart_of_accounts
      where account_code='5200' and is_active and is_postable;
      v_amount := v_row.packaging_supplies_spent;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','packaging_supplies_spent','amount',v_amount,
        'funding_account_code',v_funding_code,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'FINANCE_MANUAL','finance_daily_logs',v_row.id::text,
        'PACKAGING_SUPPLIES_EXPENSE','MANUAL_FINANCE_V1',v_row.entry_date,
        'Finance packaging supplies - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_manual_finance_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata
        ) values
          (v_event_id,v_expense_account,10,v_amount,0,'Packaging supplies expense',jsonb_build_object('submission_no',v_row.submission_no)),
          (v_event_id,v_funding_account,20,0,v_amount,'Funding source',jsonb_build_object('funding_account_code',v_funding_code));
        v_synced := v_synced+1;
      end if;
    end if;

    if v_row.petty_cash_expenses>0 then
      select id into v_expense_account from public.be_chart_of_accounts
      where account_code='6600' and is_active and is_postable;
      v_amount := v_row.petty_cash_expenses;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','petty_cash_expenses','amount',v_amount,
        'funding_account_code',v_funding_code,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'FINANCE_MANUAL','finance_daily_logs',v_row.id::text,
        'PETTY_CASH_EXPENSE','MANUAL_FINANCE_V1',v_row.entry_date,
        'Finance petty cash expense - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_manual_finance_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata
        ) values
          (v_event_id,v_expense_account,10,v_amount,0,'Petty cash expense',jsonb_build_object('submission_no',v_row.submission_no)),
          (v_event_id,v_funding_account,20,0,v_amount,'Funding source',jsonb_build_object('funding_account_code',v_funding_code));
        v_synced := v_synced+1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'code','MANUAL_FINANCE_SYNC_COMPLETE',
    'scanned',v_scanned,'synced',v_synced,'needs_review',v_needs_review
  );
end;
$$;

create or replace function public.be_accounting_sync_hr_assets_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_row public.admin_assets_and_hr_logs%rowtype;
  v_upsert jsonb;
  v_event_id uuid;
  v_amount numeric(18,2);
  v_fingerprint text;
  v_funding_code text;
  v_funding_account uuid;
  v_debit_account uuid;
  v_payroll_payable uuid;
  v_accrual uuid;
  v_threshold numeric(18,2);
  v_asset_code text;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_needs_review integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  select id into v_payroll_payable from public.be_chart_of_accounts
  where account_code='2300' and is_active and is_postable;
  select id into v_accrual from public.be_chart_of_accounts
  where account_code='2400' and is_active and is_postable;

  for v_row in
    select *
    from public.admin_assets_and_hr_logs
    where entry_date between p_from and p_to
      and soft_deleted_at is null
    order by entry_date,created_at,id
  loop
    v_scanned := v_scanned+1;

    if v_row.base_payroll_accrual>0 then
      select id into v_debit_account from public.be_chart_of_accounts
      where account_code='6000' and is_active and is_postable;
      v_amount := v_row.base_payroll_accrual;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','base_payroll_accrual','amount',v_amount,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'ADMIN_HR','admin_assets_and_hr_logs',v_row.id::text,
        'PAYROLL_ACCRUED','ADMIN_HR_V1',v_row.entry_date,
        'Payroll accrual - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_hr_assets_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description
        ) values
          (v_event_id,v_debit_account,10,v_amount,0,'Payroll expense'),
          (v_event_id,v_payroll_payable,20,0,v_amount,'Payroll payable');
        v_synced := v_synced+1;
      end if;
    end if;

    if v_row.warehouse_overtime>0 then
      select id into v_debit_account from public.be_chart_of_accounts
      where account_code='6100' and is_active and is_postable;
      v_amount := v_row.warehouse_overtime;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','warehouse_overtime','amount',v_amount,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'ADMIN_HR','admin_assets_and_hr_logs',v_row.id::text,
        'WAREHOUSE_OVERTIME_ACCRUED','ADMIN_HR_V1',v_row.entry_date,
        'Warehouse overtime accrual - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_hr_assets_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description
        ) values
          (v_event_id,v_debit_account,10,v_amount,0,'Warehouse overtime expense'),
          (v_event_id,v_payroll_payable,20,0,v_amount,'Payroll payable');
        v_synced := v_synced+1;
      end if;
    end if;

    if v_row.facility_rent>0 then
      select id into v_debit_account from public.be_chart_of_accounts
      where account_code='6200' and is_active and is_postable;
      v_amount := v_row.facility_rent;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','facility_rent','amount',v_amount,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'ADMIN_HR','admin_assets_and_hr_logs',v_row.id::text,
        'FACILITY_RENT_ACCRUED','ADMIN_HR_V1',v_row.entry_date,
        'Facility rent accrual - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_hr_assets_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description
        ) values
          (v_event_id,v_debit_account,10,v_amount,0,'Rent expense'),
          (v_event_id,v_accrual,20,0,v_amount,'Accrued expense');
        v_synced := v_synced+1;
      end if;
    end if;

    if v_row.utilities_admin_cost>0 then
      select id into v_debit_account from public.be_chart_of_accounts
      where account_code='6300' and is_active and is_postable;
      v_amount := v_row.utilities_admin_cost;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,'field','utilities_admin_cost','amount',v_amount,'version_no',v_row.version_no
      )::text);
      v_upsert := public.be_accounting_upsert_event_v1(
        'ADMIN_HR','admin_assets_and_hr_logs',v_row.id::text,
        'UTILITIES_ADMIN_ACCRUED','ADMIN_HR_V1',v_row.entry_date,
        'Utilities/admin accrual - '||v_row.submission_no,'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object('adapter','be_accounting_sync_hr_assets_v1')
      );
      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description
        ) values
          (v_event_id,v_debit_account,10,v_amount,0,'Utilities/admin expense'),
          (v_event_id,v_accrual,20,0,v_amount,'Accrued expense');
        v_synced := v_synced+1;
      end if;
    end if;

    if v_row.acquisition_cost is not null and v_row.acquisition_cost>0 then
      v_funding_code := upper(btrim(coalesce(v_row.metadata->>'funding_account_code','')));
      v_threshold := coalesce(nullif(v_row.metadata->>'capitalization_threshold_mmk','')::numeric,500000);

      select id into v_funding_account
      from public.be_chart_of_accounts
      where account_code=v_funding_code and is_active and is_postable;

      if v_funding_account is null then
        v_needs_review := v_needs_review+1;
        continue;
      end if;

      if v_row.acquisition_cost>=v_threshold then
        v_asset_code := case
          when upper(coalesce(v_row.asset_category,'')) like '%FLEET%'
            or upper(coalesce(v_row.asset_category,'')) like '%VEHICLE%' then '1510'
          when upper(coalesce(v_row.asset_category,'')) like '%WAREHOUSE%'
            or upper(coalesce(v_row.asset_category,'')) like '%MACHIN%' then '1520'
          when upper(coalesce(v_row.asset_category,'')) like '%IT%'
            or upper(coalesce(v_row.asset_category,'')) like '%TECH%' then '1530'
          else '1540'
        end;
      else
        v_asset_code := '6700';
      end if;

      select id into v_debit_account
      from public.be_chart_of_accounts
      where account_code=v_asset_code and is_active and is_postable;

      v_amount := v_row.acquisition_cost;
      v_fingerprint := md5(jsonb_build_object(
        'source_id',v_row.id,
        'field','asset_acquisition',
        'amount',v_amount,
        'asset_category',v_row.asset_category,
        'capitalization_threshold',v_threshold,
        'debit_account_code',v_asset_code,
        'funding_account_code',v_funding_code,
        'version_no',v_row.version_no
      )::text);

      v_upsert := public.be_accounting_upsert_event_v1(
        'ADMIN_HR','admin_assets_and_hr_logs',v_row.id::text,
        case when v_asset_code='6700' then 'LOW_VALUE_ASSET_EXPENSED' else 'FIXED_ASSET_ACQUIRED' end,
        'ADMIN_HR_V1',coalesce(v_row.acquisition_date,v_row.entry_date),
        case when v_asset_code='6700' then
          'Low-value asset expensed - '||coalesce(v_row.asset_name,v_row.submission_no)
        else
          'Fixed asset acquired - '||coalesce(v_row.asset_name,v_row.submission_no)
        end,
        'MMK',v_amount,
        to_jsonb(v_row)||jsonb_build_object('source_reference',v_row.submission_no),
        v_fingerprint,'REVIEW_PENDING',v_row.created_at,
        jsonb_build_object(
          'adapter','be_accounting_sync_hr_assets_v1',
          'capitalization_threshold_mmk',v_threshold,
          'fixed_asset_id',v_row.fixed_asset_id
        )
      );

      if coalesce((v_upsert->>'ok')::boolean,false)
         and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,description,metadata
        ) values
          (
            v_event_id,v_debit_account,10,v_amount,0,
            case when v_asset_code='6700' then 'Low-value asset expense' else 'Fixed asset acquisition' end,
            jsonb_build_object('asset_category',v_row.asset_category,'fixed_asset_id',v_row.fixed_asset_id)
          ),
          (
            v_event_id,v_funding_account,20,0,v_amount,
            'Asset acquisition funding source',
            jsonb_build_object('funding_account_code',v_funding_code)
          );
        update public.admin_assets_and_hr_logs set accounting_event_id=v_event_id
        where id=v_row.id and accounting_event_id is null;
        v_synced := v_synced+1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'code','ADMIN_HR_SYNC_COMPLETE',
    'scanned',v_scanned,'synced',v_synced,'needs_review',v_needs_review
  );
end;
$$;

create or replace function public.be_accounting_sync_branch_finance_v1(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_row jsonb;
  v_event_type text;
  v_mapping public.be_accounting_mappings%rowtype;
  v_debit_account uuid;
  v_credit_account uuid;
  v_amount numeric(18,2);
  v_upsert jsonb;
  v_event_id uuid;
  v_fingerprint text;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_needs_review integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if to_regclass('public.branch_office_finance_entries') is null then
    return jsonb_build_object(
      'ok',true,'code','SOURCE_NOT_AVAILABLE','source','branch_office_finance_entries',
      'scanned',0,'synced',0,'needs_review',0
    );
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select
        e.id,
        e.branch_office_id,
        coalesce(nullif(b.branch_code,''),nullif(b.code,''),e.branch_office_id::text) as branch_code,
        e.entry_type,
        e.amount,
        e.entry_date,
        e.category,
        e.notes,
        e.related_transaction_id,
        e.created_at
      from public.branch_office_finance_entries e
      left join public.branch_offices b on b.id=e.branch_office_id
      where e.entry_date between $1 and $2
        and coalesce(e.amount,0)>0
      order by e.entry_date,e.created_at,e.id
    ) q
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_event_type := case
      when upper(coalesce(v_row->>'entry_type',''))='EXPENSE'
        then 'BRANCH_EXPENSE_'||regexp_replace(upper(coalesce(v_row->>'category','OTHER')),'[^A-Z0-9]+','_','g')
      else 'BRANCH_'||regexp_replace(upper(coalesce(v_row->>'entry_type','ENTRY')),'[^A-Z0-9]+','_','g')
    end;
    v_event_type := trim(both '_' from v_event_type);
    v_amount := round(greatest(coalesce(nullif(v_row->>'amount','')::numeric,0),0),2);

    select *
    into v_mapping
    from public.be_accounting_mappings m
    where m.event_type=v_event_type
      and m.is_active
      and (m.branch_code is null or upper(m.branch_code)=upper(v_row->>'branch_code'))
      and m.effective_from<=coalesce(nullif(v_row->>'entry_date','')::date,current_date)
      and (m.effective_to is null or m.effective_to>=coalesce(nullif(v_row->>'entry_date','')::date,current_date))
    order by
      (m.branch_code is not null) desc,
      m.effective_from desc,
      m.created_at desc
    limit 1;

    if not found then
      v_needs_review := v_needs_review+1;
      continue;
    end if;

    select id into v_debit_account from public.be_chart_of_accounts
    where account_code=v_mapping.debit_account_code and is_active and is_postable;
    select id into v_credit_account from public.be_chart_of_accounts
    where account_code=v_mapping.credit_account_code and is_active and is_postable;

    if v_debit_account is null or v_credit_account is null then
      v_needs_review := v_needs_review+1;
      continue;
    end if;

    v_fingerprint := md5(jsonb_build_object(
      'source_id',v_row->>'id',
      'event_type',v_event_type,
      'amount',v_amount,
      'branch_code',v_row->>'branch_code',
      'category',v_row->>'category',
      'mapping_id',v_mapping.id,
      'mapping_version',v_mapping.mapping_version
    )::text);

    v_upsert := public.be_accounting_upsert_event_v1(
      'BRANCH_FINANCE','branch_office_finance_entries',v_row->>'id',
      v_event_type,v_mapping.mapping_version,
      (v_row->>'entry_date')::date,
      coalesce(v_row->>'notes',v_event_type),'MMK',v_amount,
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_row->>'id'),
      v_fingerprint,'REVIEW_PENDING',
      nullif(v_row->>'created_at','')::timestamptz,
      jsonb_build_object(
        'adapter','be_accounting_sync_branch_finance_v1',
        'mapping_id',v_mapping.id
      )
    );

    if coalesce((v_upsert->>'ok')::boolean,false)
       and coalesce(v_upsert->>'code','')<>'SOURCE_CHANGED_AFTER_POSTING' then
      v_event_id := (v_upsert->>'event_id')::uuid;
      delete from public.be_accounting_event_lines where event_id=v_event_id;
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,
        branch_code,description,metadata
      ) values
        (
          v_event_id,v_debit_account,10,v_amount,0,v_row->>'branch_code',
          coalesce(v_row->>'notes',v_event_type),
          jsonb_build_object('mapping_id',v_mapping.id,'account_code',v_mapping.debit_account_code)
        ),
        (
          v_event_id,v_credit_account,20,0,v_amount,v_row->>'branch_code',
          'Branch finance offset',
          jsonb_build_object('mapping_id',v_mapping.id,'account_code',v_mapping.credit_account_code)
        );
      v_synced := v_synced+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'code','BRANCH_FINANCE_SYNC_COMPLETE',
    'scanned',v_scanned,'synced',v_synced,'needs_review',v_needs_review
  );
end;
$$;

revoke all on function public.be_accounting_sync_rider_commissions_v1(date,date)
from public,anon,authenticated;
revoke all on function public.be_accounting_sync_manual_finance_v1(date,date)
from public,anon,authenticated;
revoke all on function public.be_accounting_sync_hr_assets_v1(date,date)
from public,anon,authenticated;
revoke all on function public.be_accounting_sync_branch_finance_v1(date,date)
from public,anon,authenticated;

grant execute on function public.be_accounting_sync_rider_commissions_v1(date,date) to service_role;
grant execute on function public.be_accounting_sync_manual_finance_v1(date,date) to service_role;
grant execute on function public.be_accounting_sync_hr_assets_v1(date,date) to service_role;
grant execute on function public.be_accounting_sync_branch_finance_v1(date,date) to service_role;

comment on function public.be_accounting_sync_rider_commissions_v1(date,date) is
  'Converts approved rider commission accruals and approved commission payouts into accounting review events.';
comment on function public.be_accounting_sync_manual_finance_v1(date,date) is
  'Converts manual Finance source documents into categorized accounting review events; funding account must be explicit.';
comment on function public.be_accounting_sync_hr_assets_v1(date,date) is
  'Converts Admin/HR payroll, overtime, overhead and asset source documents into accounting review events.';
comment on function public.be_accounting_sync_branch_finance_v1(date,date) is
  'Converts branch finance entries through versioned account mappings into accounting review events.';

commit;
