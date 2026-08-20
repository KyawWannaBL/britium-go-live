-- PARCEL_FINANCIAL_V2.2.1 SECURITY AND COLLECTION-STATE HARDENING
-- Build: PARCEL_FINANCIAL_V2_2_1_HARDENING_2026-07-31
-- Run after parcel_financial_v2_2_ui_finance_bridge.sql.
-- No rows are deleted.

begin;

-- Normalize Data Entry financial inputs by collection situation.
-- Important: actual_collect is NOT pre-populated during Data Entry. It represents
-- an actual collection event and must be written only by the delivery/finance flow.
create or replace function public.be_data_entry_save_financial_row_v2(
  p_pickup_id text,
  p_parcel_sequence integer,
  p_delivery_way_id text,
  p_merchant_id text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote jsonb;
  v_updated integer;
  v_township text := nullif(btrim(p_payload->>'township'), '');
  v_tier text := upper(coalesce(nullif(btrim(p_payload->>'customer_tier'), ''), 'STANDARD'));
  v_type text := upper(coalesce(nullif(btrim(p_payload->>'amount_entry_type'), ''), 'ITEM_PRICE_PLUS_DECLARED_DELIVERY'));
  v_item_price bigint := nullif(p_payload->>'item_price','')::bigint;
  v_delivery_charges bigint := nullif(p_payload->>'delivery_charges','')::bigint;
  v_stated_total bigint := nullif(p_payload->>'merchant_stated_total_amount','')::bigint;
  v_additional bigint := coalesce(nullif(p_payload->>'additional_customer_charge','')::bigint,0);
  v_cbm bigint := coalesce(nullif(p_payload->>'cbm_surcharge','')::bigint,0);
  v_other bigint := coalesce(nullif(p_payload->>'other_surcharge','')::bigint,0);
  v_merchant_charges bigint := coalesce(nullif(p_payload->>'merchant_payable_charges','')::bigint,0);
  v_merchant_credits bigint := coalesce(nullif(p_payload->>'other_merchant_credits','')::bigint,0);
  v_weight numeric := coalesce(nullif(p_payload->>'weight_kg','')::numeric,0);
begin
  if auth.uid() is null then
    raise exception 'Authenticated Data Entry user is required';
  end if;

  if v_type = 'DELIVERY_CHARGE_ONLY' then
    v_item_price := 0;
    v_stated_total := null;
  elsif v_type = 'EXACT_COLLECTION_AMOUNT' then
    v_item_price := null;
    v_delivery_charges := null;
  elsif v_type = 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' then
    v_delivery_charges := 0;
    v_stated_total := null;
  elsif v_type = 'TOTAL_AMOUNT_INCLUDING_DELIVERY' then
    v_delivery_charges := null;
  elsif v_type = 'ITEM_PRICE_PLUS_DECLARED_DELIVERY' then
    v_stated_total := null;
  end if;

  v_quote := public.be_data_entry_financial_quote_v2(
    p_merchant_id,
    v_township,
    v_tier,
    v_type,
    v_item_price,
    v_delivery_charges,
    v_stated_total,
    v_additional,
    v_cbm,
    v_other,
    v_merchant_charges,
    v_merchant_credits,
    v_weight
  );

  if v_quote->>'validation_status' = 'ERROR' then
    raise exception 'Financial validation failed: %', v_quote->>'validation_message';
  end if;

  update public.be_data_entry_parcel_details d set
    customer_tier = v_quote->>'resolved_customer_tier',
    amount_entry_type = v_type,
    item_price = v_item_price,
    weight_kg = v_weight,
    delivery_charges = v_delivery_charges,
    merchant_stated_total_amount = v_stated_total,
    additional_customer_charge = v_additional,
    cbm_surcharge = v_cbm,
    other_surcharge = v_other,
    merchant_payable_charges = v_merchant_charges,
    other_merchant_credits = v_merchant_credits,
    surcharge = (v_quote->>'weight_surcharge')::bigint,
    delivery_fee = (v_quote->>'net_system_delivery_charge')::bigint,
    cod_amount = (v_quote->>'cod_amount')::bigint,
    base_tariff = (v_quote->>'base_tariff')::bigint,
    included_kg = (v_quote->>'included_kg')::numeric,
    chargeable_weight_kg = (v_quote->>'chargeable_weight_kg')::numeric,
    extra_kg = (v_quote->>'extra_kg')::numeric,
    weight_surcharge = (v_quote->>'weight_surcharge')::bigint,
    gross_system_delivery_charge = (v_quote->>'gross_system_delivery_charge')::bigint,
    commitment_refund = (v_quote->>'commitment_refund')::bigint,
    net_system_delivery_charge = (v_quote->>'net_system_delivery_charge')::bigint,
    effective_declared_delivery_charge = nullif(v_quote->>'effective_declared_delivery_charge','')::bigint,
    delivery_difference = nullif(v_quote->>'delivery_difference','')::bigint,
    settlement_direction = v_quote->>'settlement_direction',
    merchant_settlement_adjustment = nullif(v_quote->>'merchant_settlement_adjustment','')::bigint,
    merchant_final_settlement_amount = nullif(v_quote->>'merchant_final_settlement_amount','')::bigint,
    financial_validation_status = v_quote->>'validation_status',
    financial_validation_message = v_quote->>'validation_message',
    financial_calculation_version = v_quote->>'calculation_version',
    financial_calculated_at = nullif(v_quote->>'calculated_at','')::timestamptz,
    financial_quote = v_quote,
    updated_at = now()
  where d.pickup_id = p_pickup_id
    and d.parcel_sequence = p_parcel_sequence
    and d.delivery_way_id = p_delivery_way_id;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Base Data Entry row was not found. Save the recipient row before saving its financial calculation.';
  end if;

  return v_quote || jsonb_build_object(
    'saved',true,
    'delivery_way_id',p_delivery_way_id,
    'actual_collect_written',false
  );
end
$$;

-- Resolve either way_id or delivery_way_id without requiring both columns.
create or replace function public.be_data_entry_apply_financial_to_parcel_v2(
  p_delivery_way_id text,
  p_authorized_by uuid default null,
  p_reason text default 'DATA_ENTRY_FINANCIAL_V2'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detail public.be_data_entry_parcel_details%rowtype;
  v_parcel_id text;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Data Entry user is required';
  end if;

  select * into v_detail
  from public.be_data_entry_parcel_details
  where delivery_way_id = p_delivery_way_id
  order by updated_at desc nulls last
  limit 1;

  if not found then
    raise exception 'Data Entry financial row % was not found', p_delivery_way_id;
  end if;

  select p.id::text into v_parcel_id
  from public.parcels p
  where coalesce(
    nullif(to_jsonb(p)->>'way_id',''),
    nullif(to_jsonb(p)->>'delivery_way_id',''),
    nullif(to_jsonb(p)->>'waybill_no','')
  ) = p_delivery_way_id
  order by p.created_at desc nulls last
  limit 1;

  if v_parcel_id is null then
    raise exception 'Parcel % has not been created yet. Create the waybill first, then apply financials.', p_delivery_way_id;
  end if;

  update public.parcels p set
    customer_tier = v_detail.customer_tier,
    amount_entry_type = v_detail.amount_entry_type,
    item_price = v_detail.item_price,
    weight_kg = v_detail.weight_kg,
    township = v_detail.township,
    delivery_charges = v_detail.delivery_charges,
    merchant_stated_total_amount = v_detail.merchant_stated_total_amount,
    additional_customer_charge = v_detail.additional_customer_charge,
    cbm_surcharge = v_detail.cbm_surcharge,
    other_surcharge = v_detail.other_surcharge,
    merchant_payable_charges = v_detail.merchant_payable_charges,
    other_merchant_credits = v_detail.other_merchant_credits,
    remarks = coalesce(v_detail.remark, p.remarks),
    entered_by = coalesce(p.entered_by, auth.uid())
  where p.id::text = v_parcel_id;

  return public.be_recalculate_parcel_financial_v2(
    v_parcel_id,
    auth.uid(),
    p_authorized_by,
    p_reason
  ) || jsonb_build_object(
    'parcel_id',v_parcel_id,
    'delivery_way_id',p_delivery_way_id,
    'applied',true
  );
end
$$;

-- Batch settlement hardening:
--   * authenticated actor cannot be spoofed;
--   * duplicate parcel IDs are normalized;
--   * a settlement batch ID cannot be reused;
--   * all parcel settlement calls remain one atomic transaction.
create or replace function public.be_finance_settle_batch_v2(
  p_parcel_ids text[],
  p_actor uuid default null,
  p_settlement_batch_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids text[];
  v_id text;
  v_actor uuid := auth.uid();
  v_requested integer;
  v_invalid integer;
  v_result jsonb;
  v_customer bigint;
  v_merchant bigint;
  v_revenue bigint;
  v_additional bigint;
  v_merchants integer;
begin
  if v_actor is null then
    raise exception 'Authenticated Finance user is required';
  end if;
  if p_actor is not null and p_actor <> v_actor then
    raise exception 'Actor mismatch: settlement actor must be the authenticated user';
  end if;

  select coalesce(array_agg(distinct btrim(x)) filter (where nullif(btrim(x),'') is not null), array[]::text[])
  into v_ids
  from unnest(coalesce(p_parcel_ids,array[]::text[])) as u(x);

  v_requested := cardinality(v_ids);
  if v_requested = 0 then
    raise exception 'Select at least one parcel';
  end if;

  if exists (
    select 1 from public.be_finance_settlement_batches_v2 b
    where b.settlement_batch_id = p_settlement_batch_id
  ) then
    raise exception 'Settlement batch % already exists and cannot be reused', p_settlement_batch_id;
  end if;

  select count(*)::integer into v_invalid
  from unnest(v_ids) x(parcel_id)
  left join public.be_v_finance_merchant_settlement_queue_v2 q
    on q.parcel_id = x.parcel_id
  where q.parcel_id is null or not q.settlement_eligible;

  if v_invalid > 0 then
    raise exception '% selected parcel(s) are missing or not eligible for settlement', v_invalid;
  end if;

  select
    coalesce(sum(customer_total_collection),0),
    coalesce(sum(merchant_final_settlement_amount),0),
    coalesce(sum(net_system_delivery_charge),0),
    coalesce(sum(additional_customer_charge),0),
    count(distinct merchant_id)::integer
  into v_customer, v_merchant, v_revenue, v_additional, v_merchants
  from public.be_v_finance_merchant_settlement_queue_v2
  where parcel_id = any(v_ids);

  insert into public.be_finance_settlement_batches_v2 (
    settlement_batch_id,status,parcel_count,merchant_count,
    total_customer_collection,total_merchant_settlement,
    total_company_delivery_revenue,total_company_additional_charges,
    created_by,metadata
  ) values (
    p_settlement_batch_id,'PROCESSING',v_requested,v_merchants,
    v_customer,v_merchant,v_revenue,v_additional,
    v_actor,jsonb_build_object('parcel_ids',to_jsonb(v_ids),'source','FINANCE_MERCHANT_SETTLEMENT_V2_2_1')
  );

  foreach v_id in array v_ids loop
    v_result := public.be_settle_parcel_financial_v2(
      v_id,
      p_settlement_batch_id,
      v_actor
    );
  end loop;

  update public.be_finance_settlement_batches_v2
  set status='COMPLETED', completed_at=now()
  where settlement_batch_id=p_settlement_batch_id;

  return jsonb_build_object(
    'ok',true,
    'settlement_batch_id',p_settlement_batch_id,
    'parcel_count',v_requested,
    'merchant_count',v_merchants,
    'total_customer_collection',v_customer,
    'total_merchant_settlement',v_merchant,
    'total_company_delivery_revenue',v_revenue,
    'total_company_additional_charges',v_additional
  );
end
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Remove that implicit exposure.
revoke all on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer) from public;
revoke all on function public.be_recalculate_parcel_financial_v2(text,uuid,uuid,text) from public;
revoke all on function public.be_lock_parcel_financial_v2(text,uuid,text) from public;
revoke all on function public.be_settle_parcel_financial_v2(text,uuid,uuid) from public;
revoke all on function public.be_data_entry_financial_quote_v2(text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric) from public;
revoke all on function public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb) from public;
revoke all on function public.be_data_entry_apply_financial_to_parcel_v2(text,uuid,text) from public;
revoke all on function public.be_finance_settle_batch_v2(text[],uuid,uuid) from public;
revoke all on function public.be_finance_settlement_dashboard_v2() from public;

revoke all on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer) from anon;
revoke all on function public.be_recalculate_parcel_financial_v2(text,uuid,uuid,text) from anon;
revoke all on function public.be_lock_parcel_financial_v2(text,uuid,text) from anon;
revoke all on function public.be_settle_parcel_financial_v2(text,uuid,uuid) from anon;
revoke all on function public.be_data_entry_financial_quote_v2(text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric) from anon;
revoke all on function public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb) from anon;
revoke all on function public.be_data_entry_apply_financial_to_parcel_v2(text,uuid,text) from anon;
revoke all on function public.be_finance_settle_batch_v2(text[],uuid,uuid) from anon;
revoke all on function public.be_finance_settlement_dashboard_v2() from anon;

