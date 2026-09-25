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
      with tx as (
        select to_jsonb(wt) as j
        from public.wallet_transactions wt
      ),
      normalized as (
        select jsonb_build_object(
          'id',j->>'id',
          'wallet_account_id',j->>'wallet_account_id',
          'user_id',coalesce(
            nullif(j->>'user_id',''),
            nullif(wa_j->>'owner_user_id','')
          ),
          'txn_type',coalesce(
            nullif(j->>'txn_type',''),
            nullif(j->>'transaction_type','')
          ),
          'direction',j->>'direction',
          'amount',j->>'amount',
          'status',j->>'status',
          'approval_status',j->>'approval_status',
          'reference_no',j->>'reference_no',
          'external_ref',j->>'external_ref',
          'approved_at',j->>'approved_at',
          'description',j->>'description',
          'metadata',coalesce(j->'metadata','{}'::jsonb),
          'created_at',j->>'created_at'
        ) as row_json
        from tx
        left join public.wallet_accounts wa
          on wa.id=nullif(tx.j->>'wallet_account_id','')::uuid
        cross join lateral to_jsonb(wa) wa_j
      )
      select row_json
      from normalized
      where upper(coalesce(nullif(row_json->>'txn_type',''),'')) in
        ('COMMISSION_PAYMENT','COMMISSION_PAYOUT','RIDER_COMMISSION_PAYMENT')
        and upper(coalesce(row_json->>'status','')) in ('POSTED','PAID','COMPLETED','SETTLED')
        and upper(coalesce(nullif(row_json->>'approval_status',''),'APPROVED'))='APPROVED'
        and coalesce(
          nullif(row_json->>'approved_at','')::timestamptz,
          nullif(row_json->>'created_at','')::timestamptz
        )::date between $1 and $2
        and coalesce(nullif(row_json->>'amount','')::numeric,0)>0
      order by coalesce(
        nullif(row_json->>'approved_at','')::timestamptz,
        nullif(row_json->>'created_at','')::timestamptz
      ),row_json->>'id'
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



revoke all on function public.be_accounting_sync_rider_commissions_v1(date,date)
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_rider_commissions_v1(date,date) to service_role;

commit;
