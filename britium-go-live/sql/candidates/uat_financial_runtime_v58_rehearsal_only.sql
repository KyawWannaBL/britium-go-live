-- CI ONLY: full structure verified from production pg_catalog 2026-11-16.
-- No activation record, production data, client grants or permissive policies.
CREATE TABLE public.be_data_entry_financial_v2_runtime_v58 (
 singleton boolean NOT NULL DEFAULT true PRIMARY KEY CHECK (singleton),
 mutation_mode text NOT NULL CHECK (mutation_mode IN ('MUTATION_SHADOW','ACTIVE')),
 build text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid,
 change_reason text NOT NULL
);
ALTER TABLE public.be_data_entry_financial_v2_runtime_v58 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_data_entry_financial_v2_runtime_v58 FROM PUBLIC,anon,authenticated;
