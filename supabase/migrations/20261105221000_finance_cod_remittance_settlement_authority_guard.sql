-- COD write authority hardening: use existing Finance access policy.
-- No COD rows, remittance amounts or settlements are modified by installation.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_finance_cod_record_remittance_v48(p_delivery_way_id text, p_remitted_amount numeric, p_payment_mode text, p_reference text, p_receiver text, p_received_at timestamp with time zone DEFAULT now(), p_proof_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_operation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET lock_timeout TO '3s'
AS $function$
declare
  v_way text := nullif(btrim(coalesce(p_delivery_way_id, '')), '');
  v_amount numeric := coalesce(p_remitted_amount, 0);
  v_actor text := public.be_finance_actor_v48(p_receiver);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(coalesce(v_way, '') || '|REMIT|' || clock_timestamp()::text, 'sha256'), 'hex'));
  v_row public.be_finance_cod_settlements_v48;
  v_status text;
  v_variance numeric;
  v_variance_type text;
  v_proof_status text;
begin
  if auth.uid() is null and session_user <> 'postgres' then
    raise exception 'Authenticated Finance user is required';
  end if;
  -- Enforce the existing finance role-access matrix for authenticated callers.
  -- Preserve the existing trusted postgres maintenance exception.
  if auth.uid() is not null then
    perform public.be_finance_assert_internal_v3();
  end if;
  if v_way is null then raise exception 'Way ID is required'; end if;
  if v_amount < 0 then raise exception 'Remittance amount cannot be negative'; end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null then raise exception 'Remittance reference is required'; end if;
  if nullif(btrim(coalesce(p_receiver, '')), '') is null then raise exception 'Finance receiver is required'; end if;

  if exists (select 1 from public.be_finance_cod_events_v48 where operation_id = v_operation) then
    select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  perform public.be_finance_cod_sync_v48(null);
  select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way for update;
  if v_row.delivery_way_id is null then raise exception 'Delivered COD record % was not found', v_way; end if;
  if v_row.settlement_status = 'SETTLED' then raise exception 'COD record % is already settled', v_way; end if;

  v_variance := v_amount - v_row.expected_cod;
  v_proof_status := case
    when nullif(btrim(coalesce(p_proof_reference, '')), '') is not null then 'VERIFIED'
    when v_row.proof_status in ('AVAILABLE','VERIFIED','WAIVED') then v_row.proof_status
    else 'MISSING'
  end;

  if v_row.expected_cod <= 0 then
    v_status := 'NOT_REQUIRED';
    v_variance_type := 'NONE';
  elsif v_proof_status = 'MISSING' then
    v_status := 'PENDING_PROOF';
    v_variance_type := 'MISSING_PROOF';
  elsif v_amount <= 0 then
    v_status := 'PENDING_REMITTANCE';
    v_variance_type := 'MISSING_REMITTANCE';
  elsif v_variance < -0.01 then
    v_status := 'ON_HOLD';
    v_variance_type := 'SHORTAGE';
  elsif v_variance > 0.01 then
    v_status := 'ON_HOLD';
    v_variance_type := 'OVERAGE';
  else
    v_status := 'READY_TO_SETTLE';
    v_variance_type := 'NONE';
  end if;

  update public.be_finance_cod_settlements_v48
  set rider_remittance = v_amount,
      reported_collected = case when reported_collected <= 0 then v_amount else reported_collected end,
      payment_mode = upper(coalesce(nullif(btrim(p_payment_mode), ''), payment_mode, 'UNSPECIFIED')),
      proof_status = v_proof_status,
      proof_reference = coalesce(nullif(btrim(p_proof_reference), ''), proof_reference),
      remittance_reference = btrim(p_reference),
      remittance_receiver = btrim(p_receiver),
      remitted_at = coalesce(p_received_at, now()),
      settlement_status = v_status,
      variance_type = v_variance_type,
      variance_amount = v_variance,
      hold_code = case when v_status = 'ON_HOLD' then v_variance_type else null end,
      hold_note = case when v_status = 'ON_HOLD' then coalesce(nullif(btrim(p_note), ''), 'Automatic variance hold') else null end,
      held_by = case when v_status = 'ON_HOLD' then v_actor else null end,
      held_at = case when v_status = 'ON_HOLD' then now() else null end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('remittance_note', p_note),
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_finance_cod_events_v48(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, amount, reference, payload
  ) values (
    v_way, v_row.wayplan_id, 'REMITTANCE_RECORDED', v_operation, v_actor, v_amount, p_reference,
    jsonb_build_object('payment_mode', p_payment_mode, 'proof_reference', p_proof_reference, 'status', v_status, 'variance', v_variance, 'note', p_note)
  );

  if to_regclass('public.be_cod_ledger') is not null then
    execute 'update public.be_cod_ledger set collected_amount=$1, handover_amount=$1, variance_amount=$2, cod_status=$3, handed_over_at=$4, received_by_name=$5, payload=coalesce(payload,''{}''::jsonb)||$6::jsonb, updated_at=now() where delivery_way_id=$7'
    using v_amount, v_variance,
      case when v_status = 'READY_TO_SETTLE' then 'handed_over_to_finance' else lower(v_status) end,
      coalesce(p_received_at, now()), p_receiver,
      jsonb_build_object('v48_reference', p_reference, 'v48_status', v_status), v_way;
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.be_finance_cod_settle_v48(p_delivery_way_id text, p_settled_amount numeric, p_reference text, p_receiver text, p_settled_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text, p_operation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '20s'
 SET lock_timeout TO '3s'
AS $function$
declare
  v_way text := nullif(btrim(coalesce(p_delivery_way_id, '')), '');
  v_actor text := public.be_finance_actor_v48(p_receiver);
  v_operation text := coalesce(nullif(btrim(p_operation_id), ''), encode(digest(coalesce(v_way, '') || '|SETTLE|' || coalesce(p_reference, ''), 'sha256'), 'hex'));
  v_row public.be_finance_cod_settlements_v48;
  v_amount numeric;
begin
  if auth.uid() is null and session_user <> 'postgres' then raise exception 'Authenticated Finance user is required'; end if;
  -- Enforce the existing finance role-access matrix for authenticated callers.
  -- Preserve the existing trusted postgres maintenance exception.
  if auth.uid() is not null then
    perform public.be_finance_assert_internal_v3();
  end if;
  if v_way is null then raise exception 'Way ID is required'; end if;
  if nullif(btrim(coalesce(p_reference, '')), '') is null then raise exception 'Settlement reference is required'; end if;
  if nullif(btrim(coalesce(p_receiver, '')), '') is null then raise exception 'Settlement receiver is required'; end if;

  if exists (select 1 from public.be_finance_cod_events_v48 where operation_id = v_operation) then
    select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way;
    return jsonb_build_object('ok', true, 'duplicate_operation', true, 'row', to_jsonb(v_row));
  end if;

  select * into v_row from public.be_finance_cod_settlements_v48 where delivery_way_id = v_way for update;
  if v_row.delivery_way_id is null then raise exception 'COD record % was not found', v_way; end if;
  if v_row.settlement_status = 'SETTLED' then
    return jsonb_build_object('ok', true, 'already_settled', true, 'row', to_jsonb(v_row));
  end if;
  if v_row.settlement_status <> 'READY_TO_SETTLE' then
    raise exception 'COD record % is %, not READY_TO_SETTLE', v_way, v_row.settlement_status;
  end if;
  if v_row.proof_status not in ('AVAILABLE','VERIFIED','WAIVED') or nullif(btrim(coalesce(v_row.proof_reference, '')), '') is null then
    raise exception 'Delivery/payment proof is required before settlement';
  end if;

  v_amount := coalesce(p_settled_amount, v_row.rider_remittance);
  if abs(v_amount - v_row.expected_cod) > 0.01 then
    raise exception 'Settlement amount % does not match expected COD %', v_amount, v_row.expected_cod;
  end if;
  if abs(v_row.rider_remittance - v_row.expected_cod) > 0.01 then
    raise exception 'Rider remittance % does not match expected COD %', v_row.rider_remittance, v_row.expected_cod;
  end if;

  update public.be_finance_cod_settlements_v48
  set settled_amount = v_amount,
      settlement_status = 'SETTLED',
      variance_type = 'NONE',
      variance_amount = 0,
      settlement_reference = btrim(p_reference),
      settlement_receiver = btrim(p_receiver),
      settlement_note = nullif(btrim(coalesce(p_note, '')), ''),
      settled_by = v_actor,
      settled_at = coalesce(p_settled_at, now()),
      hold_code = null,
      hold_note = null,
      held_by = null,
      held_at = null,
      updated_at = now()
  where delivery_way_id = v_way
  returning * into v_row;

  insert into public.be_finance_cod_events_v48(
    delivery_way_id, wayplan_id, event_type, operation_id, actor, amount, reference, payload
  ) values (
    v_way, v_row.wayplan_id, 'COD_SETTLED', v_operation, v_actor, v_amount, p_reference,
    jsonb_build_object('receiver', p_receiver, 'note', p_note, 'payment_mode', v_row.payment_mode)
  );

  if to_regclass('public.be_cod_ledger') is not null then
    execute 'update public.be_cod_ledger set collected_amount=$1, handover_amount=$1, variance_amount=0, cod_status=''finance_settled'', handed_over_at=coalesce(handed_over_at,$2), received_by_name=$3, settlement_id=coalesce(settlement_id,$4), payload=coalesce(payload,''{}''::jsonb)||$5::jsonb, updated_at=now() where delivery_way_id=$6'
    using v_amount, coalesce(p_settled_at, now()), p_receiver, p_reference,
      jsonb_build_object('v48_operation_id', v_operation, 'v48_settlement_reference', p_reference), v_way;
  end if;

  if to_regclass('public.be_financial_settlements') is not null then
    execute 'insert into public.be_financial_settlements(delivery_way_id,pickup_id,recipient_name,delivery_fee,gross_cod,handover_amount,variance_amount,finance_deli,finance_cod,settlement_status,finance_note,closed_by_name,closed_at,payload,updated_at) values($1,$2,$3,$4,$5,$5,0,$4,$5,''finance_settled'',$6,$7,$8,$9::jsonb,now()) on conflict(delivery_way_id) do update set handover_amount=excluded.handover_amount, variance_amount=0, finance_deli=excluded.finance_deli, finance_cod=excluded.finance_cod, settlement_status=''finance_settled'', finance_note=excluded.finance_note, closed_by_name=excluded.closed_by_name, closed_at=excluded.closed_at, payload=coalesce(public.be_financial_settlements.payload,''{}''::jsonb)||excluded.payload, updated_at=now()'
    using v_way, v_row.pickup_id, v_row.recipient_name, v_row.delivery_fee, v_amount, p_note, p_receiver,
      coalesce(p_settled_at, now()), jsonb_build_object('v48_operation_id', v_operation, 'settlement_reference', p_reference);
  end if;

  if to_regclass('public.delivery_waybills') is not null then
    execute 'update public.delivery_waybills set finance_status=''finance_settled'', financial_status=''finance_settled'', finance_received_by=$1, updated_at=now() where delivery_way_id=$2'
    using p_receiver, v_way;
  end if;

  if to_regclass('public.be_finance_journal_entries') is not null then
    execute 'insert into public.be_finance_journal_entries(source_module,source_id,delivery_way_id,account_code,account_description,debit,credit,payload) values(''finance_cod_v48'',$1,$2,''1001'',''Cash / Bank Received'',$3,0,$4::jsonb),(''finance_cod_v48'',$1,$2,''4002'',''COD Settlement'',0,$3,$4::jsonb)'
    using p_reference, v_way, v_amount, jsonb_build_object('v48_operation_id', v_operation, 'receiver', p_receiver);
  end if;

  return jsonb_build_object('ok', true, 'row', to_jsonb(v_row));
end;
$function$
;
COMMIT;
