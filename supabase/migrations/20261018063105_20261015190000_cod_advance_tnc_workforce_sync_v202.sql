-- 2026-10-15: Align advance COD fees with approved T&C and add bounded workforce sync.
-- No historical COD/settlement rows are rewritten by this migration.
begin;

create or replace function public.be_finance_cod_policy_v2(
  p_payment_type text,
  p_cod_amount numeric,
  p_parcel_count integer default 1
)
returns jsonb
language plpgsql
immutable
set search_path=public,pg_temp
as $$
declare
  v_raw text := btrim(coalesce(p_payment_type,''));
  v_type text := upper(replace(replace(v_raw,' ','_'),'-','_'));
  v_amount numeric := greatest(coalesce(p_cod_amount,0),0);
  v_parcels integer := greatest(coalesce(p_parcel_count,1),1);
  v_rate numeric := 0;
  v_fee numeric := 0;
  v_status text;
  v_applies boolean;
  v_advance boolean;
begin
  if v_type='KBZPAY' then v_type:='KBZ_PAY'; end if;
  if v_type='BANK' then v_type:='BANK_TRANSFER'; end if;
  if v_type in ('','POD','PAY_ON_DELIVERY') then v_type:='COD'; end if;

  v_applies := v_type in ('COD','CASH_ADVANCE_ON','CASH_ADVANCE_OFF','CASH_ADVANCE','PAY_ON_DELIVERY');
  v_advance := v_type in ('CASH_ADVANCE_ON','CASH_ADVANCE');

  if not v_applies then
    return jsonb_build_object(
      'payment_type',coalesce(nullif(v_raw,''),v_type),
      'normalized_payment_type',v_type,
      'cod_requested',false,'eligible',true,
      'cod_policy_status','NOT_APPLICABLE',
      'finance_status','NOT_REQUIRED','finance_required',false,
      'cod_amount',v_amount,'parcel_count',v_parcels,
      'fee_rate',0,'fee_amount',0,
      'settlement_mode','NOT_APPLICABLE',
      'policy_version','COD_TNC_ADVANCE_2026_10_15'
    );
  end if;

  -- Approved T&C: for declared COD above MMK 200,000, only Advance
  -- Settlement has a 2% processing fee. Standard remittance is separate.
  if v_advance and v_amount > 200000 then
    v_status := 'ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000';
    v_rate := 0.02;
    v_fee := round(v_amount * v_rate,0);
  elsif v_amount <= 100000 then
    v_status := 'COD_FEE_FREE_0_TO_100000';
  elsif v_amount <= 300000 then
    v_status := 'COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000';
    v_fee := 200 * v_parcels;
  else
    -- Existing ordinary COD service fees are unchanged pending separate T&C
    -- approval; do not misapply the Advance Settlement processing fee.
    v_status := 'COD_FEE_0_2_PERCENT_ABOVE_300000';
    v_rate := 0.002;
    v_fee := round(v_amount * v_rate,0);
  end if;

  return jsonb_build_object(
    'payment_type',coalesce(nullif(v_raw,''),v_type),
    'normalized_payment_type',v_type,
    'cod_requested',true,'eligible',true,
    'cod_policy_status',v_status,
    'finance_status','AUTO_APPROVED','finance_required',false,
    'cod_amount',v_amount,'parcel_count',v_parcels,
    'fee_rate',v_rate,'fee_amount',v_fee,
    'settlement_mode',case when v_advance then 'ADVANCE' else 'STANDARD' end,
    'policy_version','COD_TNC_ADVANCE_2026_10_15'
  );
end;
$$;

create or replace function public.be_workforce_commission_sync_range_v202(
  p_from date,
  p_to date
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_touched integer := 0;
  v_wallet jsonb;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated user is required' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 31 then
    raise exception 'Select a date range of up to 32 days' using errcode='22023';
  end if;

  -- Uses the existing delivered-stop trigger, which handles
  -- idempotent READY commission events through ON CONFLICT DO NOTHING.
  update public.be_wayplan_dispatch_stops s
    set stop_status = s.stop_status
  where upper(coalesce(s.stop_status,s.rider_status,s.dispatch_status,'')) in ('DELIVERED','COMPLETED')
    and coalesce(s.delivered_at,s.updated_at,s.created_at)::date between p_from and p_to;
  get diagnostics v_touched = row_count;

  v_wallet := public.be_refresh_party_wallets_v1();

  return jsonb_build_object(
    'ok',true,'sync_build','WORKFORCE_COMMISSION_RANGE_V202',
    'from_date',p_from,'to_date',p_to,
    'delivered_stops_synced',v_touched,'wallet_refresh',v_wallet
  );
end;
$$;

revoke all on function public.be_workforce_commission_sync_range_v202(date,date) from public,anon;
grant execute on function public.be_workforce_commission_sync_range_v202(date,date) to authenticated,service_role;

do $tests$
begin
  if (public.be_finance_cod_policy_v2('CASH_ADVANCE_ON',250000,1)->>'fee_amount')::numeric <> 5000 then
    raise exception 'COD advance >200000 must be charged 2 percent';
  end if;
  if (public.be_finance_cod_policy_v2('CASH_ADVANCE',500000,1)->>'fee_amount')::numeric <> 10000 then
    raise exception 'COD advance 500000 must be charged 10000 MMK';
  end if;
  if (public.be_finance_cod_policy_v2('CASH_ADVANCE_OFF',500000,1)->>'fee_amount')::numeric <> 1000 then
    raise exception 'Standard COD must preserve the existing separate fee rule';
  end if;
  if (public.be_finance_cod_policy_v2('BANK_TRANSFER',500000,1)->>'fee_amount')::numeric <> 0 then
    raise exception 'Non-COD payments must not carry a COD processing fee';
  end if;
end;
$tests$;
commit;
