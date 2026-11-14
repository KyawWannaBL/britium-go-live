CREATE OR REPLACE FUNCTION public.be_finance_cod_sync_v48(p_wayplan_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wayplan text := nullif(btrim(coalesce(p_wayplan_id, '')), '');
  v_count integer := 0;
begin
  if to_regclass('public.be_rider_route_stop_state_v46') is null
     or to_regclass('public.be_wayplan_membership_v40') is null
     or to_regclass('public.be_v_warehouse_receipt_v39') is null then
    raise exception 'Rider V46, Wayplan V40, and Warehouse V39 are required before Finance V48';
  end if;

  with source as (
    select
      s.delivery_way_id,
      s.wayplan_id,
      m.pickup_id,
      w.batch_waybill_no,
      m.rider_code,
      m.rider_name,
      m.driver_code,
      m.driver_name,
      coalesce(nullif(s.recipient_name, ''), w.recipient_name) as recipient_name,
      coalesce(nullif(s.recipient_phone, ''), w.recipient_phone) as recipient_phone,
      coalesce(nullif(s.township, ''), w.township) as township,
      greatest(coalesce(d.actual_collect,0),coalesce(d.cod_amount,0),coalesce(w.actual_collect,0),0)::numeric as expected_cod,
      greatest(coalesce(d.delivery_fee, w.delivery_fee, 0), 0)::numeric as delivery_fee,
      greatest(coalesce(d.item_price, w.item_price, 0), 0)::numeric as item_value,
      coalesce(
        public.be_finance_try_numeric_v48(s.result_payload ->> 'collected_amount'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'cod_collected'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'amount_received'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'received_amount'),
        0
      ) as reported_collected,
      coalesce(
        public.be_finance_try_numeric_v48(s.result_payload ->> 'rider_remittance'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'remitted_amount'),
        public.be_finance_try_numeric_v48(s.result_payload ->> 'handover_amount'),
        0
      ) as rider_remittance,
      upper(coalesce(
        nullif(s.result_payload ->> 'payment_mode', ''),
        nullif(s.result_payload ->> 'payment_type', ''),
        nullif(s.result_payload ->> 'cod_payment_mode', ''),
        'UNSPECIFIED'
      )) as payment_mode,
      coalesce(
        nullif(s.result_payload ->> 'proof_reference', ''),
        nullif(s.result_payload ->> 'proof_url', ''),
        nullif(s.result_payload ->> 'photo_url', ''),
        nullif(s.result_payload ->> 'signature_url', ''),
        nullif(s.result_payload ->> 'otp_reference', ''),
        nullif(s.result_payload #>> '{proof,url}', '')
      ) as proof_reference,
      (
        coalesce(
          nullif(s.result_payload ->> 'proof_reference', ''),
          nullif(s.result_payload ->> 'proof_url', ''),
          nullif(s.result_payload ->> 'photo_url', ''),
          nullif(s.result_payload ->> 'signature_url', ''),
          nullif(s.result_payload ->> 'otp_reference', ''),
          nullif(s.result_payload #>> '{proof,url}', '')
        ) is not null
        or coalesce(s.result_payload ? 'signature', false)
        or coalesce(s.result_payload ? 'photo', false)
        or coalesce(s.result_payload ? 'otp', false)
      ) as proof_available,
      s.result_at as delivered_at,
      s.result_payload
    from public.be_rider_route_stop_state_v46 s
    join public.be_wayplan_membership_v40 m
      on m.wayplan_id = s.wayplan_id and m.delivery_way_id = s.delivery_way_id
    left join public.be_v_warehouse_receipt_v39 w
      on w.delivery_way_id = s.delivery_way_id
    left join lateral (
      select dd.actual_collect,dd.cod_amount,dd.item_price,dd.delivery_fee
      from public.be_data_entry_parcel_details dd
      where dd.delivery_way_id=s.delivery_way_id
      order by dd.updated_at desc nulls last,dd.saved_at desc nulls last
      limit 1
    ) d on true
    where s.stop_status = 'DELIVERED'
      and (v_wayplan is null or s.wayplan_id = v_wayplan)
  ), normalized as (
    select
      source.*,
      (rider_remittance - expected_cod)::numeric as calculated_variance,
      case
        when expected_cod <= 0 then 'NOT_REQUIRED'
        when not proof_available then 'PENDING_PROOF'
        when rider_remittance <= 0 then 'PENDING_REMITTANCE'
        when abs(rider_remittance - expected_cod) > 0.01 then 'ON_HOLD'
        else 'READY_TO_SETTLE'
      end as calculated_status,
      case
        when expected_cod <= 0 then 'NONE'
        when not proof_available then 'MISSING_PROOF'
        when rider_remittance <= 0 then 'MISSING_REMITTANCE'
        when rider_remittance < expected_cod - 0.01 then 'SHORTAGE'
        when rider_remittance > expected_cod + 0.01 then 'OVERAGE'
        else 'NONE'
      end as calculated_variance_type
    from source
  )
  insert into public.be_finance_cod_settlements_v48(
    delivery_way_id, wayplan_id, pickup_id, batch_waybill_no,
    rider_code, rider_name, driver_code, driver_name,
    recipient_name, recipient_phone, township,
    expected_cod, reported_collected, rider_remittance,
    delivery_fee, item_value, payment_mode,
    proof_status, proof_reference, settlement_status,
    variance_type, variance_amount, delivered_at, metadata
  )
  select
    delivery_way_id, wayplan_id, pickup_id, batch_waybill_no,
    rider_code, rider_name, driver_code, driver_name,
    recipient_name, recipient_phone, township,
    expected_cod, reported_collected, rider_remittance,
    delivery_fee, item_value, payment_mode,
    case when proof_available then 'AVAILABLE' else 'MISSING' end,
    proof_reference, calculated_status,
    calculated_variance_type, calculated_variance,
    delivered_at,
    jsonb_build_object(
      'source', 'RIDER_V46',
      'rider_result_payload', result_payload,
      'build', 'FINANCE_COD_V48_RECONCILIATION_2026-07-30'
    )
  from normalized
  on conflict (delivery_way_id) do update set
    wayplan_id = excluded.wayplan_id,
    pickup_id = coalesce(excluded.pickup_id, public.be_finance_cod_settlements_v48.pickup_id),
    batch_waybill_no = coalesce(excluded.batch_waybill_no, public.be_finance_cod_settlements_v48.batch_waybill_no),
    rider_code = coalesce(excluded.rider_code, public.be_finance_cod_settlements_v48.rider_code),
    rider_name = coalesce(excluded.rider_name, public.be_finance_cod_settlements_v48.rider_name),
    driver_code = coalesce(excluded.driver_code, public.be_finance_cod_settlements_v48.driver_code),
    driver_name = coalesce(excluded.driver_name, public.be_finance_cod_settlements_v48.driver_name),
    recipient_name = coalesce(excluded.recipient_name, public.be_finance_cod_settlements_v48.recipient_name),
    recipient_phone = coalesce(excluded.recipient_phone, public.be_finance_cod_settlements_v48.recipient_phone),
    township = coalesce(excluded.township, public.be_finance_cod_settlements_v48.township),
    expected_cod = excluded.expected_cod,
    reported_collected = case
      when excluded.reported_collected > 0 then excluded.reported_collected
      else public.be_finance_cod_settlements_v48.reported_collected
    end,
    rider_remittance = case
      when public.be_finance_cod_settlements_v48.rider_remittance > 0
        then public.be_finance_cod_settlements_v48.rider_remittance
      else excluded.rider_remittance
    end,
    delivery_fee = excluded.delivery_fee,
    item_value = excluded.item_value,
    payment_mode = case
      when public.be_finance_cod_settlements_v48.payment_mode <> 'UNSPECIFIED'
        then public.be_finance_cod_settlements_v48.payment_mode
      else excluded.payment_mode
    end,
    proof_status = case
      when public.be_finance_cod_settlements_v48.proof_status in ('VERIFIED','WAIVED')
        then public.be_finance_cod_settlements_v48.proof_status
      else excluded.proof_status
    end,
    proof_reference = coalesce(public.be_finance_cod_settlements_v48.proof_reference, excluded.proof_reference),
    settlement_status = case
      when public.be_finance_cod_settlements_v48.settlement_status in ('SETTLED','ON_HOLD','VOID')
        then public.be_finance_cod_settlements_v48.settlement_status
      else excluded.settlement_status
    end,
    variance_type = case
      when public.be_finance_cod_settlements_v48.settlement_status in ('SETTLED','ON_HOLD','VOID')
        then public.be_finance_cod_settlements_v48.variance_type
      else excluded.variance_type
    end,
    variance_amount = case
      when public.be_finance_cod_settlements_v48.settlement_status in ('SETTLED','ON_HOLD','VOID')
        then public.be_finance_cod_settlements_v48.variance_amount
      else excluded.variance_amount
    end,
    delivered_at = coalesce(excluded.delivered_at, public.be_finance_cod_settlements_v48.delivered_at),
    metadata = coalesce(public.be_finance_cod_settlements_v48.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'wayplan_id', v_wayplan,
    'synced_rows', v_count,
    'workflow', 'DELIVERED -> COD RECONCILIATION -> READY/ON_HOLD -> SETTLED'
  );
end;
$function$
;
