begin;

-- Finance must consume both the legacy parcels store and the canonical Data
-- Entry waybill store. Persist only the calculation result here; never create a
-- synthetic operational parcel or fire Warehouse/Dispatch lifecycle triggers.
create table if not exists public.be_finance_calculation_projection_v4 (
  parcel_id uuid primary key,
  source_kind text not null check (source_kind in ('PARCEL', 'DELIVERY_WAYBILL')),
  source_row_id uuid not null,
  delivery_way_id text not null unique,
  amount_entry_type text not null,
  customer_tier text not null,
  calculation jsonb not null,
  input_fingerprint text not null,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, source_row_id)
);

alter table public.be_finance_calculation_projection_v4 enable row level security;
revoke all on table public.be_finance_calculation_projection_v4 from public, anon, authenticated;
grant all on table public.be_finance_calculation_projection_v4 to service_role;

create or replace function public.be_finance_project_source_v4(
  p_source_kind text,
  p_source_row_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_kind text := upper(btrim(coalesce(p_source_kind, '')));
  v_way text;
  v_merchant_id text;
  v_township text;
  v_customer_tier text;
  v_profile_tier text;
  v_amount_entry_type text;
  v_item_price bigint;
  v_delivery_charges bigint;
  v_stated_total bigint;
  v_additional_charge bigint := 0;
  v_cbm_surcharge bigint := 0;
  v_other_surcharge bigint := 0;
  v_merchant_payable bigint := 0;
  v_merchant_credits bigint := 0;
  v_weight_kg numeric := 0;
  v_monthly_ways integer := 0;
  v_source_updated_at timestamptz;
  v_calculation jsonb;
  v_fingerprint text;
begin
  if v_source_kind = 'PARCEL' then
    select
      upper(coalesce(nullif(btrim(p.way_id), ''), nullif(btrim(p.tracking_code), ''))),
      nullif(btrim(p.merchant_id), ''),
      nullif(btrim(p.township), ''),
      coalesce(nullif(upper(btrim(p.customer_tier)), ''), 'STANDARD'),
      coalesce(nullif(upper(btrim(p.amount_entry_type)), ''), 'ITEM_PRICE_PLUS_DECLARED_DELIVERY'),
      p.item_price::bigint,
      p.delivery_charges::bigint,
      p.merchant_stated_total_amount,
      coalesce(p.additional_customer_charge, 0),
      coalesce(p.cbm_surcharge, 0),
      coalesce(p.other_surcharge, 0),
      coalesce(p.merchant_payable_charges, 0),
      coalesce(p.other_merchant_credits, 0),
      coalesce(p.weight_kg, 0),
      coalesce(p.monthly_ways, 0),
      coalesce(p.updated_at, p.created_at)
    into
      v_way, v_merchant_id, v_township, v_customer_tier,
      v_amount_entry_type, v_item_price, v_delivery_charges, v_stated_total,
      v_additional_charge, v_cbm_surcharge, v_other_surcharge,
      v_merchant_payable, v_merchant_credits, v_weight_kg, v_monthly_ways,
      v_source_updated_at
    from public.parcels p
    where p.id = p_source_row_id;

    if not found then
      delete from public.be_finance_calculation_projection_v4
      where source_kind = v_source_kind and source_row_id = p_source_row_id;
      return;
    end if;
  elsif v_source_kind = 'DELIVERY_WAYBILL' then
    select
      upper(coalesce(
        nullif(btrim(w.delivery_way_id), ''),
        nullif(btrim(w.deliver_way_id), ''),
        nullif(btrim(w.tracking_no), ''),
        nullif(btrim(w.awb), '')
      )),
      coalesce(nullif(btrim(w.merchant_code), ''), nullif(btrim(w.merchant), '')),
      coalesce(
        nullif(btrim(w.recipient_township), ''),
        nullif(btrim(w.receiver_township), ''),
        nullif(btrim(w.township), '')
      ),
      nullif(upper(btrim(coalesce(w.raw_row->>'customer_tier', ''))), ''),
      coalesce(
        nullif(upper(btrim(coalesce(w.raw_row->>'amount_entry_type', ''))), ''),
        'ITEM_PRICE_PLUS_DECLARED_DELIVERY'
      ),
      w.item_price::bigint,
      coalesce(w.delivery_fee_os, w.deli_fee_os)::bigint,
      coalesce(
        nullif(w.raw_row->>'merchant_stated_total_amount', '')::bigint,
        w.cod_os::bigint,
        w.final_cod::bigint,
        w.cod_amount::bigint
      ),
      coalesce(nullif(w.raw_row->>'additional_customer_charge', '')::bigint, 0),
      coalesce(nullif(w.raw_row->>'cbm_surcharge', '')::bigint, 0),
      coalesce(w.surcharge, 0)::bigint,
      coalesce(nullif(w.raw_row->>'merchant_payable_charges', '')::bigint, 0),
      coalesce(nullif(w.raw_row->>'other_merchant_credits', '')::bigint, 0),
      coalesce(w.weight_kg, 0),
      0,
      coalesce(w.updated_at, w.created_at)
    into
      v_way, v_merchant_id, v_township, v_customer_tier,
      v_amount_entry_type, v_item_price, v_delivery_charges, v_stated_total,
      v_additional_charge, v_cbm_surcharge, v_other_surcharge,
      v_merchant_payable, v_merchant_credits, v_weight_kg, v_monthly_ways,
      v_source_updated_at
    from public.delivery_waybills w
    where w.id = p_source_row_id
      and lower(coalesce(w.validation_status, '')) = 'valid';

    if not found then
      delete from public.be_finance_calculation_projection_v4
      where source_kind = v_source_kind and source_row_id = p_source_row_id;
      return;
    end if;

    select nullif(upper(btrim(m.customer_tier)), '')
    into v_profile_tier
    from public.be_merchant_financial_profiles_v2 m
    where m.merchant_id = v_merchant_id
      and m.is_active
      and m.effective_from <= public.be_business_date()
      and (m.effective_to is null or m.effective_to >= public.be_business_date())
    order by m.effective_from desc, m.updated_at desc nulls last
    limit 1;

    v_customer_tier := coalesce(v_customer_tier, v_profile_tier, 'STANDARD');
  else
    raise exception 'Unsupported Finance projection source: %', p_source_kind;
  end if;

  if v_way is null then
    delete from public.be_finance_calculation_projection_v4
    where source_kind = v_source_kind and source_row_id = p_source_row_id;
    return;
  end if;

  if v_amount_entry_type = 'DELIVERY_CHARGE_ONLY' then
    v_item_price := null;
    v_stated_total := null;
  elsif v_amount_entry_type in ('EXACT_COLLECTION_AMOUNT', 'OPAQUE_COD_COLLECTION') then
    v_item_price := null;
    v_delivery_charges := null;
  else
    v_stated_total := null;
  end if;

  v_calculation := public.be_calculate_parcel_financial_v2(
    v_township,
    coalesce(v_customer_tier, 'STANDARD'),
    v_amount_entry_type,
    v_item_price,
    v_delivery_charges,
    v_stated_total,
    v_additional_charge,
    v_cbm_surcharge,
    v_other_surcharge,
    v_merchant_payable,
    v_merchant_credits,
    v_weight_kg,
    v_monthly_ways
  );

  v_fingerprint := md5(jsonb_build_object(
    'way_id', v_way,
    'merchant_id', v_merchant_id,
    'township', v_township,
    'customer_tier', v_customer_tier,
    'amount_entry_type', v_amount_entry_type,
    'item_price', v_item_price,
    'delivery_charges', v_delivery_charges,
    'stated_total', v_stated_total,
    'additional_charge', v_additional_charge,
    'cbm_surcharge', v_cbm_surcharge,
    'other_surcharge', v_other_surcharge,
    'merchant_payable', v_merchant_payable,
    'merchant_credits', v_merchant_credits,
    'weight_kg', v_weight_kg,
    'monthly_ways', v_monthly_ways
  )::text);

  insert into public.be_finance_calculation_projection_v4 (
    parcel_id, source_kind, source_row_id, delivery_way_id,
    amount_entry_type, customer_tier, calculation, input_fingerprint,
    source_updated_at, updated_at
  ) values (
    p_source_row_id, v_source_kind, p_source_row_id, v_way,
    v_amount_entry_type, coalesce(v_customer_tier, 'STANDARD'),
    v_calculation, v_fingerprint, v_source_updated_at, now()
  )
  on conflict (parcel_id) do update set
    source_kind = excluded.source_kind,
    source_row_id = excluded.source_row_id,
    delivery_way_id = excluded.delivery_way_id,
    amount_entry_type = excluded.amount_entry_type,
    customer_tier = excluded.customer_tier,
    calculation = excluded.calculation,
    input_fingerprint = excluded.input_fingerprint,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();
end;
$function$;

create or replace function public.be_finance_projection_source_trigger_v4()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_kind text;
begin
  v_source_kind := case tg_table_name
    when 'parcels' then 'PARCEL'
    when 'delivery_waybills' then 'DELIVERY_WAYBILL'
    else null
  end;

  if v_source_kind is null then
    raise exception 'Unsupported Finance projection trigger source: %', tg_table_name;
  end if;

  if tg_op = 'DELETE' then
    delete from public.be_finance_calculation_projection_v4
    where source_kind = v_source_kind and source_row_id = old.id;
    return old;
  end if;

  perform public.be_finance_project_source_v4(v_source_kind, new.id);
  return new;
end;
$function$;

drop trigger if exists trg_finance_project_parcel_insert_v4 on public.parcels;
create trigger trg_finance_project_parcel_insert_v4
after insert on public.parcels
for each row execute function public.be_finance_projection_source_trigger_v4();

drop trigger if exists trg_finance_project_parcel_update_v4 on public.parcels;
create trigger trg_finance_project_parcel_update_v4
after update of way_id, tracking_code, merchant_id, township, customer_tier,
  amount_entry_type, item_price, delivery_charges, merchant_stated_total_amount,
  additional_customer_charge, cbm_surcharge, other_surcharge,
  merchant_payable_charges, other_merchant_credits, weight_kg, monthly_ways
on public.parcels
for each row execute function public.be_finance_projection_source_trigger_v4();

drop trigger if exists trg_finance_project_parcel_delete_v4 on public.parcels;
create trigger trg_finance_project_parcel_delete_v4
after delete on public.parcels
for each row execute function public.be_finance_projection_source_trigger_v4();

drop trigger if exists trg_finance_project_waybill_insert_v4 on public.delivery_waybills;
create trigger trg_finance_project_waybill_insert_v4
after insert on public.delivery_waybills
for each row execute function public.be_finance_projection_source_trigger_v4();

drop trigger if exists trg_finance_project_waybill_update_v4 on public.delivery_waybills;
create trigger trg_finance_project_waybill_update_v4
after update of validation_status, delivery_way_id, deliver_way_id, tracking_no,
  awb, merchant_code, merchant, recipient_township, receiver_township, township,
  item_price, delivery_fee_os, deli_fee_os, surcharge, weight_kg, raw_row
on public.delivery_waybills
for each row execute function public.be_finance_projection_source_trigger_v4();

drop trigger if exists trg_finance_project_waybill_delete_v4 on public.delivery_waybills;
create trigger trg_finance_project_waybill_delete_v4
after delete on public.delivery_waybills
for each row execute function public.be_finance_projection_source_trigger_v4();

-- Backfill calculations without changing either operational source table.
do $block$
begin
  perform public.be_finance_project_source_v4('PARCEL', p.id)
  from public.parcels p;

  perform public.be_finance_project_source_v4('DELIVERY_WAYBILL', w.id)
  from public.delivery_waybills w;
end;
$block$;

-- The prior view exposed parcel_id as text while every settlement control and
-- batch API uses uuid. No dependent relation exists, so recreate it with the
-- correct type and the precomputed canonical projection.
drop view public.be_v_finance_merchant_settlement_queue_v2;

create view public.be_v_finance_merchant_settlement_queue_v2
with (security_invoker = true)
as
with source_rows as (
  select
    pr.parcel_id,
    pr.delivery_way_id,
    p.merchant_id,
    to_jsonb(p)->>'merchant_name' as merchant_name_hint,
    p.status,
    p.recipient_name,
    p.recipient_phone,
    p.township,
    coalesce(nullif(p.customer_tier, ''), pr.customer_tier) as customer_tier,
    coalesce(nullif(p.amount_entry_type, ''), pr.amount_entry_type) as amount_entry_type,
    p.item_price::numeric(14,2) as item_price,
    p.delivery_charges::numeric(14,2) as merchant_declared_delivery_charge,
    coalesce(p.additional_customer_charge, 0)::bigint as additional_customer_charge,
    coalesce(nullif(pr.calculation->>'cod_amount', '')::integer, p.cod_amount, p.collect_amount::integer) as customer_total_collection,
    coalesce(p.base_tariff, nullif(pr.calculation->>'base_tariff', '')::bigint) as base_tariff,
    coalesce(p.weight_surcharge, nullif(pr.calculation->>'weight_surcharge', '')::bigint) as weight_surcharge,
    coalesce(p.cbm_surcharge, 0)::bigint as cbm_surcharge,
    coalesce(p.other_surcharge, 0)::bigint as other_surcharge,
    coalesce(p.gross_system_delivery_charge, nullif(pr.calculation->>'gross_system_delivery_charge', '')::bigint) as gross_system_delivery_charge,
    coalesce(p.commitment_refund, nullif(pr.calculation->>'commitment_refund', '')::bigint) as commitment_refund,
    coalesce(p.net_system_delivery_charge, nullif(pr.calculation->>'net_system_delivery_charge', '')::bigint) as net_system_delivery_charge,
    coalesce(p.delivery_difference, nullif(pr.calculation->>'delivery_difference', '')::bigint) as delivery_difference,
    coalesce(p.merchant_settlement_adjustment, nullif(pr.calculation->>'merchant_settlement_adjustment', '')::bigint) as merchant_settlement_adjustment,
    coalesce(p.merchant_final_settlement_amount, nullif(pr.calculation->>'merchant_final_settlement_amount', '')::bigint) as merchant_final_settlement_amount,
    coalesce(p.settlement_direction, pr.calculation->>'settlement_direction') as settlement_direction,
    coalesce(p.validation_status, pr.calculation->>'validation_status') as validation_status,
    coalesce(p.validation_message, pr.calculation->>'validation_message') as validation_message,
    coalesce(p.calculation_version, pr.calculation->>'calculation_version') as calculation_version,
    coalesce(p.calculated_at, nullif(pr.calculation->>'calculated_at', '')::timestamptz, pr.updated_at) as calculated_at,
    p.financial_locked_at,
    p.financial_settled_at,
    p.financial_settlement_batch_id,
    p.created_at
  from public.be_finance_calculation_projection_v4 pr
  join public.parcels p
    on pr.source_kind = 'PARCEL' and p.id = pr.source_row_id

  union all

  select
    pr.parcel_id,
    pr.delivery_way_id,
    coalesce(nullif(w.merchant_code, ''), nullif(w.merchant, '')) as merchant_id,
    coalesce(nullif(w.merchant_name, ''), nullif(w.merchant, '')) as merchant_name_hint,
    case
      when upper(coalesce(w.status, '')) = 'DELIVERED'
        or upper(coalesce(w.operation_status, '')) = 'DELIVERED'
        or upper(coalesce(w.overall_status, '')) = 'DELIVERED' then 'delivered'
      else lower(coalesce(nullif(w.status, ''), nullif(w.operation_status, ''), nullif(w.overall_status, ''), 'registered'))
    end as status,
    coalesce(nullif(w.recipient_name, ''), nullif(w.receiver_name, '')) as recipient_name,
    coalesce(nullif(w.recipient_phone, ''), nullif(w.receiver_phone, ''), nullif(w.recipient_phone_2, '')) as recipient_phone,
    coalesce(nullif(w.recipient_township, ''), nullif(w.receiver_township, ''), nullif(w.township, '')) as township,
    pr.customer_tier,
    pr.amount_entry_type,
    w.item_price::numeric(14,2) as item_price,
    coalesce(w.delivery_fee_os, w.deli_fee_os)::numeric(14,2) as merchant_declared_delivery_charge,
    coalesce(nullif(w.raw_row->>'additional_customer_charge', '')::bigint, 0) as additional_customer_charge,
    coalesce(
      nullif(pr.calculation->>'cod_amount', '')::integer,
      w.cod_os::integer,
      w.final_cod::integer,
      w.cod_amount::integer
    ) as customer_total_collection,
    nullif(pr.calculation->>'base_tariff', '')::bigint as base_tariff,
    nullif(pr.calculation->>'weight_surcharge', '')::bigint as weight_surcharge,
    coalesce(nullif(w.raw_row->>'cbm_surcharge', '')::bigint, 0) as cbm_surcharge,
    coalesce(w.surcharge, 0)::bigint as other_surcharge,
    nullif(pr.calculation->>'gross_system_delivery_charge', '')::bigint as gross_system_delivery_charge,
    nullif(pr.calculation->>'commitment_refund', '')::bigint as commitment_refund,
    nullif(pr.calculation->>'net_system_delivery_charge', '')::bigint as net_system_delivery_charge,
    nullif(pr.calculation->>'delivery_difference', '')::bigint as delivery_difference,
    nullif(pr.calculation->>'merchant_settlement_adjustment', '')::bigint as merchant_settlement_adjustment,
    nullif(pr.calculation->>'merchant_final_settlement_amount', '')::bigint as merchant_final_settlement_amount,
    pr.calculation->>'settlement_direction' as settlement_direction,
    pr.calculation->>'validation_status' as validation_status,
    pr.calculation->>'validation_message' as validation_message,
    pr.calculation->>'calculation_version' as calculation_version,
    coalesce(nullif(pr.calculation->>'calculated_at', '')::timestamptz, pr.updated_at) as calculated_at,
    null::timestamptz as financial_locked_at,
    null::timestamptz as financial_settled_at,
    null::uuid as financial_settlement_batch_id,
    w.created_at
  from public.be_finance_calculation_projection_v4 pr
  join public.delivery_waybills w
    on pr.source_kind = 'DELIVERY_WAYBILL' and w.id = pr.source_row_id
), enriched as (
  select
    s.*,
    coalesce(m.merchant_name, s.merchant_name_hint, s.merchant_id) as merchant_name,
    coalesce(m.counterparty_type, 'MERCHANT') as counterparty_type,
    m.settlement_method,
    m.settlement_account
  from source_rows s
  left join lateral (
    select m.merchant_name, m.counterparty_type, m.settlement_method, m.settlement_account
    from public.be_merchant_financial_profiles_v2 m
    where m.merchant_id = s.merchant_id
      and m.is_active
      and m.effective_from <= public.be_business_date()
      and (m.effective_to is null or m.effective_to >= public.be_business_date())
    order by m.effective_from desc, m.updated_at desc nulls last
    limit 1
  ) m on true
)
select
  e.parcel_id,
  e.delivery_way_id,
  e.merchant_id,
  e.merchant_name,
  e.counterparty_type,
  e.settlement_method,
  e.settlement_account,
  e.status,
  e.recipient_name,
  e.recipient_phone,
  e.township,
  e.customer_tier,
  e.amount_entry_type,
  e.item_price,
  e.merchant_declared_delivery_charge,
  e.additional_customer_charge,
  e.customer_total_collection,
  e.base_tariff,
  e.weight_surcharge,
  e.cbm_surcharge,
  e.other_surcharge,
  e.gross_system_delivery_charge,
  e.commitment_refund,
  e.net_system_delivery_charge,
  e.delivery_difference,
  e.merchant_settlement_adjustment,
  e.merchant_final_settlement_amount,
  greatest(coalesce(-e.merchant_final_settlement_amount, 0::bigint), 0::bigint) as merchant_receivable,
  e.settlement_direction,
  e.validation_status,
  e.validation_message,
  e.calculation_version,
  e.calculated_at,
  e.financial_locked_at,
  e.financial_settled_at,
  e.financial_settlement_batch_id,
  upper(coalesce(e.status, '')) = 'DELIVERED'
    and e.validation_status = 'OK'
    and coalesce(e.settlement_direction, '') <> 'BREAKDOWN_REQUIRED'
    and e.financial_settled_at is null as settlement_eligible,
  case
    when e.financial_settled_at is not null then 'SETTLED'
    when upper(coalesce(e.status, '')) <> 'DELIVERED' then 'WAITING_DELIVERY'
    when e.validation_status = 'ERROR' then 'CALCULATION_ERROR'
    when e.validation_status = 'REVIEW' or e.settlement_direction = 'BREAKDOWN_REQUIRED' then 'REVIEW_REQUIRED'
    when e.validation_status = 'OK' then 'READY_TO_SETTLE'
    else 'NOT_READY'
  end as settlement_state,
  e.created_at
from enriched e;

revoke all on table public.be_v_finance_merchant_settlement_queue_v2 from public, anon, authenticated;
grant select on table public.be_v_finance_merchant_settlement_queue_v2 to service_role;

do $block$
declare
  v_expected bigint;
  v_projected bigint;
  v_queued bigint;
  v_null_validations bigint;
  v_parcel_id_type text;
begin
  select
    (select count(*) from public.parcels)
      + (select count(*) from public.delivery_waybills where lower(coalesce(validation_status, '')) = 'valid'),
    (select count(*) from public.be_finance_calculation_projection_v4),
    (select count(*) from public.be_v_finance_merchant_settlement_queue_v2),
    (select count(*) from public.be_v_finance_merchant_settlement_queue_v2 where validation_status is null),
    (
      select format_type(a.atttypid, a.atttypmod)
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.be_v_finance_merchant_settlement_queue_v2'::regclass
        and a.attname = 'parcel_id'
        and a.attnum > 0
        and not a.attisdropped
    )
  into v_expected, v_projected, v_queued, v_null_validations, v_parcel_id_type;

  if v_projected <> v_expected or v_queued <> v_expected then
    raise exception 'Finance projection reconciliation failed: expected %, projected %, queued %',
      v_expected, v_projected, v_queued;
  end if;

  if v_null_validations <> 0 then
    raise exception 'Finance projection contains % NULL validation states', v_null_validations;
  end if;

  if v_parcel_id_type <> 'uuid' then
    raise exception 'Finance queue parcel_id must be uuid, found %', v_parcel_id_type;
  end if;
end;
$block$;

-- Align the table constraint with the method already offered by the Finance UI
-- and accepted by the confirmation function.
alter table public.parcels drop constraint if exists parcels_amount_entry_type_check;
alter table public.parcels add constraint parcels_amount_entry_type_check
check (
  amount_entry_type is null or amount_entry_type = any (array[
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY'::text,
    'TOTAL_AMOUNT_INCLUDING_DELIVERY'::text,
    'DELIVERY_CHARGE_ONLY'::text,
    'EXACT_COLLECTION_AMOUNT'::text,
    'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT'::text,
    'OPAQUE_COD_COLLECTION'::text
  ])
) not valid;

create or replace function public.be_finance_confirm_data_entry_financial_v4(
  p_way_id text,
  p_changes jsonb default '{}'::jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_way text := upper(nullif(btrim(coalesce(p_way_id, '')), ''));
  v_role text;
  v_mode text;
  v_projection public.be_finance_calculation_projection_v4%rowtype;
  v_parcel public.parcels%rowtype;
  v_waybill public.delivery_waybills%rowtype;
  v_before jsonb;
  v_source_kind text;
  v_source_pickup_id text;
  v_source_phone text;
  v_phone_key text;
  v_township text;
  v_customer_tier text;
  v_type text;
  v_item bigint;
  v_delivery bigint;
  v_total bigint;
  v_add bigint;
  v_cbm bigint;
  v_other bigint;
  v_payable bigint;
  v_credits bigint;
  v_weight numeric;
  v_monthly_ways integer;
  v_calc jsonb;
  v_new jsonb;
  v_headers jsonb := '{}'::jsonb;
  v_ip text;
  v_detail_candidates integer := 0;
  v_detail_matches integer := 0;
  v_detail_updated integer := 0;
  v_register_updated integer := 0;
begin
  if v_way is null then
    return jsonb_build_object('ok', false, 'code', 'WAY_ID_REQUIRED');
  end if;

  v_role := public.be_finance_assert_internal_v3();
  select mutation_mode into v_mode
  from public.be_data_entry_financial_v2_runtime_v58
  where singleton;

  if not p_dry_run and upper(coalesce(v_role, '')) not in (
    'FINANCE_REVIEWER', 'FINANCE_APPROVER', 'FINANCE_ADMIN', 'FINANCE_MANAGER',
    'FINANCE', 'ACCOUNTS', 'ADMIN', 'SUPERADMIN'
  ) then
    raise exception 'Finance reviewer/approver permission is required';
  end if;

  select * into v_projection
  from public.be_finance_calculation_projection_v4 p
  where p.delivery_way_id = v_way
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PARCEL_NOT_FOUND', 'way_id', v_way);
  end if;

  v_source_kind := v_projection.source_kind;

  if exists (
    select 1
    from public.be_finance_settlement_batch_items_v3 i
    where i.parcel_id = v_projection.parcel_id and i.active
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'FINANCIAL_RECORD_LOCKED',
      'message', 'Use the Finance adjustment workflow for a parcel already in a settlement batch.'
    );
  end if;

  if v_source_kind = 'PARCEL' then
    select * into v_parcel
    from public.parcels p
    where p.id = v_projection.source_row_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'SOURCE_RECORD_NOT_FOUND', 'way_id', v_way);
    end if;

    if v_parcel.financial_locked_at is not null
       or v_parcel.financial_settlement_batch_id is not null
       or v_parcel.financial_settled_at is not null then
      return jsonb_build_object(
        'ok', false,
        'code', 'FINANCIAL_RECORD_LOCKED',
        'message', 'Use the Finance adjustment workflow for locked/batched/settled parcels.'
      );
    end if;

    v_before := to_jsonb(v_parcel);
    v_source_phone := v_parcel.recipient_phone;
    v_township := v_parcel.township;
    v_customer_tier := coalesce(v_parcel.customer_tier, v_projection.customer_tier, 'STANDARD');
    v_type := coalesce(v_parcel.amount_entry_type, v_projection.amount_entry_type, 'ITEM_PRICE_PLUS_DECLARED_DELIVERY');
    v_item := v_parcel.item_price::bigint;
    v_delivery := v_parcel.delivery_charges::bigint;
    v_total := v_parcel.merchant_stated_total_amount;
    v_add := coalesce(v_parcel.additional_customer_charge, 0);
    v_cbm := coalesce(v_parcel.cbm_surcharge, 0);
    v_other := coalesce(v_parcel.other_surcharge, 0);
    v_payable := coalesce(v_parcel.merchant_payable_charges, 0);
    v_credits := coalesce(v_parcel.other_merchant_credits, 0);
    v_weight := coalesce(v_parcel.weight_kg, 0);
    v_monthly_ways := coalesce(v_parcel.monthly_ways, 0);
  elsif v_source_kind = 'DELIVERY_WAYBILL' then
    select * into v_waybill
    from public.delivery_waybills w
    where w.id = v_projection.source_row_id
      and lower(coalesce(w.validation_status, '')) = 'valid'
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'SOURCE_RECORD_NOT_FOUND', 'way_id', v_way);
    end if;

    if upper(coalesce(v_waybill.finance_status, '')) like '%SETTLED%' then
      return jsonb_build_object(
        'ok', false,
        'code', 'FINANCIAL_RECORD_LOCKED',
        'message', 'Use the Finance adjustment workflow for settled waybills.'
      );
    end if;

    v_before := to_jsonb(v_waybill);
    v_source_pickup_id := coalesce(nullif(v_waybill.pickup_id, ''), nullif(v_waybill.pickup_way_id, ''));
    v_source_phone := coalesce(nullif(v_waybill.recipient_phone, ''), nullif(v_waybill.receiver_phone, ''), nullif(v_waybill.recipient_phone_2, ''));
    v_township := coalesce(nullif(v_waybill.recipient_township, ''), nullif(v_waybill.receiver_township, ''), nullif(v_waybill.township, ''));
    v_customer_tier := coalesce(v_projection.customer_tier, 'STANDARD');
    v_type := coalesce(nullif(v_waybill.raw_row->>'amount_entry_type', ''), v_projection.amount_entry_type, 'ITEM_PRICE_PLUS_DECLARED_DELIVERY');
    v_item := v_waybill.item_price::bigint;
    v_delivery := coalesce(v_waybill.delivery_fee_os, v_waybill.deli_fee_os)::bigint;
    v_total := coalesce(
      nullif(v_waybill.raw_row->>'merchant_stated_total_amount', '')::bigint,
      v_waybill.cod_os::bigint,
      v_waybill.final_cod::bigint,
      v_waybill.cod_amount::bigint
    );
    v_add := coalesce(nullif(v_waybill.raw_row->>'additional_customer_charge', '')::bigint, 0);
    v_cbm := coalesce(nullif(v_waybill.raw_row->>'cbm_surcharge', '')::bigint, 0);
    v_other := coalesce(v_waybill.surcharge, 0)::bigint;
    v_payable := coalesce(nullif(v_waybill.raw_row->>'merchant_payable_charges', '')::bigint, 0);
    v_credits := coalesce(nullif(v_waybill.raw_row->>'other_merchant_credits', '')::bigint, 0);
    v_weight := coalesce(v_waybill.weight_kg, 0);
    v_monthly_ways := 0;
  else
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_FINANCE_SOURCE', 'way_id', v_way);
  end if;

  v_type := upper(btrim(coalesce(nullif(p_changes->>'amount_entry_type', ''), v_type)));
  if v_type not in (
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    'DELIVERY_CHARGE_ONLY',
    'EXACT_COLLECTION_AMOUNT',
    'OPAQUE_COD_COLLECTION'
  ) then
    return jsonb_build_object('ok', false, 'code', 'COLLECTION_METHOD_NOT_ALLOWED');
  end if;

  v_item := case when p_changes ? 'item_price' then nullif(p_changes->>'item_price', '')::bigint else v_item end;
  v_delivery := case when p_changes ? 'delivery_charges' then nullif(p_changes->>'delivery_charges', '')::bigint else v_delivery end;
  v_total := case when p_changes ? 'merchant_stated_total_amount' then nullif(p_changes->>'merchant_stated_total_amount', '')::bigint else v_total end;
  v_add := coalesce(case when p_changes ? 'additional_customer_charge' then nullif(p_changes->>'additional_customer_charge', '')::bigint end, v_add, 0);
  v_cbm := coalesce(case when p_changes ? 'cbm_surcharge' then nullif(p_changes->>'cbm_surcharge', '')::bigint end, v_cbm, 0);
  v_other := coalesce(case when p_changes ? 'other_surcharge' then nullif(p_changes->>'other_surcharge', '')::bigint end, v_other, 0);
  v_payable := coalesce(case when p_changes ? 'merchant_payable_charges' then nullif(p_changes->>'merchant_payable_charges', '')::bigint end, v_payable, 0);
  v_credits := coalesce(case when p_changes ? 'other_merchant_credits' then nullif(p_changes->>'other_merchant_credits', '')::bigint end, v_credits, 0);
  v_weight := coalesce(case when p_changes ? 'weight_kg' then nullif(p_changes->>'weight_kg', '')::numeric end, v_weight, 0);
  v_township := coalesce(nullif(p_changes->>'township', ''), v_township);
  v_customer_tier := upper(coalesce(nullif(p_changes->>'customer_tier', ''), v_customer_tier, 'STANDARD'));

  if v_type = 'DELIVERY_CHARGE_ONLY' then
    v_item := null;
    v_total := null;
  elsif v_type in ('EXACT_COLLECTION_AMOUNT', 'OPAQUE_COD_COLLECTION') then
    v_item := null;
    v_delivery := null;
  else
    v_total := null;
  end if;

  v_calc := public.be_calculate_parcel_financial_v2(
    v_township, v_customer_tier, v_type, v_item, v_delivery, v_total,
    v_add, v_cbm, v_other, v_payable, v_credits, v_weight, v_monthly_ways
  );

  if upper(coalesce(v_calc->>'validation_status', 'ERROR')) <> 'OK' then
    return jsonb_build_object('ok', false, 'code', 'CALCULATION_NOT_VALID', 'data', v_calc);
  end if;

  begin
    v_headers := coalesce(current_setting('request.headers', true)::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-forwarded-for', ''),
    nullif(v_headers->>'x-real-ip', '')
  );

  v_phone_key := regexp_replace(coalesce(v_source_phone, ''), '[^0-9]', '', 'g');

  select
    count(*),
    count(*) filter (
      where length(v_phone_key) >= 6
        and v_phone_key = any (array[
          regexp_replace(coalesce(d.contact_no_1, ''), '[^0-9]', '', 'g'),
          regexp_replace(coalesce(d.contact_no_2, ''), '[^0-9]', '', 'g')
        ])
        and (
          v_source_pickup_id is null
          or upper(btrim(coalesce(d.pickup_id, ''))) = upper(btrim(v_source_pickup_id))
        )
    )
  into v_detail_candidates, v_detail_matches
  from public.be_data_entry_parcel_details d
  where upper(btrim(coalesce(d.delivery_way_id, d.way_id, ''))) = v_way;

  v_new := jsonb_build_object(
    'way_id', v_way,
    'parcel_id', v_projection.parcel_id,
    'finance_source', v_source_kind,
    'amount_entry_type', v_type,
    'item_price', v_item,
    'delivery_charges', v_delivery,
    'merchant_stated_total_amount', v_total,
    'finance_review', jsonb_build_object(
      'status', case when p_dry_run then 'PREVIEW' else 'CONFIRMED' end,
      'actor_uid', auth.uid(),
      'actor_email', public.be_finance_actor_email_v3(),
      'actor_role', v_role,
      'device_id', nullif(p_changes->>'client_device_id', ''),
      'user_agent', nullif(p_changes->>'client_user_agent', ''),
      'timezone', nullif(p_changes->>'client_timezone', ''),
      'request_ip', v_ip,
      'reviewed_at', now(),
      'detail_rows_matched', v_detail_matches,
      'detail_rows_quarantined', v_detail_candidates - v_detail_matches
    )
  ) || v_calc;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true,
      'persisted', false,
      'mutation_mode', coalesce(v_mode, 'MUTATION_SHADOW'),
      'source_kind', v_source_kind,
      'data', v_new
    );
  end if;

  if coalesce(v_mode, 'MUTATION_SHADOW') <> 'ACTIVE' then
    return jsonb_build_object(
      'ok', false,
      'persisted', false,
      'code', 'MUTATION_NOT_ACTIVE',
      'message', 'Finance confirmation is installed, but live Financial V2 writes remain MUTATION_SHADOW until UAT activation.',
      'preview', v_new
    );
  end if;

  if v_source_kind = 'PARCEL' then
    update public.parcels p set
      amount_entry_type = v_type,
      item_price = v_item,
      delivery_charges = v_delivery,
      merchant_stated_total_amount = v_total,
      additional_customer_charge = v_add,
      cbm_surcharge = v_cbm,
      other_surcharge = v_other,
      merchant_payable_charges = v_payable,
      other_merchant_credits = v_credits,
      weight_kg = v_weight,
      cod_amount = (v_calc->>'cod_amount')::integer,
      collect_amount = (v_calc->>'cod_amount')::numeric,
      base_tariff = nullif(v_calc->>'base_tariff', '')::bigint,
      weight_surcharge = nullif(v_calc->>'weight_surcharge', '')::bigint,
      gross_system_delivery_charge = nullif(v_calc->>'gross_system_delivery_charge', '')::bigint,
      commitment_refund = nullif(v_calc->>'commitment_refund', '')::bigint,
      net_system_delivery_charge = nullif(v_calc->>'net_system_delivery_charge', '')::bigint,
      effective_declared_delivery_charge = nullif(v_calc->>'effective_declared_delivery_charge', '')::bigint,
      delivery_difference = nullif(v_calc->>'delivery_difference', '')::bigint,
      settlement_direction = v_calc->>'settlement_direction',
      merchant_settlement_adjustment = nullif(v_calc->>'merchant_settlement_adjustment', '')::bigint,
      merchant_final_settlement_amount = nullif(v_calc->>'merchant_final_settlement_amount', '')::bigint,
      validation_status = v_calc->>'validation_status',
      validation_message = v_calc->>'validation_message',
      calculation_version = v_calc->>'calculation_version',
      calculated_at = nullif(v_calc->>'calculated_at', '')::timestamptz,
      authorized_by = auth.uid(),
      updated_at = now()
    where p.id = v_projection.source_row_id;
  else
    update public.delivery_waybills w set
      item_price = coalesce(v_item, 0),
      delivery_fee_os = coalesce(v_delivery, 0),
      deli_fee_os = coalesce(v_delivery, 0),
      cod_os = (v_calc->>'cod_amount')::numeric,
      final_cod = (v_calc->>'cod_amount')::numeric,
      cod_amount = (v_calc->>'cod_amount')::numeric,
      finance_deli = coalesce(nullif(v_calc->>'net_system_delivery_charge', '')::numeric, 0),
      finance_cod = (v_calc->>'cod_amount')::numeric,
      finance_status = 'FINANCE_CONFIRMED',
      financial_status = 'FINANCE_CONFIRMED',
      raw_row = coalesce(w.raw_row, '{}'::jsonb) || v_new,
      updated_at = now()
    where w.id = v_projection.source_row_id;
  end if;

  update public.be_data_entry_parcel_details d set
    amount_entry_type = v_type,
    item_price = coalesce(v_item, 0),
    delivery_charges = v_delivery,
    merchant_stated_total_amount = v_total,
    cod_amount = (v_calc->>'cod_amount')::numeric,
    net_system_delivery_charge = nullif(v_calc->>'net_system_delivery_charge', '')::bigint,
    delivery_difference = nullif(v_calc->>'delivery_difference', '')::bigint,
    settlement_direction = v_calc->>'settlement_direction',
    merchant_final_settlement_amount = nullif(v_calc->>'merchant_final_settlement_amount', '')::bigint,
    financial_validation_status = v_calc->>'validation_status',
    financial_validation_message = v_calc->>'validation_message',
    financial_calculation_version = v_calc->>'calculation_version',
    financial_calculated_at = nullif(v_calc->>'calculated_at', '')::timestamptz,
    financial_quote = v_new,
    finance_status = 'FINANCE_CONFIRMED',
    updated_at = now()
  where upper(btrim(coalesce(d.delivery_way_id, d.way_id, ''))) = v_way
    and length(v_phone_key) >= 6
    and v_phone_key = any (array[
      regexp_replace(coalesce(d.contact_no_1, ''), '[^0-9]', '', 'g'),
      regexp_replace(coalesce(d.contact_no_2, ''), '[^0-9]', '', 'g')
    ])
    and (
      v_source_pickup_id is null
      or upper(btrim(coalesce(d.pickup_id, ''))) = upper(btrim(v_source_pickup_id))
    );

  get diagnostics v_detail_updated = row_count;

  update public.be_data_entry_register_rows r set
    item_price = coalesce(v_item, 0),
    delivery_fee_os = coalesce(v_delivery, 0),
    cod_os = (v_calc->>'cod_amount')::numeric,
    std_deli = coalesce(nullif(v_calc->>'net_system_delivery_charge', '')::numeric, 0),
    final_cod = (v_calc->>'cod_amount')::numeric,
    finance_deli = coalesce(nullif(v_calc->>'net_system_delivery_charge', '')::numeric, 0),
    finance_cod = (v_calc->>'cod_amount')::numeric,
    finance_status = 'FINANCE_CONFIRMED',
    financial_status = 'FINANCE_CONFIRMED',
    raw_row = coalesce(r.raw_row, '{}'::jsonb) || v_new,
    updated_at = now()
  where upper(btrim(coalesce(r.delivery_way_id, ''))) = v_way
    and length(v_phone_key) >= 6
    and v_phone_key = regexp_replace(coalesce(r.recipient_phone, ''), '[^0-9]', '', 'g')
    and (
      v_source_pickup_id is null
      or upper(btrim(coalesce(r.pickup_way_id, ''))) = upper(btrim(v_source_pickup_id))
    );

  get diagnostics v_register_updated = row_count;

  perform public.be_finance_project_source_v4(v_source_kind, v_projection.source_row_id);
  perform public.be_finance_audit_v3(
    'FINANCE_DATA_ENTRY_CONFIRMED',
    v_source_kind,
    v_way,
    v_before,
    v_new,
    coalesce(nullif(p_changes->>'reason', ''), 'FINANCE_DATA_ENTRY_CONFIRMATION')
  );

  return jsonb_build_object(
    'ok', true,
    'persisted', true,
    'way_id', v_way,
    'source_kind', v_source_kind,
    'authorized_by', auth.uid(),
    'detail_rows_updated', v_detail_updated,
    'detail_rows_quarantined', v_detail_candidates - v_detail_matches,
    'register_rows_updated', v_register_updated,
    'data', v_new
  );
end;
$function$;

revoke all on function public.be_finance_project_source_v4(text, uuid) from public, anon, authenticated;
revoke all on function public.be_finance_projection_source_trigger_v4() from public, anon, authenticated;
grant execute on function public.be_finance_project_source_v4(text, uuid) to service_role;
grant execute on function public.be_finance_projection_source_trigger_v4() to service_role;

revoke all on function public.be_finance_confirm_data_entry_financial_v4(text, jsonb, boolean) from public, anon;
grant execute on function public.be_finance_confirm_data_entry_financial_v4(text, jsonb, boolean) to authenticated, service_role;

commit;
