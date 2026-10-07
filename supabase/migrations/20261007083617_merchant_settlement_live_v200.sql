-- Live merchant settlement: operational delivery source, protected payments,
-- one shared Finance/Merchant history, and outstanding wallet positions.
create table private.be_merchant_settlement_receipts_v200(
 parcel_id uuid primary key, delivery_way_id text not null unique,
 batch_id uuid not null references public.be_finance_settlement_batches_v3(id),
 merchant_id text not null, amount numeric(18,2) not null,
 settled_at timestamptz not null default now(), settled_by uuid not null,
 source_snapshot jsonb not null
);
alter table private.be_merchant_settlement_receipts_v200 enable row level security;
revoke all on private.be_merchant_settlement_receipts_v200 from public,anon,authenticated;
grant all on private.be_merchant_settlement_receipts_v200 to service_role;

create or replace view public.be_v_finance_merchant_settlement_queue_v2
with(security_invoker=true) as
with legacy as (WITH source_rows AS (
         SELECT pr.parcel_id,
            pr.delivery_way_id,
            p.merchant_id,
            to_jsonb(p.*) ->> 'merchant_name'::text AS merchant_name_hint,
            p.status,
            p.recipient_name,
            p.recipient_phone,
            p.township,
            COALESCE(NULLIF(p.customer_tier, ''::text), pr.customer_tier) AS customer_tier,
            COALESCE(NULLIF(p.amount_entry_type, ''::text), pr.amount_entry_type) AS amount_entry_type,
            p.item_price,
            p.delivery_charges AS merchant_declared_delivery_charge,
            COALESCE(p.additional_customer_charge, 0::bigint) AS additional_customer_charge,
            COALESCE(NULLIF(pr.calculation ->> 'cod_amount'::text, ''::text)::integer, p.cod_amount, p.collect_amount::integer) AS customer_total_collection,
            COALESCE(p.base_tariff, NULLIF(pr.calculation ->> 'base_tariff'::text, ''::text)::bigint) AS base_tariff,
            COALESCE(p.weight_surcharge, NULLIF(pr.calculation ->> 'weight_surcharge'::text, ''::text)::bigint) AS weight_surcharge,
            COALESCE(p.cbm_surcharge, 0::bigint) AS cbm_surcharge,
            COALESCE(p.other_surcharge, 0::bigint) AS other_surcharge,
            COALESCE(p.gross_system_delivery_charge, NULLIF(pr.calculation ->> 'gross_system_delivery_charge'::text, ''::text)::bigint) AS gross_system_delivery_charge,
            COALESCE(p.commitment_refund, NULLIF(pr.calculation ->> 'commitment_refund'::text, ''::text)::bigint) AS commitment_refund,
            COALESCE(p.net_system_delivery_charge, NULLIF(pr.calculation ->> 'net_system_delivery_charge'::text, ''::text)::bigint) AS net_system_delivery_charge,
            COALESCE(p.delivery_difference, NULLIF(pr.calculation ->> 'delivery_difference'::text, ''::text)::bigint) AS delivery_difference,
            COALESCE(p.merchant_settlement_adjustment, NULLIF(pr.calculation ->> 'merchant_settlement_adjustment'::text, ''::text)::bigint) AS merchant_settlement_adjustment,
            COALESCE(p.merchant_final_settlement_amount, NULLIF(pr.calculation ->> 'merchant_final_settlement_amount'::text, ''::text)::bigint) AS merchant_final_settlement_amount,
            COALESCE(p.settlement_direction, pr.calculation ->> 'settlement_direction'::text) AS settlement_direction,
            COALESCE(p.validation_status, pr.calculation ->> 'validation_status'::text) AS validation_status,
            COALESCE(p.validation_message, pr.calculation ->> 'validation_message'::text) AS validation_message,
            COALESCE(p.calculation_version, pr.calculation ->> 'calculation_version'::text) AS calculation_version,
            COALESCE(p.calculated_at, NULLIF(pr.calculation ->> 'calculated_at'::text, ''::text)::timestamp with time zone, pr.updated_at) AS calculated_at,
            p.financial_locked_at,
            p.financial_settled_at,
            p.financial_settlement_batch_id,
            p.created_at
           FROM be_finance_calculation_projection_v4 pr
             JOIN parcels p ON pr.source_kind = 'PARCEL'::text AND p.id = pr.source_row_id
        UNION ALL
         SELECT pr.parcel_id,
            pr.delivery_way_id,
            COALESCE(NULLIF(w.merchant_code, ''::text), NULLIF(w.merchant, ''::text)) AS merchant_id,
            COALESCE(NULLIF(w.merchant_name, ''::text), NULLIF(w.merchant, ''::text)) AS merchant_name_hint,
                CASE
                    WHEN upper(COALESCE(w.status, ''::text)) = 'DELIVERED'::text OR upper(COALESCE(w.operation_status, ''::text)) = 'DELIVERED'::text OR upper(COALESCE(w.overall_status, ''::text)) = 'DELIVERED'::text THEN 'delivered'::text
                    ELSE lower(COALESCE(NULLIF(w.status, ''::text), NULLIF(w.operation_status, ''::text), NULLIF(w.overall_status, ''::text), 'registered'::text))
                END AS status,
            COALESCE(NULLIF(w.recipient_name, ''::text), NULLIF(w.receiver_name, ''::text)) AS recipient_name,
            COALESCE(NULLIF(w.recipient_phone, ''::text), NULLIF(w.receiver_phone, ''::text), NULLIF(w.recipient_phone_2, ''::text)) AS recipient_phone,
            COALESCE(NULLIF(w.recipient_township, ''::text), NULLIF(w.receiver_township, ''::text), NULLIF(w.township, ''::text)) AS township,
            pr.customer_tier,
            pr.amount_entry_type,
            w.item_price::numeric(14,2) AS item_price,
            COALESCE(w.delivery_fee_os, w.deli_fee_os)::numeric(14,2) AS merchant_declared_delivery_charge,
            COALESCE(NULLIF(w.raw_row ->> 'additional_customer_charge'::text, ''::text)::bigint, 0::bigint) AS additional_customer_charge,
            COALESCE(NULLIF(pr.calculation ->> 'cod_amount'::text, ''::text)::integer, w.cod_os::integer, w.final_cod::integer, w.cod_amount::integer) AS customer_total_collection,
            NULLIF(pr.calculation ->> 'base_tariff'::text, ''::text)::bigint AS base_tariff,
            NULLIF(pr.calculation ->> 'weight_surcharge'::text, ''::text)::bigint AS weight_surcharge,
            COALESCE(NULLIF(w.raw_row ->> 'cbm_surcharge'::text, ''::text)::bigint, 0::bigint) AS cbm_surcharge,
            COALESCE(w.surcharge, 0::numeric)::bigint AS other_surcharge,
            NULLIF(pr.calculation ->> 'gross_system_delivery_charge'::text, ''::text)::bigint AS gross_system_delivery_charge,
            NULLIF(pr.calculation ->> 'commitment_refund'::text, ''::text)::bigint AS commitment_refund,
            NULLIF(pr.calculation ->> 'net_system_delivery_charge'::text, ''::text)::bigint AS net_system_delivery_charge,
            NULLIF(pr.calculation ->> 'delivery_difference'::text, ''::text)::bigint AS delivery_difference,
            NULLIF(pr.calculation ->> 'merchant_settlement_adjustment'::text, ''::text)::bigint AS merchant_settlement_adjustment,
            NULLIF(pr.calculation ->> 'merchant_final_settlement_amount'::text, ''::text)::bigint AS merchant_final_settlement_amount,
            pr.calculation ->> 'settlement_direction'::text AS settlement_direction,
            pr.calculation ->> 'validation_status'::text AS validation_status,
            pr.calculation ->> 'validation_message'::text AS validation_message,
            pr.calculation ->> 'calculation_version'::text AS calculation_version,
            COALESCE(NULLIF(pr.calculation ->> 'calculated_at'::text, ''::text)::timestamp with time zone, pr.updated_at) AS calculated_at,
            NULL::timestamp with time zone AS financial_locked_at,
            NULL::timestamp with time zone AS financial_settled_at,
            NULL::uuid AS financial_settlement_batch_id,
            w.created_at
           FROM be_finance_calculation_projection_v4 pr
             JOIN delivery_waybills w ON pr.source_kind = 'DELIVERY_WAYBILL'::text AND w.id = pr.source_row_id
        ), enriched AS (
         SELECT s.parcel_id,
            s.delivery_way_id,
            s.merchant_id,
            s.merchant_name_hint,
            s.status,
            s.recipient_name,
            s.recipient_phone,
            s.township,
            s.customer_tier,
            s.amount_entry_type,
            s.item_price,
            s.merchant_declared_delivery_charge,
            s.additional_customer_charge,
            s.customer_total_collection,
            s.base_tariff,
            s.weight_surcharge,
            s.cbm_surcharge,
            s.other_surcharge,
            s.gross_system_delivery_charge,
            s.commitment_refund,
            s.net_system_delivery_charge,
            s.delivery_difference,
            s.merchant_settlement_adjustment,
            s.merchant_final_settlement_amount,
            s.settlement_direction,
            s.validation_status,
            s.validation_message,
            s.calculation_version,
            s.calculated_at,
            s.financial_locked_at,
            s.financial_settled_at,
            s.financial_settlement_batch_id,
            s.created_at,
            COALESCE(m.merchant_name, s.merchant_name_hint, s.merchant_id) AS merchant_name,
            COALESCE(m.counterparty_type, 'MERCHANT'::text) AS counterparty_type,
            m.settlement_method,
            m.settlement_account
           FROM source_rows s
             LEFT JOIN LATERAL ( SELECT m_1.merchant_name,
                    m_1.counterparty_type,
                    m_1.settlement_method,
                    m_1.settlement_account
                   FROM be_merchant_financial_profiles_v2 m_1
                  WHERE m_1.merchant_id = s.merchant_id AND m_1.is_active AND m_1.effective_from <= be_business_date() AND (m_1.effective_to IS NULL OR m_1.effective_to >= be_business_date())
                  ORDER BY m_1.effective_from DESC, m_1.updated_at DESC NULLS LAST
                 LIMIT 1) m ON true
        )
 SELECT parcel_id,
    delivery_way_id,
    merchant_id,
    merchant_name,
    counterparty_type,
    settlement_method,
    settlement_account,
    status,
    recipient_name,
    recipient_phone,
    township,
    customer_tier,
    amount_entry_type,
    item_price,
    merchant_declared_delivery_charge,
    additional_customer_charge,
    customer_total_collection,
    base_tariff,
    weight_surcharge,
    cbm_surcharge,
    other_surcharge,
    gross_system_delivery_charge,
    commitment_refund,
    net_system_delivery_charge,
    delivery_difference,
    merchant_settlement_adjustment,
    merchant_final_settlement_amount,
    GREATEST(COALESCE(- merchant_final_settlement_amount, 0::bigint), 0::bigint) AS merchant_receivable,
    settlement_direction,
    validation_status,
    validation_message,
    calculation_version,
    calculated_at,
    financial_locked_at,
    financial_settled_at,
    financial_settlement_batch_id,
    upper(COALESCE(status, ''::text)) = 'DELIVERED'::text AND validation_status = 'OK'::text AND COALESCE(settlement_direction, ''::text) <> 'BREAKDOWN_REQUIRED'::text AND financial_settled_at IS NULL AS settlement_eligible,
        CASE
            WHEN financial_settled_at IS NOT NULL THEN 'SETTLED'::text
            WHEN upper(COALESCE(status, ''::text)) <> 'DELIVERED'::text THEN 'WAITING_DELIVERY'::text
            WHEN validation_status = 'ERROR'::text THEN 'CALCULATION_ERROR'::text
            WHEN validation_status = 'REVIEW'::text OR settlement_direction = 'BREAKDOWN_REQUIRED'::text THEN 'REVIEW_REQUIRED'::text
            WHEN validation_status = 'OK'::text THEN 'READY_TO_SETTLE'::text
            ELSE 'NOT_READY'::text
        END AS settlement_state,
    created_at
   FROM enriched e),
