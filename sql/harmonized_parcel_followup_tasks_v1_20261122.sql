-- UAT ONLY: parcel-action escalation and targeted staff alert inbox.
-- No delivery/custody/finance status updates. Not a payment authorisation.
BEGIN;
CREATE TABLE IF NOT EXISTS public.be_parcel_followup_tasks_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_delivery_way_id text NOT NULL CHECK (length(trim(original_delivery_way_id)) > 0),
  assigned_user_id uuid NOT NULL,
  assigned_department text NOT NULL CHECK (length(trim(assigned_department)) > 0),
  task_type text NOT NULL CHECK(task_type IN ('POD_VERIFICATION','PROVIDER_HANDOVER','RTO_CONFIRMATION','COD_RECONCILIATION','GATE_SETTLEMENT','LOCATION_AND_CUSTODY','OTHER_REVIEW')),
  task_note text NOT NULL CHECK(length(trim(task_note))>=8),
  evidence_reference text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(due_at >= created_at),
  CHECK(status <> 'ACKNOWLEDGED' OR acknowledged_at IS NOT NULL),
  CHECK(status <> 'RESOLVED' OR (resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND length(trim(coalesce(resolution_note,''))) >= 8))
);
CREATE INDEX IF NOT EXISTS be_followup_assignee_status_v1 ON public.be_parcel_followup_tasks_v1(assigned_user_id,status,due_at);
CREATE INDEX IF NOT EXISTS be_followup_way_v1 ON public.be_parcel_followup_tasks_v1(original_delivery_way_id,created_at DESC);
ALTER TABLE public.be_parcel_followup_tasks_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.be_parcel_followup_tasks_v1 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.be_parcel_followup_change_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF ROW(NEW.original_delivery_way_id,NEW.assigned_user_id,NEW.assigned_department,NEW.task_type,
     NEW.task_note,NEW.evidence_reference,NEW.created_by,NEW.created_at,NEW.due_at) IS DISTINCT FROM
     ROW(OLD.original_delivery_way_id,OLD.assigned_user_id,OLD.assigned_department,OLD.task_type,
     OLD.task_note,OLD.evidence_reference,OLD.created_by,OLD.created_at,OLD.due_at)
    THEN RAISE EXCEPTION 'Task assignment evidence is immutable; create a new escalation'; END IF;
  IF OLD.status='RESOLVED' THEN RAISE EXCEPTION 'Resolved task is immutable'; END IF;
  IF OLD.status='OPEN' AND NEW.status='ACKNOWLEDGED' THEN
    IF NEW.acknowledged_by IS DISTINCT FROM (SELECT auth.uid())
       OR NEW.acknowledged_by IS DISTINCT FROM OLD.assigned_user_id
       OR NEW.acknowledged_at IS NULL THEN RAISE EXCEPTION 'Only the assigned user may acknowledge'; END IF;
  ELSIF OLD.status IN ('OPEN','ACKNOWLEDGED') AND NEW.status='RESOLVED' THEN
    IF NEW.resolved_by IS DISTINCT FROM (SELECT auth.uid()) OR NEW.resolved_at IS NULL
       OR length(trim(coalesce(NEW.resolution_note,'')))<8
       THEN RAISE EXCEPTION 'Resolution requires assigned accountable actor and documented outcome'; END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported task state transition';
  END IF;
  NEW.updated_at=now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.be_parcel_followup_change_guard_v1() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS be_parcel_followup_change_guard_v1 ON public.be_parcel_followup_tasks_v1;
CREATE TRIGGER be_parcel_followup_change_guard_v1 BEFORE UPDATE
  ON public.be_parcel_followup_tasks_v1 FOR EACH ROW EXECUTE FUNCTION public.be_parcel_followup_change_guard_v1();

CREATE POLICY be_followup_select_v1 ON public.be_parcel_followup_tasks_v1 FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IN (assigned_user_id,created_by)
 OR replace(lower(coalesce(public.be_current_role(),'')),'-','_')
  IN ('superadmin','super_admin'));

CREATE POLICY be_followup_create_v1 ON public.be_parcel_followup_tasks_v1 FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid())=created_by
  AND status='OPEN'
  AND replace(lower(coalesce(public.be_current_role(),'')),'-','_')
     IN ('superadmin','super_admin')
  AND EXISTS (SELECT 1 FROM public.be_data_entry_parcel_details d WHERE d.delivery_way_id=original_delivery_way_id
   AND coalesce(d.parcel_status,'') <> 'duplicate_archived')
  AND EXISTS (SELECT 1 FROM public.be_user_account_registry u WHERE u.auth_user_id=assigned_user_id
    AND coalesce(u.is_active,true)=true)
);

CREATE POLICY be_followup_update_v1 ON public.be_parcel_followup_tasks_v1 FOR UPDATE TO authenticated
USING ((SELECT auth.uid())=assigned_user_id)
WITH CHECK ((SELECT auth.uid())=assigned_user_id);
GRANT SELECT ON public.be_parcel_followup_tasks_v1 TO authenticated;
GRANT INSERT(original_delivery_way_id,assigned_user_id,assigned_department,task_type,
  task_note,evidence_reference,created_by,due_at) ON public.be_parcel_followup_tasks_v1 TO authenticated;
GRANT UPDATE(status,acknowledged_at,acknowledged_by,resolved_at,resolved_by,resolution_note)
  ON public.be_parcel_followup_tasks_v1 TO authenticated;
COMMENT ON TABLE public.be_parcel_followup_tasks_v1 IS
 'Targeted in-app accountability queue. No broadcast, no off-platform email/push assumed. Acknowledgment/resolution never changes parcel status or finance.';
COMMIT;
