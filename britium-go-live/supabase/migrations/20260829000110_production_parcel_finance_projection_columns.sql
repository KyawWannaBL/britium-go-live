-- Britium UAT historical schema gap: finance projection trigger's source attributes.
-- Verified read-only against production pg_attribute on 2026-11-17, exact 16 columns.
-- No customer records, no financial entries, no privileges widened.
ALTER TABLE public.parcels
 ADD COLUMN IF NOT EXISTS way_id text,
 ADD COLUMN IF NOT EXISTS tracking_code text NOT NULL,
 ADD COLUMN IF NOT EXISTS merchant_id text,
 ADD COLUMN IF NOT EXISTS township text,
 ADD COLUMN IF NOT EXISTS customer_tier text,
 ADD COLUMN IF NOT EXISTS amount_entry_type text,
 ADD COLUMN IF NOT EXISTS item_price numeric(14,2) DEFAULT 0,
 ADD COLUMN IF NOT EXISTS delivery_charges numeric(14,2) DEFAULT 0,
 ADD COLUMN IF NOT EXISTS merchant_stated_total_amount bigint,
 ADD COLUMN IF NOT EXISTS additional_customer_charge bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS cbm_surcharge bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS other_surcharge bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS merchant_payable_charges bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS other_merchant_credits bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS weight_kg numeric(8,2) DEFAULT 0,
 ADD COLUMN IF NOT EXISTS monthly_ways integer;

DO $verify$
DECLARE v_name text; v_type text; v_actual text;
BEGIN
 FOR v_name,v_type IN SELECT expected_col,expected_type FROM (VALUES
  ('way_id','text'),
  ('tracking_code','text'),
  ('merchant_id','text'),
  ('township','text'),
  ('customer_tier','text'),
  ('amount_entry_type','text'),
  ('item_price','numeric(14,2)'),
  ('delivery_charges','numeric(14,2)'),
  ('merchant_stated_total_amount','bigint'),
  ('additional_customer_charge','bigint'),
  ('cbm_surcharge','bigint'),
  ('other_surcharge','bigint'),
  ('merchant_payable_charges','bigint'),
  ('other_merchant_credits','bigint'),
  ('weight_kg','numeric(8,2)'),
  ('monthly_ways','integer')
 ) AS x(expected_col,expected_type) LOOP
  SELECT format_type(a.atttypid,a.atttypmod) INTO v_actual
  FROM pg_attribute a WHERE a.attrelid='public.parcels'::regclass
   AND a.attname=v_name AND NOT a.attisdropped;
  IF v_actual IS DISTINCT FROM v_type THEN
    RAISE EXCEPTION 'PARCEL_FINANCE_SCHEMA_MISMATCH: % expected %, got %',v_name,v_type,v_actual;
  END IF;
 END LOOP;
END $verify$;
