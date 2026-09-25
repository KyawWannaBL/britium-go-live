begin;

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



revoke all on function public.be_accounting_post_depreciation_v1(date) from public, anon;
grant execute on function public.be_accounting_post_depreciation_v1(date) to authenticated, service_role;

commit;
