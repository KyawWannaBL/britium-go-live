-- Disposable CI ONLY. Catalog-verified employee commission eligibility ledger.
-- Empty by design: no employment or commission eligibility is fabricated.
CREATE TABLE IF NOT EXISTS public.be_employee_commission_eligibility (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 employee_id text,
 employee_email text NOT NULL,
 employee_name text,
 employed_from date NOT NULL,
 employed_to date,
 employment_status text NOT NULL DEFAULT 'ACTIVE',
 source text NOT NULL DEFAULT 'HR_SYNC',
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT be_employee_commission_eligibility_check CHECK (employed_to IS NULL OR employed_to >= employed_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS be_employee_commission_eligibility_period_uidx
 ON public.be_employee_commission_eligibility (lower(employee_email), employed_from);
CREATE INDEX IF NOT EXISTS be_employee_commission_eligibility_lookup_idx
 ON public.be_employee_commission_eligibility (lower(employee_email), employed_from, employed_to);
ALTER TABLE public.be_employee_commission_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_employee_commission_eligibility FROM PUBLIC,anon,authenticated;
