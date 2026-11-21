-- UAT FINANCIAL CALCULATION rehearsal/stage, not permission to dispatch, save, publish or settle.
-- Real production function source; synthetic merchant & limited tariff configuration, zero customer data.
-- public.parcels canonical 94 cols staged without five unavailable foreign keys; triggers remain deferred.
BEGIN;
SET LOCAL statement_timeout='65s';
DO $gate$ BEGIN
 IF to_regclass('private.uat_branch_account_roster_20261116') IS NULL OR (SELECT count(*) FROM auth.users)<>18 OR (SELECT count(*) FROM public.be_user_account_registry)<>18 OR (SELECT count(*) FROM private.uat_branch_account_roster_20261116)<>16 THEN RAISE EXCEPTION 'Not hosted branch UAT'; END IF;
 IF (SELECT mutation_mode FROM public.be_data_entry_financial_v2_runtime_v58 WHERE singleton)<>'MUTATION_SHADOW' OR (SELECT count(*) FROM public.be_portal_pickup_requests)<>2 OR (SELECT count(*) FROM public.be_data_entry_parcel_details)<>4 THEN RAISE EXCEPTION 'UAT fixtures changed'; END IF;
 IF to_regclass('public.be_merchant_master') IS NOT NULL THEN RAISE EXCEPTION 'Table exists be_merchant_master'; END IF;
 IF to_regclass('public.be_merchant_financial_profiles_v2') IS NOT NULL THEN RAISE EXCEPTION 'Table exists be_merchant_financial_profiles_v2'; END IF;
 IF to_regclass('public.be_parcel_tariffs_v2') IS NOT NULL THEN RAISE EXCEPTION 'Table exists be_parcel_tariffs_v2'; END IF;
 IF to_regclass('public.be_tariff_location_alias_v61_7_1') IS NOT NULL THEN RAISE EXCEPTION 'Table exists be_tariff_location_alias_v61_7_1'; END IF;
 IF to_regclass('public.be_township_identity_v61_7') IS NOT NULL THEN RAISE EXCEPTION 'Table exists be_township_identity_v61_7'; END IF;
 IF to_regclass('public.parcels') IS NOT NULL THEN RAISE EXCEPTION 'Table exists parcels'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_calculate') THEN RAISE EXCEPTION 'Function exists be_data_entry_financial_v2_calculate'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_calculate_v21_legacy') THEN RAISE EXCEPTION 'Function exists be_data_entry_financial_v2_calculate_v21_legacy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_royal_commission_v27') THEN RAISE EXCEPTION 'Function exists be_data_entry_royal_commission_v27'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_normalize_prepaid_input') THEN RAISE EXCEPTION 'Function exists be_normalize_prepaid_input'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_reconcile_declared_delivery_v21') THEN RAISE EXCEPTION 'Function exists be_reconcile_declared_delivery_v21'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_resolve_bulk_merchant_name') THEN RAISE EXCEPTION 'Function exists be_resolve_bulk_merchant_name'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_destination_key_v17') THEN RAISE EXCEPTION 'Function exists be_data_entry_destination_key_v17'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_calculate_v19_legacy') THEN RAISE EXCEPTION 'Function exists be_data_entry_financial_v2_calculate_v19_legacy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_delivery_route_v26') THEN RAISE EXCEPTION 'Function exists be_data_entry_delivery_route_v26'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_calculate_v13_2_legacy') THEN RAISE EXCEPTION 'Function exists be_data_entry_financial_v2_calculate_v13_2_legacy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_handoff_station_v19') THEN RAISE EXCEPTION 'Function exists be_data_entry_handoff_station_v19'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_manual_handoff_charge') THEN RAISE EXCEPTION 'Function exists be_manual_handoff_charge'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_calculate_parcel_financial_v2') THEN RAISE EXCEPTION 'Function exists be_calculate_parcel_financial_v2'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_financial_v2_calculate_v61_3_3_legacy') THEN RAISE EXCEPTION 'Function exists be_data_entry_financial_v2_calculate_v61_3_3_legacy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_handoff_charge_v26') THEN RAISE EXCEPTION 'Function exists be_data_entry_handoff_charge_v26'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_data_entry_service_provider_route_v17') THEN RAISE EXCEPTION 'Function exists be_data_entry_service_provider_route_v17'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_business_date') THEN RAISE EXCEPTION 'Function exists be_business_date'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_calculate_parcel_financial_v2_v61_9_0_legacy') THEN RAISE EXCEPTION 'Function exists be_calculate_parcel_financial_v2_v61_9_0_legacy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_calculate_parcel_financial_v2_v61_8_2_legacy') THEN RAISE EXCEPTION 'Function exists be_calculate_parcel_financial_v2_v61_8_2_legacy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_approved_tariff_lookup_key') THEN RAISE EXCEPTION 'Function exists be_approved_tariff_lookup_key'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_image_tariff_weight_surcharge_v1') THEN RAISE EXCEPTION 'Function exists be_image_tariff_weight_surcharge_v1'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_financial_v2_township_key_v61_4_1') THEN RAISE EXCEPTION 'Function exists be_financial_v2_township_key_v61_4_1'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_financial_v2_tariff_location_key_v61_7_1') THEN RAISE EXCEPTION 'Function exists be_financial_v2_tariff_location_key_v61_7_1'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_financial_v2_normalize_township_text_v61_7') THEN RAISE EXCEPTION 'Function exists be_financial_v2_normalize_township_text_v61_7'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='be_financial_v2_township_code_v61_7') THEN RAISE EXCEPTION 'Function exists be_financial_v2_township_code_v61_7'; END IF;
