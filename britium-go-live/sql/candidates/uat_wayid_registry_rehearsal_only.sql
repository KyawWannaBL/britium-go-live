-- CI ONLY: structure verified against production pg_catalog on 2026-11-16.
-- No production rows, client grants or permissive policies.
CREATE TABLE public.be_delivery_way_id_registry (
 delivery_way_id text PRIMARY KEY,
 pickup_id text NOT NULL,
 parcel_sequence integer NOT NULL CHECK (parcel_sequence > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT uq_be_delivery_way_pickup_sequence UNIQUE (pickup_id,parcel_sequence)
);
CREATE INDEX ix_be_delivery_way_id_registry_pickup
 ON public.be_delivery_way_id_registry(pickup_id,parcel_sequence);
ALTER TABLE public.be_delivery_way_id_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_delivery_way_id_registry FROM PUBLIC,anon,authenticated;