operational as (
 select (d.id)::uuid as parcel_id,
(d.delivery_way_id)::text as delivery_way_id,
(d.merchant_id)::text as merchant_id,
(coalesce(m.merchant_name,d.financial_quote->>'source_merchant_name',d.merchant_id))::text as merchant_name,
('MERCHANT')::text as counterparty_type,
(m.settlement_method)::text as settlement_method,
(m.settlement_account)::text as settlement_account,
(d.parcel_status)::text as status,
(d.recipient_name)::text as recipient_name,
(d.contact_no_1)::text as recipient_phone,
(d.township)::text as township,
(coalesce(nullif(d.financial_quote->>'customer_tier',''),'STANDARD'))::text as customer_tier,
(coalesce(d.amount_entry_type,nullif(d.financial_quote->>'amount_entry_type','')))::text as amount_entry_type,
(d.item_price)::numeric(14,2) as item_price,
(nullif(d.financial_quote->>'delivery_charges','')::numeric)::numeric(14,2) as merchant_declared_delivery_charge,
(nullif(d.financial_quote->>'additional_customer_charge','')::int8)::int8 as additional_customer_charge,
(d.cod_amount)::int4 as customer_total_collection,
(nullif(d.financial_quote->>'base_tariff','')::int8)::int8 as base_tariff,
(nullif(d.financial_quote->>'weight_surcharge','')::int8)::int8 as weight_surcharge,
(nullif(d.financial_quote->>'cbm_surcharge','')::int8)::int8 as cbm_surcharge,
(nullif(d.financial_quote->>'other_surcharge','')::int8)::int8 as other_surcharge,
(nullif(d.financial_quote->>'gross_system_delivery_charge','')::int8)::int8 as gross_system_delivery_charge,
(nullif(d.financial_quote->>'commitment_refund','')::int8)::int8 as commitment_refund,
(nullif(d.financial_quote->>'net_system_delivery_charge','')::bigint)::int8 as net_system_delivery_charge,
(nullif(d.financial_quote->>'delivery_difference','')::int8)::int8 as delivery_difference,
(nullif(d.financial_quote->>'merchant_settlement_adjustment','')::int8)::int8 as merchant_settlement_adjustment,
(coalesce(d.merchant_final_settlement_amount,nullif(d.financial_quote->>'merchant_final_settlement_amount','')::bigint))::int8 as merchant_final_settlement_amount,
(greatest(-d.merchant_final_settlement_amount,0))::int8 as merchant_receivable,
(coalesce(d.settlement_direction,d.financial_quote->>'settlement_direction'))::text as settlement_direction,
(case when upper(d.financial_validation_status) in ('OK','VALID') then 'OK' else upper(d.financial_validation_status) end)::text as validation_status,
(d.financial_quote->>'validation_message')::text as validation_message,
(d.financial_quote->>'calculation_version')::text as calculation_version,
(coalesce(nullif(d.financial_quote->>'calculated_at','')::timestamptz,d.saved_at))::timestamptz as calculated_at,
(null)::timestamptz as financial_locked_at,
(null)::timestamptz as financial_settled_at,
(null)::uuid as financial_settlement_batch_id,
(false)::bool as settlement_eligible,
('PENDING')::text as settlement_state,
(d.created_at)::timestamptz as created_at
 from public.be_data_entry_parcel_details d
 left join lateral(select p.* from public.be_merchant_financial_profiles_v2 p
   where p.merchant_id=d.merchant_id and p.is_active order by p.effective_from desc limit 1) m on true
 where d.saved_at is not null and d.financial_quote is not null
), combined as(
 select * from operational
 union all
 select l.* from legacy l where not exists(
   select 1 from operational o where upper(o.delivery_way_id)=upper(l.delivery_way_id)
 )
)
select q.parcel_id as parcel_id,
q.delivery_way_id as delivery_way_id,
q.merchant_id as merchant_id,
q.merchant_name as merchant_name,
q.counterparty_type as counterparty_type,
q.settlement_method as settlement_method,
q.settlement_account as settlement_account,
q.status as status,
q.recipient_name as recipient_name,
q.recipient_phone as recipient_phone,
q.township as township,
q.customer_tier as customer_tier,
q.amount_entry_type as amount_entry_type,
q.item_price as item_price,
q.merchant_declared_delivery_charge as merchant_declared_delivery_charge,
q.additional_customer_charge as additional_customer_charge,
q.customer_total_collection as customer_total_collection,
q.base_tariff as base_tariff,
q.weight_surcharge as weight_surcharge,
q.cbm_surcharge as cbm_surcharge,
q.other_surcharge as other_surcharge,
q.gross_system_delivery_charge as gross_system_delivery_charge,
q.commitment_refund as commitment_refund,
q.net_system_delivery_charge as net_system_delivery_charge,
q.delivery_difference as delivery_difference,
q.merchant_settlement_adjustment as merchant_settlement_adjustment,
q.merchant_final_settlement_amount as merchant_final_settlement_amount,
q.merchant_receivable as merchant_receivable,
q.settlement_direction as settlement_direction,
q.validation_status as validation_status,
q.validation_message as validation_message,
q.calculation_version as calculation_version,
q.calculated_at as calculated_at,
q.financial_locked_at as financial_locked_at,
coalesce(r.settled_at,q.financial_settled_at) as financial_settled_at,
coalesce(r.batch_id,q.financial_settlement_batch_id) as financial_settlement_batch_id,
upper(coalesce(q.status,''))='DELIVERED' and q.validation_status='OK' and q.merchant_final_settlement_amount is not null and coalesce(q.settlement_direction,'')<>'BREAKDOWN_REQUIRED' and r.parcel_id is null and q.financial_settled_at is null and (coalesce(q.customer_total_collection,0)=0 or exists(
 select 1 from public.be_finance_cod_settlements_v48 c
 where upper(c.delivery_way_id)=upper(q.delivery_way_id)
   and c.expected_cod=q.customer_total_collection
   and c.reported_collected=q.customer_total_collection
   and c.settled_amount>=q.customer_total_collection
   and upper(c.settlement_status) in ('SETTLED','PAID','COMPLETED','POSTED')
)) as settlement_eligible,
case when r.parcel_id is not null or q.financial_settled_at is not null then 'SETTLED' when upper(coalesce(q.status,''))<>'DELIVERED' then 'WAITING_DELIVERY' when q.validation_status='OK' and not (coalesce(q.customer_total_collection,0)=0 or exists(
 select 1 from public.be_finance_cod_settlements_v48 c
 where upper(c.delivery_way_id)=upper(q.delivery_way_id)
   and c.expected_cod=q.customer_total_collection
   and c.reported_collected=q.customer_total_collection
   and c.settled_amount>=q.customer_total_collection
   and upper(c.settlement_status) in ('SETTLED','PAID','COMPLETED','POSTED')
)) then 'WAITING_COD_REMITTANCE' when q.validation_status='OK' then 'READY_TO_SETTLE' else 'REVIEW_REQUIRED' end as settlement_state,
q.created_at as created_at
from combined q left join private.be_merchant_settlement_receipts_v200 r using(parcel_id);
revoke all on public.be_v_finance_merchant_settlement_queue_v2 from public,anon,authenticated;
grant select on public.be_v_finance_merchant_settlement_queue_v2 to service_role;

