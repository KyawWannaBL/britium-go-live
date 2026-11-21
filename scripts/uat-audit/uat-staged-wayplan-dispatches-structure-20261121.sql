-- Britium Express UAT staged structural repair, applied 2026-11-21.
-- This is a reconstruction RECORD, not a complete operational migration.
-- This fails closed if the table already exists. Do not rerun on hosted UAT.
-- Does not restore production triggers, data, grants or operational policies.
BEGIN;
DO $guard$ BEGIN
 IF to_regclass('public.be_wayplan_dispatches') IS NOT NULL THEN
  RAISE EXCEPTION 'be_wayplan_dispatches already exists; refusing to alter it';
 END IF;
END $guard$;
CREATE TABLE public.be_wayplan_dispatches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wayplan_id text NOT NULL,
  dispatch_batch_no text,
  branch_code text DEFAULT 'YGN'::text,
  vehicle_code text,
  vehicle_name text,
  driver_code text,
  driver_name text,
  rider_code text,
  rider_name text,
  helper_code text,
  helper_name text,
  wayplan_status text DEFAULT 'CREATED'::text,
  total_stops integer DEFAULT 0,
  total_parcels integer DEFAULT 0,
  total_cod numeric DEFAULT 0,
  planned_at timestamp with time zone DEFAULT now(),
  dispatched_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_by text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  warehouse_confirmed_at timestamp with time zone,
  rider_confirmed_at timestamp with time zone,
  total_delivered integer DEFAULT 0,
  total_failed integer DEFAULT 0,
  total_cod_collected numeric DEFAULT 0,
  loaded_to_vehicle_at timestamp with time zone,
  handed_over_to_rider_at timestamp with time zone,
  warehouse_actor text,
  warehouse_notes text,
  warehouse_status text,
  warehouse_batch_id text,
  warehouse_ready_at timestamp with time zone,
  warehouse_actor_email text,
  warehouse_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT be_wayplan_dispatches_pkey PRIMARY KEY (id),
  CONSTRAINT be_wayplan_dispatches_wayplan_id_key UNIQUE (wayplan_id)
);
ALTER TABLE public.be_wayplan_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.be_wayplan_dispatches FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.be_wayplan_dispatches IS
 'UAT staged restoration from production column metadata, 2026-11-21. RLS enabled; grants and triggers intentionally withheld pending full dependency and security review.';
COMMIT;

-- The following are read-only post-checks (must show 37 columns, RLS enabled, no app access):
SELECT to_regclass('public.be_wayplan_dispatches')::text AS dispatch_table,
       count(*) AS actual_columns
FROM pg_attribute
WHERE attrelid=to_regclass('public.be_wayplan_dispatches')
  AND attnum>0 AND NOT attisdropped
GROUP BY 1;
SELECT has_table_privilege('authenticated','public.be_wayplan_dispatches','SELECT') AS app_select_granted,
       has_table_privilege('authenticated','public.be_wayplan_dispatches','INSERT') AS app_insert_granted;
