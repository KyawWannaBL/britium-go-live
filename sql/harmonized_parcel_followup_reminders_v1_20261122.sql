-- UAT ONLY: due-soon/overdue targeted notifications for assigned parcel follow-up tasks.
-- No notification to ALL riders, all staff, or generic roles.
-- Scheduling is DELIBERATELY NOT ENABLED by this file.
-- Requires: be_parcel_followup_tasks_v1 and existing be_app_notifications.
BEGIN;
CREATE OR REPLACE FUNCTION private.be_parcel_followup_reminder_tick_v1()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
DECLARE v_created integer := 0;
BEGIN
  -- The owner-run pg_cron invocation is the only supported caller.
  -- Do not grant EXECUTE to authenticated or anon.
  INSERT INTO public.be_app_notifications(
    target_user_id, title, message, notification_type, event_type,
    event_key, source_table, source_key, waybill_no, priority, is_read, created_at)
  SELECT
    t.assigned_user_id::text,
    CASE WHEN t.due_at < now() THEN 'Overdue parcel follow-up'
         ELSE 'Parcel follow-up due within 24 hours' END,
    'Way ID '||t.original_delivery_way_id||' | '||t.assigned_department||' | '||
     t.task_type||' | due '||to_char(t.due_at AT TIME ZONE 'Asia/Yangon','YYYY-MM-DD HH24:MI')||
     ' Myanmar time. Open Parcel Follow-Up > My alerts and acknowledge or resolve with evidence.',
    'workflow','PARCEL_FOLLOWUP_TASK',
    'PARCEL_FOLLOWUP:'||t.id::text||
      CASE WHEN t.due_at<now() THEN ':OVERDUE' ELSE ':DUE_SOON' END,
    'be_parcel_followup_tasks_v1',t.id::text,t.original_delivery_way_id,
    CASE WHEN t.due_at < now() THEN 'HIGH' ELSE 'NORMAL' END,
    false,now()
  FROM public.be_parcel_followup_tasks_v1 t
  WHERE t.status<>'RESOLVED' AND t.due_at<=now()+interval '24 hours'
    AND t.assigned_user_id IS NOT NULL
  ON CONFLICT (event_key) DO NOTHING;
  GET DIAGNOSTICS v_created = ROW_COUNT;
  RETURN jsonb_build_object('targeted_reminders_written',v_created);
END $$;
REVOKE ALL ON FUNCTION private.be_parcel_followup_reminder_tick_v1() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.be_parcel_followup_reminder_tick_v1() IS
 'Cron-operated targeted single-recipient in-app reminders. Idempotent due-soon and overdue events. No financial or parcel status writes.';
COMMIT;

-- UAT and explicit rollout gate only: once role-scoped inbox SELECT and notification delivery
-- are verified, enable via an authorized PostgreSQL owner from the Supabase SQL Editor:
-- SELECT cron.schedule('be-parcel-followup-reminders-v1', '*/30 * * * *',
--   $$SELECT private.be_parcel_followup_reminder_tick_v1()$$);
-- Check cron.job_run_details before any production rollout.