-- Authorize through server-managed records; never trust editable user metadata.
create or replace function public.be_finance_actor_access_v3()
returns table(access_role text,merchant_id text)
language plpgsql stable security definer set search_path=''
as $fn$
declare v_role text; v_merchant text; v_email text;
begin
 if auth.uid() is null then return query select null::text,null::text; return; end if;
 select upper(regexp_replace(r.role,'[^A-Za-z0-9]+','_','g')),lower(r.email)
 into v_role,v_email from public.be_user_account_registry r
 where r.auth_user_id=auth.uid() and coalesce(r.is_active,true) and coalesce(r.active,true)
   and lower(coalesce(r.status,'active'))='active'
 order by r.updated_at desc nulls last limit 1;
 if v_role is null then return query select null::text,null::text; return; end if;
 select upper(a.access_role),a.merchant_id into v_role,v_merchant
 from public.be_finance_settlement_access_v3 a where lower(a.email)=v_email and a.active;
 if not found then
   select upper(regexp_replace(r.role,'[^A-Za-z0-9]+','_','g')) into v_role
   from public.be_user_account_registry r where r.auth_user_id=auth.uid()
     and coalesce(r.is_active,true) and coalesce(r.active,true)
   order by r.updated_at desc nulls last limit 1;
 end if;
 if v_role='SUPER_ADMIN' then v_role:='SUPERADMIN'; end if;
 if v_role in ('FINANCE_USER','ACCOUNTANT') then v_role:='FINANCE'; end if;
 if v_role in ('MERCHANT','VIP_CUSTOMER') then
   v_merchant:=private.be_current_merchant_identity_impl()->>'merchant_code';
 end if;
 return query select v_role,v_merchant;
end $fn$;

-- Finalize canonical source snapshots, including Data Entry parcels.
create or replace function private.be_finalize_merchant_batch_v200(p_batch uuid)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare i record; v_count integer:=0;
begin
 perform public.be_finance_assert_internal_v3();
 for i in
 select b.*,to_jsonb(q) as live_snapshot,q.settlement_eligible,
   q.merchant_final_settlement_amount as live_payable
 from public.be_finance_settlement_batch_items_v3 b
 left join public.be_v_finance_merchant_settlement_queue_v2 q using(parcel_id)
 where b.batch_id=p_batch and b.active order by b.parcel_id
 loop
   if not coalesce(i.settlement_eligible,false) or i.live_payable is distinct from i.merchant_final_settlement_amount then
     raise exception 'Parcel % is no longer eligible or its payable changed',i.delivery_way_id;
   end if;
   insert into private.be_merchant_settlement_receipts_v200(
     parcel_id,delivery_way_id,batch_id,merchant_id,amount,settled_by,source_snapshot
   ) values(i.parcel_id,i.delivery_way_id,p_batch,i.merchant_id,i.merchant_final_settlement_amount,auth.uid(),i.live_snapshot);
   update public.parcels set financial_settled_at=now(),financial_settlement_batch_id=p_batch,
     financial_settled_by=auth.uid() where id=i.parcel_id;
   v_count:=v_count+1;
 end loop;
 if v_count=0 then raise exception 'The batch has no active parcel items'; end if;
 return jsonb_build_object('ok',true,'parcel_count',v_count,'batch_id',p_batch);
end $fn$;
revoke all on function private.be_finalize_merchant_batch_v200(uuid) from public,anon,authenticated;
alter table public.be_finance_settlement_payments_v3 add column payment_group_reference text;
create unique index be_finance_payment_reference_normalized_v200
on public.be_finance_settlement_payments_v3(lower(btrim(payment_reference)));


alter table public.be_finance_settlement_payments_v3 add column accounting_event_id uuid;
create or replace function private.be_merchant_payment_accounting_v200(p_payment uuid)
returns void language plpgsql security definer set search_path=''
as $fn$
declare p record; v_event jsonb; v_event_id uuid; v_liability uuid; v_funds uuid;
begin
 select x.*,b.merchant_id,b.merchant_name into p
 from public.be_finance_settlement_payments_v3 x join public.be_finance_settlement_batches_v3 b on b.id=x.batch_id
 where x.id=p_payment and x.status='CONFIRMED';
 if not found then return; end if;
 select id into v_liability from public.be_chart_of_accounts where account_code='212002' and is_active and is_postable;
 select id into v_funds from public.be_chart_of_accounts
 where account_code=case when p.payment_method='CASH' then '111001' else '112003' end and is_active and is_postable;
 if v_liability is null or v_funds is null then raise exception 'Merchant payment accounting accounts are not configured'; end if;
 v_event:=public.be_accounting_upsert_event_v1(
   'MERCHANT_SETTLEMENT','be_finance_settlement_payments_v3',p.id::text,'MERCHANT_PAYABLE_SETTLED',
   'MERCHANT_PAYMENT_V200',(now() at time zone 'Asia/Yangon')::date,
   'Merchant payment - '||p.payment_reference,'MMK',p.amount,
   to_jsonb(p)||jsonb_build_object('source_reference',p.payment_reference),
   md5(to_jsonb(p)::text),'REVIEW_PENDING',now(),jsonb_build_object('payment_reference',p.payment_reference)
 );
 if not coalesce((v_event->>'ok')::boolean,false) then raise exception 'Payment accounting event failed: %',v_event; end if;
 v_event_id:=(v_event->>'event_id')::uuid;
 insert into public.be_accounting_event_lines(event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata)
 values(v_event_id,v_liability,10,p.amount,0,p.merchant_id,'Clear merchant payable',jsonb_build_object('payment_reference',p.payment_reference)),
       (v_event_id,v_funds,20,0,p.amount,p.merchant_id,'Confirmed merchant payment',jsonb_build_object('payment_reference',p.payment_reference));
 update public.be_finance_settlement_payments_v3 set accounting_event_id=v_event_id where id=p.id;
