-- PARCEL_FINANCIAL_V2_2_UI_FINANCE_BRIDGE_2026-07-31
-- Data Entry quote/save bridge + Finance merchant/online-seller settlement queue.
-- Requires PARCEL_FINANCIAL_V2 backend and V2.1 Yangon business-date hotfix.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regprocedure('public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer)') is null then
    raise exception 'Install PARCEL_FINANCIAL_V2 backend before V2.2';
  end if;
  if to_regprocedure('public.be_recalculate_parcel_financial_v2(text,uuid,uuid,text)') is null then
    raise exception 'be_recalculate_parcel_financial_v2 is missing';
  end if;
  if to_regprocedure('public.be_settle_parcel_financial_v2(text,uuid,uuid)') is null then
    raise exception 'be_settle_parcel_financial_v2 is missing';
  end if;
  if to_regprocedure('public.be_business_date()') is null then
    raise exception 'Install the V2.1 Yangon business-date hotfix before V2.2';
  end if;
  if to_regclass('public.be_data_entry_parcel_details') is null then
    raise exception 'public.be_data_entry_parcel_details is missing';
  end if;
end
$$;

alter table public.be_merchant_financial_profiles_v2
  add column if not exists merchant_name text,
  add column if not exists counterparty_type text not null default 'MERCHANT',
  add column if not exists settlement_method text,
  add column if not exists settlement_account text,
  add column if not exists settlement_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'be_merchant_financial_profiles_v2_counterparty_check'
      and conrelid = 'public.be_merchant_financial_profiles_v2'::regclass
  ) then
    alter table public.be_merchant_financial_profiles_v2
      add constraint be_merchant_financial_profiles_v2_counterparty_check
      check (counterparty_type in ('MERCHANT','ONLINE_SELLER','CUSTOMER_ACCOUNT')) not valid;
  end if;
end
$$;

alter table public.be_data_entry_parcel_details
  add column if not exists amount_entry_type text,
  add column if not exists delivery_charges bigint,
  add column if not exists merchant_stated_total_amount bigint,
  add column if not exists additional_customer_charge bigint not null default 0,
  add column if not exists cbm_surcharge bigint not null default 0,
  add column if not exists other_surcharge bigint not null default 0,
  add column if not exists merchant_payable_charges bigint not null default 0,
  add column if not exists other_merchant_credits bigint not null default 0,
  add column if not exists base_tariff bigint,
  add column if not exists included_kg numeric(10,3),
  add column if not exists chargeable_weight_kg numeric(10,3),
  add column if not exists extra_kg numeric(10,3),
  add column if not exists weight_surcharge bigint,
  add column if not exists gross_system_delivery_charge bigint,
  add column if not exists commitment_refund bigint,
  add column if not exists net_system_delivery_charge bigint,
  add column if not exists effective_declared_delivery_charge bigint,
  add column if not exists delivery_difference bigint,
  add column if not exists settlement_direction text,
  add column if not exists merchant_settlement_adjustment bigint,
  add column if not exists merchant_final_settlement_amount bigint,
  add column if not exists financial_validation_status text,
  add column if not exists financial_validation_message text,
  add column if not exists financial_calculation_version text,
  add column if not exists financial_calculated_at timestamptz,
  add column if not exists financial_quote jsonb not null default '{}'::jsonb;

