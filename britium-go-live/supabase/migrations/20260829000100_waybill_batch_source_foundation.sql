-- Historical batch Waybill table from data_entry_excel_register_backend.sql.
-- Production catalog verified 2026-11-17: same 12 original columns, plus a later collect total.
-- No operational rows, no grants to public/anon/authenticated.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

create table if not exists public.be_parcel_waybills (
  waybill_id uuid primary key default gen_random_uuid(),
  waybill_no text not null unique default ('WB-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6))),
  pickup_id text not null unique,
  parcel_count integer not null default 0,
  total_item_price numeric(16,2) not null default 0,
  total_delivery_charges numeric(16,2) not null default 0,
  total_cod_amount numeric(16,2) not null default 0,
  status text not null default 'created',
  environment text not null default 'production',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- The historical warehouse receipt view resolves original parcel Way IDs.
-- Production pg_catalog confirms parcels.way_id is an optional text column.
ALTER TABLE public.parcels
 ADD COLUMN IF NOT EXISTS way_id text;

ALTER TABLE public.be_parcel_waybills
 ADD COLUMN IF NOT EXISTS total_collect_amount numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE public.be_parcel_waybills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_parcel_waybills FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.be_parcel_waybills'::regclass)
 THEN RAISE EXCEPTION 'WAYBILL_TABLE_RLS_REQUIRED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='public.be_parcel_waybills'::regclass AND contype='p')
 THEN RAISE EXCEPTION 'WAYBILL_TABLE_PRIMARY_KEY_MISSING'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='public.be_parcel_waybills'::regclass AND contype='u'
     AND pg_get_constraintdef(oid) LIKE '%pickup_id%')
 THEN RAISE EXCEPTION 'WAYBILL_PICKUP_UNIQUENESS_MISSING'; END IF;
END $verify$;
