-- Issue #308: 2026-11-16 verified UAT security hardening.
-- Applied to isolated project hgijdyfwmvskchsruknp ONLY.
-- Documents already-executed fail-closed RLS change; DO NOT run against production.
-- No explicit policies are intentionally provided. Authenticated clients cannot
-- access these tables until per-role policies pass branch-isolation UAT.
BEGIN;
ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disciplinary_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_daily_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tariff_rate_cards ENABLE ROW LEVEL SECURITY;
COMMIT;

-- Read-only verification:
SELECT count(*) AS targeted_tables,
       count(*) FILTER (WHERE c.relrowsecurity) AS rls_enabled,
       count(*) FILTER (WHERE NOT c.relrowsecurity) AS rls_disabled
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
AND c.relname=ANY(ARRAY[
'hr_documents','role_bindings','asset_assignments','delivery_evidence',
'disciplinary_cases','training_records','notifications','document_daily_sequences',
'pickup_batches','delivery_orders','tariff_rate_cards'
]);
