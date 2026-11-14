CREATE OR REPLACE FUNCTION public.be_data_entry_register_bulk(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch uuid := gen_random_uuid();
  v_rows jsonb := coalesce(p_payload -> 'rows', '[]'::jsonb);
  v_total int := jsonb_array_length(coalesce(p_payload -> 'rows', '[]'::jsonb));
  v_upserted int := 0;
  v_row jsonb;
  v_idx int := 0;
  v_pickup_date date;
  v_delivery_way_id text;
  v_pickup_way_id text;
  v_merchant_code text;
  v_item_price numeric;
  v_deli_fee numeric;
  v_surcharge numeric;
  v_final_cod numeric;
begin
  insert into public.be_data_entry_register_batches (
    batch_id,
    source_file_name,
    uploaded_by,
    uploaded_by_name,
    total_rows,
    status,
    payload
  )
  values (
    v_batch,
    p_payload ->> 'source_file_name',
    p_payload ->> 'uploaded_by',
    p_payload ->> 'uploaded_by_name',
    v_total,
    'registered',
    p_payload
  );

  for v_row in
    select * from jsonb_array_elements(v_rows)
  loop
    v_idx := v_idx + 1;

    begin
      v_pickup_date := coalesce(nullif(v_row ->> 'pickup_date', '')::date, current_date);
    exception when others then
      v_pickup_date := current_date;
    end;

    v_merchant_code := public.be_gl_code(coalesce(v_row ->> 'merchant_code', v_row ->> 'merchant'), 'GEN');
    v_pickup_way_id := nullif(coalesce(v_row ->> 'pickup_way_id', v_row ->> 'pickup_id'), '');
    if v_pickup_way_id is null then
      v_pickup_way_id := 'P' || to_char(v_pickup_date, 'MMDD') || '-' || v_merchant_code || '-' || replace(v_batch::text, '-', '');
    end if;

    v_delivery_way_id := nullif(coalesce(v_row ->> 'delivery_way_id', v_row ->> 'way_id', v_row ->> 'tracking_no'), '');
    if v_delivery_way_id is null then
      v_delivery_way_id := public.be_allocate_delivery_way_id(v_pickup_way_id, v_idx);
    end if;

    v_item_price := public.be_gl_num(coalesce(v_row ->> 'item_price', v_row ->> 'cod_amount'), 0);
    v_deli_fee := public.be_gl_num(coalesce(v_row ->> 'delivery_fee', v_row ->> 'deli_fee_os', v_row ->> 'deli_fee'), 0);
    v_surcharge := public.be_gl_num(v_row ->> 'surcharge', 0);
    v_final_cod := coalesce(nullif(public.be_gl_num(coalesce(v_row ->> 'actual_collect', v_row ->> 'final_cod'), 0), 0), v_item_price + v_deli_fee + v_surcharge);

    insert into public.delivery_waybills (
      pickup_date,
      pickup_way_id,
      pickup_id,
      delivery_way_id,
      merchant_code,
      merchant_name,
      merchant,
      recipient_name,
      recipient_phone,
      recipient_phone_2,
      recipient_township,
      recipient_address,
      item_price,
      deli_fee_os,
      delivery_fee_os,
      cod_os,
      std_deli,
      max_deli,
      weight_kg,
      surcharge,
      final_cod,
      destination,
      pickup_by_1,
      general_remarks,
      finance_deli,
      finance_cod,
      finance_received_by,
      finance_status,
      operation_status,
      overall_status,
      financial_status,
      validation_status,
      validation_errors,
      raw_row,
      created_by,
      created_by_name,
      updated_at
    )
    values (
      v_pickup_date,
      v_pickup_way_id,
      v_pickup_way_id,
      v_delivery_way_id,
      v_merchant_code,
      nullif(coalesce(v_row ->> 'merchant_name', v_row ->> 'merchant'), ''),
      nullif(coalesce(v_row ->> 'merchant', v_row ->> 'merchant_name'), ''),
      nullif(v_row ->> 'recipient_name', ''),
      nullif(coalesce(v_row ->> 'recipient_phone', v_row ->> 'contact_no_1', v_row ->> 'phone'), ''),
      nullif(coalesce(v_row ->> 'recipient_phone_2', v_row ->> 'contact_no_2'), ''),
      nullif(coalesce(v_row ->> 'recipient_township', v_row ->> 'township', v_row ->> 'town'), ''),
      nullif(coalesce(v_row ->> 'recipient_address', v_row ->> 'address'), ''),
      v_item_price,
      v_deli_fee,
      v_deli_fee,
      v_item_price + v_deli_fee,
      v_deli_fee,
      v_deli_fee,
      public.be_gl_num(coalesce(v_row ->> 'weight_kg', v_row ->> 'weight'), 0),
      v_surcharge,
      v_final_cod,
      nullif(coalesce(v_row ->> 'destination', v_row ->> 'city'), ''),
      nullif(coalesce(v_row ->> 'pickup_by', v_row ->> 'pickup_by_1'), ''),
      nullif(coalesce(v_row ->> 'remark', v_row ->> 'remarks', v_row ->> 'general_remarks'), ''),
      v_deli_fee,
      v_final_cod,
      nullif(v_row ->> 'finance_received_by', ''),
      coalesce(nullif(v_row ->> 'finance_status', ''), 'pending_finance'),
      'data_entry_registered',
      'registered',
      'pending_finance',
      'valid',
      '[]'::jsonb,
      v_row,
      p_payload ->> 'uploaded_by',
      p_payload ->> 'uploaded_by_name',
      now()
    )
    on conflict (delivery_way_id) do update set
      pickup_date = excluded.pickup_date,
      pickup_way_id = excluded.pickup_way_id,
      pickup_id = excluded.pickup_id,
      merchant_code = excluded.merchant_code,
      merchant_name = excluded.merchant_name,
      merchant = excluded.merchant,
      recipient_name = excluded.recipient_name,
      recipient_phone = excluded.recipient_phone,
      recipient_phone_2 = excluded.recipient_phone_2,
      recipient_township = excluded.recipient_township,
      recipient_address = excluded.recipient_address,
      item_price = excluded.item_price,
      deli_fee_os = excluded.deli_fee_os,
      delivery_fee_os = excluded.delivery_fee_os,
      cod_os = excluded.cod_os,
      std_deli = excluded.std_deli,
      max_deli = excluded.max_deli,
      weight_kg = excluded.weight_kg,
      surcharge = excluded.surcharge,
      final_cod = excluded.final_cod,
      destination = excluded.destination,
      pickup_by_1 = excluded.pickup_by_1,
      general_remarks = excluded.general_remarks,
      finance_deli = excluded.finance_deli,
      finance_cod = excluded.finance_cod,
      finance_status = excluded.finance_status,
      operation_status = excluded.operation_status,
      overall_status = excluded.overall_status,
      financial_status = excluded.financial_status,
      validation_status = excluded.validation_status,
      validation_errors = excluded.validation_errors,
      raw_row = excluded.raw_row,
      updated_at = now();

    insert into public.be_data_entry_register_rows (
      batch_id,
      row_no,
      source_file_name,
      pickup_date,
      pickup_way_id,
      delivery_way_id,
      merchant_code,
      merchant_name,
      recipient_name,
      recipient_phone,
      recipient_township,
      recipient_address,
      item_price,
      deli_fee_os,
      delivery_fee_os,
      cod_os,
      std_deli,
      max_deli,
      weight_kg,
      surcharge,
      final_cod,
      destination,
      pickup_by_1,
      general_remarks,
      finance_deli,
      finance_cod,
      finance_received_by,
      finance_status,
      operation_status,
      overall_status,
      financial_status,
      validation_status,
      validation_errors,
      raw_row,
      created_by,
      created_by_name,
      updated_at
    )
    values (
      v_batch,
      v_idx,
      p_payload ->> 'source_file_name',
      v_pickup_date,
      v_pickup_way_id,
      v_delivery_way_id,
      v_merchant_code,
      nullif(coalesce(v_row ->> 'merchant_name', v_row ->> 'merchant'), ''),
      nullif(v_row ->> 'recipient_name', ''),
      nullif(coalesce(v_row ->> 'recipient_phone', v_row ->> 'contact_no_1', v_row ->> 'phone'), ''),
      nullif(coalesce(v_row ->> 'recipient_township', v_row ->> 'township', v_row ->> 'town'), ''),
      nullif(coalesce(v_row ->> 'recipient_address', v_row ->> 'address'), ''),
      v_item_price,
      v_deli_fee,
      v_deli_fee,
      v_item_price + v_deli_fee,
      v_deli_fee,
      v_deli_fee,
      public.be_gl_num(coalesce(v_row ->> 'weight_kg', v_row ->> 'weight'), 0),
      v_surcharge,
      v_final_cod,
      nullif(coalesce(v_row ->> 'destination', v_row ->> 'city'), ''),
      nullif(coalesce(v_row ->> 'pickup_by', v_row ->> 'pickup_by_1'), ''),
      nullif(coalesce(v_row ->> 'remark', v_row ->> 'remarks', v_row ->> 'general_remarks'), ''),
      v_deli_fee,
      v_final_cod,
      nullif(v_row ->> 'finance_received_by', ''),
      coalesce(nullif(v_row ->> 'finance_status', ''), 'pending_finance'),
      'data_entry_registered',
      'registered',
      'pending_finance',
      'valid',
      '[]'::jsonb,
      v_row,
      p_payload ->> 'uploaded_by',
      p_payload ->> 'uploaded_by_name',
      now()
    )
    on conflict (delivery_way_id) do update set
      batch_id = excluded.batch_id,
      row_no = excluded.row_no,
      item_price = excluded.item_price,
      deli_fee_os = excluded.deli_fee_os,
      finance_cod = excluded.finance_cod,
      raw_row = excluded.raw_row,
      updated_at = now();

    v_upserted := v_upserted + 1;
  end loop;

  update public.be_data_entry_register_batches
  set valid_rows = (
        select count(*)
        from public.be_data_entry_register_rows
        where batch_id = v_batch
          and validation_status = 'valid'
      ),
      rejected_rows = (
        select count(*)
        from public.be_data_entry_register_rows
        where batch_id = v_batch
          and validation_status <> 'valid'
      ),
      updated_at = now()
  where batch_id = v_batch;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_batch,
    'total_rows', v_total,
    'upserted_rows', v_upserted,
    'synced_to_delivery_waybills', true,
    'synced_to_finance', true
  );
end;
$function$