create or replace function public.be_data_entry_financial_quote_v2(
  p_merchant_id text,
  p_township text,
  p_customer_tier text,
  p_amount_entry_type text,
  p_item_price bigint default null,
  p_delivery_charges bigint default null,
  p_merchant_stated_total_amount bigint default null,
  p_additional_customer_charge bigint default 0,
  p_cbm_surcharge bigint default 0,
  p_other_surcharge bigint default 0,
  p_merchant_payable_charges bigint default 0,
  p_other_merchant_credits bigint default 0,
  p_actual_weight_kg numeric default 0
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tier text := upper(btrim(coalesce(p_customer_tier, 'STANDARD')));
  v_monthly integer := 0;
  v_profile public.be_merchant_financial_profiles_v2%rowtype;
  v_result jsonb;
begin
  if nullif(btrim(coalesce(p_merchant_id,'')), '') is not null then
    select * into v_profile
    from public.be_merchant_financial_profiles_v2 m
    where m.merchant_id = p_merchant_id
      and m.is_active
      and m.effective_from <= public.be_business_date()
      and (m.effective_to is null or m.effective_to >= public.be_business_date())
    order by m.effective_from desc
    limit 1;

    if found then
      v_tier := v_profile.customer_tier;
    end if;

    select count(*)::integer into v_monthly
    from public.parcels p
    where p.merchant_id::text = p_merchant_id
      and date_trunc('month', coalesce(p.created_at, now()) at time zone 'Asia/Yangon')
          = date_trunc('month', public.be_business_date()::timestamp)
      and upper(coalesce(p.status,'')) not in ('CANCELLED','FAILED');
  end if;

  v_result := public.be_calculate_parcel_financial_v2(
    p_township,
    v_tier,
    p_amount_entry_type,
    p_item_price,
    p_delivery_charges,
    p_merchant_stated_total_amount,
    p_additional_customer_charge,
    p_cbm_surcharge,
    p_other_surcharge,
    p_merchant_payable_charges,
    p_other_merchant_credits,
    p_actual_weight_kg,
    v_monthly
  );

  return v_result || jsonb_build_object(
    'resolved_customer_tier', v_tier,
    'backend_monthly_ways', v_monthly,
    'merchant_id', p_merchant_id
  );
end
$$;

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
begin
  v_quote := public.be_data_entry_financial_quote_v2(
    p_merchant_id,
    v_township,
    v_tier,
    v_type,
    nullif(p_payload->>'item_price','')::bigint,
    nullif(p_payload->>'delivery_charges','')::bigint,
    nullif(p_payload->>'merchant_stated_total_amount','')::bigint,
    coalesce(nullif(p_payload->>'additional_customer_charge','')::bigint,0),
    coalesce(nullif(p_payload->>'cbm_surcharge','')::bigint,0),
    coalesce(nullif(p_payload->>'other_surcharge','')::bigint,0),
    coalesce(nullif(p_payload->>'merchant_payable_charges','')::bigint,0),
    coalesce(nullif(p_payload->>'other_merchant_credits','')::bigint,0),
    coalesce(nullif(p_payload->>'weight_kg','')::numeric,0)
  );

  if v_quote->>'validation_status' = 'ERROR' then
    raise exception 'Financial validation failed: %', v_quote->>'validation_message';
  end if;

  update public.be_data_entry_parcel_details d set
    customer_tier = v_quote->>'resolved_customer_tier',
    amount_entry_type = v_type,
    item_price = coalesce(nullif(p_payload->>'item_price','')::bigint,0),
    weight_kg = coalesce(nullif(p_payload->>'weight_kg','')::numeric,0),
    delivery_charges = nullif(p_payload->>'delivery_charges','')::bigint,
    merchant_stated_total_amount = nullif(p_payload->>'merchant_stated_total_amount','')::bigint,
    additional_customer_charge = coalesce(nullif(p_payload->>'additional_customer_charge','')::bigint,0),
    cbm_surcharge = coalesce(nullif(p_payload->>'cbm_surcharge','')::bigint,0),
    other_surcharge = coalesce(nullif(p_payload->>'other_surcharge','')::bigint,0),
    merchant_payable_charges = coalesce(nullif(p_payload->>'merchant_payable_charges','')::bigint,0),
    other_merchant_credits = coalesce(nullif(p_payload->>'other_merchant_credits','')::bigint,0),
    surcharge = (v_quote->>'weight_surcharge')::bigint,
    delivery_fee = (v_quote->>'net_system_delivery_charge')::bigint,
    cod_amount = (v_quote->>'cod_amount')::bigint,
    actual_collect = (v_quote->>'cod_amount')::bigint,
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

  return v_quote || jsonb_build_object('saved',true,'delivery_way_id',p_delivery_way_id);
end
$$;

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
  where p.way_id::text = p_delivery_way_id
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
  ) || jsonb_build_object('parcel_id',v_parcel_id,'delivery_way_id',p_delivery_way_id,'applied',true);
end
$$;

create table if not exists public.be_finance_settlement_batches_v2 (
  settlement_batch_id uuid primary key default gen_random_uuid(),
  status text not null default 'DRAFT',
  parcel_count integer not null default 0,
  merchant_count integer not null default 0,
  total_customer_collection bigint not null default 0,
  total_merchant_settlement bigint not null default 0,
  total_company_delivery_revenue bigint not null default 0,
  total_company_additional_charges bigint not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint be_finance_settlement_batches_v2_status_check
    check (status in ('DRAFT','PROCESSING','COMPLETED','FAILED','VOID'))
);

create or replace view public.be_v_finance_merchant_settlement_queue_v2 as
select
  p.id::text as parcel_id,
  p.way_id::text as delivery_way_id,
  p.merchant_id::text as merchant_id,
  coalesce(m.merchant_name, p.merchant_id::text) as merchant_name,
  coalesce(m.counterparty_type, 'MERCHANT') as counterparty_type,
  m.settlement_method,
  m.settlement_account,
  p.status,
  to_jsonb(p)->>'recipient_name' as recipient_name,
  to_jsonb(p)->>'recipient_phone' as recipient_phone,
  p.township::text as township,
  p.customer_tier,
  p.amount_entry_type,
  p.item_price,
  p.delivery_charges as merchant_declared_delivery_charge,
  p.additional_customer_charge,
  p.cod_amount as customer_total_collection,
  p.base_tariff,
  p.weight_surcharge,
  p.cbm_surcharge,
  p.other_surcharge,
  p.gross_system_delivery_charge,
  p.commitment_refund,
  p.net_system_delivery_charge,
  p.delivery_difference,
  p.merchant_settlement_adjustment,
  p.merchant_final_settlement_amount,
  greatest(coalesce(-p.merchant_final_settlement_amount,0),0) as merchant_receivable,
  p.settlement_direction,
  p.validation_status,
  p.validation_message,
  p.calculation_version,
  p.calculated_at,
  p.financial_locked_at,
  p.financial_settled_at,
  p.financial_settlement_batch_id,
  (
    upper(coalesce(p.status,'')) = 'DELIVERED'
    and p.validation_status = 'OK'
    and coalesce(p.settlement_direction,'') <> 'BREAKDOWN_REQUIRED'
    and p.financial_settled_at is null
  ) as settlement_eligible,
  case
    when p.financial_settled_at is not null then 'SETTLED'
    when upper(coalesce(p.status,'')) <> 'DELIVERED' then 'WAITING_DELIVERY'
    when p.validation_status = 'ERROR' then 'CALCULATION_ERROR'
    when p.validation_status = 'REVIEW' or p.settlement_direction = 'BREAKDOWN_REQUIRED' then 'REVIEW_REQUIRED'
    when p.validation_status = 'OK' then 'READY_TO_SETTLE'
    else 'NOT_READY'
  end as settlement_state,
  p.created_at