end $fn$;
revoke all on function private.be_merchant_payment_accounting_v200(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.be_finance_record_payment_v3(p_batch_id uuid, p_amount numeric, p_payment_method text, p_payment_reference text, p_bank_account text DEFAULT NULL::text, p_evidence_url text DEFAULT NULL::text, p_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text;
  v_batch public.be_finance_settlement_batches_v3%rowtype;
  v_payment_id uuid := gen_random_uuid();
  v_confirmed_total numeric;
  v_actor text := public.be_finance_actor_email_v3();
  v_ids text[];
  v_legacy jsonb;
  v_existing public.be_finance_settlement_payments_v3%rowtype;
  v_reserved numeric;
  v_method text:=upper(btrim(coalesce(p_payment_method,'')));
  v_reference text:=btrim(coalesce(p_payment_reference,''));
begin
  v_role := public.be_finance_assert_internal_v3();

  if upper(v_role) not in (
    'PAYMENT_OFFICER',
    'FINANCE_ADMIN',
    'FINANCE_MANAGER',
    'ACCOUNTS',
    'ADMIN',
    'SUPERADMIN'
  ) then
    raise exception 'This role cannot record settlement payments';
  end if;

  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if nullif(btrim(coalesce(p_payment_reference, '')), '') is null then
    raise exception 'Payment reference is required';
  end if;

  if v_method not in ('CASH','BANK_TRANSFER','KBZ_PAY','WAVE_PAY','AYA_PAY','CB_PAY','CHEQUE','OTHER') then
    raise exception 'A supported payment method is required';
  end if;
  if coalesce(p_evidence_url,'') !~ '^https://' then raise exception 'HTTPS receipt/evidence URL is required'; end if;
  if v_method in ('BANK_TRANSFER','CHEQUE') and nullif(btrim(coalesce(p_bank_account,'')),'') is null then
    raise exception 'Beneficiary bank/account detail is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(v_reference),200));
  if exists(select 1 from public.be_finance_settlement_payments_v3 where lower(btrim(payment_group_reference))=lower(v_reference)) then
    raise exception 'Reference already belongs to a bulk transfer';
  end if;
  select * into v_existing from public.be_finance_settlement_payments_v3
    where lower(btrim(payment_reference))=lower(v_reference);
  if found then
    if v_existing.batch_id is distinct from p_batch_id or v_existing.amount is distinct from p_amount
      or upper(v_existing.payment_method) is distinct from v_method
      or coalesce(v_existing.bank_account,'')<>coalesce(p_bank_account,'')
      or coalesce(v_existing.evidence_url,'')<>coalesce(p_evidence_url,'')
      or v_existing.status <> (case when p_confirm then 'CONFIRMED' else 'PROCESSING' end) then
      raise exception 'Payment reference already exists with different details';
    end if;
    return jsonb_build_object('ok',true,'duplicate_reference',true,'payment_id',v_existing.id,
      'batch',(select to_jsonb(b) from public.be_finance_settlement_batches_v3 b where b.id=p_batch_id));
  end if;

  select *
  into v_batch
  from public.be_finance_settlement_batches_v3
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Settlement batch not found';
  end if;

  if v_batch.status not in (
    'APPROVED',
    'PAYMENT_PROCESSING',
    'PARTIALLY_PAID'
  ) then
    raise exception 'Batch must be approved before payment';
  end if;

  if v_batch.batch_net_payable <= 0 then
    raise exception 'This batch is a merchant receivable and cannot be paid as a merchant payable';
  end if;

  select coalesce(sum(amount),0) into v_reserved from public.be_finance_settlement_payments_v3
    where batch_id=p_batch_id and status in ('CONFIRMED','PROCESSING','SCHEDULED');
  if p_amount > v_batch.batch_net_payable-v_reserved then
    raise exception 'Payment amount exceeds outstanding amount';
  end if;

  perform 1 from public.be_data_entry_parcel_details d
    where d.id in(select parcel_id from public.be_finance_settlement_batch_items_v3 where batch_id=p_batch_id and active) order by d.id for update;
  perform 1 from public.parcels d
    where d.id in(select parcel_id from public.be_finance_settlement_batch_items_v3 where batch_id=p_batch_id and active) order by d.id for update;
  perform 1 from public.be_finance_cod_settlements_v48 c
    where upper(c.delivery_way_id) in(select upper(delivery_way_id) from public.be_finance_settlement_batch_items_v3 where batch_id=p_batch_id and active)
    order by c.delivery_way_id for update;
  if exists(
    select 1 from public.be_finance_settlement_batch_items_v3 i
    left join public.be_v_finance_merchant_settlement_queue_v2 q using(parcel_id)
    left join public.be_finance_settlement_parcel_control_v3 c using(parcel_id)
    where i.batch_id=p_batch_id and i.active
      and (not coalesce(q.settlement_eligible,false)
        or q.merchant_final_settlement_amount is distinct from i.merchant_final_settlement_amount
        or coalesce(c.financial_hold,false)
        or exists(select 1 from public.be_finance_settlement_disputes_v3 d
          where (d.parcel_id=i.parcel_id or d.batch_id=p_batch_id) and d.status not in ('RESOLVED','REJECTED','CLOSED')))
  ) then raise exception 'Delivery, COD remittance, payable, hold or dispute changed since batch creation'; end if;

  if not exists(select 1 from public.be_finance_settlement_batch_items_v3 where batch_id=p_batch_id and active) then
    raise exception 'Batch has no active delivered parcels';
  end if;
  insert into public.be_finance_settlement_payments_v3(
    id,
    batch_id,
    amount,
    payment_method,
    payment_reference,
    bank_account,
    evidence_url,
    status,
    entered_by,
    confirmed_by,
    confirmed_at
  )
  values (
    v_payment_id,
    p_batch_id,
    p_amount,
    v_method,
    v_reference,
    p_bank_account,
    p_evidence_url,
    case when p_confirm then 'CONFIRMED' else 'PROCESSING' end,
    v_actor,
    case when p_confirm then v_actor else null end,
    case when p_confirm then now() else null end
  );

  perform private.be_merchant_payment_accounting_v200(v_payment_id);

  select coalesce(sum(amount), 0)
  into v_confirmed_total
  from public.be_finance_settlement_payments_v3
  where batch_id = p_batch_id
    and status = 'CONFIRMED';

  if p_confirm and v_confirmed_total >= v_batch.batch_net_payable then
    v_legacy := private.be_finalize_merchant_batch_v200(p_batch_id);

    update public.be_finance_settlement_batches_v3
    set
      paid_amount = v_confirmed_total,
      outstanding_amount = greatest(batch_net_payable - v_confirmed_total, 0),
      status = 'PAID',
      payment_status = 'PAID',
      paid_by = v_actor,
      paid_at = now(),
      updated_at = now(),
      legacy_finalize_result = v_legacy
    where id = p_batch_id;

  elsif p_confirm then
    update public.be_finance_settlement_batches_v3
    set
      paid_amount = v_confirmed_total,
      outstanding_amount = batch_net_payable - v_confirmed_total,
      status = 'PARTIALLY_PAID',
      payment_status = 'PARTIALLY_PAID',
      updated_at = now()
    where id = p_batch_id;

  else
    update public.be_finance_settlement_batches_v3
    set
      status = 'PAYMENT_PROCESSING',
      payment_status = 'PROCESSING',
      updated_at = now()
    where id = p_batch_id;
  end if;

  perform public.be_refresh_party_wallets_v1();

  perform public.be_finance_audit_v3(
    'PAYMENT_RECORDED',
    'SETTLEMENT_BATCH',
    p_batch_id::text,
    to_jsonb(v_batch),
    (
      select to_jsonb(batch_row)
      from public.be_finance_settlement_batches_v3 batch_row
      where batch_row.id = p_batch_id
    ),
    p_payment_reference
  );

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'batch', (
      select to_jsonb(batch_row)
      from public.be_finance_settlement_batches_v3 batch_row
      where batch_row.id = p_batch_id
    )
  );
end;
$function$;

create or replace function public.be_finance_record_bulk_payment_v200(
 p_payments jsonb,p_reference text,p_method text,p_account text,p_evidence_url text
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare x jsonb; v_result jsonb; v_results jsonb:='[]'::jsonb; v_batch uuid;
begin
 perform public.be_finance_assert_internal_v3();
 if jsonb_typeof(p_payments) is distinct from 'array' or jsonb_array_length(p_payments)=0 then raise exception 'Payment allocations are required'; end if;
 if nullif(btrim(p_reference),'') is null then raise exception 'Transfer reference is required'; end if;
 if (select count(distinct (value->>'batch_id')::uuid) from jsonb_array_elements(p_payments))<>jsonb_array_length(p_payments) then
   raise exception 'Each batch must appear once in a bulk payment';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_reference)),200));
 if exists(select 1 from public.be_finance_settlement_payments_v3 where lower(btrim(payment_reference))=lower(btrim(p_reference))) then
   raise exception 'Reference already belongs to an individual payment';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_reference)||':'||(value->>'batch_id')::uuid::text),200))
   from jsonb_array_elements(p_payments) order by (value->>'batch_id')::uuid;
 if exists(select 1 from jsonb_array_elements(p_payments) a
   join public.be_finance_settlement_payments_v3 p on lower(btrim(p.payment_reference))=lower(btrim(p_reference)||':'||(a.value->>'batch_id')::uuid::text)
   where lower(btrim(coalesce(p.payment_group_reference,'')))<>lower(btrim(p_reference))) then
   raise exception 'An allocation reference already belongs to another transfer';
 end if;
 if exists(select 1 from public.be_finance_settlement_payments_v3 where lower(btrim(payment_group_reference))=lower(btrim(p_reference))) and
   (select jsonb_agg(jsonb_build_object('batch_id',batch_id,'amount',amount) order by batch_id)
    from public.be_finance_settlement_payments_v3 where lower(btrim(payment_group_reference))=lower(btrim(p_reference))) is distinct from
   (select jsonb_agg(jsonb_build_object('batch_id',(value->>'batch_id')::uuid,'amount',(value->>'amount')::numeric) order by (value->>'batch_id')::uuid) from jsonb_array_elements(p_payments)) then
   raise exception 'Transfer reference already belongs to different allocations';
 end if;
 for x in select value from jsonb_array_elements(p_payments) order by (value->>'batch_id')::uuid loop
   v_batch:=(x->>'batch_id')::uuid;
   v_result:=public.be_finance_record_payment_v3(v_batch,(x->>'amount')::numeric,
     p_method,btrim(p_reference)||':'||v_batch,p_account,p_evidence_url,true);
   update public.be_finance_settlement_payments_v3 set payment_group_reference=btrim(p_reference)
     where id=(v_result->>'payment_id')::uuid;
   v_results:=v_results||jsonb_build_array(v_result);
 end loop;
 return jsonb_build_object('ok',true,'payments',v_results,'payment_reference',btrim(p_reference));
