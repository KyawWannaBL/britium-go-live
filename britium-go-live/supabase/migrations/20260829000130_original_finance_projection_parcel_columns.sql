-- Original September Finance V4.1 projection parcel attribute dependencies.
-- Definitions derived read-only from production catalog, no data or grants.
ALTER TABLE public.parcels
 ADD COLUMN IF NOT EXISTS base_tariff bigint,
 ADD COLUMN IF NOT EXISTS calculated_at timestamp with time zone,
 ADD COLUMN IF NOT EXISTS calculation_version text NOT NULL DEFAULT 'PARCEL_FINANCIAL_V2'::text,
 ADD COLUMN IF NOT EXISTS collect_amount numeric(14,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS commitment_refund bigint,
 ADD COLUMN IF NOT EXISTS delivery_difference bigint,
 ADD COLUMN IF NOT EXISTS financial_locked_at timestamp with time zone,
 ADD COLUMN IF NOT EXISTS financial_settled_at timestamp with time zone,
 ADD COLUMN IF NOT EXISTS financial_settlement_batch_id uuid,
 ADD COLUMN IF NOT EXISTS gross_system_delivery_charge bigint,
 ADD COLUMN IF NOT EXISTS merchant_final_settlement_amount bigint,
 ADD COLUMN IF NOT EXISTS merchant_settlement_adjustment bigint,
 ADD COLUMN IF NOT EXISTS net_system_delivery_charge bigint,
 ADD COLUMN IF NOT EXISTS settlement_direction text,
 ADD COLUMN IF NOT EXISTS validation_message text,
 ADD COLUMN IF NOT EXISTS validation_status text,
 ADD COLUMN IF NOT EXISTS weight_surcharge bigint;

DO $verify$
DECLARE v_record record; v_actual text;
BEGIN
 FOR v_record IN SELECT * FROM (VALUES
 ('additional_customer_charge','bigint'),
 ('amount_entry_type','text'),
 ('base_tariff','bigint'),
 ('calculated_at','timestamp with time zone'),
 ('calculation_version','text'),
 ('cbm_surcharge','bigint'),
 ('cod_amount','integer'),
 ('collect_amount','numeric(14,2)'),
 ('commitment_refund','bigint'),
 ('created_at','timestamp with time zone'),
 ('customer_tier','text'),
 ('delivery_charges','numeric(14,2)'),
 ('delivery_difference','bigint'),
 ('financial_locked_at','timestamp with time zone'),
 ('financial_settled_at','timestamp with time zone'),
 ('financial_settlement_batch_id','uuid'),
 ('gross_system_delivery_charge','bigint'),
 ('id','uuid'),
 ('item_price','numeric(14,2)'),
 ('merchant_final_settlement_amount','bigint'),
 ('merchant_id','text'),
 ('merchant_settlement_adjustment','bigint'),
 ('net_system_delivery_charge','bigint'),
 ('other_surcharge','bigint'),
 ('recipient_name','text'),
 ('recipient_phone','text'),
 ('settlement_direction','text'),
 ('status','text'),
 ('township','text'),
 ('validation_message','text'),
 ('validation_status','text'),
 ('weight_surcharge','bigint')
 ) AS expected(name,typ) LOOP
 SELECT format_type(a.atttypid,a.atttypmod) INTO v_actual
 FROM pg_attribute a WHERE a.attrelid='public.parcels'::regclass
 AND a.attname=v_record.name AND NOT a.attisdropped;
 IF v_actual IS DISTINCT FROM v_record.typ
 THEN RAISE EXCEPTION 'FINANCE_PROJECTION_COLUMN_DRIFT: % expected %, got %',v_record.name,v_record.typ,v_actual; END IF;
 END LOOP;
END $verify$;
