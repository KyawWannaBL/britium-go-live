-- Original July 31 merchant financial profile structure, followed by original V2.2 bridge fields.
-- Restored ahead of September finance canonical projection; no merchant data is copied.
create table if not exists public.be_merchant_financial_profiles_v2 (
  merchant_id text primary key,
  customer_tier text not null,
  is_active boolean not null default true,
  effective_from date not null default current_date,
  effective_to date,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint be_merchant_financial_profiles_v2_tier_check
    check (customer_tier in ('STANDARD','ROYAL','COMMITMENT'))
);

ALTER TABLE public.be_merchant_financial_profiles_v2
 ADD COLUMN IF NOT EXISTS merchant_name text,
 ADD COLUMN IF NOT EXISTS counterparty_type text NOT NULL DEFAULT 'MERCHANT',
 ADD COLUMN IF NOT EXISTS settlement_method text,
 ADD COLUMN IF NOT EXISTS settlement_account text,
 ADD COLUMN IF NOT EXISTS settlement_notes text;

DO $constraint$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='public.be_merchant_financial_profiles_v2'::regclass
   AND conname='be_merchant_financial_profiles_v2_counterparty_check') THEN
  ALTER TABLE public.be_merchant_financial_profiles_v2
   ADD CONSTRAINT be_merchant_financial_profiles_v2_counterparty_check
   CHECK (counterparty_type IN ('MERCHANT','ONLINE_SELLER','CUSTOMER_ACCOUNT')) NOT VALID;
 END IF;
END $constraint$;

ALTER TABLE public.be_merchant_financial_profiles_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_merchant_financial_profiles_v2 FROM PUBLIC, anon, authenticated;
DO $verify$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.be_merchant_financial_profiles_v2'::regclass)
 THEN RAISE EXCEPTION 'MERCHANT_FINANCE_PROFILE_RLS_REQUIRED'; END IF;
END $verify$;
