begin;

create or replace function public.be_accounting_sync_delivery_v1(
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
  v_way text;
  v_collection numeric(18,2);
  v_revenue numeric(18,2);
  v_merchant_payable numeric(18,2);
  v_merchant_receivable numeric(18,2);
  v_debits numeric(18,2);
  v_credits numeric(18,2);
  v_status text;
  v_fingerprint text;
  v_event_date date;
  v_source_updated_at timestamptz;
  v_clearing_account uuid;
  v_ar_account uuid;
  v_payable_account uuid;
  v_revenue_account uuid;
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
      'ok',true,
      'code','SOURCE_NOT_AVAILABLE',
      'source','be_v_finance_merchant_settlement_queue_v2',
      'scanned',0,
      'synced',0,
      'skipped',0,
      'needs_review',0
    );
  end if;

  select id into v_clearing_account
  from public.be_chart_of_accounts
  where account_code='1200' and is_active and is_postable;

  select id into v_ar_account
  from public.be_chart_of_accounts
  where account_code='1220' and is_active and is_postable;

  select id into v_payable_account
  from public.be_chart_of_accounts
  where account_code='2100' and is_active and is_postable;

  select id into v_revenue_account
  from public.be_chart_of_accounts
  where account_code='4000' and is_active and is_postable;

  if v_clearing_account is null or v_ar_account is null
     or v_payable_account is null or v_revenue_account is null then
    return jsonb_build_object('ok',false,'code','DELIVERY_ACCOUNTS_NOT_CONFIGURED');
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select distinct on (upper(btrim(delivery_way_id)))
        parcel_id,
        delivery_way_id,
        merchant_id,
        merchant_name,
        status,
        customer_total_collection,
        net_system_delivery_charge,
        merchant_final_settlement_amount,
        merchant_receivable,
        settlement_direction,
        validation_status,
        calculation_version,
        calculated_at,
        settlement_eligible,
        created_at
      from public.be_v_finance_merchant_settlement_queue_v2
      where coalesce(calculated_at,created_at)::date between $1 and $2
        and upper(coalesce(status,''))='DELIVERED'
        and upper(coalesce(validation_status,''))='OK'
        and coalesce(settlement_eligible,false)
        and nullif(btrim(delivery_way_id),'') is not null
      order by
        upper(btrim(delivery_way_id)),
        calculated_at desc nulls last,
        created_at desc nulls last,
        parcel_id desc
    ) q
    order by coalesce(q.calculated_at,q.created_at),q.delivery_way_id
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_way := upper(btrim(v_row->>'delivery_way_id'));
    v_collection := greatest(coalesce(nullif(v_row->>'customer_total_collection','')::numeric,0),0);
    v_revenue := greatest(coalesce(nullif(v_row->>'net_system_delivery_charge','')::numeric,0),0);
    v_merchant_payable := greatest(coalesce(nullif(v_row->>'merchant_final_settlement_amount','')::numeric,0),0);
    v_merchant_receivable := greatest(coalesce(nullif(v_row->>'merchant_receivable','')::numeric,0),0);
    v_debits := v_collection+v_merchant_receivable;
    v_credits := v_merchant_payable+v_revenue;
    v_event_date := coalesce(
      nullif(v_row->>'calculated_at','')::timestamptz,
      nullif(v_row->>'created_at','')::timestamptz,
      now()
    )::date;
    v_source_updated_at := coalesce(
      nullif(v_row->>'calculated_at','')::timestamptz,
      nullif(v_row->>'created_at','')::timestamptz
    );
    v_status := case
      when v_debits>0 and v_debits=v_credits then 'REVIEW_PENDING'
      else 'NEEDS_REVIEW'
    end;
    v_fingerprint := md5(
      jsonb_build_object(
        'delivery_way_id',v_way,
        'merchant_id',v_row->>'merchant_id',
        'customer_total_collection',v_collection,
        'net_system_delivery_charge',v_revenue,
        'merchant_final_settlement_amount',v_merchant_payable,
        'merchant_receivable',v_merchant_receivable,
        'settlement_direction',v_row->>'settlement_direction',
        'validation_status',v_row->>'validation_status',
        'calculation_version',v_row->>'calculation_version'
      )::text
    );

    v_upsert := public.be_accounting_upsert_event_v1(
      'CANONICAL_FINANCE',
      'be_v_finance_merchant_settlement_queue_v2',
      v_way,
      'DELIVERY_REVENUE_RECOGNIZED',
      coalesce(nullif(upper(btrim(v_row->>'calculation_version')),''),'CANONICAL_V4'),
      v_event_date,
      'Validated delivery economics - '||v_way,
      'MMK',
      greatest(v_debits,v_credits),
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_way),
      v_fingerprint,
      v_status,
      v_source_updated_at,
      jsonb_build_object(
        'adapter','be_accounting_sync_delivery_v1',
        'balance_debit',v_debits,
        'balance_credit',v_credits
      )
    );

    if not coalesce((v_upsert->>'ok')::boolean,false) then
      raise exception 'DELIVERY_EVENT_UPSERT_FAILED: %',v_upsert;
    end if;

    if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_event_id := (v_upsert->>'event_id')::uuid;

    delete from public.be_accounting_event_lines
    where event_id=v_event_id;

    if v_collection>0 then
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description
      ) values (
        v_event_id,v_clearing_account,10,v_collection,0,
        nullif(v_row->>'merchant_id',''),
        'Customer collection allocated to delivery economics - '||v_way
      );
    end if;

    if v_merchant_receivable>0 then
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description
      ) values (
        v_event_id,v_ar_account,20,v_merchant_receivable,0,
        nullif(v_row->>'merchant_id',''),
        'Merchant receivable generated by delivery economics - '||v_way
      );
    end if;

    if v_merchant_payable>0 then
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description
      ) values (
        v_event_id,v_payable_account,30,0,v_merchant_payable,
        nullif(v_row->>'merchant_id',''),
        'Merchant COD payable from validated delivery - '||v_way
      );
    end if;

    if v_revenue>0 then
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description
      ) values (
        v_event_id,v_revenue_account,40,0,v_revenue,
        nullif(v_row->>'merchant_id',''),
        'Britium delivery service revenue - '||v_way
      );
    end if;

    if v_status='NEEDS_REVIEW' then
      v_needs_review := v_needs_review+1;
    end if;

    v_synced := v_synced+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'code','DELIVERY_SYNC_COMPLETE',
    'scanned',v_scanned,
    'synced',v_synced,
    'skipped',v_skipped,
    'needs_review',v_needs_review
  );
end;
$$;

revoke all on function public.be_accounting_sync_delivery_v1(date,date)
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_delivery_v1(date,date)
to service_role;

comment on function public.be_accounting_sync_delivery_v1(date,date) is
  'Creates idempotent accounting review events from the canonical merchant settlement queue. Uses Way ID as economic identity and never recalculates parcel pricing.';

commit;
