-- Production cleanup: remove only exact duplicate, non-constraint indexes.
-- Each dropped index has an equivalent surviving index on the same expression/columns.

DROP INDEX IF EXISTS public.idx_be_notifications_pickup_id;

DROP INDEX IF EXISTS public.idx_be_pickup_request_items_pickup_id;
DROP INDEX IF EXISTS public.idx_pickup_request_items_pickup_id;
DROP INDEX IF EXISTS public.ix_be_portal_items_pickup_id;

DROP INDEX IF EXISTS public.idx_be_workforce_email_lower;
DROP INDEX IF EXISTS public.be_mwa_role_active_idx;

DROP INDEX IF EXISTS public.be_portal_cargo_events_pickup_idx;
DROP INDEX IF EXISTS public.idx_be_portal_events_pickup;
DROP INDEX IF EXISTS public.be_events_pickup_idx;
DROP INDEX IF EXISTS public.idx_be_cargo_pickup_created;

DROP INDEX IF EXISTS public.idx_be_pickup_assigned_email_lower;
DROP INDEX IF EXISTS public.idx_be_pickup_assigned_rider_code_upper;
DROP INDEX IF EXISTS public.idx_be_portal_pickup_branch;
DROP INDEX IF EXISTS public.idx_be_portal_pickup_merchant;

DROP INDEX IF EXISTS public.idx_be_delivery_jobs_wayplan;

DROP INDEX IF EXISTS public.be_rider_delivery_events_job_idx;
DROP INDEX IF EXISTS public.be_rider_delivery_events_rider_idx;
DROP INDEX IF EXISTS public.be_rider_delivery_events_way_idx;

DROP INDEX IF EXISTS public.be_rider_live_locations_seen_idx;
DROP INDEX IF EXISTS public.idx_be_supervisor_job_assignments_pickup;

DROP INDEX IF EXISTS public.idx_be_wayplan_stops_status;
DROP INDEX IF EXISTS public.idx_be_wayplan_stops_wayplan_id;