revoke all on public.be_finance_settlement_batches_v2 from anon;
revoke all on public.be_v_finance_merchant_settlement_queue_v2 from anon;

grant execute on function public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer) to authenticated;
grant execute on function public.be_recalculate_parcel_financial_v2(text,uuid,uuid,text) to authenticated;
grant execute on function public.be_lock_parcel_financial_v2(text,uuid,text) to authenticated;
grant execute on function public.be_settle_parcel_financial_v2(text,uuid,uuid) to authenticated;
grant execute on function public.be_data_entry_financial_quote_v2(text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric) to authenticated;
grant execute on function public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb) to authenticated;
grant execute on function public.be_data_entry_apply_financial_to_parcel_v2(text,uuid,text) to authenticated;
grant execute on function public.be_finance_settle_batch_v2(text[],uuid,uuid) to authenticated;
grant execute on function public.be_finance_settlement_dashboard_v2() to authenticated;
grant select on public.be_finance_settlement_batches_v2 to authenticated;
grant select on public.be_v_finance_merchant_settlement_queue_v2 to authenticated;

notify pgrst, 'reload schema';
commit;

select jsonb_build_object(
  'build','PARCEL_FINANCIAL_V2_2_1_HARDENING_2026-07-31',
  'authenticated_only',true,
  'actual_collect_prepopulated',false,
  'batch_actor_spoof_blocked',true,
  'duplicate_parcel_ids_deduplicated',true,
  'batch_id_reuse_blocked',true,
  'deletes_rows',false
) as parcel_financial_v2_2_1_installation;
