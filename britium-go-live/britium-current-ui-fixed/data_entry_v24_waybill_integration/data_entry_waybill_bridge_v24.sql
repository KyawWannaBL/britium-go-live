-- Britium Data Entry V24
-- Confirm parcel rows, create the pickup-level waybill, and synchronize the
-- legacy Data Entry / Waybill Studio / Print Room / Warehouse workflow.
--
-- Safe to run after the existing V13/V16 parcel and pickup migrations.
-- This script does not replace or drop any views.

create or replace function public.be_data_entry_v24_numeric(
  p_value text,
  p_default numeric default 0
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_clean text;
begin
  v_clean := nullif(regexp_replace(coalesce(p_value, ''), '[,[:space:]]', '', 'g'), '');
  if v_clean is null then
    return coalesce(p_default, 0);
  end if;

  begin
    return v_clean::numeric;
  exception when others then
    return coalesce(p_default, 0);
  end;
end;
$$;

create or replace function public.be_data_entry_confirm_waybill_v24(
  p_pickup_id text,
  p_rows jsonb,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_result jsonb := null;
  v_primary_error text := null;
  v_legacy_rows jsonb := '[]'::jsonb;
  v_legacy_result jsonb := null;
  v_legacy_error text := null;
  v_legacy_detail_error text := null;
  v_legacy_saved_count integer := 0;
  v_summary jsonb := null;
  v_first jsonb := '{}'::jsonb;
  v_screen_sync_ok boolean := false;
  v_ok boolean := false;
begin
  if nullif(btrim(coalesce(p_pickup_id, '')), '') is null then
    raise exception 'pickup_id is required';
  end if;

  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) = 0 then
    raise exception 'At least one parcel row is required';
  end if;

  -- Save the exact 15-column parcel sheet and create/update be_parcel_waybills.
  begin
    execute 'select to_jsonb(public.be_data_entry_create_waybill_from_parcel_sheet($1, $2, $3))'
      into v_primary_result
      using p_pickup_id, p_rows, p_actor_email;
  exception
    when undefined_function then
      v_primary_error := 'be_data_entry_create_waybill_from_parcel_sheet(text,jsonb,text) is not installed';
    when others then
      v_primary_error := sqlerrm;
  end;

  -- Translate the exact parcel-sheet headers to the legacy row contract used by
  -- Waybill Studio, document printing, and warehouse queues.
  select coalesce(jsonb_agg(jsonb_build_object(
    'parcel_sequence', coalesce(
      nullif(regexp_replace(coalesce(r.value->>'စဉ်', ''), '[^0-9-]+', '', 'g'), '')::integer,
      r.ordinality::integer
    ),
    'delivery_way_id', coalesce(nullif(btrim(r.value->>'Way ID'), ''), nullif(btrim(r.value->>'way_id'), '')),
    'recipient_name', coalesce(r.value->>'လက်ခံမည့်သူအမည်', r.value->>'recipient_name', ''),
    'contact_no_1', coalesce(r.value->>'ဖုန်း', r.value->>'recipient_phone', ''),
    'contact_no_2', null,
    'township', coalesce(r.value->>'မြို့နယ်', r.value->>'township', ''),
    'recipient_address', coalesce(r.value->>'လိပ်စာ', r.value->>'delivery_address', ''),
    'customer_tier', 'Standard',
    'item_price', public.be_data_entry_v24_numeric(coalesce(r.value->>'ပစ္စည်းတန်ဖိုး', r.value->>'item_price'), 0),
    'weight_kg', public.be_data_entry_v24_numeric(coalesce(r.value->>'ကီလို', r.value->>'weight_kg'), 0),
    'surcharge', public.be_data_entry_v24_numeric(coalesce(r.value->>'ကီလိုအပိုကြေး', r.value->>'extra_weight_charge'), 0),
    'delivery_fee', public.be_data_entry_v24_numeric(coalesce(r.value->>'ပို့ဆောင်ခ', r.value->>'delivery_charges'), 0),
    'cod_amount', public.be_data_entry_v24_numeric(coalesce(r.value->>'ပစ္စည်းတန်ဖိုး', r.value->>'item_price'), 0),
    'actual_collect', public.be_data_entry_v24_numeric(coalesce(r.value->>'ငွေကောက်ရန်', r.value->>'collect_amount'), 0),
    'destination', coalesce(r.value->>'Destination', r.value->>'destination', ''),
    'pickup_by', 'DATA_ENTRY',
    'remark', coalesce(r.value->>'Remarks', r.value->>'remarks', ''),
    'os', coalesce(r.value->>'OS', r.value->>'os', ''),
    'proof_photo_path', null
  ) order by r.ordinality), '[]'::jsonb)
  into v_legacy_rows
  from jsonb_array_elements(p_rows) with ordinality as r(value, ordinality);

  v_first := coalesce(v_legacy_rows->0, '{}'::jsonb);

  -- Keep be_data_entry_parcel_details synchronized for older Data Entry and
  -- Waybill Studio screens. Any schema mismatch is returned as a diagnostic and
  -- does not roll back the exact parcel-sheet save.
  if to_regclass('public.be_data_entry_parcel_details') is not null then
    begin
      execute $legacy_detail_sql$
        insert into public.be_data_entry_parcel_details (
          pickup_id,
          parcel_sequence,
          delivery_way_id,
          recipient_name,
          contact_no_1,
          contact_no_2,
          township,
          recipient_address,
          customer_tier,
          item_price,
          weight_kg,
          surcharge,
          delivery_fee,
          cod_amount,
          actual_collect,
          destination,
          pickup_by,
          remark,
          proof_photo_path,
          saved_by_email,
          saved_at,
          updated_at
        )
        select
          $2::text,
          x.parcel_sequence,
          x.delivery_way_id,
          nullif(x.recipient_name, ''),
          nullif(x.contact_no_1, ''),
          nullif(x.contact_no_2, ''),
          nullif(x.township, ''),
          nullif(x.recipient_address, ''),
          coalesce(nullif(x.customer_tier, ''), 'Standard'),
          coalesce(x.item_price, 0),
          coalesce(x.weight_kg, 0),
          coalesce(x.surcharge, 0),
          coalesce(x.delivery_fee, 0),
          coalesce(x.cod_amount, 0),
          coalesce(x.actual_collect, 0),
          nullif(x.destination, ''),
          coalesce(nullif(x.pickup_by, ''), 'DATA_ENTRY'),
          nullif(x.remark, ''),
          nullif(x.proof_photo_path, ''),
          $3::text,
          now(),
          now()
        from jsonb_to_recordset($1::jsonb) as x(
          parcel_sequence integer,
          delivery_way_id text,
          recipient_name text,
          contact_no_1 text,
          contact_no_2 text,
          township text,
          recipient_address text,
          customer_tier text,
          item_price numeric,
          weight_kg numeric,
          surcharge numeric,
          delivery_fee numeric,
          cod_amount numeric,
          actual_collect numeric,
          destination text,
          pickup_by text,
          remark text,
          proof_photo_path text
        )
        on conflict (pickup_id, parcel_sequence) do update set
          delivery_way_id = excluded.delivery_way_id,
          recipient_name = excluded.recipient_name,
          contact_no_1 = excluded.contact_no_1,
          contact_no_2 = excluded.contact_no_2,
          township = excluded.township,
          recipient_address = excluded.recipient_address,
          customer_tier = excluded.customer_tier,
          item_price = excluded.item_price,
          weight_kg = excluded.weight_kg,
          surcharge = excluded.surcharge,
          delivery_fee = excluded.delivery_fee,
          cod_amount = excluded.cod_amount,
          actual_collect = excluded.actual_collect,
          destination = excluded.destination,
          pickup_by = excluded.pickup_by,
          remark = excluded.remark,
          proof_photo_path = coalesce(excluded.proof_photo_path, be_data_entry_parcel_details.proof_photo_path),
          saved_by_email = coalesce(excluded.saved_by_email, be_data_entry_parcel_details.saved_by_email),
          saved_at = now(),
          updated_at = now()
      $legacy_detail_sql$
      using v_legacy_rows, p_pickup_id, p_actor_email;

      execute 'select count(*)::integer from public.be_data_entry_parcel_details where pickup_id = $1'
        into v_legacy_saved_count
        using p_pickup_id;
    exception when others then
      v_legacy_detail_error := sqlerrm;
      v_legacy_saved_count := 0;
    end;
  else
    v_legacy_detail_error := 'public.be_data_entry_parcel_details does not exist';
  end if;

  -- Use the existing legacy workflow API to populate the screens and queues.
  -- Skip an additional call when the primary RPC already reports a legacy result.
  if v_primary_result is not null
     and v_primary_result ? 'legacy_result'
     and jsonb_typeof(v_primary_result->'legacy_result') <> 'null' then
    v_legacy_result := v_primary_result->'legacy_result';
  else
    begin
      execute 'select to_jsonb(public.be_data_entry_create_waybill_from_rows($1, $2, $3))'
        into v_legacy_result
        using p_pickup_id, v_legacy_rows, p_actor_email;
    exception
      when undefined_function then
        v_legacy_error := 'be_data_entry_create_waybill_from_rows(text,jsonb,text) is not installed';
      when others then
        v_legacy_error := sqlerrm;
    end;
  end if;

  -- Compatibility fallback for older installations that expose only the
  -- pickup-level single-waybill RPC.
  if v_legacy_result is null then
    begin
      execute 'select to_jsonb(public.be_data_entry_create_waybill($1,$2,$3,$4,$5,$6,$7,$8,$9))'
        into v_legacy_result
        using
          p_pickup_id,
          null::text,
          coalesce(v_first->>'recipient_name', 'Receiver'),
          coalesce(v_first->>'contact_no_1', ''),
          coalesce(v_first->>'recipient_address', ''),
          coalesce(v_first->>'destination', 'Yangon'),
          coalesce(v_first->>'township', ''),
          public.be_data_entry_v24_numeric(v_first->>'actual_collect', 0),
          p_actor_email;
    exception
      when undefined_function then
        if v_legacy_error is null then
          v_legacy_error := 'No compatible legacy Waybill creation RPC is installed';
        end if;
      when others then
        v_legacy_error := concat_ws(' | ', v_legacy_error, sqlerrm);
    end;
  end if;

  if to_regclass('public.be_parcel_waybills') is not null then
    begin
      execute 'select to_jsonb(w) from public.be_parcel_waybills w where w.pickup_id = $1 order by w.updated_at desc limit 1'
        into v_summary
        using p_pickup_id;
    exception when others then
      v_summary := null;
    end;
  end if;

  v_screen_sync_ok := v_legacy_result is not null;
  v_ok := v_primary_result is not null or v_summary is not null or v_legacy_result is not null;

  return jsonb_build_object(
    'ok', v_ok,
    'screen_sync_ok', v_screen_sync_ok,
    'pickup_id', p_pickup_id,
    'waybill_id', coalesce(
      v_summary->>'waybill_id',
      v_primary_result->>'waybill_id',
      v_primary_result->'waybill'->>'waybill_id',
      v_legacy_result->>'waybill_id'
    ),
    'waybill_no', coalesce(
      v_legacy_result->>'waybill_no',
      v_legacy_result->>'waybillNo',
      v_summary->>'waybill_no',
      v_primary_result->>'waybill_no',
      v_primary_result->'waybill'->>'waybill_no'
    ),
    'parcel_count', coalesce(
      nullif(v_legacy_result->>'parcel_count', '')::integer,
      nullif(v_summary->>'parcel_count', '')::integer,
      nullif(v_primary_result->>'parcel_count', '')::integer,
      jsonb_array_length(p_rows)
    ),
    'legacy_detail_rows', v_legacy_saved_count,
    'primary_result', v_primary_result,
    'primary_error', v_primary_error,
    'legacy_result', v_legacy_result,
    'legacy_sync_error', v_legacy_error,
    'legacy_detail_error', v_legacy_detail_error,
    'waybill', v_summary,
    'related_screens', jsonb_build_array('Waybill Studio', 'Doc Print Room', 'Warehouse Ops')
  );
end;
$$;

grant execute on function public.be_data_entry_confirm_waybill_v24(text, jsonb, text) to authenticated;
grant execute on function public.be_data_entry_confirm_waybill_v24(text, jsonb, text) to service_role;

grant execute on function public.be_data_entry_v24_numeric(text, numeric) to authenticated;
grant execute on function public.be_data_entry_v24_numeric(text, numeric) to service_role;

-- Ask PostgREST to reload function signatures.
notify pgrst, 'reload schema';

-- Installation verification only. This does not create a Waybill.
select
  to_regprocedure('public.be_data_entry_confirm_waybill_v24(text,jsonb,text)')::text as waybill_bridge_signature,
  to_regprocedure('public.be_data_entry_create_waybill_from_parcel_sheet(text,jsonb,text)')::text as parcel_sheet_rpc,
  to_regprocedure('public.be_data_entry_create_waybill_from_rows(text,jsonb,text)')::text as legacy_screen_sync_rpc;
