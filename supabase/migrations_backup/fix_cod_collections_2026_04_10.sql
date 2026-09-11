-- Drop and recreate COD collections table with correct status
DROP TABLE IF EXISTS public.cod_collections CASCADE;

-- COD Collections table
CREATE TABLE public.cod_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID REFERENCES public.deliveries(id) NOT NULL,
  shipment_id UUID REFERENCES public.shipments(id) NOT NULL,
  driver_id UUID REFERENCES public.user_profiles(id) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  deposited_at TIMESTAMPTZ,
  deposit_reference TEXT,
  status TEXT DEFAULT 'collected',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cod_collections_driver ON public.cod_collections(driver_id);
CREATE INDEX idx_cod_collections_status ON public.cod_collections(status);
CREATE INDEX idx_cod_collections_collected_at ON public.cod_collections(collected_at DESC);

ALTER TABLE public.cod_collections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for COD Collections
CREATE POLICY "Drivers can view their COD collections"
  ON public.cod_collections FOR SELECT
  USING (
    driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'finance', 'branch-office')
    )
  );

CREATE POLICY "Drivers can create COD collections"
  ON public.cod_collections FOR INSERT
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Finance can manage COD collections"
  ON public.cod_collections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND role IN ('super-admin', 'admin', 'finance', 'branch-office')
    )
  );

CREATE TRIGGER update_cod_collections_updated_at BEFORE UPDATE ON public.cod_collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();