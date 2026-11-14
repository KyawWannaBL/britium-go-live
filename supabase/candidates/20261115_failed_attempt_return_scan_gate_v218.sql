-- Prevent ANY failed delivery from re-entering Wayplan before the corresponding
-- physical Warehouse Return Scan; preserve future customer-date holds.
-- Uses the existing V71 predicate so all callers share the same safety check.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_delivery_schedule_allows_wayplan_v71(p_delivery_way_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $fn$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.be_delivery_reschedules_v71 r
    WHERE r.status='ACTIVE'
      AND (upper(r.delivery_way_id)=upper(btrim(p_delivery_way_id))
        OR upper(coalesce(r.original_way_id,''))=upper(btrim(p_delivery_way_id)))
      AND (
        r.requested_delivery_date>(now() at time zone 'Asia/Yangon')::date
        OR NOT EXISTS (
          SELECT 1 FROM public.be_warehouse_return_scans_v39 h
          WHERE upper(h.delivery_way_id)=upper(r.delivery_way_id)
        )
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.be_delivery_attempt_state_v39 a
    WHERE upper(a.delivery_way_id)=upper(btrim(p_delivery_way_id))
      AND (
        upper(coalesce(a.last_status,''))='RTO'
        OR (
          upper(coalesce(a.last_status,''))='ATTEMPTED_FAILED'
          AND coalesce(a.consecutive_failures,0) >
            (SELECT count(*) FROM public.be_warehouse_return_scans_v39 h
             WHERE upper(h.delivery_way_id)=upper(a.delivery_way_id))
        )
      )
  );
$fn$;
COMMIT;
