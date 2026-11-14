-- Production candidate: prevent the same delivery Way ID from belonging to
-- two simultaneously live Rider/Driver/Helper Wayplans.
-- Historical COMPLETED and ON_HOLD memberships are preserved.
BEGIN;
CREATE OR REPLACE FUNCTION public.be_unique_active_wayplan_membership_guard_v218()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
 IF upper(coalesce(new.membership_status,'')) IN
    ('PLANNED','READY_FOR_DISPATCH','DISPATCHED') THEN
   PERFORM pg_advisory_xact_lock(hashtext(upper(btrim(new.delivery_way_id)))::bigint);
   IF EXISTS (
     SELECT 1 FROM public.be_wayplan_membership_v40 m
     WHERE upper(m.delivery_way_id)=upper(new.delivery_way_id)
       AND m.id IS DISTINCT FROM new.id
       AND m.wayplan_id IS DISTINCT FROM new.wayplan_id
       AND upper(m.membership_status) IN ('PLANNED','READY_FOR_DISPATCH','DISPATCHED')
   ) THEN
     RAISE EXCEPTION 'ACTIVE_WAY_ALREADY_ASSIGNED_TO_ANOTHER_WAYPLAN: %',new.delivery_way_id
       USING errcode='23505';
   END IF;
 END IF;
 RETURN new;
END;
$fn$;
DROP TRIGGER IF EXISTS be_unique_active_wayplan_membership_guard_v218 ON public.be_wayplan_membership_v40;
CREATE TRIGGER be_unique_active_wayplan_membership_guard_v218
BEFORE INSERT OR UPDATE OF delivery_way_id,membership_status,wayplan_id
ON public.be_wayplan_membership_v40
FOR EACH ROW EXECUTE FUNCTION public.be_unique_active_wayplan_membership_guard_v218();
REVOKE ALL ON FUNCTION public.be_unique_active_wayplan_membership_guard_v218()
FROM PUBLIC,anon,authenticated;
COMMIT;
