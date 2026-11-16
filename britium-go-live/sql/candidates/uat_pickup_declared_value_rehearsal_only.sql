-- CI ONLY: verified production column type/default on 2026-11-16.
ALTER TABLE public.be_portal_pickup_requests
 ADD COLUMN IF NOT EXISTS declared_item_value numeric NOT NULL DEFAULT 0;