END $gate$;
CREATE FUNCTION public.be_business_date()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (statement_timestamp() at time zone 'Asia/Yangon')::date
$function$
;
REVOKE ALL ON FUNCTION public.be_business_date() FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_merchant_master" (
 "merchant_code" character varying(20) NOT NULL,
 "merchant_name" character varying(255) NOT NULL,
 "contact_phone" character varying(50),
 "pickup_township" character varying(100),
 "pickup_address" text,
 "created_at" timestamp with time zone DEFAULT now(),
 CONSTRAINT "be_merchant_master_pkey" PRIMARY KEY (merchant_code)
);
ALTER TABLE public."be_merchant_master" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."be_merchant_master" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_merchant_financial_profiles_v2" (
 "merchant_id" text NOT NULL,
 "customer_tier" text NOT NULL,
 "is_active" boolean DEFAULT true NOT NULL,
 "effective_from" date DEFAULT be_business_date() NOT NULL,
 "effective_to" date,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_by" uuid,
 "merchant_name" text,
 "counterparty_type" text DEFAULT 'MERCHANT'::text NOT NULL,
 "settlement_method" text,
 "settlement_account" text,
 "settlement_notes" text,
 CONSTRAINT "be_merchant_financial_profiles_v2_pkey" PRIMARY KEY (merchant_id),
 CONSTRAINT "be_merchant_financial_profiles_v2_tier_check" CHECK (customer_tier = ANY (ARRAY['STANDARD'::text, 'ROYAL'::text, 'COMMITMENT'::text]))
);
ALTER TABLE public."be_merchant_financial_profiles_v2" ADD CONSTRAINT "be_merchant_financial_profiles_v2_counterparty_check" CHECK (counterparty_type = ANY (ARRAY['MERCHANT'::text, 'ONLINE_SELLER'::text, 'CUSTOMER_ACCOUNT'::text])) NOT VALID;
ALTER TABLE public."be_merchant_financial_profiles_v2" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."be_merchant_financial_profiles_v2" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_parcel_tariffs_v2" (
 "id" bigint GENERATED BY DEFAULT AS IDENTITY NOT NULL,
 "township" text NOT NULL,
 "customer_tier" text NOT NULL,
 "tariff_zone" text NOT NULL,
 "tariff_zone_code" text NOT NULL,
 "base_tariff" bigint NOT NULL,
 "included_kg" numeric(10,3) NOT NULL,
 "extra_per_kg" bigint NOT NULL,
 "commitment_min_ways" integer DEFAULT 0 NOT NULL,
 "commitment_refund_per_way" bigint DEFAULT 0 NOT NULL,
 "note" text,
 "status" text DEFAULT 'ACTIVE'::text NOT NULL,
 "effective_from" date DEFAULT be_business_date() NOT NULL,
 "effective_to" date,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "be_parcel_tariffs_v2_amount_check" CHECK (base_tariff > 0 AND included_kg >= 0::numeric AND extra_per_kg >= 0 AND commitment_min_ways >= 0 AND commitment_refund_per_way >= 0),
 CONSTRAINT "be_parcel_tariffs_v2_pkey" PRIMARY KEY (id),
 CONSTRAINT "be_parcel_tariffs_v2_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])),
 CONSTRAINT "be_parcel_tariffs_v2_tier_check" CHECK (customer_tier = ANY (ARRAY['STANDARD'::text, 'ROYAL'::text, 'COMMITMENT'::text])),
 CONSTRAINT "be_parcel_tariffs_v2_version_unique" UNIQUE (township, customer_tier, effective_from)
);
ALTER TABLE public."be_parcel_tariffs_v2" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."be_parcel_tariffs_v2" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_tariff_location_alias_v61_7_1" (
 "normalized_alias" text NOT NULL,
 "alias_value" text NOT NULL,
 "location_key" text NOT NULL,
 "township_code" text,
 "location_kind" text NOT NULL,
 "canonical_label" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "be_tariff_location_alias_v61_7_1_location_kind_check" CHECK (location_kind = ANY (ARRAY['TOWNSHIP'::text, 'CITY_AGGREGATE'::text, 'HIGHWAY_STATION'::text, 'SERVICE_POINT'::text])),
 CONSTRAINT "be_tariff_location_alias_v61_7_1_pkey" PRIMARY KEY (normalized_alias)
);
ALTER TABLE public."be_tariff_location_alias_v61_7_1" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."be_tariff_location_alias_v61_7_1" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."be_township_identity_v61_7" (
 "township_code" text NOT NULL,
 "township_name_en" text NOT NULL,
 "township_name_mm" text NOT NULL,
 "city" text,
 "state_region_name_en" text,
 "state_region_name_mm" text,
 "normalized_en" text DEFAULT ''::text NOT NULL,
 "normalized_mm" text DEFAULT ''::text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "be_township_identity_v61_7_pkey" PRIMARY KEY (township_code)
);
ALTER TABLE public."be_township_identity_v61_7" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."be_township_identity_v61_7" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."parcels" (
 "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
 "tracking_code" text NOT NULL,
 "pickup_request_id" uuid,
 "enterprise_id" uuid,
 "sender_name" text NOT NULL,
 "sender_phone" text,
 "sender_address" text,
 "recipient_name" text NOT NULL,
 "recipient_phone" text NOT NULL,
 "recipient_address" text NOT NULL,
 "recipient_township" text,
 "zone_id" uuid,
 "weight_kg" numeric(8,2) DEFAULT 0,
 "length_cm" numeric(6,2),
 "width_cm" numeric(6,2),
 "height_cm" numeric(6,2),
 "parcel_type" text DEFAULT 'standard'::text,
 "cod_amount" integer DEFAULT 0,
 "declared_value" integer DEFAULT 0,
 "base_price" integer DEFAULT 0,
 "overweight_fee" integer DEFAULT 0,
 "total_price" integer DEFAULT 0,
 "status" text DEFAULT 'registered'::text,
 "assigned_rider_id" uuid,
 "branch_id" uuid,
 "delivery_photo_url" text,
 "delivery_signature_url" text,
 "actual_weight_kg" numeric(8,2),
 "notes" text,
 "created_at" timestamp with time zone DEFAULT now(),
 "updated_at" timestamp with time zone DEFAULT now(),
 "delivered_at" timestamp with time zone,
 "verification_status" text DEFAULT 'PENDING'::text,
 "verification_note" text,
 "verification_rejected_reason" text,
 "verification_rejected_by" text,
 "verification_rejected_at" timestamp with time zone,
 "way_id" text,
 "customer_id" text,
 "merchant_id" text,
 "township" text,
 "delivery_address" text,
 "item_price" numeric(14,2) DEFAULT 0,
 "delivery_charges" numeric(14,2) DEFAULT 0,
 "environment" text DEFAULT 'uat'::text,
 "parcel_sequence" integer,
 "os" text,
 "extra_weight_charge" numeric(14,2) DEFAULT 0 NOT NULL,
 "collect_amount" numeric(14,2) DEFAULT 0 NOT NULL,
 "destination" text,
 "remarks" text,
 "customer_tier" text,
 "monthly_ways" integer,
 "amount_entry_type" text,
 "merchant_stated_total_amount" bigint,
 "additional_customer_charge" bigint DEFAULT 0 NOT NULL,
 "cbm_surcharge" bigint DEFAULT 0 NOT NULL,
 "other_surcharge" bigint DEFAULT 0 NOT NULL,
 "merchant_payable_charges" bigint DEFAULT 0 NOT NULL,
 "other_merchant_credits" bigint DEFAULT 0 NOT NULL,
 "entered_by" uuid,
 "authorized_by" uuid,
 "tariff_zone" text,
 "tariff_zone_code" text,
 "base_tariff" bigint,
 "included_kg" numeric(10,3),
 "extra_per_kg" bigint,
 "commitment_min_ways" integer,
 "commitment_refund_per_way" bigint,
 "chargeable_weight_kg" numeric(10,3),
 "extra_kg" numeric(10,3),
 "weight_surcharge" bigint,
 "gross_system_delivery_charge" bigint,
 "commitment_refund" bigint,
 "net_system_delivery_charge" bigint,
 "effective_declared_delivery_charge" bigint,
 "delivery_difference" bigint,
 "settlement_direction" text,
 "merchant_settlement_adjustment" bigint,
 "merchant_final_settlement_amount" bigint,
 "validation_status" text,
 "validation_message" text,
 "calculation_version" text DEFAULT 'PARCEL_FINANCIAL_V2'::text NOT NULL,
 "calculated_at" timestamp with time zone,
 "financial_locked_at" timestamp with time zone,
 "financial_locked_by" uuid,
 "financial_lock_reason" text,
 "financial_settlement_batch_id" uuid,
 "financial_settled_at" timestamp with time zone,
 "financial_settled_by" uuid,
 "batch_id" character varying(50),
 "merchant_code" character varying(50),
 "wayplan_id" character varying(50),
 "delivery_zone" character varying(100),
 CONSTRAINT "parcels_parcel_type_check" CHECK (parcel_type = ANY (ARRAY['standard'::text, 'fragile'::text, 'document'::text, 'perishable'::text, 'oversized'::text])),
 CONSTRAINT "parcels_pkey" PRIMARY KEY (id),
 CONSTRAINT "parcels_status_check" CHECK (status = ANY (ARRAY['registered'::text, 'picked_up'::text, 'in_transit'::text, 'at_branch'::text, 'out_for_delivery'::text, 'delivered'::text, 'failed'::text, 'returned'::text, 'cancelled'::text])),
 CONSTRAINT "parcels_tracking_code_key" UNIQUE (tracking_code)
);
ALTER TABLE public."parcels" ADD CONSTRAINT "parcels_amount_entry_type_check" CHECK (amount_entry_type IS NULL OR (amount_entry_type = ANY (ARRAY['ITEM_PRICE_PLUS_DECLARED_DELIVERY'::text, 'TOTAL_AMOUNT_INCLUDING_DELIVERY'::text, 'DELIVERY_CHARGE_ONLY'::text, 'EXACT_COLLECTION_AMOUNT'::text, 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT'::text, 'OPAQUE_COD_COLLECTION'::text]))) NOT VALID;
ALTER TABLE public."parcels" ADD CONSTRAINT "parcels_customer_tier_check" CHECK (customer_tier IS NULL OR (customer_tier = ANY (ARRAY['STANDARD'::text, 'ROYAL'::text, 'COMMITMENT'::text]))) NOT VALID;
ALTER TABLE public."parcels" ADD CONSTRAINT "parcels_non_negative_amounts_check" CHECK (COALESCE(item_price, 0::numeric) >= 0::numeric AND COALESCE(delivery_charges, 0::numeric) >= 0::numeric AND COALESCE(cod_amount, 0) >= 0 AND COALESCE(merchant_stated_total_amount, 0::bigint) >= 0 AND COALESCE(additional_customer_charge, 0::bigint) >= 0 AND COALESCE(cbm_surcharge, 0::bigint) >= 0 AND COALESCE(other_surcharge, 0::bigint) >= 0 AND COALESCE(merchant_payable_charges, 0::bigint) >= 0 AND COALESCE(other_merchant_credits, 0::bigint) >= 0) NOT VALID;
ALTER TABLE public."parcels" ADD CONSTRAINT "parcels_settlement_direction_check" CHECK (settlement_direction IS NULL OR (settlement_direction = ANY (ARRAY['CREDIT_TO_MERCHANT'::text, 'DEDUCT_FROM_MERCHANT'::text, 'NO_ADJUSTMENT'::text, 'BREAKDOWN_REQUIRED'::text]))) NOT VALID;
ALTER TABLE public."parcels" ADD CONSTRAINT "parcels_validation_status_check" CHECK (validation_status IS NULL OR (validation_status = ANY (ARRAY['OK'::text, 'REVIEW'::text, 'ERROR'::text]))) NOT VALID;
ALTER TABLE public."parcels" ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public."parcels" FROM PUBLIC, anon, authenticated;
INSERT INTO public.be_merchant_master(merchant_code,merchant_name) VALUES('UAT-QA','UAT Synthetic Test Merchant');
INSERT INTO public.be_merchant_financial_profiles_v2(merchant_id,customer_tier,is_active,effective_from,merchant_name,counterparty_type) VALUES ('UAT-QA','STANDARD',true,DATE '2026-01-01','UAT Synthetic Test Merchant','MERCHANT');
INSERT INTO public.be_township_identity_v61_7(township_code,township_name_en,township_name_mm,city,state_region_name_en,normalized_en,normalized_mm) VALUES ('MMR013001','Insein','အင်းစိန်','Yangon','Yangon','insein','အင်းစိန်'),('MMR010002','Chanayethazan','ချမ်းအေးသာစံ','Mandalay','Mandalay','chanayethazan','ချမ်းအေးသာစံ');
INSERT INTO public.be_parcel_tariffs_v2(id,township,customer_tier,tariff_zone,tariff_zone_code,base_tariff,included_kg,extra_per_kg,commitment_min_ways,commitment_refund_per_way,status,effective_from) VALUES
 (398,'အင်းစိန်','STANDARD','YANGON','YANGON',4000,3,500,0,0,'ACTIVE',DATE '2026-09-11'),(316,'မန္တလေး','STANDARD','BRANCH','BRANCH',6000,3,500,0,0,'ACTIVE',DATE '2026-09-11'),(127,'ချမ်းအေးသာစံမြို့နယ်','STANDARD','Mandalay','MDY',6000,3,500,0,0,'ACTIVE',DATE '2026-07-31'),(77,'အင်းစိန်','ROYAL','Yangon','YGN',4000,5,500,0,0,'ACTIVE',DATE '2026-07-31'),(146,'Mandalay','ROYAL','Mandalay','MDY',6000,5,500,0,0,'ACTIVE',DATE '2026-07-31');
CREATE FUNCTION public.be_normalize_prepaid_input(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb:=coalesce(p,'{}'); t text:=upper(coalesce(p->>'amount_entry_type','')); i text:=nullif(btrim(p->>'item_price'),''); d text:=nullif(btrim(p->>'delivery_charges'),'');
begin
 if t not in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY') then return v; end if;
 if i in ('-','—') then i:=null; end if; if d in ('-','—') then d:=null; end if;
 if (i is null or t='DELIVERY_CHARGE_ONLY') and d is null then
   return v||jsonb_build_object('amount_entry_type','EXACT_COLLECTION_AMOUNT','merchant_stated_total_amount',0,'item_price',null,'delivery_charges',null,'prepaid_to_merchant',true);
 elsif i is null or t='DELIVERY_CHARGE_ONLY' then
   return v||jsonb_build_object('amount_entry_type','DELIVERY_CHARGE_ONLY','item_price',null,'delivery_charges',d::bigint,'prepaid_item',true);
 elsif d is null then
   return v||jsonb_build_object('amount_entry_type','ITEM_PRICE_PLUS_DECLARED_DELIVERY','delivery_charges',0,'prepaid_delivery',true);
 end if; return v;
end $function$
;
REVOKE ALL ON FUNCTION public.be_normalize_prepaid_input(jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_resolve_bulk_merchant_name(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
with candidates as (
  select distinct upper(btrim(m.merchant_code)) as code
  from public.be_merchant_master m
  where nullif(btrim(m.merchant_code),'') is not null
    and (
      lower(btrim(m.merchant_name)) = lower(btrim(coalesce(p_name,'')))
      or upper(btrim(m.merchant_code)) = upper(btrim(coalesce(p_name,'')))
    )
),
resolved as (
  select count(distinct code) as code_count, max(code) as code
  from candidates
)
select case when code_count=1 then code else null end
from resolved;
$function$
;
REVOKE ALL ON FUNCTION public.be_resolve_bulk_merchant_name(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_destination_key_v17(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with normalized as (
    select regexp_replace(
      replace(replace(replace(replace(replace(replace(
        regexp_replace(lower(btrim(coalesce(p_value,''))),'(royal[[:space:]]*express|royal|dk[[:space:]]*delivery|npt[[:space:]]*branch|grs)','','g'),
        'မြို့နယ်',''),'မြို့',''),'တိုင်းဒေသကြီး',''),'ပြည်ထောင်စုနယ်မြေ',''),'township',''),'city',''),
      '[[:space:]()（）.,၊။/|·_-]+','','g') as destination_key
  )
  select case destination_key
    when 'northdagon' then 'မြောက်ဒဂုံ'
    when 'dagonmyothitnorth' then 'မြောက်ဒဂုံ'
    when 'ဒဂုံမြို့သစ်မြောက်ပိုင်း' then 'မြောက်ဒဂုံ'
    when 'ဒဂုံသစ်မြောက်ပိုင်း' then 'မြောက်ဒဂုံ'
    when 'southdagon' then 'တောင်ဒဂုံ'
    when 'dagonmyothitsouth' then 'တောင်ဒဂုံ'
    when 'ဒဂုံမြို့သစ်တောင်ပိုင်း' then 'တောင်ဒဂုံ'
    when 'ဒဂုံသစ်တောင်ပိုင်း' then 'တောင်ဒဂုံ'
    when 'eastdagon' then 'အရှေ့ဒဂုံ'
    when 'dagonmyothiteast' then 'အရှေ့ဒဂုံ'
    when 'ဒဂုံမြို့သစ်အရှေ့ပိုင်း' then 'အရှေ့ဒဂုံ'
    when 'ဒဂုံသစ်အရှေ့ပိုင်း' then 'အရှေ့ဒဂုံ'
    when 'dagonseikkan' then 'ဒဂုံဆိပ်ကမ်း'
    when 'dagonmyothitseikkan' then 'ဒဂုံဆိပ်ကမ်း'
    when 'ဒဂုံမြို့သစ်ဆိပ်ကမ်း' then 'ဒဂုံဆိပ်ကမ်း'
    when 'hlaingtharya' then 'လှိုင်သာယာ'
    when 'hlaingtharyar' then 'လှိုင်သာယာ'
    when 'hlaingthaya' then 'လှိုင်သာယာ'
    when 'hlaingthayar' then 'လှိုင်သာယာ'
    when 'hlaingtharyaeast' then 'လှိုင်သာယာ'
    when 'hlaingtharyawest' then 'လှိုင်သာယာ'
    when 'hlaingtharyareast' then 'လှိုင်သာယာ'
    when 'hlaingtharyarwest' then 'လှိုင်သာယာ'
    when 'hlaingthayaeast' then 'လှိုင်သာယာ'
    when 'hlaingthayawest' then 'လှိုင်သာယာ'
    when 'hlaingthayareast' then 'လှိုင်သာယာ'
    when 'hlaingthayarwest' then 'လှိုင်သာယာ'
    when 'kyimyindaing' then 'ကြည့်မြင်တိုင်'
    when 'kyeemyindaing' then 'ကြည့်မြင်တိုင်'
    when 'kyimyindine' then 'ကြည့်မြင်တိုင်'
    when 'kyeemyindine' then 'ကြည့်မြင်တိုင်'
    when 'mingalataungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'mingalartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    when 'minglartaungnyunt' then 'မင်္ဂလာတောင်ညွန့်'
    else destination_key
  end from normalized;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_destination_key_v17(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_service_provider_route_v17(p_township text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text := public.be_data_entry_destination_key_v17(p_township);
  v_provider_code text;
  v_reason text := 'UNRESOLVED';
  v_destination_name text;
begin

  -- MDY_EXPLICIT_AREA_RATE_V1
  select t.destination_name into v_destination_name
  from public.be_data_entry_tariff_catalog t
  join public.be_data_entry_service_providers p on p.provider_code=t.provider_code and p.is_active
  where t.is_active and t.provider_code='MDY BRANCH'
    and t.source_file='MDY_APPROVED_MANUAL_AREAS_6487f3c1'
    and (public.be_data_entry_destination_key_v17(t.destination_key)=v_key or public.be_data_entry_destination_key_v17(t.destination_name)=v_key)
  limit 1;
  if found then
    return jsonb_build_object('provider_code','MDY BRANCH','reason','MANDALAY_BRANCH_SERVICE_AREA','destination_key',v_key,'matched_destination',v_destination_name,'selection_mode','EXPLICIT_AREA_RATE');
  end if;
  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,
      'reason',v_reason,
      'destination_key',v_key,
      'matched_destination',null
    );
  end if;

  if v_key = any(array['tatkon','တပ်ကုန်း','lewe','leway','လယ်ဝေး']::text[]) then
    v_provider_code := 'ROYAL EXPRESS';
    v_reason := 'NAYPYITAW_EXCEPTION_ROYAL';
  elsif v_key = any(array[
    'mandalay','မန္တလေး',
    'aungmyaythazan','aungmyaytharzan','အောင်မြေသာစံ',
    'chanayethazan','chanayetharzan','ချမ်းအေးသာစံ',
    'mahaaungmyay','မဟာအောင်မြေ',
    'chanmyathazi','chanmyatharsi','ချမ်းမြသာစည်',
    'pyigyitagon','ပြည်ကြီးတံခွန်',
    'amarapura','အမရပူရ',
    'patheingyi','ပုသိမ်ကြီး'
  ]::text[]) then
    v_provider_code := 'MDY BRANCH';
    v_reason := 'MANDALAY_BRANCH_SERVICE_AREA';
  elsif v_key = any(array[
    'naypyitaw','naypyidaw','နေပြည်တော်',
    'zabuthiri','ဇမ္ဗူသီရိ',
    'pyinmana','ပျဉ်းမနား',
    'zayyarthiri','zeyathiri','ဇေယျာသီရိ',
    'detkhinathiri','dekkhinathiri','ဒက္ခိဏသီရိ',
    'pokebathiri','pobbathiri','ပုဗ္ဗသီရိ',
    'oketarathiri','ottarathiri','ဥတ္တရသီရိ'
  ]::text[]) then
    v_provider_code := 'NPT BRANCH';
    v_reason := 'NAYPYITAW_BRANCH_SERVICE_AREA';
  else
    select t.provider_code,t.destination_name
    into v_provider_code,v_destination_name
    from public.be_data_entry_tariff_catalog t
    join public.be_data_entry_service_providers p
      on p.provider_code=t.provider_code and p.is_active
    where t.is_active
      and (
        public.be_data_entry_destination_key_v17(t.destination_key)=v_key
        or public.be_data_entry_destination_key_v17(t.destination_name)=v_key
      )
    order by case t.provider_code
      when 'BRITIUM' then 0
      when 'NPT BRANCH' then 1
      when 'MDY BRANCH' then 2
      when 'DK DELIVERY' then 3
      when 'ROYAL EXPRESS' then 3
      when 'GRS' then 4
      else 5
    end,t.updated_at desc
    limit 1;

    if v_provider_code='BRITIUM' then
      v_reason := 'EXACT_BRITIUM_ROUTE';
    elsif v_provider_code is not null then
      v_reason := 'EXACT_CONFIGURED_ROUTE';
    else
      v_provider_code := 'ROYAL EXPRESS';
      v_reason := 'OUTSIDE_BRITIUM_SERVICE_AREA';
    end if;
  end if;

  if v_destination_name is null then
    select t.destination_name
    into v_destination_name
    from public.be_data_entry_tariff_catalog t
    where t.is_active and t.provider_code=v_provider_code
      and (
        public.be_data_entry_destination_key_v17(t.destination_key)=v_key
        or public.be_data_entry_destination_key_v17(t.destination_name)=v_key
      )
    order by t.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'provider_code',v_provider_code,
    'reason',v_reason,
    'destination_key',v_key,
    'matched_destination',v_destination_name
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_service_provider_route_v17(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_delivery_route_v26(p_township text, p_item_price numeric DEFAULT NULL::numeric, p_delivery_address text DEFAULT NULL::text, p_requested_provider text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_legacy jsonb := public.be_data_entry_service_provider_route_v17(p_township);
  v_key text := coalesce(v_legacy->>'destination_key','');
  v_legacy_reason text := coalesce(v_legacy->>'reason','UNRESOLVED');
  v_royal_available boolean := (
      upper(coalesce(v_legacy->>'provider_code',''))='ROYAL EXPRESS'
      and (
        nullif(btrim(coalesce(v_legacy->>'matched_destination','')),'') is not null
        or v_legacy_reason='NAYPYITAW_EXCEPTION_ROYAL'
      )
    ) or upper(btrim(coalesce(p_requested_provider,'')))='ROYAL EXPRESS';
  v_provider text;
  v_region text := 'UNRESOLVED';
  v_mode text := 'UNRESOLVED';
  v_reason text := 'UNRESOLVED';
  v_map_required boolean := false;
  v_station_required boolean := false;
  v_explicit_station boolean := (
    -- EXPLICIT_HIGHWAY_SELECTION_20261022: mirror the Data Entry selector.
    lower(btrim(coalesce(p_township,''))) in ('ဂိတ်ချ','h.terminal drop-off','highway terminal drop-off')
    or upper(btrim(coalesce(p_requested_provider,'')))='H.TERMINAL DROP-OFF'
    or (coalesce(p_item_price,0) <= 0
      and lower(coalesce(p_delivery_address,'')) ~ '(ဂိတ်ချပေးရန်|အဝေးပြေးကားဝင်း|highway bus station|highway station)')
  );
begin
  if v_explicit_station then
    return jsonb_build_object(
      'provider_code','H.TERMINAL DROP-OFF',
      'reason','EXPLICIT_HIGHWAY_STATION_V120',
      'region_code','OUTSIDE_CORE',
      'delivery_mode','HIGHWAY_BUS_STATION',
      'map_required',false,
      'station_required',true,
      'destination_key',v_key,
      'matched_destination',v_legacy->>'matched_destination',
      'royal_available',false,
      'build','EXPLICIT_HIGHWAY_STATION_V120_20260923'
    );
  end if;

  if v_key='' then
    return jsonb_build_object(
      'provider_code',null,'reason',v_reason,'region_code',v_region,
      'delivery_mode',v_mode,'map_required',false,'station_required',false,
      'destination_key',v_key,'matched_destination',null,
      'build','YANGON_DYNAMIC_ZONING_V37_20260915'
    );
  end if;

  if v_key = any(array[
    'dala','ဒလ',
    'seikgyikanaungto','seikkyikanaungto','ဆိပ်ကြီးခနောင်တို'
  ]::text[]) then
    v_provider := 'ROYAL EXPRESS';
    v_region := 'OUTSIDE_CORE';
    v_mode := 'ROYAL_EXPRESS';
    v_reason := 'YANGON_OUT_OF_SCOPE_ROYAL_V37';
    v_map_required := false;
    v_station_required := false;
  elsif v_key = any(array[
    'yangon','rangoon','ရန်ကုန်',
    'thanlyin','syriam','သန်လျင်',
    'thongwa','thone gwa','thone-gwa','သုံးခွ'
  ]::text[]) then
    v_provider := 'BRITIUM'; v_region := 'YANGON';
    v_mode := 'DOORSTEP_MAP'; v_reason := 'EXACT_BRITIUM_ROUTE'; v_map_required := true;
  elsif v_legacy_reason='MANDALAY_BRANCH_SERVICE_AREA' then
    v_provider := 'MDY BRANCH'; v_region := 'MANDALAY';
    v_mode := 'DOORSTEP_MAP'; v_reason := v_legacy_reason; v_map_required := true;
  elsif v_legacy_reason='NAYPYITAW_BRANCH_SERVICE_AREA' then
    v_provider := 'NPT BRANCH'; v_region := 'NAYPYITAW';
    v_mode := 'DOORSTEP_MAP'; v_reason := v_legacy_reason; v_map_required := true;
  elsif v_legacy_reason='EXACT_BRITIUM_ROUTE' then
    v_provider := 'BRITIUM'; v_region := 'YANGON';
    v_mode := 'DOORSTEP_MAP'; v_reason := v_legacy_reason; v_map_required := true;
  else
    v_region := 'OUTSIDE_CORE';
    if coalesce(p_item_price,0)>0
       or btrim(coalesce(p_delivery_address,''))<>''
       or v_royal_available then
      v_provider := 'ROYAL EXPRESS'; v_mode := 'ROYAL_EXPRESS';
      v_reason := case when coalesce(p_item_price,0)>0
        then 'OUTSIDE_CORE_ROYAL_WITH_ITEM_PRICE' else 'OUTSIDE_CORE_ROYAL_DEFAULT' end;
    else
      v_provider := 'H.TERMINAL DROP-OFF'; v_mode := 'HIGHWAY_BUS_STATION';
      v_reason := 'OUTSIDE_CORE_HIGHWAY_STATION'; v_station_required := true;
    end if;
  end if;

  return jsonb_build_object(
    'provider_code',v_provider,'reason',v_reason,'region_code',v_region,
    'delivery_mode',v_mode,'map_required',v_map_required,
    'station_required',v_station_required,'destination_key',v_key,
    'matched_destination',v_legacy->>'matched_destination',
    'royal_available',v_royal_available,
    'build','YANGON_DYNAMIC_ZONING_V37_20260915'
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_delivery_route_v26(text,numeric,text,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_handoff_station_v19(p_code text, p_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text := upper(nullif(btrim(coalesce(p_code,'')),''));
  v_name text := nullif(btrim(coalesce(p_name,'')),'');
begin
  if v_code='AUNG_MINGALAR' then
    return jsonb_build_object('valid',true,'code',v_code,'name','Aung Mingalar Highway Bus Station / အောင်မင်္ဂလာအဝေးပြေး');
  elsif v_code='DAGON_AYAR_THIRI' then
    return jsonb_build_object('valid',true,'code',v_code,'name','Dagon Ayar / Dagon Thiri Highway Bus Station / ဒဂုံဧရာ-ဒဂုံသီရိအဝေးပြေး');
  elsif v_code='OTHER' and length(coalesce(v_name,''))>=3 then
    return jsonb_build_object('valid',true,'code',v_code,'name',v_name);
  end if;
  return jsonb_build_object('valid',false,'code',v_code,'name',v_name);
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_handoff_station_v19(text,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_handoff_charge_v26(p_station_code text)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case upper(btrim(coalesce(p_station_code,'')))
    when 'AUNG_MINGALAR' then 3000
    when 'DAGON_AYAR_THIRI' then 4000
    when 'OTHER' then 4000
    else null
  end;
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_handoff_charge_v26(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_manual_handoff_charge(p_payload jsonb, p_station_code text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v text;
begin
 if not (p_payload ? 'handoff_delivery_charge') then return public.be_data_entry_handoff_charge_v26(p_station_code); end if;
 v:=p_payload->>'handoff_delivery_charge';
 if v is null or v !~ '^[0-9]+$' then raise exception 'Enter a non-negative whole-MMK highway delivery charge.' using errcode='22023'; end if;
 return v::bigint;
end $function$
;
REVOKE ALL ON FUNCTION public.be_manual_handoff_charge(jsonb,text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_financial_v2_normalize_township_text_v61_7(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
  select btrim(regexp_replace(regexp_replace(lower(coalesce(p_value,'')), '[[:punct:]]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$function$
;
REVOKE ALL ON FUNCTION public.be_financial_v2_normalize_township_text_v61_7(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_financial_v2_township_code_v61_7(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v text := public.be_financial_v2_normalize_township_text_v61_7(p_value);
  v_code text;
begin
  if v = '' then return null; end if;

  select t.township_code into v_code
  from public.be_township_identity_v61_7 t
  where lower(t.township_code)=v
     or t.normalized_en=v
     or t.normalized_mm=v
  order by case when lower(t.township_code)=v then 0 when t.normalized_en=v then 1 else 2 end
  limit 1;
  if v_code is not null then return v_code; end if;

  select a.township_code into v_code
  from public.be_tariff_location_alias_v61_7_1 a
  where a.normalized_alias=v and a.township_code is not null
  limit 1;
  if v_code is not null then return v_code; end if;

  select t.township_code into v_code
  from public.be_township_identity_v61_7 t
  where (length(t.normalized_en) >= 4 and position(t.normalized_en in v) > 0)
     or (length(t.normalized_mm) >= 2 and position(t.normalized_mm in v) > 0)
  order by greatest(length(t.normalized_en),length(t.normalized_mm)) desc, t.township_code
  limit 1;

  return v_code;
end
$function$
;
REVOKE ALL ON FUNCTION public.be_financial_v2_township_code_v61_7(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_financial_v2_tariff_location_key_v61_7_1(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v text := public.be_financial_v2_normalize_township_text_v61_7(p_value);
  v_code text;
  v_key text;
begin

  -- MDY_EXPLICIT_ALIAS_PRIORITY_V1
  select a.location_key into v_key from public.be_tariff_location_alias_v61_7_1 a
  where a.normalized_alias=v and a.location_kind='SERVICE_POINT' and a.location_key like 'MDY_AREA:%';
  if found then return v_key; end if;
  if v = '' then return null; end if;
  v_code := public.be_financial_v2_township_code_v61_7(p_value);
  if v_code is not null then return v_code; end if;
  select a.location_key into v_key
  from public.be_tariff_location_alias_v61_7_1 a
  where a.normalized_alias=v
  limit 1;
  return v_key;
end
$function$
;
REVOKE ALL ON FUNCTION public.be_financial_v2_tariff_location_key_v61_7_1(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_financial_v2_township_key_v61_4_1(p_value text)
 RETURNS text
 LANGUAGE sql
 STABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.be_financial_v2_tariff_location_key_v61_7_1(p_value);
$function$
;
REVOKE ALL ON FUNCTION public.be_financial_v2_township_key_v61_4_1(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_approved_tariff_lookup_key(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare k text; matched text;
begin
k:=regexp_replace(regexp_replace(regexp_replace(lower(btrim(p_value)), '[[:space:]]*(township|မြို့နယ်)$', '', 'i'),'\(royal\)','','g'),'[[:space:]]+','','g');
if k in ('စဉ့်ကူး','singu') then return 'APPROVED:စဉ့်ကူး'; end if;
if k in ('ထောက်ကြံ့','htaukkyant') then return 'APPROVED:ထောက်ကြံ့'; end if;
if k in ('monghsu','မိုင်းရှူး') then return 'MMR014017'; end if;
if k in ('pinlon','ပင်လုံ') then return 'APPROVED:ပင်လုံ'; end if;
if k in ('ဥက္ကံ','okkan','oakkan') then return 'APPROVED:ဥက္ကံ'; end if;
matched:='{"ahlone":"အလုံ","bahan":"ဗဟန်း","botahtaung":"ဗိုလ်တထောင်","dagon":"ဒဂုံ","dagonmyothit(east)":"အရှေ့ဒဂုံ","dagonmyothit(north)":"မြောက်ဒဂုံ","dagonmyothit(south)":"တောင်ဒဂုံ","dagonseikkan":"ဒဂုံဆိပ်ကမ်း","dawbon":"ဒေါပုံ","eastdagon":"အရှေ့ဒဂုံ","hlaing":"လှိုင်","hlaingtharya(east)":"လှိုင်သာယာ","hlaingtharya(west)":"လှိုင်သာယာ","hlaingtharyaeast":"လှိုင်သာယာ","hlaingtharyar":"လှိုင်သာယာ","hlaingtharyar(east)":"လှိုင်သာယာ","hlaingtharyar(west)":"လှိုင်သာယာ","hlaingtharyareast":"လှိုင်သာယာ","hlaingtharyarwest":"လှိုင်သာယာ","hlaingtharyawest":"လှိုင်သာယာ","hlaingthaya":"လှိုင်သာယာ","hlaingthayareast":"လှိုင်သာယာ","hlaingthayarwest":"လှိုင်သာယာ","insein":"အင်းစိန်","kamayut":"ကမာရွတ်","kyauktada":"ကျောက်တံတား","kyeemyindaing":"ကြည့်မြင်တိုင်","kyimyindaing":"ကြည့်မြင်တိုင်","kyimyindine":"ကြည့်မြင်တိုင်","lanmadaw":"လမ်းမတော်","latha":"လသာ","mandalay":"မန္တလေး","mayangone":"မရမ်းကုန်း","mingaladon":"မင်္ဂလာဒုံ","mingalartaungnyunt":"မင်္ဂလာတောင်ညွန့်","mingalataungnyunt":"မင်္ဂလာတောင်ညွန့်","naypyitaw":"နေပြည်တော်","northdagon":"မြောက်ဒဂုံ","northokkalapa":"မြောက်ဥက္ကလာပ","pabedan":"ပန်းဘဲတန်း","pazundaung":"ပုဇွန်တောင်","sanchaung":"စမ်းချောင်း","shwepyithar":"ရွှေပြည်သာ","southdagon":"တောင်ဒဂုံ","southokkalapa":"တောင်ဥက္ကလာပ","tamwe":"တာမွေ","thaketa":"သာကေတ","thingangyun":"သင်္ဃန်းကျွန်း","yankin":"ရန်ကင်း","ကညွတ်ကွင်း":"ကညွတ်ကွင်း","ကန်ကြီးထောင့်":"ကန်ကြီးထောင့်","ကမာရွတ်":"ကမာရွတ်","ကမ္မ":"ကမ္မ","ကမ္မ(ပခုက္ကူ)":"ကမ္မ(ပခုက္ကူ)","ကလော":"ကလော","ကလေး":"ကလေး","ကဝ":"ကဝ","ကသာ":"ကသာ","ကူမဲ":"ကူမဲ","ကေတုမတီ":"ကေတုမတီ","ကောလင်း":"ကောလင်း","ကော့ကရိတ်":"ကော့ကရိတ်","ကော့မှူး":"ကော့မှူး","ကော့သောင်း":"ကော့သောင်း","ကျိုက္ခမီ":"ကျိုက္ခမီ","ကျိုက်ကော်":"ကျိုက်ကော်","ကျိုက်ထို":"ကျိုက်ထို","ကျိုက်မရော":"ကျိုက်မရော","ကျိုက်လတ်":"ကျိုက်လတ်","ကျိုင်းတုံ":"ကျိုင်းတုံ","ကျုံပျော်":"ကျုံပျော်","ကျုံမငေး":"ကျုံမငေး","ကျောက်ဆည်":"ကျောက်ဆည်","ကျောက်တန်း":"ကျောက်တန်း","ကျောက်တံခါး":"ကျောက်တံခါး","ကျောက်တံတား":"ကျောက်တံတား","ကျောက်ပန်းတောင်း":"ကျောက်ပန်းတောင်း","ကျောက်မဲ":"ကျောက်မဲ","ကျောင်းကုန်း":"ကျောင်းကုန်း","ကြည့်မြင်တိုင်":"ကြည့်မြင်တိုင်","ကြည့်မြင်တိုင်":"ကြည့်မြင်တိုင်","ကြို့ပင်ကောက်":"ကြို့ပင်ကောက်","ကြံခင်း":"ကြံခင်း","ကွင်းကောက်":"ကွင်းကောက်","ကွတ်ခိုင်":"ကွတ်ခိုင်","ကွမ်းခြံကုန်း":"ကွမ်းခြံကုန်း","ခရမ်း":"ခရမ်း","ချောက်":"ချောက်","ချောင်းဆုံ":"ချောင်းဆုံ","ချောင်းသာ":"ချောင်းသာ","ဂိတ်ချ":"ဂိတ်ချ","ငပုတော":"ငပုတော","ငဖဲ":"ငဖဲ","ငါးသိုင်းချောင်း":"ငါးသိုင်းချောင်း","ငွေဆောင်":"ငွေဆောင်","စကု":"စကု","စက္ကော့":"စက္ကော့","စစ်ကိုင်း":"စစ်ကိုင်း","စစ်ကွင်း":"စစ်ကွင်း","စဉ့်ကိုင်":"စဉ့်ကိုင်","စည်ပင်ကြီး":"စည်ပင်ကြီး","စမ်းချောင်း":"စမ်းချောင်း","စလင်း":"စလင်း","စလေ":"စလေ","စာမလောက်":"စာမလောက်","ဆင်ပေါင်ဝဲ":"ဆင်ပေါင်ဝဲ","ဆင်ဖြူကျွန်း":"ဆင်ဖြူကျွန်း","ဆိပ်ခွန်":"ဆိပ်ခွန်","ဆိပ်ဖြူ":"ဆိပ်ဖြူ","ဆွာ":"ဆွာ","ဇင်းကျိုက်":"ဇင်းကျိုက်","ဇလွန်":"ဇလွန်","ဇီကုန်း":"ဇီကုန်း","ညောင်ခြေထောက်":"ညောင်ခြေထောက်","ညောင်တုန်း":"ညောင်တုန်း","ညောင်ရွှေ":"ညောင်ရွှေ","ညောင်လေးပင်":"ညောင်လေးပင်","ညောင်ဦး":"ညောင်ဦး","တပ်ကုန်း":"တပ်ကုန်း","တမူး":"တမူး","တာချီလိတ်":"တာချီလိတ်","တာမွေ":"တာမွေ","တိုက်ကြီး":"တိုက်ကြီး","တောင်ကြီး":"တောင်ကြီး","တောင်ငူ":"တောင်ငူ","တောင်တွင်းကြီး":"တောင်တွင်းကြီး","တောင်ဒဂုံ":"တောင်ဒဂုံ","တောင်သာ":"တောင်သာ","တောင်ဥက္ကလာပ":"တောင်ဥက္ကလာပ","တံတားဦး":"တံတားဦး","တွံတေး":"တွံတေး","ထားဝယ်":"ထားဝယ်","ထီးချိုင့်":"ထီးချိုင့်","ထူးကြီး":"ထူးကြီး","ဒဂုံ":"ဒဂုံ","ဒဂုံဆိပ်ကမ်း":"ဒဂုံဆိပ်ကမ်း","ဒဂုံမြို့သစ်တောင်ပိုင်း":"တောင်ဒဂုံ","ဒဂုံမြို့သစ်မြောက်ပိုင်း":"မြောက်ဒဂုံ","ဒဂုံမြို့သစ်အရှေ့ပိုင်း":"အရှေ့ဒဂုံ","ဒဂုံဧရာအဝေးပြေး":"ဒဂုံဧရာအဝေးပြေး","ဒလ":"ဒလ","ဒါးက":"ဒါးက","ဒိုက်ဦး":"ဒိုက်ဦး","ဒေါပုံ":"ဒေါပုံ","ဒေးဒရဲ":"ဒေးဒရဲ","ဓနုဖြူ":"ဓနုဖြူ","နတ်တလင်း":"နတ်တလင်း","နတ်မောက်":"နတ်မောက်","နမ့်ခမ်း":"နမ့်ခမ်း","နမ်တူ":"နမ်တူ","နေပြည်တော်":"နေပြည်တော်","နေပြည်တော်ကောင်စီနယ်မြေ":"နေပြည်တော်","နောင်ချို":"နောင်ချို","နွားထိုးကြီး":"နွားထိုးကြီး","ပခုက္ကူ":"ပခုက္ကူ","ပင်လောင်း":"ပင်လောင်း","ပင်းတယ":"ပင်းတယ","ပန်းတနော်":"ပန်းတနော်","ပန်းတောင်း":"ပန်းတောင်း","ပန်းဘဲတန်း":"ပန်းဘဲတန်း","ပရမီကားဝင်း(ဗန္ဓုလ)":"ပရမီကားဝင်း(ဗန္ဓုလ)","ပိန်းဇလုပ်":"ပိန်းဇလုပ်","ပုဂံ":"ပုဂံ","ပုဇွန်တောင်":"ပုဇွန်တောင်","ပုလိပ်":"ပုလိပ်","ပုသိမ်":"ပုသိမ်","ပုသိမ်ကြီး":"ပုသိမ်ကြီး","ပေါက်ခေါင်း":"ပေါက်ခေါင်း","ပေါင်":"ပေါင်","ပေါင်းတည်":"ပေါင်းတည်","ပဲခူး":"ပဲခူး","ပျော်ဘွယ်":"ပျော်ဘွယ်","ပြင်ညောင်":"ပြင်ညောင်","ပြင်ရွာ":"ပြင်ရွာ","ပြင်ဦးလွင်":"ပြင်ဦးလွင်","ပြည်":"ပြည်","ပြွန်တန်ဆာ":"ပြွန်တန်ဆာ","ပွင့်ဖြူ":"ပွင့်ဖြူ","ဖျာပုံ":"ဖျာပုံ","ဖြူး":"ဖြူး","ဗဟန်း":"ဗဟန်း","ဗိုလ်တထောင်":"ဗိုလ်တထောင်","ဘားအံ":"ဘားအံ","ဘိုကလေး":"ဘိုကလေး","ဘီးလင်း":"ဘီးလင်း","ဘုရင့်နောင်ဂိတ်ချ":"ဘုရင့်နောင်ဂိတ်ချ","ဘုရားကြီး":"ဘုရားကြီး","မကွေး":"မကွေး","မင်းတုန်း":"မင်းတုန်း","မင်းဘူး":"မင်းဘူး","မင်းလှအထက်":"မင်းလှအထက်","မင်းလှအောက်":"မင်းလှအောက်","မင်္ဂလာတောင်ညွန့်":"မင်္ဂလာတောင်ညွန့်","မင်္ဂလာတောင်ညွန့်":"မင်္ဂလာတောင်ညွန့်","မင်္ဂလာဒုံ":"မင်္ဂလာဒုံ","မတ္တရာ":"မတ္တရာ","မန္တလေး":"မန္တလေး","မရမ်းကုန်း":"မရမ်းကုန်း","မလှိုင်":"မလှိုင်","မအူပင်":"မအူပင်","မိတ္ထီလာ":"မိတ္ထီလာ","မိုးကုတ်":"မိုးကုတ်","မိုးညို":"မိုးညို","မုဒုံ":"မုဒုံ","မုံရွာ":"မုံရွာ","မူဆယ်":"မူဆယ်","မော်လမြိုင်":"မော်လမြိုင်","မော်လမြိုင်ကျွန်း":"မော်လမြိုင်ကျွန်း","မြင်းခြံ":"မြင်းခြံ","မြင်းမူ":"မြင်းမူ","မြစ်ငယ်":"မြစ်ငယ်","မြစ်သား":"မြစ်သား","မြန်အောင်":"မြန်အောင်","မြဝတီ":"မြဝတီ","မြိတ်":"မြိတ်","မြိုင်ကလေး":"မြိုင်ကလေး","မြို့တွင်းဂိတ်ချ":"မြို့တွင်းဂိတ်ချ","မြို့လှ":"မြို့လှ","မြို့သစ်":"မြို့သစ်","မြောက်ဒဂုံ":"မြောက်ဒဂုံ","မြောက်ဥက္ကလာပ":"မြောက်ဥက္ကလာပ","မြောင်းမြ":"မြောင်းမြ","မှော်ဘီ":"မှော်ဘီ","ရန်ကင်း":"ရန်ကင်း","ရန်ကုန်ဘူတာကြီး":"ရန်ကုန်ဘူတာကြီး","ရပ်စောက်":"ရပ်စောက်","ရမည်းသင်း":"ရမည်းသင်း","ရေကြည်":"ရေကြည်","ရေစကြို":"ရေစကြို","ရေတာရှည်":"ရေတာရှည်","ရေနီ":"ရေနီ","ရေနံချောင်း":"ရေနံချောင်း","ရေး":"ရေး","ရွာငံ":"ရွာငံ","ရွှေကျင်":"ရွှေကျင်","ရွှေညောင်":"ရွှေညောင်","ရွှေတောင်":"ရွှေတောင်","ရွှေပြည်သာ":"ရွှေပြည်သာ","ရွှေဘို":"ရွှေဘို","ရွှေလောင်း":"ရွှေလောင်း","လက်ပံတန်း":"လက်ပံတန်း","လပွတ္တာ":"လပွတ္တာ","လမ်းမတော်":"လမ်းမတော်","လသာ":"လသာ","လားရှိုး":"လားရှိုး","လေးမျက်နှာ":"လေးမျက်နှာ","လွိုင်ကော်":"လွိုင်ကော်","လွိုင်လင်":"လွိုင်လင်","လှည်းကူး":"လှည်းကူး","လှိုင်":"လှိုင်","လှိုင်သာယာ":"လှိုင်သာယာ","လှိုင်သာယာ(အနောက်ပိုင်း)":"လှိုင်သာယာ","လှိုင်သာယာ(အရှေ့ပိုင်း)":"လှိုင်သာယာ","လှိုင်သာယာအနောက်ပိုင်း":"လှိုင်သာယာ","လှိုင်သာယာအရှေ့ပိုင်း":"လှိုင်သာယာ","လှိုင်းဘွဲ့":"လှိုင်းဘွဲ့","ဝမ်းတွင်း":"ဝမ်းတွင်း","ဝါးခယ်မ":"ဝါးခယ်မ","ဝေါ":"ဝေါ","သင်္ဃန်းကျွန်း":"သင်္ဃန်းကျွန်း","သင်္ဘောဆိပ်ချ":"သင်္ဘောဆိပ်ချ","သစ်ရာကောက်":"သစ်ရာကောက်","သထုံ":"သထုံ","သနပ်ပင်":"သနပ်ပင်","သရက်":"သရက်","သာကရ":"သာကရ","သာကေတ":"သာကေတ","သာစည်":"သာစည်","သာပေါင်း":"သာပေါင်း","သာယာဝတီ":"သာယာဝတီ","သာဝတ္ထိ":"သာဝတ္ထိ","သိမ်ဇရပ်":"သိမ်ဇရပ်","သီပေါ":"သီပေါ","သီရိမင်္ဂလာကားဝင်း":"သီရိမင်္ဂလာကားဝင်း","သုံးခွ":"သုံးခွ","သုံးဆယ်":"သုံးဆယ်","သဲကုန်း":"သဲကုန်း","သံဖြူဇရပ်":"သံဖြူဇရပ်","ဟင်္သာတ":"ဟင်္သာတ","ဟန်မြင့်မိုရ်":"ဟန်မြင့်မိုရ်","ဟိုပုံး":"ဟိုပုံး","ဟဲဟိုး":"ဟဲဟိုး","အင်းစိန်":"အင်းစိန်","အင်းတကော်":"အင်းတကော်","အင်းတော်":"အင်းတော်","အင်းမ":"အင်းမ","အင်္ဂပူ":"အင်္ဂပူ","အတ်ထုပ်":"အတ်ထုပ်","အထောင်":"အထောင်","အနီးစခန်း":"အနီးစခန်း","အဖျောက်":"အဖျောက်","အမရပူရ":"အမရပူရ","အရှေ့ဒဂုံ":"အရှေ့ဒဂုံ","အလုံ":"အလုံ","အိမ်မဲ":"အိမ်မဲ","အိုင်သဲကုန်း":"အိုင်သဲကုန်း","အုတ်တွင်း":"အုတ်တွင်း","အုတ်ဖို":"အုတ်ဖို","အုန်းချော":"အုန်းချော","အုပ်ရှစ်ပင်":"အုပ်ရှစ်ပင်","အောင်ပန်း":"အောင်ပန်း","အောင်မင်္ဂလာကားဝင်း":"အောင်မင်္ဂလာကားဝင်း","အောင်မင်္ဂလာဂိတ်ချ":"အောင်မင်္ဂလာဂိတ်ချ","အောင်လံ":"အောင်လံ","အေးသာယာ":"အေးသာယာ","ဧလာ":"ဧလာ"}'::jsonb->>k;
if matched is not null then return 'APPROVED:'||matched; end if;
return public.be_financial_v2_township_key_v61_4_1(p_value);
end $function$
;
REVOKE ALL ON FUNCTION public.be_approved_tariff_lookup_key(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_image_tariff_weight_surcharge_v1(p_zone text, p_township text, p_tier text, p_weight numeric, p_included numeric, p_fallback_per_kg bigint)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$ with input as (select ceil(greatest(0::numeric,coalesce(p_weight,0))) w,greatest(0::numeric,coalesce(p_included,0)) included,upper(btrim(coalesce(p_zone,''))) zone) select case when upper(btrim(coalesce(p_tier,'')))='STANDARD' and (zone in('YGN','YANGON','MDY','MANDALAY') or (zone='BRANCH' and btrim(coalesce(p_township,'')) in('မန္တလေး','Mandalay'))) then (greatest(0::numeric,least(w,10)-3)*500+greatest(0::numeric,least(w,20)-10)*1000+greatest(0::numeric,w-20)*1500)::bigint when upper(btrim(coalesce(p_tier,'')))='STANDARD' and (zone='NPT' or (zone='BRANCH' and btrim(p_township)='နေပြည်တော်')) then (greatest(0::numeric,w-3)*1500)::bigint else ceil(greatest(0::numeric,w-included)*coalesce(p_fallback_per_kg,0))::bigint end from input; $function$
;
REVOKE ALL ON FUNCTION public.be_image_tariff_weight_surcharge_v1(text,text,text,numeric,numeric,bigint) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_calculate_parcel_financial_v2_v61_8_2_legacy(p_township text, p_customer_tier text, p_amount_entry_type text, p_item_price bigint DEFAULT NULL::bigint, p_delivery_charges bigint DEFAULT NULL::bigint, p_merchant_stated_total_amount bigint DEFAULT NULL::bigint, p_additional_customer_charge bigint DEFAULT 0, p_cbm_surcharge bigint DEFAULT 0, p_other_surcharge bigint DEFAULT 0, p_merchant_payable_charges bigint DEFAULT 0, p_other_merchant_credits bigint DEFAULT 0, p_actual_weight_kg numeric DEFAULT 0, p_merchant_monthly_ways integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tariff public.be_parcel_tariffs_v2%rowtype;
  v_tier text := upper(btrim(coalesce(p_customer_tier, '')));
  v_type text := upper(btrim(coalesce(p_amount_entry_type, '')));
  v_messages text[] := array[]::text[];
  v_chargeable numeric(10,3);
  v_extra numeric(10,3);
  v_weight_surcharge bigint;
  v_backend_delivery_surcharges bigint;
  v_customer_delivery_surcharges bigint;
  v_gross bigint;
  v_commitment_refund bigint;
  v_net bigint;
  v_effective bigint;
  v_cod bigint := 0;
  v_difference bigint;
  v_direction text;
  v_adjustment bigint;
  v_merchant_final bigint;
  v_status text;
  v_candidate_count integer := 0;
  v_shape_count integer := 0;
begin
  if nullif(btrim(coalesce(p_township, '')), '') is null then
    v_messages := array_append(v_messages, 'Township is required.');
  end if;
  if v_tier not in ('STANDARD','ROYAL','COMMITMENT') then
    v_messages := array_append(v_messages, 'A valid backend-resolved customer tier is required.');
  end if;
  if v_type not in (
    'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
    'TOTAL_AMOUNT_INCLUDING_DELIVERY',
    'DELIVERY_CHARGE_ONLY',
    'EXACT_COLLECTION_AMOUNT',
    'OPAQUE_COD_COLLECTION',
    'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT'
  ) then
    v_messages := array_append(v_messages, 'Invalid amount entry type.');
  end if;

  if coalesce(p_additional_customer_charge,0) < 0
     or coalesce(p_cbm_surcharge,0) < 0
     or coalesce(p_other_surcharge,0) < 0
     or coalesce(p_merchant_payable_charges,0) < 0
     or coalesce(p_other_merchant_credits,0) < 0
     or coalesce(p_actual_weight_kg,0) < 0
     or coalesce(p_merchant_monthly_ways,0) < 0
     or (p_item_price is not null and p_item_price < 0)
     or (p_delivery_charges is not null and p_delivery_charges < 0)
     or (p_merchant_stated_total_amount is not null and p_merchant_stated_total_amount < 0) then
    v_messages := array_append(v_messages, 'Financial and weight inputs must be non-negative.');
  end if;

  select
    count(*)::integer,
    count(distinct concat_ws(
      '|',
      t.base_tariff::text,
      t.included_kg::text,
      t.extra_per_kg::text,
      t.commitment_min_ways::text,
      t.commitment_refund_per_way::text,
      coalesce(t.tariff_zone,''),
      coalesce(t.tariff_zone_code,'')
    ))::integer
  into v_candidate_count, v_shape_count
  from public.be_parcel_tariffs_v2 t
  where public.be_approved_tariff_lookup_key(t.township) = public.be_approved_tariff_lookup_key(p_township)
    and t.customer_tier = v_tier
    and t.status = 'ACTIVE'
    and t.effective_from <= public.be_business_date()
    and (t.effective_to is null or t.effective_to >= public.be_business_date());

  if v_candidate_count = 0 then
    v_messages := array_append(v_messages, 'No active tariff exists for the selected township and customer tier.');
    v_tariff.base_tariff := 0;
    v_tariff.included_kg := 0;
    v_tariff.extra_per_kg := 0;
    v_tariff.commitment_min_ways := 0;
    v_tariff.commitment_refund_per_way := 0;
  elsif v_shape_count <> 1 then
    v_messages := array_append(v_messages, 'Conflicting active tariff configurations exist for the selected township and customer tier.');
    v_tariff.base_tariff := 0;
    v_tariff.included_kg := 0;
    v_tariff.extra_per_kg := 0;
    v_tariff.commitment_min_ways := 0;
    v_tariff.commitment_refund_per_way := 0;
  else
    select * into v_tariff
    from public.be_parcel_tariffs_v2 t
    where public.be_approved_tariff_lookup_key(t.township) = public.be_approved_tariff_lookup_key(p_township)
      and t.customer_tier = v_tier
      and t.status = 'ACTIVE'
      and t.effective_from <= public.be_business_date()
      and (t.effective_to is null or t.effective_to >= public.be_business_date())
    order by t.effective_from desc, t.updated_at desc, t.id desc
    limit 1;
  end if;

  v_chargeable := ceil(greatest(0::numeric, coalesce(p_actual_weight_kg,0)));
  v_extra := greatest(0::numeric, v_chargeable - coalesce(v_tariff.included_kg,0));
  v_weight_surcharge := public.be_image_tariff_weight_surcharge_v1(v_tariff.tariff_zone_code,v_tariff.township,v_tier,v_chargeable,v_tariff.included_kg,v_tariff.extra_per_kg);
  v_backend_delivery_surcharges := greatest(0::bigint,
    v_weight_surcharge + coalesce(p_cbm_surcharge,0) + coalesce(p_other_surcharge,0));

  -- Receiver-paid collection types add backend-calculated weight/CBM/other
  -- delivery surcharges to the customer's collection. When the merchant pays
  -- delivery, the same surcharge remains Britium entitlement but is recovered
  -- from merchant settlement instead of the receiver.
  -- Merchant-declared delivery is the complete receiver-facing amount.
  -- Backend tariff shortfalls are recovered from merchant settlement.
  v_customer_delivery_surcharges := 0;

  v_gross := greatest(0::bigint, coalesce(v_tariff.base_tariff,0) + v_backend_delivery_surcharges);
  v_commitment_refund := case
    when v_tier = 'COMMITMENT'
      and coalesce(p_merchant_monthly_ways,0) >= coalesce(v_tariff.commitment_min_ways,0)
    then coalesce(v_tariff.commitment_refund_per_way,0)
    else 0
  end;
  v_net := greatest(0::bigint, v_gross - v_commitment_refund);

  case v_type
    when 'ITEM_PRICE_PLUS_DECLARED_DELIVERY' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0);

    when 'TOTAL_AMOUNT_INCLUDING_DELIVERY' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      -- Approved business meaning: the operator enters item price and the
      -- merchant-declared delivery amount separately. Mandatory receiver-paid
      -- weight/CBM/other delivery surcharges are then added once.
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0);

    when 'DELIVERY_CHARGE_ONLY' then
      if p_delivery_charges is null then v_messages := array_append(v_messages, 'Merchant-declared delivery charge is required.'); end if;
      v_effective := coalesce(p_delivery_charges,0) + v_customer_delivery_surcharges;
      v_cod := v_effective + coalesce(p_additional_customer_charge,0);

    when 'EXACT_COLLECTION_AMOUNT' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Merchant-stated exact collection amount is required.'); end if;
      -- The stated amount is collected exactly. Britium entitlement is not
      -- added to receiver COD; it is deducted from the gross collection when
      -- merchant settlement is calculated.
      v_cod := coalesce(p_merchant_stated_total_amount,0);
      v_effective := null;

    when 'OPAQUE_COD_COLLECTION' then
      if p_merchant_stated_total_amount is null then v_messages := array_append(v_messages, 'Opaque COD gross collection amount is required.'); end if;
      -- Opaque COD follows the same gross-minus-Britium settlement rule as
      -- exact collection: collect the stated gross and deduct the canonical
      -- Britium entitlement to determine the merchant payable amount.
      v_cod := coalesce(p_merchant_stated_total_amount,0);
      v_effective := null;

    when 'ITEM_PRICE_ONLY_DELIVERY_PAID_BY_MERCHANT' then
      if p_item_price is null then v_messages := array_append(v_messages, 'Item price is required.'); end if;
      v_effective := 0;
      v_cod := coalesce(p_item_price,0) + coalesce(p_additional_customer_charge,0);

    else
      null;
  end case;

  if cardinality(v_messages) > 0 then
    v_status := 'ERROR';
    v_direction := 'NO_ADJUSTMENT';
  elsif v_type in ('EXACT_COLLECTION_AMOUNT','OPAQUE_COD_COLLECTION') then
    v_difference := null;
    v_adjustment := -v_net;
    v_merchant_final := v_cod - v_net
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);
    v_direction := case
      when v_merchant_final > 0 then 'CREDIT_TO_MERCHANT'
      when v_merchant_final < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;
    v_status := 'OK';
    v_messages := array[case
      when v_type = 'EXACT_COLLECTION_AMOUNT'
        then 'Ready. Exact receiver collection is preserved and Britium entitlement is deducted from the gross amount for merchant settlement.'
      else 'Ready. Opaque COD gross collection is preserved and Britium entitlement is deducted from the gross amount for merchant settlement.'
    end];
  else
    v_difference := coalesce(v_effective,0) - v_net;
    v_adjustment := v_difference;
    v_direction := case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;
    v_merchant_final := case
      when v_type = 'DELIVERY_CHARGE_ONLY' then 0
      else coalesce(p_item_price,0)
    end + v_difference
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);
    v_status := 'OK';
    v_messages := array['Ready. Collection-type ownership rules were applied without hidden-field carryover or duplicate surcharge collection.'];
  end if;

  return jsonb_build_object(
    'tariff_zone', v_tariff.tariff_zone,
    'tariff_zone_code', v_tariff.tariff_zone_code,
    'base_tariff', v_tariff.base_tariff,
    'included_kg', v_tariff.included_kg,
    'extra_per_kg', v_tariff.extra_per_kg,
    'commitment_min_ways', v_tariff.commitment_min_ways,
    'commitment_refund_per_way', v_tariff.commitment_refund_per_way,
    'chargeable_weight_kg', v_chargeable,
    'extra_kg', v_extra,
    'weight_surcharge', v_weight_surcharge,
    'backend_calculated_delivery_surcharges', v_backend_delivery_surcharges,
    'customer_payable_delivery_surcharges', v_customer_delivery_surcharges,
    'gross_system_delivery_charge', v_gross,
    'commitment_refund', v_commitment_refund,
    'net_system_delivery_charge', v_net,
    'britium_delivery_entitlement', v_net,
    'effective_declared_delivery_charge', v_effective,
    'customer_payable_delivery_component', v_effective,
    'cod_amount', v_cod,
    'delivery_difference', v_difference,
    'merchant_settlement_adjustment', v_adjustment,
    'settlement_direction', v_direction,
    'merchant_final_settlement_amount', v_merchant_final,
    'validation_status', v_status,
    'validation_message', array_to_string(v_messages, ' '),
    'calculation_version', 'PARCEL_FINANCIAL_V2_DECLARED_DELIVERY_SETTLEMENT_V61_8_2',
    'resolved_tariff_township', v_tariff.township,
    'resolved_township_key', public.be_approved_tariff_lookup_key(p_township),
    'calculated_at', now()
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_calculate_parcel_financial_v2_v61_8_2_legacy(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_calculate_parcel_financial_v2_v61_9_0_legacy(p_township text, p_customer_tier text, p_amount_entry_type text, p_item_price bigint DEFAULT NULL::bigint, p_delivery_charges bigint DEFAULT NULL::bigint, p_merchant_stated_total_amount bigint DEFAULT NULL::bigint, p_additional_customer_charge bigint DEFAULT 0, p_cbm_surcharge bigint DEFAULT 0, p_other_surcharge bigint DEFAULT 0, p_merchant_payable_charges bigint DEFAULT 0, p_other_merchant_credits bigint DEFAULT 0, p_actual_weight_kg numeric DEFAULT 0, p_merchant_monthly_ways integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_quote jsonb;
  v_type text := upper(btrim(coalesce(p_amount_entry_type,'')));
  v_base bigint := 0;
  v_backend_surcharges bigint := 0;
  v_net bigint := 0;
  v_effective bigint := 0;
  v_cod bigint := 0;
  v_difference bigint := 0;
  v_adjustment bigint := 0;
  v_merchant_final bigint := 0;
  v_direction text := 'NO_ADJUSTMENT';
begin
  v_quote := public.be_calculate_parcel_financial_v2_v61_8_2_legacy(
    p_township,
    p_customer_tier,
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
    p_merchant_monthly_ways
  );

  if coalesce(v_quote->>'validation_status','ERROR') <> 'ERROR'
     and v_type in (
       'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
       'TOTAL_AMOUNT_INCLUDING_DELIVERY',
       'DELIVERY_CHARGE_ONLY'
     ) then
    v_base := coalesce(nullif(v_quote->>'base_tariff','')::bigint,0);
    v_backend_surcharges := coalesce(nullif(v_quote->>'backend_calculated_delivery_surcharges','')::bigint,0);
    v_net := coalesce(nullif(v_quote->>'net_system_delivery_charge','')::bigint,0);

    v_effective := greatest(coalesce(p_delivery_charges,0), v_base) + v_backend_surcharges;

    v_cod := case
      when v_type = 'DELIVERY_CHARGE_ONLY'
        then v_effective + coalesce(p_additional_customer_charge,0)
      else coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0)
    end;

    v_difference := v_effective - v_net;
    v_adjustment := v_difference;
    v_merchant_final := case
      when v_type = 'DELIVERY_CHARGE_ONLY' then 0
      else coalesce(p_item_price,0)
    end
      + v_difference
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);

    v_direction := case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;

    v_quote := v_quote || jsonb_build_object(
      'customer_payable_delivery_surcharges', v_backend_surcharges,
      'effective_declared_delivery_charge', v_effective,
      'customer_payable_delivery_component', v_effective,
      'cod_amount', v_cod,
      'delivery_difference', v_difference,
      'merchant_settlement_adjustment', v_adjustment,
      'settlement_direction', v_direction,
      'merchant_final_settlement_amount', v_merchant_final,
      'validation_message', 'Ready. Receiver collection includes the authoritative township tariff and delivery surcharges; Britium entitlement is separated from merchant settlement.',
      'calculation_version', 'PARCEL_FINANCIAL_V2_RECEIVER_PAID_SYSTEM_DELIVERY_V61_9_0',
      'calculated_at', now()
    );
  end if;

  return v_quote;
end
$function$
;
REVOKE ALL ON FUNCTION public.be_calculate_parcel_financial_v2_v61_9_0_legacy(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_calculate_parcel_financial_v2(p_township text, p_customer_tier text, p_amount_entry_type text, p_item_price bigint DEFAULT NULL::bigint, p_delivery_charges bigint DEFAULT NULL::bigint, p_merchant_stated_total_amount bigint DEFAULT NULL::bigint, p_additional_customer_charge bigint DEFAULT 0, p_cbm_surcharge bigint DEFAULT 0, p_other_surcharge bigint DEFAULT 0, p_merchant_payable_charges bigint DEFAULT 0, p_other_merchant_credits bigint DEFAULT 0, p_actual_weight_kg numeric DEFAULT 0, p_merchant_monthly_ways integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_quote jsonb;
  v_type text := upper(btrim(coalesce(p_amount_entry_type,'')));
  v_backend_surcharges bigint := 0;
  v_net bigint := 0;
  v_effective bigint := 0;
  v_cod bigint := 0;
  v_difference bigint := 0;
  v_merchant_final bigint := 0;
  v_direction text := 'NO_ADJUSTMENT';
begin
  v_quote := public.be_calculate_parcel_financial_v2_v61_9_0_legacy(
    p_township,
    p_customer_tier,
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
    p_merchant_monthly_ways
  );

  if coalesce(v_quote->>'validation_status','ERROR') <> 'ERROR'
     and v_type in (
       'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
       'TOTAL_AMOUNT_INCLUDING_DELIVERY',
       'DELIVERY_CHARGE_ONLY'
     ) then
    v_backend_surcharges := coalesce(nullif(v_quote->>'backend_calculated_delivery_surcharges','')::bigint,0);
    v_net := coalesce(nullif(v_quote->>'net_system_delivery_charge','')::bigint,0);
    v_effective := coalesce(p_delivery_charges,0) + v_backend_surcharges;

    v_cod := case
      when v_type = 'DELIVERY_CHARGE_ONLY'
        then v_effective + coalesce(p_additional_customer_charge,0)
      else coalesce(p_item_price,0) + v_effective + coalesce(p_additional_customer_charge,0)
    end;

    v_difference := v_effective - v_net;
    v_merchant_final := case
      when v_type = 'DELIVERY_CHARGE_ONLY' then 0
      else coalesce(p_item_price,0)
    end
      + v_difference
      + coalesce(p_other_merchant_credits,0)
      - coalesce(p_merchant_payable_charges,0);

    v_direction := case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end;

    v_quote := v_quote || jsonb_build_object(
      'customer_payable_delivery_surcharges', v_backend_surcharges,
      'effective_declared_delivery_charge', v_effective,
      'customer_payable_delivery_component', v_effective,
      'cod_amount', v_cod,
      'delivery_difference', v_difference,
      'merchant_settlement_adjustment', v_difference,
      'settlement_direction', v_direction,
      'merchant_final_settlement_amount', v_merchant_final,
      'validation_message', 'Ready. Receiver delivery equals the merchant-declared delivery amount plus backend-calculated surcharges. Any tariff shortfall is deducted from merchant settlement.',
      'calculation_version', 'PARCEL_FINANCIAL_V2_RECEIVER_PAID_DECLARED_DELIVERY_V61_9_1',
      'calculated_at', now()
    );
  end if;

  return v_quote;
end
$function$
;
REVOKE ALL ON FUNCTION public.be_calculate_parcel_financial_v2(text,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint,bigint,numeric,integer) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access jsonb;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_merchant_id text := upper(nullif(btrim(coalesce(p_payload ->> 'merchant_id','')),''));
  v_township text := nullif(btrim(coalesce(p_payload ->> 'township','')), '');
  v_amount_type text := upper(nullif(btrim(coalesce(p_payload ->> 'amount_entry_type','')),''));
  v_profile public.be_merchant_financial_profiles_v2%rowtype;
  v_profile_found boolean := false;
  v_any_profile_exists boolean := false;
  v_requested_tier text := upper(nullif(btrim(coalesce(p_payload ->> 'customer_tier','')),''));
  v_resolved_tier text;
  v_tier_source text;
  v_registration_status text;
  v_monthly integer := 0;
  v_quote jsonb;
  v_row jsonb;
  v_errors text[] := array[]::text[];
  v_item_price bigint;
  v_delivery_charges bigint;
  v_stated_total bigint;
  v_additional bigint := 0;
  v_cbm bigint := 0;
  v_other bigint := 0;
  v_merchant_charges bigint := 0;
  v_merchant_credits bigint := 0;
  v_weight numeric := 0;
  v_text text;
begin
  v_access := public.be_data_entry_require_access_v57('create', false);

  if v_merchant_id is null then
    return jsonb_build_object(
      'ok', false,
      'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
      'generated_at', now(),
      'errors', jsonb_build_array(jsonb_build_object(
        'code','MERCHANT_ID_REQUIRED','field','merchant_id','message','Merchant ID is required.'
      )),
      'access', v_access
    );
  end if;

  select * into v_profile
  from public.be_merchant_financial_profiles_v2 m
  where upper(btrim(m.merchant_id)) = v_merchant_id
    and m.is_active
    and m.effective_from <= public.be_business_date()
    and (m.effective_to is null or m.effective_to >= public.be_business_date())
  order by m.effective_from desc
  limit 1;

  v_profile_found := found;

  if v_profile_found then
    v_resolved_tier := upper(btrim(coalesce(v_profile.customer_tier,'')));
    if v_resolved_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return jsonb_build_object(
        'ok', false,
        'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
        'generated_at', now(),
        'errors', jsonb_build_array(jsonb_build_object(
          'code','INVALID_REGISTERED_MERCHANT_TIER',
          'field','customer_tier',
          'message','The active merchant profile does not contain STANDARD, ROYAL, or COMMITMENT.'
        )),
        'data', jsonb_build_object('merchant_id',v_merchant_id),
        'access', v_access
      );
    end if;
    v_tier_source := 'ACTIVE_APPROVED_MERCHANT_PROFILE';
    v_registration_status := 'REGISTERED_ACTIVE_PROFILE';
  else
    select exists(
      select 1
      from public.be_merchant_financial_profiles_v2 m
      where upper(btrim(m.merchant_id)) = v_merchant_id
    ) into v_any_profile_exists;

    if v_any_profile_exists then
      return jsonb_build_object(
        'ok', false,
        'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
        'generated_at', now(),
        'errors', jsonb_build_array(jsonb_build_object(
          'code','MERCHANT_PROFILE_INACTIVE_OR_BLOCKED',
          'field','merchant_id',
          'message','This merchant has a Financial V2 profile but it is inactive, expired, or blocked. It is not treated as unregistered.'
        )),
        'data', jsonb_build_object('merchant_id',v_merchant_id),
        'access', v_access
      );
    end if;

    if v_requested_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return jsonb_build_object(
        'ok', false,
        'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
        'generated_at', now(),
        'errors', jsonb_build_array(jsonb_build_object(
          'code','UNREGISTERED_MERCHANT_TIER_REQUIRED',
          'field','customer_tier',
          'message','For a truly unregistered merchant, select STANDARD, ROYAL, or COMMITMENT before calculation.'
        )),
        'data', jsonb_build_object('merchant_id',v_merchant_id),
        'access', v_access
      );
    end if;

    v_resolved_tier := v_requested_tier;
    v_tier_source := 'UNREGISTERED_MERCHANT_OPERATOR_SELECTION';
    v_registration_status := 'UNREGISTERED';
  end if;

  v_text := nullif(btrim(v_payload ->> 'item_price'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then
    v_errors := array_append(v_errors,'item_price must be a non-negative whole number.');
  else v_item_price := v_text::bigint; end if;

  v_text := nullif(btrim(v_payload ->> 'delivery_charges'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then
    v_errors := array_append(v_errors,'delivery_charges must be a non-negative whole number.');
  else v_delivery_charges := v_text::bigint; end if;

  v_text := nullif(btrim(v_payload ->> 'merchant_stated_total_amount'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then
    v_errors := array_append(v_errors,'merchant_stated_total_amount must be a non-negative whole number.');
  else v_stated_total := v_text::bigint; end if;

  v_text := nullif(btrim(v_payload ->> 'additional_customer_charge'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'additional_customer_charge is invalid.');
  else v_additional := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'cbm_surcharge'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'cbm_surcharge is invalid.');
  else v_cbm := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'other_surcharge'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'other_surcharge is invalid.');
  else v_other := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'merchant_payable_charges'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'merchant_payable_charges is invalid.');
  else v_merchant_charges := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'other_merchant_credits'),'');
  if v_text is not null and v_text !~ '^[0-9]+$' then v_errors := array_append(v_errors,'other_merchant_credits is invalid.');
  else v_merchant_credits := coalesce(v_text::bigint,0); end if;

  v_text := nullif(btrim(v_payload ->> 'weight_kg'),'');
  if v_text is not null and v_text !~ '^[0-9]+([.][0-9]+)?$' then v_errors := array_append(v_errors,'weight_kg must be a non-negative number.');
  else v_weight := coalesce(v_text::numeric,0); end if;

  select count(*)::integer into v_monthly
  from public.parcels p
  where upper(btrim(coalesce(p.merchant_id::text,''))) = v_merchant_id
    and date_trunc('month', coalesce(p.created_at,now()) at time zone 'Asia/Yangon')
        = date_trunc('month', public.be_business_date()::timestamp)
    and upper(coalesce(p.status,'')) not in ('CANCELLED','FAILED');

  v_quote := public.be_calculate_parcel_financial_v2(
    v_township,
    v_resolved_tier,
    v_amount_type,
    v_item_price,
    v_delivery_charges,
    v_stated_total,
    v_additional,
    v_cbm,
    v_other,
    v_merchant_charges,
    v_merchant_credits,
    v_weight,
    v_monthly
  );

  if cardinality(v_errors) > 0 then
    v_quote := v_quote || jsonb_build_object(
      'validation_status','ERROR',
      'validation_message',
        array_to_string(v_errors,' ') || case
          when nullif(v_quote ->> 'validation_message','') is null then ''
          else ' ' || (v_quote ->> 'validation_message')
        end
    );
  end if;

  v_row := jsonb_build_object(
    'id', nullif(btrim(v_payload ->> 'id'), ''),
    'way_id', nullif(btrim(v_payload ->> 'way_id'), ''),
    'customer_id', nullif(btrim(v_payload ->> 'customer_id'), ''),
    'merchant_id', v_merchant_id,
    'status', lower(coalesce(nullif(btrim(v_payload ->> 'status'), ''), 'registered')),
    'recipient_name', nullif(btrim(v_payload ->> 'recipient_name'), ''),
    'recipient_phone', nullif(btrim(v_payload ->> 'recipient_phone'), ''),
    'township', v_township,
    'delivery_address', nullif(btrim(v_payload ->> 'delivery_address'), ''),
    'item_price', v_item_price,
    'delivery_charges', v_delivery_charges,
    'cod_amount', nullif(v_quote ->> 'cod_amount', '')::bigint,
    'weight_kg', v_weight,
    'created_at', nullif(btrim(v_payload ->> 'created_at'), ''),
    'updated_at', nullif(btrim(v_payload ->> 'updated_at'), ''),
    'environment', 'UAT',
    'customer_tier', v_resolved_tier,
    'monthly_ways', v_monthly,
    'amount_entry_type', v_amount_type,
    'merchant_stated_total_amount', v_stated_total,
    'additional_customer_charge', v_additional,
    'cbm_surcharge', v_cbm,
    'other_surcharge', v_other,
    'merchant_payable_charges', v_merchant_charges,
    'other_merchant_credits', v_merchant_credits,
    'remarks', nullif(btrim(v_payload ->> 'remarks'), ''),
    'entered_by', nullif(v_access ->> 'actor_user_id', ''),
    'authorized_by', null,
    'tariff_zone', v_quote ->> 'tariff_zone',
    'tariff_zone_code', v_quote ->> 'tariff_zone_code',
    'base_tariff', nullif(v_quote ->> 'base_tariff', '')::bigint,
    'included_kg', nullif(v_quote ->> 'included_kg', '')::numeric,
    'extra_per_kg', nullif(v_quote ->> 'extra_per_kg', '')::bigint,
    'commitment_min_ways', nullif(v_quote ->> 'commitment_min_ways', '')::integer,
    'commitment_refund_per_way', nullif(v_quote ->> 'commitment_refund_per_way', '')::bigint,
    'chargeable_weight_kg', nullif(v_quote ->> 'chargeable_weight_kg', '')::numeric,
    'extra_kg', nullif(v_quote ->> 'extra_kg', '')::numeric,
    'weight_surcharge', nullif(v_quote ->> 'weight_surcharge', '')::bigint,
    'gross_system_delivery_charge', nullif(v_quote ->> 'gross_system_delivery_charge', '')::bigint,
    'commitment_refund', nullif(v_quote ->> 'commitment_refund', '')::bigint,
    'net_system_delivery_charge', nullif(v_quote ->> 'net_system_delivery_charge', '')::bigint,
    'effective_declared_delivery_charge', nullif(v_quote ->> 'effective_declared_delivery_charge', '')::bigint,
    'delivery_difference', nullif(v_quote ->> 'delivery_difference', '')::bigint,
    'settlement_direction', v_quote ->> 'settlement_direction',
    'merchant_settlement_adjustment', nullif(v_quote ->> 'merchant_settlement_adjustment', '')::bigint,
    'merchant_final_settlement_amount', nullif(v_quote ->> 'merchant_final_settlement_amount', '')::bigint,
    'validation_status', v_quote ->> 'validation_status',
    'validation_message', v_quote ->> 'validation_message',
    'calculation_version', v_quote ->> 'calculation_version',
    'calculated_at', nullif(v_quote ->> 'calculated_at', '')::timestamptz
  );

  return jsonb_build_object(
    'ok', coalesce(v_quote ->> 'validation_status','ERROR') <> 'ERROR',
    'build', 'DATA_ENTRY_FINANCIAL_V2_ALL_MERCHANTS_V61_3_3_2026_08_02',
    'generated_at', now(),
    'data', v_row,
    'warnings',
      (case when v_quote ->> 'validation_status' = 'REVIEW'
        then jsonb_build_array(jsonb_build_object(
          'code','FINANCIAL_REVIEW_REQUIRED','message',v_quote ->> 'validation_message'
        )) else '[]'::jsonb end)
      ||
      (case when not v_profile_found
        then jsonb_build_array(jsonb_build_object(
          'code','UNREGISTERED_MERCHANT_TIER_USED',
          'message','The merchant has no Financial V2 profile. The selected STANDARD, ROYAL, or COMMITMENT tier was used for this calculation.'
        )) else '[]'::jsonb end),
    'errors', case when v_quote ->> 'validation_status' = 'ERROR'
      then jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_VALIDATION_ERROR','message',v_quote ->> 'validation_message'
      )) else '[]'::jsonb end,
    'server_resolution', jsonb_build_object(
      'merchant_registration_status',v_registration_status,
      'customer_tier_source',v_tier_source,
      'resolved_customer_tier',v_resolved_tier,
      'backend_monthly_ways',v_monthly,
      'client_customer_tier_ignored',v_profile_found and (v_payload ? 'customer_tier'),
      'client_customer_tier_used',not v_profile_found,
      'inactive_or_blocked_profile_preserved',true,
      'calculation_source','be_calculate_parcel_financial_v2'
    ),
    'access', v_access
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_calculate_v13_2_legacy(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_result jsonb;
  v_data jsonb;
  v_quote jsonb;
  v_resolution jsonb;
  v_update_access jsonb;
  v_type text := upper(nullif(btrim(coalesce(p_payload->>'amount_entry_type','')),''));
  v_requested_tier text := upper(nullif(btrim(coalesce(p_payload->>'customer_tier','')),''));
  v_provider_code text := upper(nullif(btrim(coalesce(p_payload->>'service_provider_code','')),''));
  v_override_requested boolean := lower(coalesce(p_payload->>'customer_tier_override','false')) in ('true','1','yes','on');
  v_registered boolean := false;
  v_monthly integer := 0;
  v_additional bigint := 0;
  v_ok boolean := false;
begin
  v_result := public.be_data_entry_financial_v2_calculate_v61_3_3_legacy(v_payload);
  if not coalesce((v_result->>'ok')::boolean,false) then
    return v_result;
  end if;

  if v_type = 'OPAQUE_COD_COLLECTION' then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','OPAQUE_COD_RETIRED','field','amount_entry_type',
        'message','Unclassified COD collection is retired. Use Exact Collection Amount and enter the exact receiver total.'
      ))
    );
  end if;

  v_additional := coalesce(nullif(btrim(coalesce(p_payload->>'additional_customer_charge','')),'')::bigint,0);
  if v_additional <> 0 then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','ADDITIONAL_CUSTOMER_CHARGE_RETIRED','field','additional_customer_charge',
        'message','Additional customer charge is retired for new Data Entry calculations and must be zero.'
      ))
    );
  end if;

  if v_provider_code is not null and not exists (
    select 1 from public.be_data_entry_service_providers p
    where p.provider_code=v_provider_code and p.is_active
  ) then
    return v_result || jsonb_build_object(
      'ok',false,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','SERVICE_PROVIDER_INVALID','field','service_provider_code',
        'message','Select an active service provider.'
      ))
    );
  end if;

  v_resolution := coalesce(v_result->'server_resolution','{}'::jsonb);
  v_registered := coalesce(v_resolution->>'merchant_registration_status','')='REGISTERED_ACTIVE_PROFILE';
  v_monthly := coalesce(nullif(v_resolution->>'backend_monthly_ways','')::integer,0);

  if v_override_requested and v_registered then
    if v_requested_tier not in ('STANDARD','ROYAL','COMMITMENT') then
      return v_result || jsonb_build_object(
        'ok',false,
        'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
        'errors',jsonb_build_array(jsonb_build_object(
          'code','INVALID_TIER_OVERRIDE','field','customer_tier',
          'message','Tier override must be STANDARD, ROYAL, or COMMITMENT.'
        ))
      );
    end if;

    v_update_access := public.be_data_entry_require_access_v57('update',false);
    v_quote := public.be_calculate_parcel_financial_v2(
      nullif(btrim(v_payload->>'township'),''),
      v_requested_tier,
      v_type,
      nullif(btrim(v_payload->>'item_price'),'')::bigint,
      nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,
      nullif(btrim(v_payload->>'merchant_stated_total_amount'),'')::bigint,
      0,
      coalesce(nullif(btrim(v_payload->>'cbm_surcharge'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'other_surcharge'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0),
      coalesce(nullif(btrim(v_payload->>'weight_kg'),'')::numeric,0),
      v_monthly
    );

    v_data := coalesce(v_result->'data','{}'::jsonb)
      || v_quote
      || jsonb_build_object(
        'customer_tier',v_requested_tier,
        'additional_customer_charge',0,
        'service_provider_code',v_provider_code
      );
    v_ok := coalesce(v_quote->>'validation_status','ERROR') <> 'ERROR';
    v_resolution := v_resolution || jsonb_build_object(
      'customer_tier_source','AUTHORIZED_DATA_ENTRY_UPDATE_OVERRIDE',
      'resolved_customer_tier',v_requested_tier,
      'client_customer_tier_ignored',false,
      'client_customer_tier_used',true,
      'tier_override_applied',true,
      'tier_override_access',v_update_access
    );

    return v_result || jsonb_build_object(
      'ok',v_ok,
      'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
      'data',v_data,
      'server_resolution',v_resolution,
      'warnings',coalesce(v_result->'warnings','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'code','AUTHORIZED_TIER_OVERRIDE_APPLIED',
        'message','The merchant profile tier was overridden for this parcel by a user with Data Entry update access.'
      )),
      'errors',case when v_ok then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'code','FINANCIAL_VALIDATION_ERROR','message',v_quote->>'validation_message'
      )) end
    );
  end if;

  v_data := coalesce(v_result->'data','{}'::jsonb) || jsonb_build_object(
    'additional_customer_charge',0,
    'service_provider_code',v_provider_code
  );
  return v_result || jsonb_build_object(
    'build','DATA_ENTRY_FINANCIAL_RECONCILIATION_V13_2_20260902',
    'data',v_data,
    'server_resolution',v_resolution || jsonb_build_object('tier_override_applied',false)
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_calculate_v13_2_legacy(jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_calculate_v19_legacy(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_item_price numeric := case
    when btrim(coalesce(p_payload->>'item_price','')) ~ '^[0-9]+([.][0-9]+)?$'
      then (p_payload->>'item_price')::numeric
    else null
  end;
  v_route jsonb := public.be_data_entry_delivery_route_v26(p_payload->>'township',v_item_price,p_payload->>'delivery_address',p_payload->>'service_provider_code');
  v_station jsonb := public.be_data_entry_handoff_station_v19(
    p_payload->>'handoff_station_code',p_payload->>'handoff_station_name'
  );
  v_provider text := nullif(v_route->>'provider_code','');
  v_requested_provider text := upper(nullif(btrim(coalesce(p_payload->>'service_provider_code','')),''));
  v_result jsonb;
  v_data jsonb;
  v_resolution jsonb;
  v_warnings jsonb;
begin
  if v_provider is null then
    return jsonb_build_object(
      'ok',false,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','DELIVERY_ROUTE_UNRESOLVED','field','township',
        'message','Enter a recognized township before calculating.'
      )),'data','{}'::jsonb,'server_resolution',jsonb_build_object('delivery_route',v_route)
    );
  end if;
  if coalesce((v_route->>'station_required')::boolean,false)
     and not coalesce((v_station->>'valid')::boolean,false) then
    return jsonb_build_object(
      'ok',false,'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
      'errors',jsonb_build_array(jsonb_build_object(
        'code','HIGHWAY_HANDOFF_STATION_REQUIRED','field','handoff_station_code',
        'message','Choose Aung Mingalar, Dagon Ayar/Thiri, or enter another highway station before calculating.'
      )),
      'data',jsonb_build_object(
        'service_provider_code',v_provider,'delivery_region',v_route->>'region_code',
        'delivery_route_mode',v_route->>'delivery_mode','location_required',false
      ),
      'server_resolution',jsonb_build_object('delivery_route',v_route,'handoff_station',v_station)
    );
  end if;

  v_payload := v_payload || jsonb_build_object(
    'service_provider_code',v_provider,
    'delivery_region',v_route->>'region_code',
    'delivery_route_mode',v_route->>'delivery_mode',
    'location_required',coalesce((v_route->>'map_required')::boolean,false),
    'handoff_station_code',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'code' else null end,
    'handoff_station_name',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'name' else null end
  );

  if coalesce((v_route->>'station_required')::boolean,false) then v_payload := v_payload || jsonb_build_object('delivery_charges',public.be_manual_handoff_charge(v_payload,v_station->>'code')); end if; v_result := public.be_data_entry_financial_v2_calculate_v13_2_legacy(v_payload);
  v_data := coalesce(v_result->'data','{}'::jsonb)||jsonb_build_object(
    'service_provider_code',v_provider,
    'delivery_region',v_route->>'region_code',
    'delivery_route_mode',v_route->>'delivery_mode',
    'location_required',coalesce((v_route->>'map_required')::boolean,false),
    'handoff_station_code',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'code' else null end,
    'handoff_station_name',case when coalesce((v_route->>'station_required')::boolean,false) then v_station->>'name' else null end
  );
  v_resolution := coalesce(v_result->'server_resolution','{}'::jsonb)||jsonb_build_object(
    'service_provider_code',v_provider,
    'delivery_region',v_route->>'region_code',
    'delivery_route_mode',v_route->>'delivery_mode',
    'map_required',coalesce((v_route->>'map_required')::boolean,false),
    'station_required',coalesce((v_route->>'station_required')::boolean,false),
    'delivery_route',v_route,
    'handoff_station',case when coalesce((v_route->>'station_required')::boolean,false) then v_station else null end,
    'client_service_provider_ignored',v_requested_provider is distinct from v_provider
  );
  v_warnings := coalesce(v_result->'warnings','[]'::jsonb);
  if v_requested_provider is not null and v_requested_provider is distinct from v_provider then
    v_warnings := v_warnings||jsonb_build_array(jsonb_build_object(
      'code','SERVICE_PROVIDER_AUTO_CORRECTED',
      'message','The service provider was corrected from the authoritative region and item-price routing rule.',
      'requested_provider',v_requested_provider,'resolved_provider',v_provider
    ));
  end if;

  return v_result||jsonb_build_object(
    'build','DATA_ENTRY_DELIVERY_ROUTING_WAYPLAN_REGIONS_V19_20260903',
    'data',v_data,'server_resolution',v_resolution,'warnings',v_warnings
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_calculate_v19_legacy(jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_reconcile_declared_delivery_v21(p_merchant_id text, p_amount_entry_type text, p_item_price bigint, p_delivery_charges bigint, p_backend_surcharges bigint, p_standard_britium_entitlement bigint, p_merchant_payable_charges bigint DEFAULT 0, p_other_merchant_credits bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type text := upper(btrim(coalesce(p_amount_entry_type,'')));
  v_receiver_delivery bigint := coalesce(p_delivery_charges,0) + coalesce(p_backend_surcharges,0);
  v_britium_entitlement bigint;
  v_difference bigint;
  v_cod bigint;
  v_settlement bigint;
begin
  v_britium_entitlement := case
    when upper(btrim(coalesce(p_merchant_id,''))) = 'GSK'
      then round(coalesce(p_delivery_charges,0)::numeric * 0.45)::bigint
    else coalesce(p_standard_britium_entitlement,0)
  end;

  v_difference := v_receiver_delivery - v_britium_entitlement;
  v_cod := case
    when v_type = 'DELIVERY_CHARGE_ONLY' then v_receiver_delivery
    else coalesce(p_item_price,0) + v_receiver_delivery
  end;
  v_settlement := case
    when v_type = 'DELIVERY_CHARGE_ONLY' then 0
    else coalesce(p_item_price,0)
  end + v_difference
    + coalesce(p_other_merchant_credits,0)
    - coalesce(p_merchant_payable_charges,0);

  return jsonb_build_object(
    'cod_amount',v_cod,
    'customer_payable_delivery_component',v_receiver_delivery,
    'effective_declared_delivery_charge',v_receiver_delivery,
    'net_system_delivery_charge',v_britium_entitlement,
    'delivery_difference',v_difference,
    'merchant_settlement_adjustment',v_difference,
    'merchant_final_settlement_amount',v_settlement,
    'settlement_direction',case
      when v_difference > 0 then 'CREDIT_TO_MERCHANT'
      when v_difference < 0 then 'DEDUCT_FROM_MERCHANT'
      else 'NO_ADJUSTMENT'
    end,
    'britium_entitlement_rule',case
      when upper(btrim(coalesce(p_merchant_id,''))) = 'GSK' then 'GSK_OS_SET_PRICE_45_PERCENT'
      else 'STANDARD_TARIFF'
    end,
    'calculation_version','DECLARED_DELIVERY_RECONCILIATION_V21'
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_reconcile_declared_delivery_v21(text,text,bigint,bigint,bigint,bigint,bigint,bigint) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_calculate_v21_legacy(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_result jsonb;
  v_data jsonb;
  v_reconciled jsonb;
  v_type text := upper(nullif(btrim(coalesce(p_payload->>'amount_entry_type','')),''));
begin
  v_result := public.be_data_entry_financial_v2_calculate_v19_legacy(v_payload);
  if not coalesce((v_result->>'ok')::boolean,false)
     or v_type not in (
       'ITEM_PRICE_PLUS_DECLARED_DELIVERY',
       'TOTAL_AMOUNT_INCLUDING_DELIVERY',
       'DELIVERY_CHARGE_ONLY'
     ) then
    return v_result;
  end if;

  v_data := coalesce(v_result->'data','{}'::jsonb);
  v_reconciled := public.be_reconcile_declared_delivery_v21(
    v_payload->>'merchant_id',
    v_type,
    coalesce(nullif(btrim(v_payload->>'item_price'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,0),
    greatest(coalesce(nullif(v_data->>'backend_calculated_delivery_surcharges','')::bigint,0),coalesce(nullif(v_data->>'weight_surcharge','')::bigint,0)),
    coalesce(nullif(v_data->>'net_system_delivery_charge','')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0)
  );

  return v_result || jsonb_build_object(
    'build','DATA_ENTRY_DECLARED_DELIVERY_RECONCILIATION_V21_20260904',
    'data',v_data || v_reconciled || jsonb_build_object(
      'validation_message','Ready. Receiver COD uses item price plus the OS-set delivery price and explicit surcharges only. The delivery difference is applied once, to merchant settlement.'
    )
  );
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_calculate_v21_legacy(jsonb) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_royal_commission_v27(p_township text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_key text := public.be_data_entry_destination_key_v17(p_township);
  v_tariff bigint;
begin
  select t.standard_rate_mmk into v_tariff
  from public.be_data_entry_tariff_catalog t
  where t.is_active and upper(t.provider_code)='ROYAL EXPRESS'
    and (public.be_data_entry_destination_key_v17(t.destination_key)=v_key
      or public.be_data_entry_destination_key_v17(t.destination_name)=v_key)
  order by t.updated_at desc limit 1;
  return jsonb_build_object(
    'matched',v_tariff is not null,'normal_tariff_mmk',v_tariff,
    'commission_rate_percent',15,
    'commission_mmk',case when v_tariff is null then 0 else round(v_tariff::numeric*0.15)::bigint end,
    'rule','ROYAL_PARTNER_NORMAL_TARIFF_15_PERCENT');
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_royal_commission_v27(text) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.be_data_entry_financial_v2_calculate(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_payload jsonb := public.be_normalize_prepaid_input(p_payload);
  v_result jsonb; v_data jsonb; v_reconciled jsonb; v_royal jsonb;
  v_type text := upper(v_payload->>'amount_entry_type');
  v_provider text;
  v_merchant text := upper(btrim(coalesce(p_payload->>'merchant_id','')));
begin
  PERFORM public.be_data_entry_require_access_v57('create',false); -- UAT-only access enforcement


  if v_merchant in ('BBB','BLK') then
    v_merchant:=public.be_resolve_bulk_merchant_name(v_payload->>'source_merchant_name');
    if v_merchant is null then
      return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('code','CONSOLIDATED_SOURCE_MERCHANT_REQUIRED','field','source_merchant_name','message','Original merchant "'||coalesce(v_payload->>'source_merchant_name','')||'" needs a unique approved name/code mapping.')));
    end if;
    v_payload:=v_payload||jsonb_build_object('merchant_id',v_merchant,'container_merchant_code',v_merchant);
  end if;
  v_result := public.be_data_entry_financial_v2_calculate_v21_legacy(v_payload);
  if v_payload->>'container_merchant_code' in ('BBB','BLK') and coalesce((v_result->>'ok')::boolean,false) then
    v_result := jsonb_set(v_result,'{data}',coalesce(v_result->'data','{}'::jsonb)||jsonb_build_object(
      'source_merchant_name',v_payload->>'source_merchant_name','container_merchant_code',v_merchant));
  end if;

  if not coalesce((v_result->>'ok')::boolean,false)
     or v_type not in ('ITEM_PRICE_PLUS_DECLARED_DELIVERY','TOTAL_AMOUNT_INCLUDING_DELIVERY','DELIVERY_CHARGE_ONLY') then
    return v_result;
  end if;
  v_data := coalesce(v_result->'data','{}'::jsonb);
  v_provider := upper(btrim(coalesce(v_data->>'service_provider_code',p_payload->>'service_provider_code','')));
  if v_provider<>'ROYAL EXPRESS' or v_merchant='GSK' then return v_result; end if;

  v_royal := public.be_data_entry_royal_commission_v27(coalesce(nullif(v_data->>'township',''),p_payload->>'township'));
  if not coalesce((v_royal->>'matched')::boolean,false) then
    return v_result||jsonb_build_object(
      'build','DATA_ENTRY_ROYAL_PARTNER_COMMISSION_V27_20260905',
      'warnings',coalesce(v_result->'warnings','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'code','ROYAL_COMMISSION_TARIFF_NOT_FOUND',
        'message','The Royal township has no active approved tariff; Britium commission remains zero for review.')),
      'data',v_data||v_royal);
  end if;

  v_reconciled := public.be_reconcile_declared_delivery_v21(
    v_payload->>'merchant_id',v_type,
    coalesce(nullif(btrim(v_payload->>'item_price'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'delivery_charges'),'')::bigint,0),
    coalesce(nullif(v_data->>'backend_calculated_delivery_surcharges','')::bigint,0),
    (v_royal->>'commission_mmk')::bigint,
    coalesce(nullif(btrim(v_payload->>'merchant_payable_charges'),'')::bigint,0),
    coalesce(nullif(btrim(v_payload->>'other_merchant_credits'),'')::bigint,0));

  return v_result||jsonb_build_object(
    'build','DATA_ENTRY_ROYAL_PARTNER_COMMISSION_V27_20260905',
    'data',v_data||v_reconciled||v_royal||jsonb_build_object(
      'royal_partner_tariff_mmk',(v_royal->>'normal_tariff_mmk')::bigint,
      'royal_partner_commission_rate_percent',15,
      'royal_partner_commission_mmk',(v_royal->>'commission_mmk')::bigint,
      'britium_entitlement_rule','ROYAL_PARTNER_NORMAL_TARIFF_15_PERCENT',
      'calculation_version','DECLARED_DELIVERY_RECONCILIATION_ROYAL_V27',
      'validation_message','Ready. Royal Express commission is 15% of the approved normal township tariff and is recorded as Britium entitlement for this way.'));
end
$function$
;
REVOKE ALL ON FUNCTION public.be_data_entry_financial_v2_calculate(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.be_data_entry_financial_v2_calculate(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