end $fn$;
revoke all on function public.be_finance_record_bulk_payment_v200(jsonb,text,text,text,text) from public,anon;
grant execute on function public.be_finance_record_bulk_payment_v200(jsonb,text,text,text,text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.be_refresh_party_wallets_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rows integer:=0;
begin
  -- Workforce + marketing accounts from commission events.
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select distinct
    case when role_code='MARKETING_SUPPORT' then 'MARKETING_EMPLOYEE' else role_code end,
    lower(assignee_email),
    max(assignee_name) over(partition by role_code,lower(assignee_email)),
    jsonb_build_object('source','be_commission_events'),now()
  from public.be_commission_events
  where nullif(assignee_email,'') is not null
    and role_code in ('RIDER','DRIVER','HELPER','MARKETING_SUPPORT')
  on conflict(party_type,party_key) do update
  set party_name=excluded.party_name,updated_at=now();

  -- Merchant accounts.
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select 'MERCHANT',coalesce(nullif(merchant_code,''),id::text),
         coalesce(nullif(merchant_name,''),nullif(name,''),nullif(business_name,''),merchant_code),
         jsonb_build_object('source','merchants'),now()
  from public.merchants
  where coalesce(is_active,true)
  on conflict(party_type,party_key) do update
  set party_name=excluded.party_name,updated_at=now();

  -- Provider/allied-company accounts from service provider master.
  insert into public.be_party_wallet_accounts(party_type,party_key,party_name,metadata,updated_at)
  select
    case
      when provider_code='DK DELIVERY' then 'DK'
      when provider_code='ROYAL EXPRESS' then 'ROYAL'
      when provider_code='NPT BRANCH' then 'NPT'
      when provider_type='OUTSOURCE' then 'ALLIED_COMPANY'
      else 'SERVICE_PROVIDER'
    end,
    provider_code,display_name,
    jsonb_build_object('provider_type',provider_type,'source','be_data_entry_service_providers'),now()
  from public.be_data_entry_service_providers
  where is_active
  on conflict(party_type,party_key) do update
  set party_name=excluded.party_name,metadata=excluded.metadata,updated_at=now();

  -- Commission liabilities: Britium owes the worker/marketing supporter.
  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'COMMISSION',e.id::text,e.work_date,'BRITIUM_OWES_PARTY',e.commission_mmk,
    case when upper(coalesce(e.event_status,'')) in ('PAID','SETTLED') then 'SETTLED' else 'PENDING' end,
    e.operation_type||' commission',
    jsonb_build_object(
      'role_code',e.role_code,'operation_type',e.operation_type,'unit_count',e.unit_count,
      'rate_mmk',e.rate_mmk,'tracking_no',e.tracking_no,'pickup_id',e.pickup_id,
      'merchant_id',e.merchant_id,'policy_version','COMMISSION_2026_09_30'
    ),now()
  from public.be_commission_events e
  join public.be_party_wallet_accounts w
    on w.party_type=(case when e.role_code='MARKETING_SUPPORT' then 'MARKETING_EMPLOYEE' else e.role_code end)
   and w.party_key=lower(e.assignee_email)
  where e.role_code in ('RIDER','DRIVER','HELPER','MARKETING_SUPPORT')
    and e.commission_mmk>=0
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  -- Merchant settlement positions from the finance settlement queue.
  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'MERCHANT_SETTLEMENT',q.parcel_id::text,q.created_at::date,
    case when coalesce(q.merchant_final_settlement_amount,0)>=0 then 'BRITIUM_OWES_PARTY' else 'PARTY_OWES_BRITIUM' end,
    abs(coalesce(q.merchant_final_settlement_amount,0)),
    case when q.financial_settled_at is not null then 'SETTLED' else upper(coalesce(q.settlement_state,'PENDING')) end,
    'Merchant parcel settlement '||q.delivery_way_id,
    to_jsonb(q),now()
  from public.be_v_finance_merchant_settlement_queue_v2 q
  join public.be_party_wallet_accounts w
    on w.party_type='MERCHANT' and w.party_key=q.merchant_id
  left join public.be_finance_settlement_batch_items_v3 i on i.parcel_id=q.parcel_id and i.active
  left join public.be_finance_settlement_batches_v3 b on b.id=i.batch_id
  where upper(coalesce(q.status,''))='DELIVERED' and q.validation_status='OK'
    and not exists(select 1 from public.be_finance_settlement_batch_items_v3 active_item where active_item.parcel_id=q.parcel_id and active_item.active)
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  -- Remove pending positions that do not represent delivered/validated parcels.
  -- Retain their audit snapshots rather than deleting rows.
  update public.be_party_wallet_ledger l set status='VOID',amount=0,updated_at=now()
  where l.source_type='MERCHANT_SETTLEMENT' and upper(l.status)<>'SETTLED'
    and not exists(select 1 from public.be_v_finance_merchant_settlement_queue_v2 q
      where q.parcel_id::text=l.source_key and upper(q.status)='DELIVERED' and q.validation_status='OK'
        and not exists(select 1 from public.be_finance_settlement_batch_items_v3 i where i.parcel_id=q.parcel_id and i.active));

  -- One batch position uses the adjusted net amount, including mixed collection types.
  insert into public.be_party_wallet_ledger(wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at)
  select w.id,'MERCHANT_SETTLEMENT','BATCH:'||b.id,b.created_at::date,
    case when b.batch_net_payable>=0 then 'BRITIUM_OWES_PARTY' else 'PARTY_OWES_BRITIUM' end,
    case when b.status in ('PAID','CANCELLED','REJECTED') then 0
      when b.batch_net_payable>=0 then greatest(b.outstanding_amount,0) else abs(b.batch_net_payable) end,
    case when b.status='PAID' then 'SETTLED' when b.status in ('CANCELLED','REJECTED') then 'VOID' else 'PENDING' end,
    'Merchant settlement batch '||b.batch_number,to_jsonb(b),now()
  from public.be_finance_settlement_batches_v3 b join public.be_party_wallet_accounts w
    on w.party_type='MERCHANT' and w.party_key=b.merchant_id
  on conflict(wallet_id,source_type,source_key,direction) do update
    set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  update public.be_party_wallet_ledger set amount=0,status='VOID',updated_at=now()
  where source_type='MERCHANT_SETTLEMENT_LIVE';

  -- Explicit partner payable where the financial quote exposes a partner share.
  insert into public.be_party_wallet_ledger(
    wallet_id,source_type,source_key,transaction_date,direction,amount,status,description,metadata,updated_at
  )
  select
    w.id,'SERVICE_PROVIDER_PAYABLE',d.delivery_way_id,
    coalesce(d.saved_at,d.created_at)::date,'BRITIUM_OWES_PARTY',
    greatest(
      coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
      - coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
    ),
    'PENDING',
    'Provider payable for '||d.delivery_way_id,
    jsonb_build_object(
      'service_provider_code',d.financial_quote->>'service_provider_code',
      'calculation_version',d.financial_quote->>'calculation_version',
      'financial_quote',d.financial_quote
    ),now()
  from public.be_data_entry_parcel_details d
  join public.be_party_wallet_accounts w
    on w.party_key=(d.financial_quote->>'service_provider_code')
   and w.party_type in ('DK','ROYAL','NPT','ALLIED_COMPANY','SERVICE_PROVIDER')
  where nullif(d.financial_quote->>'service_provider_code','') is not null
    and (d.financial_quote->>'service_provider_code')<>'BRITIUM'
    and greatest(
      coalesce(nullif(d.financial_quote->>'gross_system_delivery_charge','')::numeric,0)
      - coalesce(nullif(d.financial_quote->>'net_system_delivery_charge','')::numeric,0),0
    )>0
  on conflict(wallet_id,source_type,source_key,direction) do update
  set amount=excluded.amount,status=excluded.status,metadata=excluded.metadata,updated_at=now();

  update public.be_party_wallet_accounts a
  set britium_owes=coalesce(x.britium_owes,0),
      owes_britium=coalesce(x.owes_britium,0),
      net_position=coalesce(x.britium_owes,0)-coalesce(x.owes_britium,0),
      updated_at=now()
  from (
    select wallet_id,
      sum(amount) filter(where direction='BRITIUM_OWES_PARTY' and upper(status)<>'SETTLED') britium_owes,
      sum(amount) filter(where direction='PARTY_OWES_BRITIUM' and upper(status)<>'SETTLED') owes_britium
    from public.be_party_wallet_ledger
    group by wallet_id
  ) x
  where x.wallet_id=a.id;

  update public.be_party_wallet_accounts a
  set britium_owes=0,owes_britium=0,net_position=0,updated_at=now()
  where not exists(select 1 from public.be_party_wallet_ledger l where l.wallet_id=a.id);

  get diagnostics v_rows=row_count;
  return jsonb_build_object('ok',true,'accounts_refreshed',(select count(*) from public.be_party_wallet_accounts),
    'ledger_rows',(select count(*) from public.be_party_wallet_ledger),'policy_version','COMMISSION_2026_09_30');
end;
$function$;

create or replace function private.be_merchant_payment_history_v200(p_merchant text)
returns jsonb language sql stable security definer set search_path=''
as $fn$
 with batches as(
   select b.* from public.be_finance_settlement_batches_v3 b
   where p_merchant is null or upper(b.merchant_id)=upper(p_merchant)
 ), payments as(
   select p.*,b.merchant_id,b.merchant_name,b.batch_number
   from public.be_finance_settlement_payments_v3 p join batches b on b.id=p.batch_id
 ), unbatched as(
   select q.* from public.be_v_finance_merchant_settlement_queue_v2 q
   where (p_merchant is null or upper(q.merchant_id)=upper(p_merchant))
     and upper(q.status)='DELIVERED' and upper(q.validation_status)='OK' and q.financial_settled_at is null and not exists(
       select 1 from public.be_finance_settlement_batch_items_v3 i where i.parcel_id=q.parcel_id and i.active)
 )
 select jsonb_build_object(
   'batches',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from batches b),'[]'::jsonb),
   'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from payments p),'[]'::jsonb),
   'wallet',jsonb_build_object(
     'britium_owes',coalesce((select sum(greatest(merchant_final_settlement_amount,0)) from unbatched),0)
        +coalesce((select sum(greatest(outstanding_amount,0)) from batches where status not in ('CANCELLED','REJECTED','PAID')),0),
     'owes_britium',coalesce((select sum(greatest(-merchant_final_settlement_amount,0)) from unbatched),0)
        +coalesce((select sum(greatest(-batch_net_payable,0)) from batches where status not in ('CANCELLED','REJECTED','PAID')),0),
     'paid_amount',coalesce((select sum(amount) from payments where status='CONFIRMED'),0)
   )
 );