from public.parcels p
left join public.be_merchant_financial_profiles_v2 m
  on m.merchant_id = p.merchant_id::text
 and m.is_active
 and m.effective_from <= public.be_business_date()
 and (m.effective_to is null or m.effective_to >= public.be_business_date());

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
  v_id text;
  v_requested integer := coalesce(array_length(p_parcel_ids,1),0);
  v_invalid integer;
  v_result jsonb;
  v_customer bigint;
  v_merchant bigint;
  v_revenue bigint;
  v_additional bigint;
  v_merchants integer;
begin
  if v_requested = 0 then
    raise exception 'Select at least one parcel';
  end if;

  select count(*)::integer into v_invalid
  from unnest(p_parcel_ids) x(parcel_id)
  left join public.be_v_finance_merchant_settlement_queue_v2 q on q.parcel_id = x.parcel_id
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
  where parcel_id = any(p_parcel_ids);

  insert into public.be_finance_settlement_batches_v2 (
    settlement_batch_id,status,parcel_count,merchant_count,
    total_customer_collection,total_merchant_settlement,
    total_company_delivery_revenue,total_company_additional_charges,
    created_by,metadata
  ) values (
    p_settlement_batch_id,'PROCESSING',v_requested,v_merchants,
    v_customer,v_merchant,v_revenue,v_additional,
    coalesce(p_actor,auth.uid()),jsonb_build_object('parcel_ids',to_jsonb(p_parcel_ids))
  )
  on conflict (settlement_batch_id) do update set status='PROCESSING';

  foreach v_id in array p_parcel_ids loop
    v_result := public.be_settle_parcel_financial_v2(
      v_id,
      p_settlement_batch_id,
      coalesce(p_actor,auth.uid())
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
exception when others then
  update public.be_finance_settlement_batches_v2
  set status='FAILED', completed_at=now(), metadata=metadata || jsonb_build_object('error',sqlerrm)
  where settlement_batch_id=p_settlement_batch_id;
  raise;
end
$$;

create or replace function public.be_finance_settlement_dashboard_v2()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'rows',count(*),
    'ready',count(*) filter (where settlement_eligible),
    'review',count(*) filter (where settlement_state='REVIEW_REQUIRED'),
    'settled',count(*) filter (where settlement_state='SETTLED'),
    'customer_collection_ready',coalesce(sum(customer_total_collection) filter (where settlement_eligible),0),
    'merchant_payable_ready',coalesce(sum(greatest(coalesce(merchant_final_settlement_amount,0),0)) filter (where settlement_eligible),0),
    'merchant_receivable_ready',coalesce(sum(merchant_receivable) filter (where settlement_eligible),0),
    'company_delivery_revenue_ready',coalesce(sum(net_system_delivery_charge) filter (where settlement_eligible),0)
  )
  from public.be_v_finance_merchant_settlement_queue_v2
$$;

grant select on public.be_v_finance_merchant_settlement_queue_v2 to authenticated;
grant select on public.be_finance_settlement_batches_v2 to authenticated;
grant execute on function public.be_data_entry_financial_quote_v2(text,text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric) to authenticated;
grant execute on function public.be_data_entry_save_financial_row_v2(text,integer,text,text,jsonb) to authenticated;
grant execute on function public.be_data_entry_apply_financial_to_parcel_v2(text,uuid,text) to authenticated;
grant execute on function public.be_finance_settle_batch_v2(text[],uuid,uuid) to authenticated;
grant execute on function public.be_finance_settlement_dashboard_v2() to authenticated;

commit;

select jsonb_build_object(
  'build','PARCEL_FINANCIAL_V2_2_UI_FINANCE_BRIDGE_2026-07-31',
  'data_entry_quote','be_data_entry_financial_quote_v2',
  'data_entry_save','be_data_entry_save_financial_row_v2',
  'data_entry_apply','be_data_entry_apply_financial_to_parcel_v2',
  'finance_queue','be_v_finance_merchant_settlement_queue_v2',
  'finance_batch','be_finance_settle_batch_v2',
  'deletes_rows',false
) as parcel_financial_v2_2_installation;
