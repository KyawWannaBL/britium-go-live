-- BRITIUM HOSTED UAT only: original pre-dispatch COD policy and finance-sync trigger chain.
-- Source structure, original COD logic; no finance settlements or customer dataset copied.
-- Table protected with RLS and no client DML. Financial mutation remains MUTATION_SHADOW.
BEGIN;
SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN
IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Wrong hosted UAT'; END IF;
IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_waybill_ledger)<>0 OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'UAT financial baseline changed'; END IF;
IF to_regclass('public.be_finance_predispatch_reviews_v1') IS NOT NULL THEN RAISE EXCEPTION 'Finance review table exists'; END IF;
IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('be_finance_cod_policy_v2','be_finance_predispatch_sync_from_parcel_v1','be_parcel_cod_service_fee_sync_v1')) THEN RAISE EXCEPTION 'COD function exists'; END IF;
IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='be_finance_predispatch_sync_from_parcel_v1') THEN RAISE EXCEPTION 'Finance trigger exists: be_finance_predispatch_sync_from_parcel_v1'; END IF;
IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.be_data_entry_parcel_details'::regclass AND tgname='trg_be_parcel_cod_service_fee_sync_v1') THEN RAISE EXCEPTION 'Finance trigger exists: trg_be_parcel_cod_service_fee_sync_v1'; END IF;
END $guard$;
CREATE TABLE public.be_finance_predispatch_reviews_v1 (
  "delivery_way_id" text NOT NULL,
  "pickup_id" text NOT NULL,
  "parcel_sequence" integer,
  "merchant_code" text,
  "merchant_name" text,
  "payment_type" text NOT NULL,
  "declared_item_value" numeric DEFAULT 0 NOT NULL,
  "delivery_region" text,
  "cod_requested" boolean DEFAULT false NOT NULL,
  "cod_policy_status" text NOT NULL,
  "cod_service_fee_rate" numeric DEFAULT 0 NOT NULL,
  "cod_service_fee_amount" numeric DEFAULT 0 NOT NULL,
  "finance_status" text NOT NULL,
  "finance_required" boolean DEFAULT false NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "be_finance_predispatch_reviews_v1_pkey" PRIMARY KEY (delivery_way_id)
);
ALTER TABLE public.be_finance_predispatch_reviews_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_finance_predispatch_reviews_v1 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_finance_cod_policy_v2(p_payment_type text, p_cod_amount numeric, p_parcel_count integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_raw text := btrim(coalesce(p_payment_type,''));
  v_type text := upper(replace(replace(v_raw,' ','_'),'-','_'));
  v_amount numeric := greatest(coalesce(p_cod_amount,0),0);
  v_parcels integer := greatest(coalesce(p_parcel_count,1),1);
  v_rate numeric := 0;
  v_fee numeric := 0;
  v_status text;
  v_applies boolean;
  v_advance boolean;
begin
  if v_type='KBZPAY' then v_type:='KBZ_PAY'; end if;
  if v_type='BANK' then v_type:='BANK_TRANSFER'; end if;
  if v_type in ('','POD','PAY_ON_DELIVERY') then v_type:='COD'; end if;

  v_applies := v_type in ('COD','CASH_ADVANCE_ON','CASH_ADVANCE_OFF','CASH_ADVANCE','PAY_ON_DELIVERY');
  v_advance := v_type in ('CASH_ADVANCE_ON','CASH_ADVANCE');

  if not v_applies then
    return jsonb_build_object(
      'payment_type',coalesce(nullif(v_raw,''),v_type),
      'normalized_payment_type',v_type,
      'cod_requested',false,'eligible',true,
      'cod_policy_status','NOT_APPLICABLE',
      'finance_status','NOT_REQUIRED','finance_required',false,
      'cod_amount',v_amount,'parcel_count',v_parcels,
      'fee_rate',0,'fee_amount',0,
      'settlement_mode','NOT_APPLICABLE',
      'policy_version','COD_TNC_ADVANCE_2026_10_15'
    );
  end if;

  -- Approved T&C: for declared COD above MMK 200,000, only Advance
  -- Settlement has a 2% processing fee. Standard remittance is separate.
  if v_advance and v_amount > 200000 then
    v_status := 'ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000';
    v_rate := 0.02;
    v_fee := round(v_amount * v_rate,0);
  elsif v_amount <= 100000 then
    v_status := 'COD_FEE_FREE_0_TO_100000';
  elsif v_amount <= 300000 then
    v_status := 'COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000';
    v_fee := 200 * v_parcels;
  else
    -- Existing ordinary COD service fees are unchanged pending separate T&C
    -- approval; do not misapply the Advance Settlement processing fee.
    v_status := 'COD_FEE_0_2_PERCENT_ABOVE_300000';
    v_rate := 0.002;
    v_fee := round(v_amount * v_rate,0);
  end if;

  return jsonb_build_object(
    'payment_type',coalesce(nullif(v_raw,''),v_type),
    'normalized_payment_type',v_type,
    'cod_requested',true,'eligible',true,
    'cod_policy_status',v_status,
    'finance_status','AUTO_APPROVED','finance_required',false,
    'cod_amount',v_amount,'parcel_count',v_parcels,
    'fee_rate',v_rate,'fee_amount',v_fee,
    'settlement_mode',case when v_advance then 'ADVANCE' else 'STANDARD' end,
    'policy_version','COD_TNC_ADVANCE_2026_10_15'
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_finance_cod_policy_v2(text,numeric,integer) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.be_finance_predispatch_sync_from_parcel_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_pickup public.be_portal_pickup_requests%rowtype;
  v_type text;
  v_cod numeric;
  v_policy jsonb;
  v_status text;
begin
  if new.delivery_way_id is null or btrim(new.delivery_way_id)='' then
    return new;
  end if;

  select * into v_pickup
  from public.be_portal_pickup_requests
  where pickup_id=new.pickup_id
  limit 1;

  v_type:=coalesce(
    nullif(btrim(v_pickup.payment_type),''),
    nullif(btrim(v_pickup.payment_method),''),
    nullif(btrim(v_pickup.payment_terms),''),
    'COD'
  );

  v_cod:=greatest(coalesce(new.actual_collect,0),coalesce(new.cod_amount,0),0);
  v_policy:=public.be_finance_cod_policy_v2(v_type,v_cod,1);
  v_status:=coalesce(v_policy->>'finance_status','NOT_REQUIRED');

  insert into public.be_finance_predispatch_reviews_v1(
    delivery_way_id,pickup_id,parcel_sequence,merchant_code,merchant_name,payment_type,
    declared_item_value,delivery_region,cod_requested,cod_policy_status,cod_service_fee_rate,
    cod_service_fee_amount,finance_status,finance_required,source_snapshot,created_at,updated_at
  ) values (
    new.delivery_way_id,new.pickup_id,new.parcel_sequence,
    coalesce(new.merchant_id,v_pickup.merchant_code),v_pickup.merchant_name,v_type,
    v_cod,new.delivery_region,coalesce((v_policy->>'cod_requested')::boolean,false),
    coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED'),
    coalesce((v_policy->>'fee_rate')::numeric,0),
    coalesce((v_policy->>'fee_amount')::numeric,0),
    v_status,coalesce((v_policy->>'finance_required')::boolean,false),
    jsonb_build_object(
      'policy_version',v_policy->>'policy_version',
      'financial_validation_status',new.financial_validation_status,
      'cod_amount',new.cod_amount,
      'actual_collect',new.actual_collect,
      'delivery_fee',new.delivery_fee,
      'item_price',new.item_price,
      'merchant_stated_total_amount',new.merchant_stated_total_amount,
      'township',new.township,
      'delivery_region',new.delivery_region,
      'financial_quote',coalesce(new.financial_quote,'{}'::jsonb)
    ),now(),now()
  )
  on conflict (delivery_way_id) do update
  set pickup_id=excluded.pickup_id,
      parcel_sequence=excluded.parcel_sequence,
      merchant_code=excluded.merchant_code,
      merchant_name=excluded.merchant_name,
      payment_type=excluded.payment_type,
      declared_item_value=excluded.declared_item_value,
      delivery_region=excluded.delivery_region,
      cod_requested=excluded.cod_requested,
      cod_policy_status=excluded.cod_policy_status,
      cod_service_fee_rate=excluded.cod_service_fee_rate,
      cod_service_fee_amount=excluded.cod_service_fee_amount,
      finance_required=excluded.finance_required,
      source_snapshot=excluded.source_snapshot,
      finance_status=case
        when public.be_finance_predispatch_reviews_v1.finance_status in ('APPROVED','REJECTED','HELD')
             and public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.finance_status
        else excluded.finance_status
      end,
      reviewed_by=case
        when public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.reviewed_by else null end,
      reviewed_at=case
        when public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.reviewed_at else null end,
      review_note=case
        when public.be_finance_predispatch_reviews_v1.cod_policy_status=excluded.cod_policy_status
             and public.be_finance_predispatch_reviews_v1.declared_item_value=excluded.declared_item_value
          then public.be_finance_predispatch_reviews_v1.review_note else null end,
      updated_at=now();

  update public.be_portal_pickup_requests p
  set finance_pre_dispatch_status=case
      when exists(
        select 1 from public.be_finance_predispatch_reviews_v1 r
        where r.pickup_id=p.pickup_id
          and r.finance_status in ('PENDING_FINANCE','PENDING_VALUE','PENDING_DATA_ENTRY','HELD','REJECTED','NOT_ELIGIBLE')
      ) then 'REVIEW_REQUIRED'
      else 'CLEARED'
    end,
    cod_service_fee_amount=coalesce((
      select sum(r.cod_service_fee_amount)
      from public.be_finance_predispatch_reviews_v1 r
      where r.pickup_id=p.pickup_id
    ),0),
    cod_service_fee_rate=coalesce((
      select max(coalesce(r.cod_service_fee_rate,0))
      from public.be_finance_predispatch_reviews_v1 r
      where r.pickup_id=p.pickup_id
    ),0),
    cod_policy_status=coalesce((
      select case
        when bool_or(r.cod_policy_status='ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000')
          then 'ADVANCE_SETTLEMENT_2_PERCENT_ABOVE_200000'
        when bool_or(r.cod_policy_status='COD_FEE_0_2_PERCENT_ABOVE_300000')
          then 'COD_FEE_0_2_PERCENT_ABOVE_300000'
        when bool_or(r.cod_policy_status='COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000')
          then 'COD_FEE_FLAT_200_PER_PARCEL_100001_TO_300000'
        when bool_or(r.cod_requested)
          then 'COD_FEE_FREE_0_TO_100000'
        else 'NOT_APPLICABLE'
      end
      from public.be_finance_predispatch_reviews_v1 r
      where r.pickup_id=p.pickup_id
    ),p.cod_policy_status),
    updated_at=now()
  where p.pickup_id=new.pickup_id;

  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_finance_predispatch_sync_from_parcel_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER be_finance_predispatch_sync_from_parcel_v1 AFTER INSERT OR UPDATE OF item_price, merchant_stated_total_amount, cod_amount, delivery_fee, delivery_region, township, financial_validation_status, financial_quote ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION be_finance_predispatch_sync_from_parcel_v1();
CREATE FUNCTION public.be_parcel_cod_service_fee_sync_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cod numeric := greatest(coalesce(new.actual_collect,0),coalesce(new.cod_amount,0),0);
  v_policy jsonb;
  v_payment_type text;
begin
  -- A parcel inherits the approved payment arrangement from its pickup.
  select coalesce(
    nullif(btrim(p.payment_type),''),
    nullif(btrim(p.payment_method),''),
    nullif(btrim(p.payment_terms),''),
    'COD'
  ) into v_payment_type
  from public.be_portal_pickup_requests p
  where p.pickup_id = new.pickup_id
  limit 1;

  v_policy := public.be_finance_cod_policy_v2(coalesce(v_payment_type,'COD'),v_cod,1);
  new.cod_service_fee_rate := coalesce((v_policy->>'fee_rate')::numeric,0);
  new.cod_service_fee_amount := coalesce((v_policy->>'fee_amount')::numeric,0);
  new.cod_fee_policy_status := coalesce(v_policy->>'cod_policy_status','NOT_EVALUATED');
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION public.be_parcel_cod_service_fee_sync_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_be_parcel_cod_service_fee_sync_v1 BEFORE INSERT OR UPDATE OF actual_collect, cod_amount ON be_data_entry_parcel_details FOR EACH ROW EXECUTE FUNCTION be_parcel_cod_service_fee_sync_v1();
NOTIFY pgrst,'reload schema';
COMMIT;
