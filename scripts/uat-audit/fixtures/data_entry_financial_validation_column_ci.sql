-- Issue #308 CI-only legacy column dependency.
-- Production pg_catalog confirms public.be_data_entry_parcel_details.financial_validation_status
-- is nullable text with no default. This migration is injected only into disposable
-- GitHub runner checkout, before v12_11 dispatch queue view compilation.
ALTER TABLE public.be_data_entry_parcel_details
  ADD COLUMN IF NOT EXISTS financial_validation_status text;
-- No default VALID: doing so would fabricate financial verification.
