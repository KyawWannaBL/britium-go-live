-- 1. Ensure the COD settlements table exists
CREATE TABLE IF NOT EXISTS public.cod_settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_number TEXT UNIQUE NOT NULL,
    cod_amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending'
);

-- 2. Enable Row Level Security
ALTER TABLE public.cod_settlements ENABLE ROW LEVEL SECURITY;

-- 3. Restrict COD updates exclusively to the finance role
CREATE POLICY "Finance can update COD settlements"
ON public.cod_settlements
FOR UPDATE
USING (
  (auth.jwt() ->> 'user_role') = 'finance'
)
WITH CHECK (
  (auth.jwt() ->> 'user_role') = 'finance'
);

-- 4. Allow general read access for the dispatch boards
CREATE POLICY "Operations can view settlements"
ON public.cod_settlements FOR SELECT USING (true);
