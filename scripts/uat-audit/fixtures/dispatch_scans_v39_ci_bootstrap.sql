-- Issue #308: CI-only historical schema dependency reconstruction.
-- Rebuilt from live production pg_catalog on 2026-11-17.
-- Used exclusively in disposable GitHub Actions local PostgreSQL; never apply to
-- customer/finance data in production or the already existing UAT branch.
-- Exact columns/PK/status constraint and initial secondary indexes are retained.
CREATE TABLE IF NOT EXISTS public.be_dispatch_scans_v39 (
  delivery_way_id text PRIMARY KEY,
  pickup_id text,
  parcel_sequence integer,
  wayplan_code text,
  scan_status text NOT NULL DEFAULT 'SCANNED'
    CONSTRAINT be_dispatch_scans_v39_status_check CHECK (scan_status IN ('SCANNED','REVERSED')),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  scanned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS be_dispatch_scans_v39_pickup_idx
 ON public.be_dispatch_scans_v39(pickup_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS be_dispatch_scans_v39_wayplan_status_idx
 ON public.be_dispatch_scans_v39(wayplan_code, scan_status, delivery_way_id);
ALTER TABLE public.be_dispatch_scans_v39 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.be_dispatch_scans_v39 FROM PUBLIC, anon, authenticated;
