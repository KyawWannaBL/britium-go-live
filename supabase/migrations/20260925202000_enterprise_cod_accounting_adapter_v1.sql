begin;

create or replace function public.be_accounting_sync_cod_v1(
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
  v_status text;
  v_collect_status text;
  v_collection numeric(18,2);
  v_remittance numeric(18,2);
  v_collect_date date;
  v_remit_date date;
  v_updated_at timestamptz;
  v_fingerprint text;
  v_upsert jsonb;
  v_event_id uuid;
  v_rider_receivable uuid;
  v_clearing uuid;
  v_bank uuid;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_held integer := 0;
  v_skipped integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if to_regclass('public.be_finance_cod_settlements_v48') is null then
    return jsonb_build_object(
      'ok',true,'code','SOURCE_NOT_AVAILABLE',
      'source','be_finance_cod_settlements_v48',
      'scanned',0,'synced',0,'held',0,'skipped',0
    );
  end if;

  select id into v_rider_receivable
  from public.be_chart_of_accounts
  where account_code='1210' and is_active and is_postable;

  select id into v_clearing
  from public.be_chart_of_accounts
  where account_code='1200' and is_active and is_postable;

  select id into v_bank
  from public.be_chart_of_accounts
  where account_code='1100' and is_active and is_postable;

  if v_rider_receivable is null or v_clearing is null or v_bank is null then
    return jsonb_build_object('ok',false,'code','COD_ACCOUNTS_NOT_CONFIGURED');
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select
        delivery_way_id,
        wayplan_id,
        rider_code,
        rider_name,
        expected_cod,
        reported_collected,
        rider_remittance,
        settled_amount,
        settlement_status,
        variance_type,
        variance_amount,
        remittance_reference,
        remitted_at,
        hold_code,
        hold_note,
        held_at,
        settlement_reference,
        settled_at,
        delivered_at,
        created_at,
        updated_at,
        metadata
      from public.be_finance_cod_settlements_v48
      where coalesce(delivered_at,settled_at,remitted_at,updated_at,created_at)::date between $1 and $2
        and nullif(btrim(delivery_way_id),'') is not null
      order by coalesce(delivered_at,settled_at,remitted_at,updated_at,created_at),delivery_way_id
    ) q
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_way := upper(btrim(v_row->>'delivery_way_id'));
    v_status := upper(btrim(coalesce(v_row->>'settlement_status','')));
    v_collection := greatest(
      coalesce(
        nullif(v_row->>'reported_collected','')::numeric,
        nullif(v_row->>'expected_cod','')::numeric,
        0
      ),
      0
    );
    v_updated_at := coalesce(
      nullif(v_row->>'updated_at','')::timestamptz,
      nullif(v_row->>'settled_at','')::timestamptz,
      nullif(v_row->>'delivered_at','')::timestamptz,
      nullif(v_row->>'created_at','')::timestamptz
    );
    v_collect_date := coalesce(
      nullif(v_row->>'delivered_at','')::timestamptz,
      nullif(v_row->>'created_at','')::timestamptz,
      v_updated_at,
      now()
    )::date;
    v_collect_status := case
      when v_status='HOLD_EXCEPTION' then 'HELD'
      when v_collection>0 then 'REVIEW_PENDING'
      else 'NEEDS_REVIEW'
    end;

    v_fingerprint := md5(
      jsonb_build_object(
        'delivery_way_id',v_way,
        'wayplan_id',v_row->>'wayplan_id',
        'rider_code',v_row->>'rider_code',
        'collection',v_collection,
        'settlement_status',v_status,
        'hold_code',v_row->>'hold_code',
        'hold_note',v_row->>'hold_note',
        'delivered_at',v_row->>'delivered_at'
      )::text
    );

    v_upsert := public.be_accounting_upsert_event_v1(
      'COD',
      'be_finance_cod_settlements_v48',
      v_way,
      'COD_COLLECTED',
      'COD_V93',
      v_collect_date,
      'COD collected by field team - '||v_way,
      'MMK',
      v_collection,
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_way),
      v_fingerprint,
      v_collect_status,
      v_updated_at,
      jsonb_build_object(
        'adapter','be_accounting_sync_cod_v1',
        'settlement_status',v_status
      )
    );

    if not coalesce((v_upsert->>'ok')::boolean,false) then
      raise exception 'COD_COLLECTION_UPSERT_FAILED: %',v_upsert;
    end if;

    if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
      v_skipped := v_skipped+1;
    else
      v_event_id := (v_upsert->>'event_id')::uuid;
      delete from public.be_accounting_event_lines where event_id=v_event_id;

      if v_collection>0 then
        insert into public.be_accounting_event_lines(
          event_id,account_id,sequence_no,debit_amount,credit_amount,
          rider_or_employee_id,source_reference,description
        ) values
          (
            v_event_id,v_rider_receivable,10,v_collection,0,
            nullif(v_row->>'rider_code',''),v_way,
            'COD in rider custody - '||v_way
          ),
          (
            v_event_id,v_clearing,20,0,v_collection,
            nullif(v_row->>'rider_code',''),v_way,
            'COD unallocated clearing - '||v_way
          );
      end if;

      v_synced := v_synced+1;
      if v_collect_status='HELD' then
        v_held := v_held+1;
      end if;
    end if;

    if v_status='SETTLED'
       or nullif(v_row->>'settled_at','') is not null
       or nullif(v_row->>'remitted_at','') is not null then

      v_remittance := greatest(
        coalesce(
          nullif(v_row->>'settled_amount','')::numeric,
          nullif(v_row->>'rider_remittance','')::numeric,
          nullif(v_row->>'reported_collected','')::numeric,
          nullif(v_row->>'expected_cod','')::numeric,
          0
        ),
        0
      );

      v_remit_date := coalesce(
        nullif(v_row->>'settled_at','')::timestamptz,
        nullif(v_row->>'remitted_at','')::timestamptz,
        v_updated_at,
        now()
      )::date;

      v_fingerprint := md5(
        jsonb_build_object(
          'delivery_way_id',v_way,
          'wayplan_id',v_row->>'wayplan_id',
          'rider_code',v_row->>'rider_code',
          'remittance',v_remittance,
          'settlement_status',v_status,
          'settlement_reference',v_row->>'settlement_reference',
          'remittance_reference',v_row->>'remittance_reference',
          'settled_at',v_row->>'settled_at',
          'remitted_at',v_row->>'remitted_at'
        )::text
      );

      v_upsert := public.be_accounting_upsert_event_v1(
        'COD',
        'be_finance_cod_settlements_v48',
        v_way,
        'RIDER_COD_REMITTED',
        'COD_V93',
        v_remit_date,
        'COD remitted to Finance - '||v_way,
        'MMK',
        v_remittance,
        coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_way),
        v_fingerprint,
        case when v_remittance>0 then 'REVIEW_PENDING' else 'NEEDS_REVIEW' end,
        v_updated_at,
        jsonb_build_object(
          'adapter','be_accounting_sync_cod_v1',
          'settlement_status',v_status,
          'revenue_recognition',false
        )
      );

      if not coalesce((v_upsert->>'ok')::boolean,false) then
        raise exception 'COD_REMITTANCE_UPSERT_FAILED: %',v_upsert;
      end if;

      if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
        v_skipped := v_skipped+1;
      else
        v_event_id := (v_upsert->>'event_id')::uuid;
        delete from public.be_accounting_event_lines where event_id=v_event_id;

        if v_remittance>0 then
          insert into public.be_accounting_event_lines(
            event_id,account_id,sequence_no,debit_amount,credit_amount,
            rider_or_employee_id,source_reference,description
          ) values
            (
              v_event_id,v_bank,10,v_remittance,0,
              nullif(v_row->>'rider_code',''),v_way,
              'Finance cash/bank receipt of rider COD - '||v_way
            ),
            (
              v_event_id,v_rider_receivable,20,0,v_remittance,
              nullif(v_row->>'rider_code',''),v_way,
              'Clear rider COD receivable - '||v_way
            );
        end if;

        v_synced := v_synced+1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'code','COD_SYNC_COMPLETE',
    'scanned',v_scanned,
    'synced',v_synced,
    'held',v_held,
    'skipped',v_skipped
  );
end;
$$;

revoke all on function public.be_accounting_sync_cod_v1(date,date)
from public,anon,authenticated;
grant execute on function public.be_accounting_sync_cod_v1(date,date)
to service_role;

comment on function public.be_accounting_sync_cod_v1(date,date) is
  'Creates separate COD collection and rider-remittance accounting review events from Finance COD V48/V93. Remittance is an asset transfer, never revenue.';

commit;
