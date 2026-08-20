-- BRITIUM Financial Settlement V3
-- Additive production workflow over be_v_finance_merchant_settlement_queue_v2.
-- The existing Parcel Financial V2 calculations remain the source of truth.

create extension if not exists pgcrypto;

create sequence if not exists public.be_finance_settlement_batch_no_seq_v3;

create table if not exists public.be_finance_settlement_access_v3 (
  email text primary key,
  access_role text not null,
  merchant_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (upper(access_role) in (
    'FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER',
    'PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER',
    'ACCOUNTS','ADMIN','SUPERADMIN','MERCHANT'
  ))
);

insert into public.be_finance_settlement_access_v3(email, access_role, active)
values ('finance@britiumexpress.com', 'FINANCE_ADMIN', true)
on conflict (email) do nothing;

create table if not exists public.be_finance_settlement_batches_v3 (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null unique,
  merchant_id text not null,
  merchant_name text,
  period_from date,
  period_to date,
  planned_payment_date date,
  status text not null default 'DRAFT',
  payment_status text not null default 'UNPAID',
  payment_method text,
  merchant_bank_account text,
  finance_remarks text,
  customer_collection numeric(18,2) not null default 0,
  item_value numeric(18,2) not null default 0,
  company_delivery_revenue numeric(18,2) not null default 0,
  delivery_excess_credit numeric(18,2) not null default 0,
  delivery_shortfall_deduction numeric(18,2) not null default 0,
  batch_credits numeric(18,2) not null default 0,
  batch_deductions numeric(18,2) not null default 0,
  advance_recovery numeric(18,2) not null default 0,
  withholding_tax numeric(18,2) not null default 0,
  parcel_settlement_total numeric(18,2) not null default 0,
  batch_net_payable numeric(18,2) not null default 0,
  paid_amount numeric(18,2) not null default 0,
  outstanding_amount numeric(18,2) not null default 0,
  created_by_uid uuid,
  created_by text,
  created_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  rejected_by text,
  rejected_at timestamptz,
  paid_by text,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  legacy_finalize_result jsonb,
  check (status in (
    'DRAFT','UNDER_REVIEW','PENDING_APPROVAL','APPROVED',
    'PAYMENT_PROCESSING','PAID','PARTIALLY_PAID','REJECTED',
    'CANCELLED','REOPENED'
  )),
  check (payment_status in (
    'UNPAID','SCHEDULED','PROCESSING','PARTIALLY_PAID',
    'PAID','FAILED','REVERSED'
  ))
);

create index if not exists be_finance_settlement_batches_v3_merchant_idx
  on public.be_finance_settlement_batches_v3(merchant_id, created_at desc);
create index if not exists be_finance_settlement_batches_v3_status_idx
  on public.be_finance_settlement_batches_v3(status, payment_status, created_at desc);

create table if not exists public.be_finance_settlement_batch_items_v3 (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.be_finance_settlement_batches_v3(id) on delete cascade,
  parcel_id uuid not null,
  delivery_way_id text not null,
  merchant_id text not null,
  merchant_name text,
  delivered_date date,
  recipient_name text,
  destination text,
  customer_tier text,
  amount_entry_type text,
  item_price numeric(18,2),
  merchant_declared_delivery numeric(18,2),
  customer_total_collection numeric(18,2) not null default 0,
  net_system_delivery_charge numeric(18,2) not null default 0,
  delivery_difference numeric(18,2),
  settlement_direction text,
  other_merchant_credits numeric(18,2) not null default 0,
  merchant_payable_charges numeric(18,2) not null default 0,
  merchant_final_settlement_amount numeric(18,2),
  validation_status text,
  source_snapshot jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  removed_at timestamptz,
  removed_by text,
  created_at timestamptz not null default now()
);

create unique index if not exists be_finance_settlement_batch_items_v3_active_uidx
  on public.be_finance_settlement_batch_items_v3(parcel_id)
  where active;
create index if not exists be_finance_settlement_batch_items_v3_batch_idx
  on public.be_finance_settlement_batch_items_v3(batch_id, active, delivery_way_id);

create table if not exists public.be_finance_settlement_payments_v3 (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.be_finance_settlement_batches_v3(id),
  amount numeric(18,2) not null,
  payment_date date not null default current_date,
  payment_method text,
  payment_reference text,
  bank_account text,
  evidence_url text,
  status text not null default 'PROCESSING',
  entered_by text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (amount > 0),
  check (status in ('SCHEDULED','PROCESSING','CONFIRMED','FAILED','REVERSED'))
);

create index if not exists be_finance_settlement_payments_v3_batch_idx
  on public.be_finance_settlement_payments_v3(batch_id, created_at desc);
create unique index if not exists be_finance_settlement_payments_v3_ref_uidx
  on public.be_finance_settlement_payments_v3(payment_reference)
  where payment_reference is not null and btrim(payment_reference) <> '';

