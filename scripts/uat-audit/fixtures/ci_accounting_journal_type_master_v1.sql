-- Disposable CI ONLY, production-catalog-verified accounting journal type master.
-- No master rows inserted; the existing historical seed remains authoritative.
CREATE TABLE public.be_accounting_journal_type_master_v1 (
 journal_type text PRIMARY KEY,
 name_en text NOT NULL,
 name_mm text NOT NULL,
 category text NOT NULL DEFAULT 'GENERAL',
 reference_prefix text NOT NULL,
 aliases text[] NOT NULL DEFAULT '{}'::text[],
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.be_accounting_journal_type_master_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_accounting_journal_type_master_v1 FROM PUBLIC,anon,authenticated;