$fn$;
revoke all on function private.be_merchant_payment_history_v200(text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.be_finance_settlement_snapshot_v3(p_merchant_id text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'cod_received',coalesce((select c.settled_amount from public.be_finance_cod_settlements_v48 c where c.delivery_way_id=n.delivery_way_id limit 1),0),
      'cod_reported',coalesce((select c.reported_collected from public.be_finance_cod_settlements_v48 c where c.delivery_way_id=n.delivery_way_id limit 1),0),
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
    'paid_settlements', coalesce((select sum(paid_amount) from public.be_finance_settlement_batches_v3 b where (v_merchant is null or b.merchant_id = v_merchant)),0),
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
    'wallet',private.be_merchant_payment_history_v200(v_merchant)->'wallet',
    'rows', v_rows,
    'batches', v_batches,
    'payments', v_payments,
    'exceptions', v_exceptions,
    'disputes', v_disputes,
    'audit', v_audit
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.be_merchant_portal_v1_snapshot_impl(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth', 'private'
AS $function$
declare
  v_identity jsonb:=private.be_current_merchant_identity_impl();
  v_finance jsonb;
  v_code text; v_name text; v_uuid uuid;
  v_limit integer:=least(greatest(coalesce((p_payload->>'limit')::integer,100),1),500);
  v_pickups jsonb:='[]'; v_shipments jsonb:='[]'; v_settlements jsonb:='[]';
  v_invoices jsonb:='[]'; v_tickets jsonb:='[]'; v_profile jsonb:='{}';
begin
  v_code:=v_identity->>'merchant_code'; v_name:=v_identity->>'merchant_name';
  v_uuid:=nullif(v_identity->>'merchant_uuid','')::uuid;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_pickups from (
    select * from public.be_merchant_portal_pickup_requests p
    where upper(coalesce(p.merchant_code,''))=upper(v_code) order by p.created_at desc limit v_limit) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_shipments from (
    select * from public.be_data_entry_register_rows r
    where upper(coalesce(r.merchant_code,''))=upper(v_code) order by r.created_at desc limit v_limit) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_settlements from (
    select * from public.be_financial_settlements s
    where upper(coalesce(s.merchant_code,''))=upper(v_code)
       or (nullif(s.merchant_code,'') is null and lower(coalesce(s.merchant_name,''))=lower(v_name))
    order by s.created_at desc limit v_limit) x;
  if v_uuid is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_invoices from (
      select * from public.merchant_invoices i where i.merchant_id=v_uuid
      order by i.created_at desc limit v_limit) x;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into v_tickets from (
    select * from public.be_merchant_support_tickets t
    where upper(coalesce(t.merchant_code,''))=upper(v_code) order by t.created_at desc limit v_limit) x;
  select coalesce(to_jsonb(p),'{}') into v_profile from public.be_merchant_profiles p
  where p.id=auth.uid() or (v_uuid is not null and p.id=v_uuid)
  order by case when p.id=auth.uid() then 0 else 1 end limit 1;
  v_finance:=private.be_merchant_payment_history_v200(v_code);
  return jsonb_build_object('ok',true,'identity',v_identity,'profile',coalesce(v_profile,'{}'),
    'pickups',v_pickups,'shipments',v_shipments,'settlements',v_finance->'batches',
    'payments',v_finance->'payments','wallet',v_finance->'wallet',
    'invoices',v_invoices,'tickets',v_tickets);
end $function$;

create or replace function public.be_merchant_portal_snapshot(p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $fn$ select public.be_merchant_portal_v1_snapshot(p_payload) $fn$;
revoke all on function public.be_merchant_portal_snapshot(jsonb) from public,anon;
grant execute on function public.be_merchant_portal_snapshot(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.be_finance_create_settlement_batch_v3(p_parcel_ids uuid[], p_period_from date DEFAULT NULL::date, p_period_to date DEFAULT NULL::date, p_planned_payment_date date DEFAULT NULL::date, p_batch_credits numeric DEFAULT 0, p_batch_deductions numeric DEFAULT 0, p_advance_recovery numeric DEFAULT 0, p_withholding_tax numeric DEFAULT 0, p_payment_method text DEFAULT NULL::text, p_merchant_bank_account text DEFAULT NULL::text, p_finance_remarks text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  perform 1 from public.be_data_entry_parcel_details where id=any(p_parcel_ids) order by id for update;
  perform 1 from public.parcels where id=any(p_parcel_ids) order by id for update;
  if exists(select 1 from public.be_finance_settlement_parcel_control_v3 c
      where c.parcel_id=any(p_parcel_ids) and c.financial_hold)
    or exists(select 1 from public.be_finance_settlement_disputes_v3 d
      where d.parcel_id=any(p_parcel_ids) and d.status not in ('RESOLVED','REJECTED','CLOSED')) then
    raise exception 'Held or disputed parcels cannot be batched';
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
$function$;

CREATE OR REPLACE FUNCTION public.be_party_wallet_confirm_payout_v193(p_wallet_id uuid, p_ledger_ids uuid[], p_payment_reference text, p_payment_method text, p_recipient text, p_paid_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_wallet public.be_party_wallet_accounts%rowtype;
  v_auth jsonb := public.be_accounting_current_authority_v2();
  v_actor uuid := auth.uid();
  v_actor_email text := nullif(auth.jwt()->>'email','');
  v_ref text := nullif(btrim(coalesce(p_payment_reference,'')),'');
  v_method text := upper(nullif(btrim(coalesce(p_payment_method,'')),''));
  v_recipient text := nullif(btrim(coalesce(p_recipient,'')),'');
  v_amount numeric(18,2) := coalesce(p_paid_amount,0);
  v_sum numeric(18,2) := 0;
  v_count integer := 0;
  v_payout_id uuid;
  v_event jsonb;
  v_event_id uuid;
  v_liability uuid;
  v_bank uuid;
  v_liability_code text;
  v_bank_code text;
  v_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.be_accounting_can_v1('journal_post') then
    raise exception 'Journal-post authority is required to confirm payout';
  end if;

  if p_wallet_id is null then raise exception 'wallet_id is required'; end if;
  if coalesce(array_length(p_ledger_ids,1),0)=0 then raise exception 'At least one wallet ledger row is required'; end if;
  if v_ref is null then raise exception 'payment reference is required'; end if;
  if v_method is null then raise exception 'payment method is required'; end if;
  if v_recipient is null then raise exception 'recipient is required'; end if;
  if v_amount<=0 then raise exception 'paid amount must be greater than zero'; end if;

  select * into v_wallet
  from public.be_party_wallet_accounts
  where id=p_wallet_id
  for update;

  if not found then raise exception 'Wallet not found'; end if;

  if upper(v_wallet.party_type)='MERCHANT' then
    raise exception 'Use Finance Merchant Settlement to pay merchants and preserve batch approval/payment history';
  end if;

  if exists(select 1 from public.be_party_wallet_payouts_v193 where payment_reference=v_ref) then
    select id into v_payout_id
    from public.be_party_wallet_payouts_v193
    where payment_reference=v_ref;
    return jsonb_build_object(
      'ok',true,'duplicate_reference',true,'payout_id',v_payout_id,
      'payment_reference',v_ref
    );
  end if;

  select count(*),coalesce(sum(l.amount),0)
  into v_count,v_sum
  from public.be_party_wallet_ledger l
  where l.id=any(p_ledger_ids)
    and l.wallet_id=p_wallet_id
    and l.direction='BRITIUM_OWES_PARTY'
    and (
      upper(coalesce(l.status,''))='READY_FOR_PAYOUT'
      or (
        upper(coalesce(l.status,''))='PENDING'
        and l.source_type='COMMISSION'
        and exists(
          select 1 from public.be_commission_events e
          where e.id::text=l.source_key
            and upper(coalesce(e.event_status,'')) in ('PENDING','READY')
        )
      )
    );

  if v_count<>array_length(p_ledger_ids,1) then
    raise exception 'One or more ledger rows are not eligible for payout';
  end if;

  if abs(v_sum-v_amount)>0.01 then
    raise exception 'Paid amount % does not match selected wallet amount %',v_amount,v_sum;
  end if;

  case upper(v_wallet.party_type)
    when 'MERCHANT' then
      v_liability_code:='212002'; v_bank_code:='112003'; v_event_type:='MERCHANT_PAYOUT_CONFIRMED';
    when 'ROYAL' then
      v_liability_code:='211003'; v_bank_code:='112001'; v_event_type:='PROVIDER_PAYOUT_CONFIRMED';
    when 'DK' then
      v_liability_code:='211004'; v_bank_code:='112001'; v_event_type:='PROVIDER_PAYOUT_CONFIRMED';
    when 'NPT' then
      v_liability_code:='211002'; v_bank_code:='112001'; v_event_type:='PROVIDER_PAYOUT_CONFIRMED';
    when 'ALLIED_COMPANY' then
      v_liability_code:='211002'; v_bank_code:='112001'; v_event_type:='PROVIDER_PAYOUT_CONFIRMED';
    when 'SERVICE_PROVIDER' then
      v_liability_code:='211002'; v_bank_code:='112001'; v_event_type:='PROVIDER_PAYOUT_CONFIRMED';
    when 'RIDER' then
      v_liability_code:='213001'; v_bank_code:='112002'; v_event_type:='WORKFORCE_COMMISSION_PAYOUT';
    when 'DRIVER' then
      v_liability_code:='213002'; v_bank_code:='112002'; v_event_type:='WORKFORCE_COMMISSION_PAYOUT';
    when 'HELPER' then
      v_liability_code:='213003'; v_bank_code:='112002'; v_event_type:='WORKFORCE_COMMISSION_PAYOUT';
    when 'MARKETING_EMPLOYEE' then
      v_liability_code:='211005'; v_bank_code:='112002'; v_event_type:='MARKETING_COMMISSION_PAYOUT';
    else
      raise exception 'Unsupported party type %',v_wallet.party_type;
  end case;

  select id into v_liability
  from public.be_chart_of_accounts
  where account_code=v_liability_code and is_active and is_postable;

  select id into v_bank
  from public.be_chart_of_accounts
  where account_code=v_bank_code and is_active and is_postable;

  if v_liability is null or v_bank is null then
    raise exception 'Required payout accounts are not configured';
  end if;

  insert into public.be_party_wallet_payouts_v193(
    wallet_id,party_type,party_key,party_name,payment_reference,payment_method,
    recipient,amount,paid_at,paid_by,paid_by_email,status,note,ledger_ids,metadata
  ) values(
    v_wallet.id,v_wallet.party_type,v_wallet.party_key,v_wallet.party_name,
    v_ref,v_method,v_recipient,v_amount,now(),v_actor,v_actor_email,'CONFIRMED',
    nullif(btrim(coalesce(p_note,'')),''),
    p_ledger_ids,
    jsonb_build_object(
      'authority',v_auth,
      'liability_account',v_liability_code,
      'bank_account',v_bank_code,
      'policy_version','PARTY_WALLET_PAYOUT_V193'
    )
  )
  returning id into v_payout_id;

  update public.be_party_wallet_ledger l
  set status='SETTLED',
      metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
        'payout_id',v_payout_id,
        'payment_reference',v_ref,
        'payment_method',v_method,
        'recipient',v_recipient,
        'paid_at',now(),
        'paid_by',v_actor,
        'policy_version','PARTY_WALLET_PAYOUT_V193'
      ),
      updated_at=now()
  where l.id=any(p_ledger_ids) and l.wallet_id=p_wallet_id;

  update public.be_commission_events e
  set event_status='PAID',
      actor_email=coalesce(v_actor_email,actor_email),
      metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
        'payout_id',v_payout_id,
        'payment_reference',v_ref,
        'paid_at',now(),
        'policy_version','PARTY_WALLET_PAYOUT_V193'
      ),
      updated_at=now()
  where e.id::text in (
    select l.source_key
    from public.be_party_wallet_ledger l
    where l.id=any(p_ledger_ids) and l.source_type='COMMISSION'
  );

  v_event := public.be_accounting_upsert_event_v1(
    'PARTY_PAYOUT',
    'be_party_wallet_payouts_v193',
    v_payout_id::text,
    v_event_type,
    'PARTY_WALLET_PAYOUT_V193',
    (now() at time zone 'Asia/Yangon')::date,
    'Payout confirmed - '||coalesce(v_wallet.party_name,v_wallet.party_key)||' - '||v_ref,
    'MMK',
    v_amount,
    jsonb_build_object(
      'source_reference',v_ref,
      'payout_id',v_payout_id,
      'wallet_id',v_wallet.id,
      'party_type',v_wallet.party_type,
      'party_key',v_wallet.party_key,
      'payment_method',v_method,
      'recipient',v_recipient,
      'ledger_ids',to_jsonb(p_ledger_ids)
    ),
    md5(v_payout_id::text||'|'||v_ref||'|'||v_amount::text||'|'||v_method),
    'APPROVED',
    now(),
    jsonb_build_object('confirmed_by',v_actor_email,'policy_version','PARTY_WALLET_PAYOUT_V193')
  );

  if not coalesce((v_event->>'ok')::boolean,false) then
    raise exception 'Accounting payout event failed: %',v_event;
  end if;

  v_event_id:=(v_event->>'event_id')::uuid;

  delete from public.be_accounting_event_lines where event_id=v_event_id;

  insert into public.be_accounting_event_lines(
    event_id,account_id,sequence_no,debit_amount,credit_amount,
    merchant_id,rider_or_employee_id,description,metadata
  ) values
  (
    v_event_id,v_liability,10,v_amount,0,
    case when upper(v_wallet.party_type)='MERCHANT' then v_wallet.party_key else null end,
    case when upper(v_wallet.party_type) in ('RIDER','DRIVER','HELPER','MARKETING_EMPLOYEE') then v_wallet.party_key else null end,
    'Clear payable - '||coalesce(v_wallet.party_name,v_wallet.party_key),
    jsonb_build_object('payment_reference',v_ref,'payout_id',v_payout_id)
  ),
  (
    v_event_id,v_bank,20,0,v_amount,
    case when upper(v_wallet.party_type)='MERCHANT' then v_wallet.party_key else null end,
    case when upper(v_wallet.party_type) in ('RIDER','DRIVER','HELPER','MARKETING_EMPLOYEE') then v_wallet.party_key else null end,
    'Payment from bank - '||v_ref,
    jsonb_build_object('payment_reference',v_ref,'payout_id',v_payout_id,'payment_method',v_method)
  );

  update public.be_party_wallet_payouts_v193
  set accounting_event_id=v_event_id,updated_at=now()
  where id=v_payout_id;

  perform public.be_refresh_party_wallets_v1();

  -- Reassert settled rows because generic wallet refresh reconstructs source positions.
  update public.be_party_wallet_ledger l
  set status='SETTLED',
      metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
        'payout_id',v_payout_id,'payment_reference',v_ref
      ),
      updated_at=now()
  where l.id=any(p_ledger_ids) and l.wallet_id=p_wallet_id;

  update public.be_party_wallet_accounts a
  set britium_owes=coalesce(x.britium_owes,0),
      owes_britium=coalesce(x.owes_britium,0),
      net_position=coalesce(x.britium_owes,0)-coalesce(x.owes_britium,0),
      updated_at=now()
  from (
    select wallet_id,
      coalesce(sum(amount) filter(where direction='BRITIUM_OWES_PARTY' and upper(status)<>'SETTLED'),0) as britium_owes,
      coalesce(sum(amount) filter(where direction='PARTY_OWES_BRITIUM' and upper(status)<>'SETTLED'),0) as owes_britium
    from public.be_party_wallet_ledger
    where wallet_id=p_wallet_id
    group by wallet_id
  ) x
  where a.id=x.wallet_id;

  update public.be_app_notifications
  set status='RESOLVED',
      is_read=true,
      read_at=coalesce(read_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'payout_id',v_payout_id,
        'payment_reference',v_ref,
        'payout_confirmed_at',now()
      )
  where (
    lower(coalesce(metadata->>'party_key',''))=lower(v_wallet.party_key)
    or lower(coalesce(metadata->>'wallet_id',''))=lower(v_wallet.id::text)
  )
  and upper(coalesce(status,'')) not in ('RESOLVED','CLOSED');

  return jsonb_build_object(
    'ok',true,
    'payout_id',v_payout_id,
    'payment_reference',v_ref,
    'wallet_id',v_wallet.id,
    'party_type',v_wallet.party_type,
    'party_key',v_wallet.party_key,
    'amount',v_amount,
    'accounting_event_id',v_event_id,
    'status','CONFIRMED'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.be_accounting_sync_merchant_settlements_v1(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_row jsonb;
  v_way text;
  v_payable numeric(18,2);
  v_receivable numeric(18,2);
  v_event_type text;
  v_amount numeric(18,2);
  v_fingerprint text;
  v_upsert jsonb;
  v_event_id uuid;
  v_bank uuid;
  v_payable_account uuid;
  v_ar_account uuid;
  v_scanned integer := 0;
  v_synced integer := 0;
  v_skipped integer := 0;
  v_needs_review integer := 0;
begin
  if p_from is null or p_to is null or p_to<p_from then
    return jsonb_build_object('ok',false,'code','INVALID_DATE_RANGE');
  end if;

  if to_regclass('public.be_v_finance_merchant_settlement_queue_v2') is null then
    return jsonb_build_object(
      'ok',true,'code','SOURCE_NOT_AVAILABLE',
      'source','be_v_finance_merchant_settlement_queue_v2',
      'scanned',0,'synced',0,'skipped',0,'needs_review',0
    );
  end if;

  select id into v_bank
  from public.be_chart_of_accounts
  where account_code='112001' and is_active and is_postable;

  select id into v_payable_account
  from public.be_chart_of_accounts
  where account_code='212001' and is_active and is_postable;

  select id into v_ar_account
  from public.be_chart_of_accounts
  where account_code='113005' and is_active and is_postable;

  if v_bank is null or v_payable_account is null or v_ar_account is null then
    return jsonb_build_object('ok',false,'code','MERCHANT_SETTLEMENT_ACCOUNTS_NOT_CONFIGURED');
  end if;

  for v_row in execute $query$
    select to_jsonb(q)
    from (
      select distinct on (upper(btrim(delivery_way_id)))
        parcel_id,
        delivery_way_id,
        merchant_id,
        merchant_name,
        merchant_final_settlement_amount,
        merchant_receivable,
        settlement_direction,
        validation_status,
        calculation_version,
        financial_settled_at,
        financial_settlement_batch_id,
        calculated_at,
        created_at
      from public.be_v_finance_merchant_settlement_queue_v2
      where financial_settled_at is not null
        and not exists(select 1 from public.be_finance_settlement_payments_v3 payment
          where payment.batch_id=financial_settlement_batch_id and payment.status='CONFIRMED'
            and payment.accounting_event_id is not null)
        and financial_settled_at::date between $1 and $2
        and upper(coalesce(validation_status,''))='OK'
        and nullif(btrim(delivery_way_id),'') is not null
      order by
        upper(btrim(delivery_way_id)),
        financial_settled_at desc,
        calculated_at desc nulls last,
        created_at desc nulls last,
        parcel_id desc
    ) q
    order by q.financial_settled_at,q.delivery_way_id
  $query$
  using p_from,p_to
  loop
    v_scanned := v_scanned+1;
    v_way := upper(btrim(v_row->>'delivery_way_id'));
    v_payable := greatest(coalesce(nullif(v_row->>'merchant_final_settlement_amount','')::numeric,0),0);
    v_receivable := greatest(
      coalesce(
        nullif(v_row->>'merchant_receivable','')::numeric,
        case
          when coalesce(nullif(v_row->>'merchant_final_settlement_amount','')::numeric,0)<0
            then -nullif(v_row->>'merchant_final_settlement_amount','')::numeric
          else 0
        end,
        0
      ),
      0
    );

    if v_payable>0 and v_receivable=0 then
      v_event_type := 'MERCHANT_PAYABLE_SETTLED';
      v_amount := v_payable;
    elsif v_receivable>0 and v_payable=0 then
      v_event_type := 'MERCHANT_RECEIVABLE_SETTLED';
      v_amount := v_receivable;
    else
      v_needs_review := v_needs_review+1;
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_fingerprint := md5(
      jsonb_build_object(
        'delivery_way_id',v_way,
        'merchant_id',v_row->>'merchant_id',
        'event_type',v_event_type,
        'amount',v_amount,
        'settlement_direction',v_row->>'settlement_direction',
        'financial_settled_at',v_row->>'financial_settled_at',
        'financial_settlement_batch_id',v_row->>'financial_settlement_batch_id',
        'calculation_version',v_row->>'calculation_version'
      )::text
    );

    v_upsert := public.be_accounting_upsert_event_v1(
      'MERCHANT_SETTLEMENT',
      'be_v_finance_merchant_settlement_queue_v2',
      v_way,
      v_event_type,
      coalesce(nullif(upper(btrim(v_row->>'calculation_version')),''),'CANONICAL_V4'),
      (v_row->>'financial_settled_at')::timestamptz::date,
      case v_event_type
        when 'MERCHANT_PAYABLE_SETTLED' then 'Merchant payable settled - '||v_way
        else 'Merchant receivable settled - '||v_way
      end,
      'MMK',
      v_amount,
      coalesce(v_row,'{}'::jsonb)||jsonb_build_object('source_reference',v_way),
      v_fingerprint,
      'REVIEW_PENDING',
      (v_row->>'financial_settled_at')::timestamptz,
      jsonb_build_object(
        'adapter','be_accounting_sync_merchant_settlements_v1',
        'settlement_direction',v_row->>'settlement_direction',
        'financial_settlement_batch_id',v_row->>'financial_settlement_batch_id'
      )
    );

    if not coalesce((v_upsert->>'ok')::boolean,false) then
      raise exception 'MERCHANT_SETTLEMENT_UPSERT_FAILED: %',v_upsert;
    end if;

    if coalesce(v_upsert->>'code','')='SOURCE_CHANGED_AFTER_POSTING' then
      v_skipped := v_skipped+1;
      continue;
    end if;

    v_event_id := (v_upsert->>'event_id')::uuid;
    delete from public.be_accounting_event_lines where event_id=v_event_id;

    if v_event_type='MERCHANT_PAYABLE_SETTLED' then
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
      ) values
        (
          v_event_id,v_payable_account,10,v_amount,0,
          nullif(v_row->>'merchant_id',''),
          'Clear Merchant COD Payable - '||v_way,
          jsonb_build_object('source_reference',v_way)
        ),
        (
          v_event_id,v_bank,20,0,v_amount,
          nullif(v_row->>'merchant_id',''),
          'Merchant settlement payment - '||v_way,
          jsonb_build_object('source_reference',v_way)
        );
    else
      insert into public.be_accounting_event_lines(
        event_id,account_id,sequence_no,debit_amount,credit_amount,merchant_id,description,metadata
      ) values
        (
          v_event_id,v_bank,10,v_amount,0,
          nullif(v_row->>'merchant_id',''),
          'Merchant receivable collection - '||v_way,
          jsonb_build_object('source_reference',v_way)
        ),
        (
          v_event_id,v_ar_account,20,0,v_amount,
          nullif(v_row->>'merchant_id',''),
          'Clear Merchant Accounts Receivable - '||v_way,
          jsonb_build_object('source_reference',v_way)
        );
    end if;

    v_synced := v_synced+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'code','MERCHANT_SETTLEMENT_SYNC_COMPLETE',
    'scanned',v_scanned,
    'synced',v_synced,
    'skipped',v_skipped,
    'needs_review',v_needs_review
  );
end;
$function$;

-- Serialize new/changed holds and disputes with payment validation.
create or replace function private.be_lock_merchant_payment_control_v200()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_old uuid; v_new uuid; v_old_batch uuid; v_new_batch uuid;
begin
 if TG_OP<>'INSERT' then v_old:=OLD.parcel_id; v_old_batch:=(to_jsonb(OLD)->>'batch_id')::uuid; end if;
 if TG_OP<>'DELETE' then v_new:=NEW.parcel_id; v_new_batch:=(to_jsonb(NEW)->>'batch_id')::uuid; end if;
 perform 1 from public.be_finance_settlement_batches_v3 b
   where b.id in(v_old_batch,v_new_batch) or b.id in(select i.batch_id from public.be_finance_settlement_batch_items_v3 i
     where i.active and i.parcel_id in(v_old,v_new)) order by b.id for update;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $fn$;
revoke all on function private.be_lock_merchant_payment_control_v200() from public,anon,authenticated;
drop trigger if exists merchant_payment_control_v200 on public.be_finance_settlement_parcel_control_v3;
create trigger merchant_payment_control_v200 before insert or update or delete
on public.be_finance_settlement_parcel_control_v3 for each row execute function private.be_lock_merchant_payment_control_v200();
drop trigger if exists merchant_payment_dispute_v200 on public.be_finance_settlement_disputes_v3;
create trigger merchant_payment_dispute_v200 before insert or update or delete
on public.be_finance_settlement_disputes_v3 for each row execute function private.be_lock_merchant_payment_control_v200();


-- Prevent COD/CS synchronization recursion and duplicate merchant obligations.
CREATE OR REPLACE FUNCTION public.be_sync_finance_cod_settled_downstream_v192()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_way text := upper(btrim(coalesce(new.delivery_way_id,'')));
  v_merchant text;
  v_merchant_name text;
  v_amount numeric := 0;
  v_provider text;
  v_wallet_id uuid;
  v_result jsonb;
begin
  if upper(coalesce(new.settlement_status,'')) <> 'SETTLED' then
    return new;
  end if;

  -- Reconciliation updates unchanged settled rows; do not recursively re-run downstream sync.
  if TG_OP='UPDATE' and OLD.settlement_status is not distinct from NEW.settlement_status
    and OLD.settled_amount is not distinct from NEW.settled_amount
    and OLD.expected_cod is not distinct from NEW.expected_cod
    and OLD.reported_collected is not distinct from NEW.reported_collected
    and OLD.settlement_reference is not distinct from NEW.settlement_reference
    and OLD.settled_at is not distinct from NEW.settled_at then return NEW; end if;
  -- Keep live Data Entry record aligned with authoritative Finance V48 settlement.
  update public.be_data_entry_parcel_details d
  set finance_status='COD_SETTLED',updated_at=now()
  where upper(d.delivery_way_id)=v_way and upper(d.parcel_status) in ('DELIVERED','COMPLETED')
    and d.finance_status is distinct from 'COD_SETTLED';

  -- Refresh wallet account masters/provider positions first.
  v_result := public.be_refresh_party_wallets_v1();

  select
    d.merchant_id,
    coalesce(p.merchant_name,d.merchant_id),
    coalesce(d.merchant_final_settlement_amount,0)::numeric,
    nullif(d.financial_quote->>'service_provider_code','')
  into
    v_merchant,v_merchant_name,v_amount,v_provider
  from public.be_data_entry_parcel_details d
  left join public.be_portal_pickup_requests p on p.pickup_id=d.pickup_id
  where upper(d.delivery_way_id)=v_way
  order by d.updated_at desc nulls last,d.saved_at desc nulls last
  limit 1;

  -- The canonical queue/batch ledger owns merchant balances; retire the duplicate legacy entry.
  update public.be_party_wallet_ledger set amount=0,status='VOID',updated_at=now()
  where source_type='MERCHANT_SETTLEMENT_LIVE' and upper(source_key)=v_way;

  -- Provider payable also becomes ready for payout, never auto-paid.
  update public.be_party_wallet_ledger l
  set status='READY_FOR_PAYOUT',
      metadata=coalesce(l.metadata,'{}'::jsonb)||jsonb_build_object(
        'cod_finance_settled',true,
        'cod_settlement_reference',new.settlement_reference,
        'cod_settled_at',new.settled_at,
        'policy_version','FINANCE_DOWNSTREAM_V192'
      ),
      updated_at=now()
  where l.source_type='SERVICE_PROVIDER_PAYABLE'
    and upper(l.source_key)=v_way;

  -- Keep reporting/notifications/CS synchronized after Finance confirmation.
  perform public.be_accounting_sync_cod_v1(
    coalesce(new.settled_at,new.updated_at,now())::date,
    coalesce(new.settled_at,new.updated_at,now())::date
  );
  perform public.be_cs_closure_sync_v49(new.wayplan_id);
  perform public.be_refresh_party_wallets_v1();

  -- Re-assert READY_FOR_PAYOUT after generic wallet refresh, which currently
  -- rebuilds provider rows as PENDING.
  update public.be_party_wallet_ledger l
  set status='READY_FOR_PAYOUT',
      updated_at=now()
  where (
      (l.source_type='SERVICE_PROVIDER_PAYABLE' and upper(l.source_key)=v_way)

    );

  update public.be_app_notifications
  set status='RESOLVED',
      is_read=true,
      read_at=coalesce(read_at,now()),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'finance_cod_settled',true,
        'finance_cod_settlement_reference',new.settlement_reference,
        'resolved_at',now()
      )
  where upper(coalesce(metadata->>'delivery_way_id',entity_id,source_key,''))=v_way
    and upper(coalesce(notification_type,event_type,'')) in ('COD_HANDOVER','COD_SETTLEMENT_REQUIRED');

  return new;
exception
  when others then
    update public.be_finance_cod_settlements_v48
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'downstream_sync_ok',false,
      'downstream_sync_error',sqlerrm,
      'downstream_sync_failed_at',now(),
      'downstream_sync_build','FINANCE_DOWNSTREAM_V192'
    )
    where delivery_way_id=new.delivery_way_id;
    return new;
end;
$function$
;

