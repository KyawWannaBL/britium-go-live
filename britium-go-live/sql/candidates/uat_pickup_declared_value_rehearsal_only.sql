-- CI ONLY: verified production column type/default on 2026-11-16.
ALTER TABLE public.be_portal_pickup_requests
 ADD COLUMN IF NOT EXISTS declared_item_value numeric NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS cod_policy_status text NOT NULL DEFAULT 'NOT_EVALUATED',
 ADD COLUMN IF NOT EXISTS cod_service_fee_rate numeric NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS cod_service_fee_amount numeric NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS finance_pre_dispatch_status text NOT NULL DEFAULT 'NOT_REQUIRED';
