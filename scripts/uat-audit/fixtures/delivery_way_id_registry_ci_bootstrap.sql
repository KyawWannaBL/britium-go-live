-- UAT-308: disposable CI-only reconstruction of the production catalog-verified
-- canonical delivery Way ID registry. No real Way IDs or parcel rows are inserted.
-- Do not apply this fixture to hosted UAT or production.
CREATE TABLE IF NOT EXISTS public.be_delivery_way_id_registry (
  delivery_way_id text NOT NULL PRIMARY KEY,
  pickup_id text NOT NULL,
  parcel_sequence integer NOT NULL CHECK (parcel_sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_be_delivery_way_pickup_sequence UNIQUE (pickup_id, parcel_sequence)
);
CREATE INDEX IF NOT EXISTS ix_be_delivery_way_id_registry_pickup
  ON public.be_delivery_way_id_registry (pickup_id, parcel_sequence);
ALTER TABLE public.be_delivery_way_id_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_delivery_way_id_registry FROM PUBLIC, anon, authenticated;
