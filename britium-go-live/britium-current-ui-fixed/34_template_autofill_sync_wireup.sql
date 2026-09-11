create extension if not exists pgcrypto;

create table if not exists public.be_template_sync_events (
  id uuid primary key default gen_random_uuid(),
  module_name text,
  template_code text,
  pickup_id text,
  way_id text,
  merchant_code text,
  row_payload jsonb default '{}'::jsonb,
  context_payload jsonb default '{}'::jsonb,
  result_payload jsonb default '{}'::jsonb,
  created_by_email text,
  created_at timestamptz default now()
);

create or replace function public.be_template_sync_row(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_module text := coalesce(p_payload->>'module', p_payload->>'module_name', 'data_entry');
  v_template text := coalesce(p_payload->>'template_code', 'parcel_import');
  v_email text := coalesce(p_payload->>'actor_email', p_payload->>'uploaded_by_email', '');
  v_row jsonb := coalesce(p_payload->'row', '{}'::jsonb);
  v_context jsonb := coalesce(p_payload->'context', '{}'::jsonb);
  v_pickup_id text := coalesce(v_context->>'pickup_id', v_row->>'pickup_id', '');
  v_way_id text := coalesce(v_context->>'way_id', v_row->>'way_id', v_row->>'waybill_no', '');
  v_pickup jsonb := '{}'::jsonb;
  v_charge jsonb := '{}'::jsonb;
  v_result_row jsonb;
  v_weight numeric := greatest(coalesce(nullif(v_row->>'weight_kg', '')::numeric, nullif(v_row->>'weight', '')::numeric, 1), 0);
  v_parcel_count integer := greatest(coalesce(nullif(v_row->>'pickup_parcel_count', '')::integer, nullif(v_context->>'parcel_count', '')::integer, 1), 1);
  v_distance numeric := greatest(coalesce(nullif(v_row->>'distance_km', '')::numeric, nullif(v_context->>'distance_km', '')::numeric, 0), 0);
  v_cod numeric := greatest(coalesce(nullif(v_row->>'cod_amount', '')::numeric, nullif(v_context->>'cod_amount', '')::numeric, 0), 0);
  v_merchant_code text;
  v_merchant_name text;
  v_branch_code text;
  v_service_type text;
  v_payment_method text;
  v_priority text;
  v_mmdd text := to_char(now(), 'MMDD');
  v_count3 text;
begin
  if v_pickup_id <> '' and to_regclass('public.be_portal_pickup_requests') is not null then
    begin
      execute $q$
        select to_jsonb(x)
        from (
          select *
          from public.be_portal_pickup_requests
          where lower(coalesce(canonical_pickup_id, pickup_id, id::text)) = lower($1)
             or lower(coalesce(pickup_id, '')) = lower($1)
             or lower(coalesce(canonical_pickup_id, '')) = lower($1)
          order by created_at desc nulls last
          limit 1
        ) x
      $q$ into v_pickup using v_pickup_id;
    exception when others then
      v_pickup := '{}'::jsonb;
    end;
  end if;

  v_merchant_code := upper(left(coalesce(
    v_context->>'merchant_code',
    v_row->>'merchant_code',
    v_pickup->>'merchant_code',
    'UAT'
  ), 3));

  if v_merchant_code = '' then
    v_merchant_code := 'UAT';
  end if;

  v_merchant_name := coalesce(
    v_context->>'merchant_name',
    v_row->>'merchant_sender_name',
    v_row->>'merchant_name',
    v_pickup->>'merchant_name',
    v_pickup->>'sender_name',
    ''
  );

  v_branch_code := coalesce(
    v_context->>'branch_code',
    v_row->>'branch_code',
    v_row->>'warehouse_branch',
    v_pickup->>'branch_code',
    'HQ'
  );

  v_payment_method := coalesce(v_row->>'payment_method', v_pickup->>'payment_terms', v_pickup->>'payment_method', 'COD');
  v_service_type := upper(coalesce(v_row->>'service_type', v_pickup->>'service_type', v_pickup->>'service', 'STANDARD'));
  v_priority := coalesce(v_row->>'priority', v_pickup->>'priority', 'Normal');
  v_count3 := lpad(v_parcel_count::text, 3, '0');

  if to_regprocedure('public.be_calculate_delivery_charge(jsonb)') is not null then
    begin
      select public.be_calculate_delivery_charge(
        jsonb_build_object(
          'pickup_id', coalesce(nullif(v_pickup_id, ''), format('P%s-%s-%s', v_mmdd, v_merchant_code, v_count3)),
          'way_id', coalesce(nullif(v_way_id, ''), format('W%s-%s-%s', v_mmdd, v_merchant_code, v_count3)),
          'merchant_code', v_merchant_code,
          'branch_code', v_branch_code,
          'service_type', v_service_type,
          'weight_kg', v_weight,
          'parcel_count', v_parcel_count,
          'distance_km', v_distance,
          'cod_amount', v_cod
        )
      ) into v_charge;
    exception when others then
      v_charge := jsonb_build_object('ok', false, 'total_charge', 0, 'tariff_source', 'tariff_rpc_failed');
    end;
  else
    v_charge := jsonb_build_object('ok', false, 'total_charge', 0, 'tariff_source', 'tariff_rpc_missing');
  end if;

  v_result_row := v_row || jsonb_build_object(
    'upload_action', coalesce(v_row->>'upload_action', 'CREATE'),
    'requester_type', coalesce(v_row->>'requester_type', v_context->>'requester_type', 'DATA_ENTRY'),
    'merchant_id', coalesce(v_row->>'merchant_id', v_pickup->>'merchant_id', v_context->>'merchant_id', v_merchant_code),
    'merchant_code', v_merchant_code,
    'merchant_sender_name', v_merchant_name,
    'merchant_name', v_merchant_name,
    'sender_phone', coalesce(v_row->>'sender_phone', v_pickup->>'contact_phone', v_pickup->>'sender_phone', ''),
    'pickup_address', coalesce(v_row->>'pickup_address', v_pickup->>'pickup_address', ''),
    'pickup_township', coalesce(v_row->>'pickup_township', v_pickup->>'pickup_township', v_pickup->>'township', ''),
    'pickup_city', coalesce(v_row->>'pickup_city', v_pickup->>'pickup_city', v_pickup->>'city', 'Yangon'),
    'pickup_date', coalesce(v_row->>'pickup_date', v_pickup->>'pickup_date', to_char(now(), 'YYYY-MM-DD')),
    'pickup_time', coalesce(v_row->>'pickup_time', v_pickup->>'pickup_time', ''),
    'pickup_parcel_count', v_parcel_count,
    'weight_kg', v_weight,
    'pickup_id', coalesce(nullif(v_pickup_id, ''), v_pickup->>'canonical_pickup_id', v_pickup->>'pickup_id', format('P%s-%s-%s', v_mmdd, v_merchant_code, v_count3)),
    'deliver_id', coalesce(v_row->>'deliver_id', v_pickup->>'deliver_id', format('D%s-%s-%s', v_mmdd, v_merchant_code, v_count3)),
    'invoice_no', coalesce(v_row->>'invoice_no', v_pickup->>'invoice_no', format('I%s-%s-%s', v_mmdd, v_merchant_code, v_count3)),
    'waybill_no', coalesce(v_row->>'waybill_no', v_row->>'way_id', v_pickup->>'waybill_no', format('W%s-%s-%s', v_mmdd, v_merchant_code, v_count3)),
    'payment_method', v_payment_method,
    'service_type', v_service_type,
    'priority', v_priority,
    'destination', coalesce(v_row->>'destination', v_row->>'delivery_township', v_pickup->>'delivery_township', ''),
    'delivery_fee', coalesce(v_charge->>'total_charge', '0'),
    'extra_weight_fee', case when v_weight > 1 then ((v_weight - 1) * 700)::text else '0' end,
    'prepaid_amount', coalesce(v_row->>'prepaid_amount', '0'),
    'cod_amount', v_cod,
    'tariff_source', coalesce(v_charge->>'tariff_source', 'unknown'),
    'upload_status', 'READY_TO_SAVE',
    'api_message', 'Auto-filled from backend masterdata and tariff calculation',
    'source_row_no', coalesce(v_row->>'source_row_no', v_row->>'row_no', '1'),
    'warehouse_branch', v_branch_code,
    'expected_parcel_count', v_parcel_count,
    'scanned_parcel_count', greatest(coalesce(nullif(v_row->>'scanned_parcel_count', '')::integer, 0), 0),
    'remaining_count', greatest(v_parcel_count - greatest(coalesce(nullif(v_row->>'scanned_parcel_count', '')::integer, 0), 0), 0),
    'current_status', coalesce(v_row->>'current_status', v_pickup->>'status', 'PICKUP_COMPLETED'),
    'next_status', coalesce(v_row->>'next_status', 'RECEIVED_AT_ORIGIN'),
    'validation_status', 'SYNCED'
  );

  insert into public.be_template_sync_events (
    module_name,
    template_code,
    pickup_id,
    way_id,
    merchant_code,
    row_payload,
    context_payload,
    result_payload,
    created_by_email
  )
  values (
    v_module,
    v_template,
    coalesce(v_result_row->>'pickup_id', v_pickup_id),
    coalesce(v_result_row->>'waybill_no', v_way_id),
    v_merchant_code,
    v_row,
    v_context,
    jsonb_build_object('row', v_result_row, 'charge', v_charge, 'pickup', v_pickup),
    v_email
  );

  return jsonb_build_object(
    'ok', true,
    'row', v_result_row,
    'charge', v_charge,
    'pickup_context', v_pickup
  );
end;
$$;

grant execute on function public.be_template_sync_row(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