create table if not exists public.be_finance_settlement_parcel_control_v3 (
  parcel_id uuid primary key,
  delivery_way_id text,
  financial_hold boolean not null default false,
  hold_reason text,
  hold_by text,
  hold_at timestamptz,
  exact_collection_resolution jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.be_finance_settlement_disputes_v3 (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.be_finance_settlement_batches_v3(id),
  parcel_id uuid,
  delivery_way_id text,
  merchant_id text not null,
  dispute_category text not null,
  claimed_amount numeric(18,2),
  merchant_explanation text not null,
  attachment_url text,
  status text not null default 'OPEN',
  submitted_by text,
  submitted_at timestamptz not null default now(),
  assigned_finance_user text,
  resolution_note text,
  resolved_by text,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status in (
    'OPEN','UNDER_REVIEW','MERCHANT_ACTION_REQUIRED','FINANCE_ACTION_REQUIRED',
    'RESOLVED','REJECTED','CLOSED'
  ))
);

create index if not exists be_finance_settlement_disputes_v3_lookup_idx
  on public.be_finance_settlement_disputes_v3(merchant_id, status, submitted_at desc);

create table if not exists public.be_finance_settlement_adjustments_v3 (
  id uuid primary key default gen_random_uuid(),
  original_batch_id uuid references public.be_finance_settlement_batches_v3(id),
  original_parcel_id uuid,
  adjustment_type text not null,
  previous_amount numeric(18,2),
  corrected_amount numeric(18,2),
  difference numeric(18,2),
  reason text not null,
  supporting_document_url text,
  requested_by text,
  approved_by text,
  status text not null default 'PENDING_APPROVAL',
  adjustment_batch_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.be_finance_settlement_audit_v3 (
  id bigint generated always as identity primary key,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  previous_value jsonb,
  new_value jsonb,
  actor_uid uuid,
  actor_email text,
  actor_role text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists be_finance_settlement_audit_v3_entity_idx
  on public.be_finance_settlement_audit_v3(entity_type, entity_id, created_at desc);

create or replace function public.be_finance_claim_v3(p_key text)
returns text
language sql
stable
as $$
  select nullif(btrim(coalesce(
    auth.jwt() ->> p_key,
    auth.jwt() -> 'app_metadata' ->> p_key,
    auth.jwt() -> 'user_metadata' ->> p_key,
    ''
  )), '');
$$;

create or replace function public.be_finance_actor_email_v3()
returns text
language sql
stable
as $$
  select coalesce(
    public.be_finance_claim_v3('email'),
    nullif(current_setting('request.jwt.claim.email', true), '')
  );
$$;

create or replace function public.be_finance_actor_access_v3()
returns table(access_role text, merchant_id text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(coalesce(public.be_finance_actor_email_v3(), ''));
  v_role text;
  v_merchant text;
begin
  select upper(a.access_role), a.merchant_id
  into v_role, v_merchant
  from public.be_finance_settlement_access_v3 a
  where lower(a.email) = v_email and a.active
  limit 1;

  if v_role is null then
    v_role := upper(coalesce(
      public.be_finance_claim_v3('portal_role'),
      public.be_finance_claim_v3('user_role'),
      public.be_finance_claim_v3('account_role'),
      public.be_finance_claim_v3('role'),
      ''
    ));
  end if;

  if v_merchant is null then
    v_merchant := coalesce(
      public.be_finance_claim_v3('merchant_id'),
      public.be_finance_claim_v3('merchantId'),
      public.be_finance_claim_v3('merchant_code')
    );
  end if;

  if v_role in ('AUTHENTICATED','') and v_merchant is not null then
    v_role := 'MERCHANT';
  end if;

  return query select v_role, v_merchant;
end;
$$;

create or replace function public.be_finance_assert_internal_v3()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_merchant text;
begin
  select a.access_role, a.merchant_id into v_role, v_merchant
  from public.be_finance_actor_access_v3() a;

  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  if upper(coalesce(v_role, '')) not in (
    'FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER',
    'PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER',
    'ACCOUNTS','ADMIN','SUPERADMIN'
  ) then
    raise exception 'Finance settlement permission is required';
  end if;

  return upper(v_role);
end;
$$;

create or replace function public.be_finance_json_number_v3(p_data jsonb, variadic p_keys text[])
returns numeric
language plpgsql
immutable
as $$
declare
  v_key text;
  v_text text;
begin
  foreach v_key in array p_keys loop
    v_text := nullif(btrim(p_data ->> v_key), '');
    if v_text is not null and v_text ~ '^-?[0-9]+([.][0-9]+)?$' then
      return v_text::numeric;
    end if;
  end loop;
  return 0;
end;
$$;

create or replace function public.be_finance_json_date_v3(p_data jsonb, variadic p_keys text[])
returns date
language plpgsql
immutable
as $$
declare
  v_key text;
  v_text text;
begin
  foreach v_key in array p_keys loop
    v_text := nullif(btrim(p_data ->> v_key), '');
    if v_text is not null then
      begin
        return v_text::timestamptz::date;
      exception when others then
        begin
          return v_text::date;
        exception when others then
          null;
        end;
      end;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.be_finance_audit_v3(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_previous jsonb default null,
  p_new jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_merchant text;
begin
  select a.access_role, a.merchant_id into v_role, v_merchant
  from public.be_finance_actor_access_v3() a;

  insert into public.be_finance_settlement_audit_v3(
    action, entity_type, entity_id, previous_value, new_value,
    actor_uid, actor_email, actor_role, reason
  ) values (
    upper(p_action), p_entity_type, p_entity_id, p_previous, p_new,
    auth.uid(), public.be_finance_actor_email_v3(), v_role, p_reason
  );
end;
$$;

create or replace function public.be_finance_settlement_snapshot_v3(
  p_merchant_id text default null,
  p_search text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_actor_merchant text;
  v_merchant text;
  v_internal boolean;
  v_rows jsonb;
  v_batches jsonb;
  v_payments jsonb;
  v_exceptions jsonb;
  v_disputes jsonb;
  v_audit jsonb;
  v_kpis jsonb;
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select a.access_role, a.merchant_id into v_role, v_actor_merchant
  from public.be_finance_actor_access_v3() a;

  v_internal := upper(coalesce(v_role, '')) in (
    'FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER',
    'PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER',
    'ACCOUNTS','ADMIN','SUPERADMIN'
  );

  if not v_internal then
    v_merchant := v_actor_merchant;
    if v_merchant is null then
      raise exception 'Merchant ownership is not configured for this user';
    end if;
  else
    v_merchant := nullif(btrim(p_merchant_id), '');
  end if;

  with queue as (
    select
      q.*,
      to_jsonb(q) as source_json,
      bi.batch_id,
      b.batch_number,
      b.status as batch_status,
      b.payment_status,
      c.financial_hold as control_financial_hold,
      c.hold_reason,
      exists (
        select 1 from public.be_finance_settlement_disputes_v3 d
        where d.parcel_id = q.parcel_id
          and d.status not in ('RESOLVED','REJECTED','CLOSED')
      ) as under_dispute
    from public.be_v_finance_merchant_settlement_queue_v2 q
    left join public.be_finance_settlement_batch_items_v3 bi
      on bi.parcel_id = q.parcel_id and bi.active
    left join public.be_finance_settlement_batches_v3 b
      on b.id = bi.batch_id
    left join public.be_finance_settlement_parcel_control_v3 c
      on c.parcel_id = q.parcel_id
    where (v_merchant is null or q.merchant_id = v_merchant)
      and (
        v_search = '' or
        lower(coalesce(q.delivery_way_id, '')) like '%' || v_search || '%' or
        lower(coalesce(q.merchant_name, '')) like '%' || v_search || '%' or
        lower(coalesce(q.merchant_id, '')) like '%' || v_search || '%' or
        lower(coalesce(q.recipient_name, '')) like '%' || v_search || '%' or
        lower(coalesce(b.batch_number, '')) like '%' || v_search || '%'
      )
    order by q.calculated_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 1000), 5000))
  ), normalized as (
    select
      q.*,
      case
        when q.batch_id is not null then false
        when coalesce(q.control_financial_hold, false) then false
        when q.under_dispute then false
        else coalesce(q.settlement_eligible, false)
      end as effective_eligible,
      case
        when q.batch_id is not null then 'ALREADY_BATCHED'
        when coalesce(q.control_financial_hold, false) then 'ON_HOLD'
        when q.under_dispute then 'UNDER_DISPUTE'
        else q.settlement_state
      end as effective_state
    from queue q
  )
  select coalesce(jsonb_agg(
    n.source_json || jsonb_build_object(
      'batch_id', n.batch_id,
      'batch_number', n.batch_number,
      'batch_status', n.batch_status,
      'payment_status', n.payment_status,
      'financial_hold', coalesce(n.control_financial_hold, false),
      'financial_hold_reason', n.hold_reason,
      'under_dispute', n.under_dispute,
      'settlement_eligible', n.effective_eligible,
      'settlement_state', n.effective_state,
      'item_price', public.be_finance_json_number_v3(n.source_json, 'item_price','declared_item_price','confirmed_item_price'),
      'merchant_declared_delivery', public.be_finance_json_number_v3(n.source_json, 'effective_merchant_declared_delivery','merchant_declared_delivery','customer_delivery_charge'),
      'other_merchant_credits', public.be_finance_json_number_v3(n.source_json, 'other_merchant_credits','merchant_credits'),
      'merchant_payable_charges', public.be_finance_json_number_v3(n.source_json, 'merchant_payable_charges','other_merchant_charges')
    ) order by n.calculated_at desc nulls last
  ), '[]'::jsonb)
  into v_rows
  from normalized n;

  with queue as (
    select q.*
    from public.be_v_finance_merchant_settlement_queue_v2 q
    where (v_merchant is null or q.merchant_id = v_merchant)
  )
  select jsonb_build_object(
    'customer_collection', coalesce(sum(customer_total_collection),0),
    'company_delivery_revenue', coalesce(sum(net_system_delivery_charge),0),
    'merchant_payable', coalesce(sum(merchant_final_settlement_amount) filter (where settlement_eligible),0),
    'delivery_excess_credit', coalesce(sum(delivery_difference) filter (where delivery_difference > 0),0),
    'delivery_shortfall', abs(coalesce(sum(delivery_difference) filter (where delivery_difference < 0),0)),
    'requires_review', count(*) filter (where settlement_direction = 'BREAKDOWN_REQUIRED' or validation_status in ('REVIEW','ERROR')),
    'approved_unpaid', coalesce((select sum(batch_net_payable - paid_amount) from public.be_finance_settlement_batches_v3 b where (v_merchant is null or b.merchant_id = v_merchant) and b.status = 'APPROVED' and b.payment_status <> 'PAID'),0),
    'paid_settlements', coalesce((select sum(paid_amount) from public.be_finance_settlement_batches_v3 b where (v_merchant is null or b.merchant_id = v_merchant) and b.payment_status = 'PAID'),0),
    'pending_parcels', count(*) filter (where settlement_eligible),
    'total_parcels', count(*)
  ) into v_kpis
  from queue;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_batches
  from (
    select b.*,
      (select count(*) from public.be_finance_settlement_batch_items_v3 i where i.batch_id=b.id and i.active) as parcel_count
    from public.be_finance_settlement_batches_v3 b
    where (v_merchant is null or b.merchant_id = v_merchant)
    order by b.created_at desc
    limit 1000
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_payments
  from (
    select p.*, b.batch_number, b.merchant_id, b.merchant_name, b.batch_net_payable, b.outstanding_amount
    from public.be_finance_settlement_payments_v3 p
    join public.be_finance_settlement_batches_v3 b on b.id=p.batch_id
    where (v_merchant is null or b.merchant_id = v_merchant)
    order by p.created_at desc
    limit 1000
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at desc), '[]'::jsonb)
  into v_disputes
  from (
    select d.*, b.batch_number
    from public.be_finance_settlement_disputes_v3 d
    left join public.be_finance_settlement_batches_v3 b on b.id=d.batch_id
    where (v_merchant is null or d.merchant_id = v_merchant)
    order by d.submitted_at desc
    limit 1000
  ) x;

  with exception_rows as (
    select q.parcel_id, q.delivery_way_id, q.merchant_id, q.merchant_name,
      q.validation_status,
      q.validation_message,
      q.settlement_direction,
      q.customer_total_collection,
      q.net_system_delivery_charge,
      q.delivery_difference,
      q.calculated_at,
      c.financial_hold,
      c.hold_reason
    from public.be_v_finance_merchant_settlement_queue_v2 q
    left join public.be_finance_settlement_parcel_control_v3 c on c.parcel_id=q.parcel_id
    where (v_merchant is null or q.merchant_id = v_merchant)
      and (
        q.settlement_direction = 'BREAKDOWN_REQUIRED'
        or q.validation_status in ('REVIEW','ERROR')
        or coalesce(c.financial_hold,false)
      )
    order by q.calculated_at desc nulls last
    limit 1000
  )
  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_exceptions
  from exception_rows e;

  if v_internal then
    select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
    into v_audit
    from (
      select * from public.be_finance_settlement_audit_v3
      order by created_at desc
      limit 1000
    ) a;
  else
    v_audit := '[]'::jsonb;
  end if;

  return jsonb_build_object(
    'ok', true,
    'build', 'FINANCIAL_SETTLEMENT_V3_2026_07_31',
    'scope', jsonb_build_object('role', v_role, 'merchant_id', v_merchant, 'internal', v_internal),
    'kpis', v_kpis,
    'rows', v_rows,
    'batches', v_batches,
    'payments', v_payments,
    'exceptions', v_exceptions,
    'disputes', v_disputes,
    'audit', v_audit
  );
end;
$$;

create or replace function public.be_finance_create_settlement_batch_v3(
  p_parcel_ids uuid[],
  p_period_from date default null,
  p_period_to date default null,
  p_planned_payment_date date default null,
  p_batch_credits numeric default 0,
  p_batch_deductions numeric default 0,
  p_advance_recovery numeric default 0,
  p_withholding_tax numeric default 0,
  p_payment_method text default null,
  p_merchant_bank_account text default null,
  p_finance_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_batch_id uuid := gen_random_uuid();
  v_batch_number text;
  v_expected integer;
  v_found integer;
  v_merchants integer;
  v_merchant_id text;
  v_merchant_name text;
  v_bad integer;
  v_batch public.be_finance_settlement_batches_v3%rowtype;
  v_internal boolean;
begin
  v_role := public.be_finance_assert_internal_v3();
  if upper(v_role) not in ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') then
    raise exception 'This role cannot create settlement batches';
  end if;

  if p_parcel_ids is null or cardinality(p_parcel_ids) = 0 then
    raise exception 'Select at least one eligible parcel';
  end if;

  select count(distinct x) into v_expected from unnest(p_parcel_ids) x;

  select count(*), count(distinct q.merchant_id), min(q.merchant_id), min(q.merchant_name),
    count(*) filter (where not coalesce(q.settlement_eligible,false) or coalesce(q.validation_status,'') <> 'OK' or q.settlement_direction = 'BREAKDOWN_REQUIRED')
  into v_found, v_merchants, v_merchant_id, v_merchant_name, v_bad
  from public.be_v_finance_merchant_settlement_queue_v2 q
  where q.parcel_id = any(p_parcel_ids);

  if v_found <> v_expected then
    raise exception 'One or more selected parcels are missing from the canonical settlement queue';
  end if;
  if v_merchants <> 1 then
    raise exception 'A settlement batch may contain parcels for one merchant only';
  end if;
  if v_bad > 0 then
    raise exception 'One or more selected parcels are not settlement eligible';
  end if;
  if exists (select 1 from public.be_finance_settlement_batch_items_v3 i where i.parcel_id=any(p_parcel_ids) and i.active) then
    raise exception 'One or more selected parcels are already in an active settlement batch';
  end if;

  v_batch_number := 'FS-' || to_char(clock_timestamp(),'YYYYMMDD') || '-' || lpad(nextval('public.be_finance_settlement_batch_no_seq_v3')::text, 6, '0');

  insert into public.be_finance_settlement_batches_v3(
    id,batch_number,merchant_id,merchant_name,period_from,period_to,
    planned_payment_date,status,payment_status,payment_method,
    merchant_bank_account,finance_remarks,batch_credits,batch_deductions,
    advance_recovery,withholding_tax,created_by_uid,created_by
  ) values (
    v_batch_id,v_batch_number,v_merchant_id,v_merchant_name,p_period_from,p_period_to,
    p_planned_payment_date,'DRAFT','UNPAID',p_payment_method,
    p_merchant_bank_account,p_finance_remarks,coalesce(p_batch_credits,0),coalesce(p_batch_deductions,0),
    coalesce(p_advance_recovery,0),coalesce(p_withholding_tax,0),auth.uid(),public.be_finance_actor_email_v3()
  );

  insert into public.be_finance_settlement_batch_items_v3(
    batch_id,parcel_id,delivery_way_id,merchant_id,merchant_name,delivered_date,
    recipient_name,destination,customer_tier,amount_entry_type,item_price,
    merchant_declared_delivery,customer_total_collection,net_system_delivery_charge,
    delivery_difference,settlement_direction,other_merchant_credits,
    merchant_payable_charges,merchant_final_settlement_amount,validation_status,source_snapshot
  )
  select
    v_batch_id,q.parcel_id,q.delivery_way_id,q.merchant_id,q.merchant_name,
    public.be_finance_json_date_v3(to_jsonb(q),'delivered_date','delivery_completed_at','delivered_at','completed_at'),
    q.recipient_name,
    coalesce(to_jsonb(q)->>'destination_township',to_jsonb(q)->>'destination'),
    to_jsonb(q)->>'customer_tier',
    to_jsonb(q)->>'amount_entry_type',
    public.be_finance_json_number_v3(to_jsonb(q),'item_price','declared_item_price','confirmed_item_price'),
    public.be_finance_json_number_v3(to_jsonb(q),'effective_merchant_declared_delivery','merchant_declared_delivery','customer_delivery_charge'),
    coalesce(q.customer_total_collection,0),coalesce(q.net_system_delivery_charge,0),
    q.delivery_difference,q.settlement_direction,
    public.be_finance_json_number_v3(to_jsonb(q),'other_merchant_credits','merchant_credits'),
    public.be_finance_json_number_v3(to_jsonb(q),'merchant_payable_charges','other_merchant_charges'),
    q.merchant_final_settlement_amount,q.validation_status,to_jsonb(q)
  from public.be_v_finance_merchant_settlement_queue_v2 q
  where q.parcel_id = any(p_parcel_ids);

  update public.be_finance_settlement_batches_v3 b
  set
    customer_collection = x.customer_collection,
    item_value = x.item_value,
    company_delivery_revenue = x.company_delivery_revenue,
    delivery_excess_credit = x.delivery_excess_credit,
    delivery_shortfall_deduction = x.delivery_shortfall_deduction,
    parcel_settlement_total = x.parcel_settlement_total,
    batch_net_payable = x.parcel_settlement_total + b.batch_credits - b.batch_deductions - b.advance_recovery - b.withholding_tax,
    outstanding_amount = x.parcel_settlement_total + b.batch_credits - b.batch_deductions - b.advance_recovery - b.withholding_tax,
    updated_at = now()
  from (
    select batch_id,
      coalesce(sum(customer_total_collection),0) customer_collection,
      coalesce(sum(item_price),0) item_value,
      coalesce(sum(net_system_delivery_charge),0) company_delivery_revenue,
      coalesce(sum(delivery_difference) filter (where delivery_difference > 0),0) delivery_excess_credit,
      abs(coalesce(sum(delivery_difference) filter (where delivery_difference < 0),0)) delivery_shortfall_deduction,
      coalesce(sum(merchant_final_settlement_amount),0) parcel_settlement_total
    from public.be_finance_settlement_batch_items_v3
    where batch_id=v_batch_id and active
    group by batch_id
  ) x
  where b.id=v_batch_id and b.id=x.batch_id;

  select * into v_batch from public.be_finance_settlement_batches_v3 where id=v_batch_id;
  perform public.be_finance_audit_v3('BATCH_CREATED','SETTLEMENT_BATCH',v_batch_id::text,null,to_jsonb(v_batch),p_finance_remarks);

  return jsonb_build_object('ok',true,'batch',to_jsonb(v_batch));
end;
$$;

create or replace function public.be_finance_transition_batch_v3(
  p_batch_id uuid,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_action text := upper(btrim(coalesce(p_action,'')));
  v_before public.be_finance_settlement_batches_v3%rowtype;
  v_after public.be_finance_settlement_batches_v3%rowtype;
  v_actor text := public.be_finance_actor_email_v3();
begin
  v_role := public.be_finance_assert_internal_v3();

  if v_action in ('SUBMIT_REVIEW','CANCEL') and upper(v_role) not in ('FINANCE_CREATOR','FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ADMIN','SUPERADMIN') then
    raise exception 'This role cannot submit or cancel settlement batches';
  end if;
  if v_action in ('SUBMIT_APPROVAL','RETURN_DRAFT') and upper(v_role) not in ('FINANCE_REVIEWER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') then
    raise exception 'This role cannot review settlement batches';
  end if;
  if v_action in ('APPROVE','REJECT') and upper(v_role) not in ('FINANCE_APPROVER','FINANCE_ADMIN','FINANCE_MANAGER','ADMIN','SUPERADMIN') then
    raise exception 'This role cannot approve or reject settlement batches';
  end if;

  select * into v_before from public.be_finance_settlement_batches_v3 where id=p_batch_id for update;
  if not found then raise exception 'Settlement batch not found'; end if;

  if v_action='SUBMIT_REVIEW' and v_before.status='DRAFT' then
    update public.be_finance_settlement_batches_v3 set status='UNDER_REVIEW',updated_at=now() where id=p_batch_id;
  elsif v_action='SUBMIT_APPROVAL' and v_before.status='UNDER_REVIEW' then
    update public.be_finance_settlement_batches_v3 set status='PENDING_APPROVAL',reviewed_by=v_actor,reviewed_at=now(),updated_at=now() where id=p_batch_id;
  elsif v_action='RETURN_DRAFT' and v_before.status in ('UNDER_REVIEW','PENDING_APPROVAL') then
    update public.be_finance_settlement_batches_v3 set status='DRAFT',updated_at=now() where id=p_batch_id;
  elsif v_action='APPROVE' and v_before.status='PENDING_APPROVAL' then
    if lower(coalesce(v_before.created_by,''))=lower(coalesce(v_actor,'')) then
      raise exception 'Maker-checker control: the batch creator cannot approve this batch';
    end if;
    update public.be_finance_settlement_batches_v3 set status='APPROVED',approved_by=v_actor,approved_at=now(),updated_at=now() where id=p_batch_id;
  elsif v_action='REJECT' and v_before.status in ('UNDER_REVIEW','PENDING_APPROVAL') then
    update public.be_finance_settlement_batches_v3 set status='REJECTED',rejected_by=v_actor,rejected_at=now(),updated_at=now() where id=p_batch_id;
    update public.be_finance_settlement_batch_items_v3 set active=false,removed_at=now(),removed_by=v_actor where batch_id=p_batch_id and active;
  elsif v_action='CANCEL' and v_before.status in ('DRAFT','UNDER_REVIEW') then
    update public.be_finance_settlement_batches_v3 set status='CANCELLED',updated_at=now() where id=p_batch_id;
    update public.be_finance_settlement_batch_items_v3 set active=false,removed_at=now(),removed_by=v_actor where batch_id=p_batch_id and active;
  elsif v_action='REOPEN' and v_before.status='PAID' and upper(v_role) in ('FINANCE_ADMIN','ADMIN','SUPERADMIN') then
    update public.be_finance_settlement_batches_v3 set status='REOPENED',updated_at=now() where id=p_batch_id;
  else
    raise exception 'Action % is not valid for batch status %',v_action,v_before.status;
  end if;

  select * into v_after from public.be_finance_settlement_batches_v3 where id=p_batch_id;
  perform public.be_finance_audit_v3(v_action,'SETTLEMENT_BATCH',p_batch_id::text,to_jsonb(v_before),to_jsonb(v_after),p_note);
  return jsonb_build_object('ok',true,'batch',to_jsonb(v_after));
end;
$$;

create or replace function public.be_finance_record_payment_v3(
  p_batch_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text,
  p_bank_account text default null,
  p_evidence_url text default null,
  p_confirm boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_batch public.be_finance_settlement_batches_v3%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_confirmed_total numeric;
  v_actor text := public.be_finance_actor_email_v3();
  v_ids uuid[];
  v_legacy jsonb;
begin
  v_role := public.be_finance_assert_internal_v3();
  if upper(v_role) not in ('PAYMENT_OFFICER','FINANCE_ADMIN','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN') then
    raise exception 'This role cannot record settlement payments';
  end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Payment amount must be greater than zero'; end if;
  if nullif(btrim(coalesce(p_payment_reference,'')),'') is null then raise exception 'Payment reference is required'; end if;

  select * into v_batch from public.be_finance_settlement_batches_v3 where id=p_batch_id for update;
  if not found then raise exception 'Settlement batch not found'; end if;
  if v_batch.status not in ('APPROVED','PAYMENT_PROCESSING','PARTIALLY_PAID') then
    raise exception 'Batch must be approved before payment';
  end if;
  if v_batch.batch_net_payable<=0 then raise exception 'This batch is a merchant receivable and cannot be paid as a merchant payable'; end if;
  if p_amount > v_batch.outstanding_amount then raise exception 'Payment amount exceeds outstanding amount'; end if;

  insert into public.be_finance_settlement_payments_v3(
    id,batch_id,amount,payment_method,payment_reference,bank_account,evidence_url,
    status,entered_by,confirmed_by,confirmed_at
  ) values (
    v_payment_id,p_batch_id,p_amount,p_payment_method,p_payment_reference,p_bank_account,p_evidence_url,
    case when p_confirm then 'CONFIRMED' else 'PROCESSING' end,
    v_actor,case when p_confirm then v_actor else null end,case when p_confirm then now() else null end
  );

  select coalesce(sum(amount),0) into v_confirmed_total
  from public.be_finance_settlement_payments_v3
  where batch_id=p_batch_id and status='CONFIRMED';

  if p_confirm and v_confirmed_total >= v_batch.batch_net_payable then
    select array_agg(parcel_id order by parcel_id) into v_ids
    from public.be_finance_settlement_batch_items_v3 where batch_id=p_batch_id and active;

    begin
      execute 'select public.be_finance_settle_batch_v2($1,$2,$3)::jsonb'
        into v_legacy using v_ids, auth.uid(), p_batch_id;
    exception when others then
      raise exception 'Legacy parcel settlement finalization failed: %', sqlerrm;
    end;

    update public.be_finance_settlement_batches_v3
    set paid_amount=v_confirmed_total,outstanding_amount=greatest(batch_net_payable-v_confirmed_total,0),
        status='PAID',payment_status='PAID',paid_by=v_actor,paid_at=now(),updated_at=now(),legacy_finalize_result=v_legacy
    where id=p_batch_id;
  elsif p_confirm then
    update public.be_finance_settlement_batches_v3
    set paid_amount=v_confirmed_total,outstanding_amount=batch_net_payable-v_confirmed_total,
        status='PARTIALLY_PAID',payment_status='PARTIALLY_PAID',updated_at=now()
    where id=p_batch_id;
  else
    update public.be_finance_settlement_batches_v3
    set status='PAYMENT_PROCESSING',payment_status='PROCESSING',updated_at=now()
    where id=p_batch_id;
  end if;

  perform public.be_finance_audit_v3('PAYMENT_RECORDED','SETTLEMENT_BATCH',p_batch_id::text,to_jsonb(v_batch),
    (select to_jsonb(b) from public.be_finance_settlement_batches_v3 b where b.id=p_batch_id),p_payment_reference);

  return jsonb_build_object(
    'ok',true,'payment_id',v_payment_id,
    'batch',(select to_jsonb(b) from public.be_finance_settlement_batches_v3 b where b.id=p_batch_id)
  );
end;
$$;

create or replace function public.be_finance_set_parcel_hold_v3(
  p_parcel_id uuid,
  p_hold boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_way text;
begin
  v_role := public.be_finance_assert_internal_v3();
  select delivery_way_id into v_way from public.be_v_finance_merchant_settlement_queue_v2 where parcel_id=p_parcel_id;
  if v_way is null then raise exception 'Parcel not found'; end if;

  insert into public.be_finance_settlement_parcel_control_v3(parcel_id,delivery_way_id,financial_hold,hold_reason,hold_by,hold_at,updated_at)
  values(p_parcel_id,v_way,coalesce(p_hold,false),case when p_hold then p_reason else null end,
    case when p_hold then public.be_finance_actor_email_v3() else null end,case when p_hold then now() else null end,now())
  on conflict(parcel_id) do update set
    financial_hold=excluded.financial_hold,hold_reason=excluded.hold_reason,
    hold_by=excluded.hold_by,hold_at=excluded.hold_at,updated_at=now();

  perform public.be_finance_audit_v3(case when p_hold then 'PARCEL_HOLD' else 'PARCEL_HOLD_RELEASED' end,
    'PARCEL',p_parcel_id::text,null,jsonb_build_object('financial_hold',p_hold,'reason',p_reason),p_reason);
  return jsonb_build_object('ok',true,'parcel_id',p_parcel_id,'financial_hold',p_hold);
end;
$$;

create or replace function public.be_finance_raise_dispute_v3(
  p_batch_id uuid,
  p_parcel_id uuid,
  p_category text,
  p_claimed_amount numeric,
  p_explanation text,
  p_attachment_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_actor_merchant text;
  v_merchant text;
  v_way text;
  v_id uuid := gen_random_uuid();
  v_internal boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select a.access_role,a.merchant_id into v_role,v_actor_merchant from public.be_finance_actor_access_v3() a;

  select coalesce(b.merchant_id,q.merchant_id),q.delivery_way_id
  into v_merchant,v_way
  from public.be_v_finance_merchant_settlement_queue_v2 q
  left join public.be_finance_settlement_batches_v3 b on b.id=p_batch_id
  where q.parcel_id=p_parcel_id
  limit 1;

  if v_merchant is null then raise exception 'Parcel not found'; end if;
  v_internal := upper(coalesce(v_role,'')) in (
    'FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER',
    'FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN'
  );
  if not v_internal and (v_actor_merchant is null or v_actor_merchant is distinct from v_merchant) then
    raise exception 'Merchant ownership check failed';
  end if;
  if nullif(btrim(coalesce(p_category,'')),'') is null or nullif(btrim(coalesce(p_explanation,'')),'') is null then
    raise exception 'Dispute category and explanation are required';
  end if;

  insert into public.be_finance_settlement_disputes_v3(
    id,batch_id,parcel_id,delivery_way_id,merchant_id,dispute_category,claimed_amount,
    merchant_explanation,attachment_url,status,submitted_by
  ) values (
    v_id,p_batch_id,p_parcel_id,v_way,v_merchant,upper(p_category),p_claimed_amount,
    p_explanation,p_attachment_url,'OPEN',public.be_finance_actor_email_v3()
  );

  perform public.be_finance_audit_v3('DISPUTE_RAISED','DISPUTE',v_id::text,null,
    (select to_jsonb(d) from public.be_finance_settlement_disputes_v3 d where d.id=v_id),p_explanation);
  return jsonb_build_object('ok',true,'dispute_id',v_id);
end;
$$;

create or replace function public.be_finance_resolve_dispute_v3(
  p_dispute_id uuid,
  p_status text,
  p_resolution_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_before public.be_finance_settlement_disputes_v3%rowtype;
  v_after public.be_finance_settlement_disputes_v3%rowtype;
  v_status text := upper(btrim(coalesce(p_status,'')));
begin
  v_role := public.be_finance_assert_internal_v3();
  if v_status not in ('UNDER_REVIEW','MERCHANT_ACTION_REQUIRED','FINANCE_ACTION_REQUIRED','RESOLVED','REJECTED','CLOSED') then
    raise exception 'Invalid dispute status';
  end if;
  select * into v_before from public.be_finance_settlement_disputes_v3 where id=p_dispute_id for update;
  if not found then raise exception 'Dispute not found'; end if;
  update public.be_finance_settlement_disputes_v3
  set status=v_status,resolution_note=p_resolution_note,assigned_finance_user=public.be_finance_actor_email_v3(),
      resolved_by=case when v_status in ('RESOLVED','REJECTED','CLOSED') then public.be_finance_actor_email_v3() else resolved_by end,
      resolved_at=case when v_status in ('RESOLVED','REJECTED','CLOSED') then now() else resolved_at end,
      updated_at=now()
  where id=p_dispute_id;
  select * into v_after from public.be_finance_settlement_disputes_v3 where id=p_dispute_id;
  perform public.be_finance_audit_v3('DISPUTE_'||v_status,'DISPUTE',p_dispute_id::text,to_jsonb(v_before),to_jsonb(v_after),p_resolution_note);
  return jsonb_build_object('ok',true,'dispute',to_jsonb(v_after));
end;
$$;

create or replace function public.be_finance_settlement_statement_v3(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_actor_merchant text;
  v_batch public.be_finance_settlement_batches_v3%rowtype;
  v_internal boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  select a.access_role,a.merchant_id into v_role,v_actor_merchant from public.be_finance_actor_access_v3() a;
  select * into v_batch from public.be_finance_settlement_batches_v3 where id=p_batch_id;
  if not found then raise exception 'Settlement batch not found'; end if;
  v_internal := upper(coalesce(v_role,'')) in (
    'FINANCE_CREATOR','FINANCE_REVIEWER','FINANCE_APPROVER','PAYMENT_OFFICER',
    'FINANCE_ADMIN','FINANCE','FINANCE_MANAGER','ACCOUNTS','ADMIN','SUPERADMIN'
  );
  if not v_internal and (v_actor_merchant is null or v_actor_merchant is distinct from v_batch.merchant_id) then
    raise exception 'Merchant ownership check failed';
  end if;
  return jsonb_build_object(
    'ok',true,
    'batch',to_jsonb(v_batch),
    'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.delivery_way_id) from public.be_finance_settlement_batch_items_v3 i where i.batch_id=p_batch_id and i.active),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.be_finance_settlement_payments_v3 p where p.batch_id=p_batch_id),'[]'::jsonb)
  );
end;
$$;

revoke all on public.be_finance_settlement_access_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_batches_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_batch_items_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_payments_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_parcel_control_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_disputes_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_adjustments_v3 from anon, authenticated;
revoke all on public.be_finance_settlement_audit_v3 from anon, authenticated;

grant execute on function public.be_finance_settlement_snapshot_v3(text,text,integer) to authenticated, service_role;
grant execute on function public.be_finance_create_settlement_batch_v3(uuid[],date,date,date,numeric,numeric,numeric,numeric,text,text,text) to authenticated, service_role;
grant execute on function public.be_finance_transition_batch_v3(uuid,text,text) to authenticated, service_role;
grant execute on function public.be_finance_record_payment_v3(uuid,numeric,text,text,text,text,boolean) to authenticated, service_role;
grant execute on function public.be_finance_set_parcel_hold_v3(uuid,boolean,text) to authenticated, service_role;
grant execute on function public.be_finance_raise_dispute_v3(uuid,uuid,text,numeric,text,text) to authenticated, service_role;
grant execute on function public.be_finance_resolve_dispute_v3(uuid,text,text) to authenticated, service_role;
grant execute on function public.be_finance_settlement_statement_v3(uuid) to authenticated, service_role;
