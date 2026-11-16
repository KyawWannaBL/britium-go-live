-- CI ONLY: complete missing lineage column group verified in production pg_catalog 2026-11-16.
ALTER TABLE public.be_commission_events
 ADD COLUMN IF NOT EXISTS source_key text,
 ADD COLUMN IF NOT EXISTS merchant_id text,
 ADD COLUMN IF NOT EXISTS merchant_name text,
 ADD COLUMN IF NOT EXISTS referral_assignment_id uuid;
