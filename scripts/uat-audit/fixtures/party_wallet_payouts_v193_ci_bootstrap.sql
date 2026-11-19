-- Disposable CI ONLY: original workforce/party payout register v193.
-- Verified with production catalog: no payouts created, browser roles denied.
CREATE TABLE IF NOT EXISTS public.be_party_wallet_payouts_v193 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 wallet_id uuid NOT NULL REFERENCES public.be_party_wallet_accounts(id),
 party_type text NOT NULL,
 party_key text NOT NULL,
 party_name text,
 payment_reference text NOT NULL UNIQUE,
 payment_method text NOT NULL,
 recipient text NOT NULL,
 amount numeric(18,2) NOT NULL
  CONSTRAINT be_party_wallet_payouts_v193_amount_check CHECK (amount > 0),
 paid_at timestamptz NOT NULL DEFAULT now(),
 paid_by uuid,
 paid_by_email text,
 status text NOT NULL DEFAULT 'CONFIRMED',
 note text,
 ledger_ids uuid[] NOT NULL,
 accounting_event_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.be_party_wallet_payouts_v193 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_party_wallet_payouts_v193 FROM PUBLIC,anon,authenticated;
