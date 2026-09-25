begin;

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
        perform set_config('be.accounting_override','on',true);
        update public.finance_daily_logs
        set accounting_event_id=v_event_id
        where id=v_row.id and accounting_event_id is null;
        perform set_config('be.accounting_override','off',true);
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
        perform set_config('be.accounting_override','on',true);
        update public.admin_assets_and_hr_logs
        set accounting_event_id=v_event_id
        where id=v_row.id and accounting_event_id is null;
        perform set_config('be.accounting_override','off',true);
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




revoke all on function public.be_accounting_sync_manual_finance_v1(date,date)
from public,anon,authenticated;
revoke all on function public.be_accounting_sync_hr_assets_v1(date,date)
from public,anon,authenticated;

grant execute on function public.be_accounting_sync_manual_finance_v1(date,date) to service_role;
grant execute on function public.be_accounting_sync_hr_assets_v1(date,date) to service_role;

commit;
