begin;

create or replace function public.be_accounting_sync_merchant_settlements_v1(
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
  v_way text;
  v_payable numeric(18,2);
  v_receivable numeric(18,2);
  v_event_type text;
  v_amount numeric(18,2);
  v_fingerprint text;
  v_upsert jsonb;
  v_event_id uuid;
  v_bank uuid;
  v_payable_account uuid;
  v_ar_account uuid;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_skipped integer := 0;
  v_needs_review integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if to_regclass('public.be_v_finance_merchant_settlement_queue_v2') is null then
    return jsonb_build_object(
      'ok',true,'code','SOURCE_NOT_AVAILABLE',
      'source','be_v_finance_merchant_settlement_queue_v2',
      'scanned',0,'synced',0,'skipped',0,'needs_review',0
    );
  end if;

  select id into v_bank
  from public.be_chart_of_accounts
  where account_code='1100' and is_active and is_postable;

  select id into v_payable_account
  from public.be_chart_of_accounts
  where account_code='2100' and is_active and is_postable;

  select id into v_ar_account
  from public.be_chart_of_accounts
  where account_code='1220' and is_active and is_postable;

  if v_bank is null or v_payable_account is null or v_ar_account is null then
    return jsonb_build_object('ok',false,'code','MERCHANT_SETTLEMENT_ACCOUNTS_NOT_CONFIGURED');
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select distinct on (upper(btrim(delivery_way_id)))
        parcel_id,
        delivery_way_id,
        merchant_id,
        merchant_name,
        merchant_final_settlement_amount,
        merchant_receivable,
        settlement_direction,
        validation_status,
        calculation_version,
        financial_settled_at,
        financial_settlement_batch_id,
        calculated_at,
        created_at
      from public.be_v_finance_merchant_settlement_queue_v2
      where financial_settled_at is not null
        and financial_settled_at::date between $1 and $2
        and upper(coalesce(validation_status,''))='OK'
        and nullif(btrim(delivery_way_id),'') is not null
      order by
        upper(btrim(delivery_way_id)),
        financial_settled_at desc,
        calculated_at desc nulls last,
        created_at desc nulls last,
        parcel_id desc
    ) q
    order by q.financial_settled_at,q.delivery_way_id
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_way := upper(btrim(v_row->>'delivery_way_id'));
    v_payable := greatest(coalesce(nullif(v_row->>'merchant_final_settlement_amount','')::numeric,0),0);
    v_receivable := greatest(
      coalesce(
        nullif(v_row->>'merchant_receivable','')::numeric,
        case
          when coalesce(nullif(v_row->>'merchant_final_settlement_amount','')::numeric,0)<0
            then -nullif(v_row->>'merchant_final_settlement_amount','')::numeric
          else 0
        end,
        0
      ),
      0
    );

    if v_payable>0 and v_receivable=0 then
      v_event_type := 'MERCHANT_PAYABLE_SETTLED';
      v_amount := v_payable;
    elsif v_receivable>0 and v_payable=0 then
      v_event_type := 'MERCHANT_RECEIVABLE_SETTLED';
      v_amount := v_receivable;
    else
      v_needs_review := v_needs_review+1;
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_fingerprint := md5(
      jsonb_build_object(
        'delivery_way_id',v_way,
        'merchant_id',v_row->>'merchant_id',
        'event_type',v_event_type,
        'amount',v_amount,
        'settlement_direction',v_row->>'settlement_direction',
        'financial_settled_at',v_row->>'financial_settled_at',
        'financial_settlement_batch_id',v_row->>'financial_settlement_batch_id',
        'calculation_version',v_row->>'calculation_version'
      )::text
    );

    v_upsert := public.be_accounting_upsert_event_v1(
      'MERCHANT_SETTLEMENT',
      'be_v_finance_merchant_settlement_queue_v2',
      v_way,
      v_event_type,
      coalesce(nullif(upper(btrim(v_row->>'calculation_version')),''),'CANONICAL_V4'),
      (v_row->>'financial_settled_at')::timestamptz::date,
      case v_event_type
        when 'MERCHANT_PAYABLE_SETTLED' then 'Merchant payable settled - '||v_way
        else 'Merchant receivable settled - '||v_way
      end,
      'MMK',
      v_amount,
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_way),
      v_fingerprint,
      'REVIEW_PENDING',
      (v_row->>'financial_settled_at')::timestamptz,
      jsonb_build_object(
        'adapter','be_accounting_sync_merchant_settlements_v1',
        'settlement_direction',v_row->>'settlement_direction',
        'financial_settlement_batch_id',v_row->>'financial_settlement_batch_id'
      )
    );

    if not coalesce((v_upsert->>'ok')::boolean,false) then
      raise exception 'MERCHANT_SETTLEMENT_UPSERT_FAILED: %',v_upsert;
    end if;

    if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_event_id := (v_upsert->>'event_id')::uuid;
    delete from public.be_accounting_event_lines where event_id=v_event_id;

    if v_event_type='MERCHANT_PAYABLE_SETTLED' then
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
      ) values
        (
          v_event_id,v_payable_account,10,v_amount,0,
          nullif(v_row->>'merchant_id',''),
          'Clear Merchant COD Payable - '||v_way,
          jsonb_build_object('source_reference',v_way)
        ),
        (
          v_event_id,v_bank,20,0,v_amount,
          nullif(v_row->>'merchant_id',''),
          'Merchant settlement payment - '||v_way,
          jsonb_build_object('source_reference',v_way)
        );
    else
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
      ) values
        (
          v_event_id,v_bank,10,v_amount,0,
          nullif(v_row->>'merchant_id',''),
          'Merchant receivable collection - '||v_way,
          jsonb_build_object('source_reference',v_way)
        ),
        (
          v_event_id,v_ar_account,20,0,v_amount,
          nullif(v_row->>'merchant_id',''),
          'Clear Merchant Accounts Receivable - '||v_way,
          jsonb_build_object('source_reference',v_way)
        );
    end if;

    v_synced := v_synced+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'code','MERCHANT_SETTLEMENT_SYNC_COMPLETE',
    'scanned',v_scanned,
    'synced',v_synced,
    'skipped',v_skipped,
    'needs_review',v_needs_review
  );
end;
$$;

revoke all on function public.be_accounting_sync_merchant_settlements_v1(date,date)
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_merchant_settlements_v1(date,date)
to service_role;

comment on function public.be_accounting_sync_merchant_settlements_v1(date,date) is
  'Creates balance-sheet-only merchant payable or merchant receivable settlement review events from canonical Finance settlement state; never creates revenue or expense.';

commit;
