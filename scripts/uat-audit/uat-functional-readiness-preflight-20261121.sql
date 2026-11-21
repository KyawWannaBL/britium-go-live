-- Britium Express — LIVE READ-ONLY UAT Functional RPC Gate (2026-11-21).
-- Never changes tables/functions/passwords. Name-only check, not signature or permission proof.
WITH expected(screen,name) AS (VALUES
 ('Data Entry','be_data_entry_phone_history_v81'),
 ('Data Entry','be_data_entry_staff_progress_v98'),
 ('Data Entry','be_data_entry_financial_v2_schema'),
 ('Data Entry','be_data_entry_financial_v2_runtime_state'),
 ('Data Entry','be_data_entry_tariff_options'),
 ('Data Entry','be_data_entry_service_provider_options_v13'),
 ('Data Entry','be_data_entry_pickup_list_web_v16'),
 ('Data Entry','be_data_entry_merchant_tier_access_v13'),
 ('Data Entry','be_data_entry_registration_state_v1'),
 ('Data Entry','be_delivery_location_batch_v10'),
 ('Data Entry','be_data_entry_registration_delete_v1'),
 ('Data Entry','be_data_entry_photo_waiver_v54'),
 ('Data Entry','be_data_entry_financial_v2_calculate'),
 ('Data Entry','be_review_parcel_photo'),
 ('Data Entry','be_data_entry_financial_v2_save'),
 ('Data Entry','be_data_entry_financial_v2_save_batch_v22'),
 ('Data Entry','be_data_entry_financial_v2_add_registrations'),
 ('Data Entry','be_data_entry_financial_v2_ready_sequences_v137'),
 ('Data Entry','be_data_entry_financial_v2_create_ready_waybill'),
 ('Data Entry','be_delivery_location_review_batch_v23'),
 ('Wayplan','be_wayplan_region_options_v19'),
 ('Wayplan','be_wayplan_visible_queue_v124'),
 ('Wayplan','be_wayplan_command_center'),
 ('Wayplan','be_warehouse_ack_wayplan_handoff_v150'),
 ('Wayplan','be_wayplan_region_set_active_v19'),
 ('Wayplan','be_delete_created_wayplan_v55'),
 ('Wayplan','be_created_wayplan_revision_snapshot_v46'),
 ('Wayplan','be_wayplan_update_status'),
 ('Wayplan','be_dispatch_wayplan_integrity_v12_11'),
 ('Wayplan','be_dispatch_start_wayplan'),
 ('Dispatch','be_dispatch_command_snapshot_v63'),
 ('Dispatch','be_driver_update_delivery_status'),
 ('Dispatch','be_close_dispatch_day')
), inventory AS (
 SELECT screen,name,EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname=expected.name
 ) AS name_exists FROM expected
)
SELECT screen,count(*) AS rpc_names,count(*) FILTER(WHERE name_exists) AS found,count(*) FILTER(WHERE NOT name_exists) AS missing,
array_agg(name ORDER BY name) FILTER(WHERE NOT name_exists) AS missing_names
FROM inventory GROUP BY screen ORDER BY screen;

SELECT
  to_regclass('private.uat_branch_account_roster_20261116') IS NOT NULL AS is_branch_uat,
  (SELECT count(*) FROM auth.users) AS auth_accounts,
  (SELECT count(*) FROM public.be_user_account_registry) AS registry,
  (SELECT count(*) FROM private.uat_branch_account_roster_20261116) AS branch_roster,
  (SELECT count(*) FROM public.be_wayplan_dispatches) AS dispatch_headers,
  (SELECT count(*) FROM public.be_wayplan_dispatch_stops) AS dispatch_stops,
  (SELECT count(*) FROM public.be_data_entry_parcel_details) AS parcel_rows,
  (SELECT count(*) FROM public.be_wayplan_review_v43 WHERE review_status='DRAFT') AS draft_reviews,
  (SELECT count(*) FROM public.be_dispatch_scans_v39) AS dispatch_scans,
  (SELECT count(*) FROM public.be_wayplan_region_runtime_v19 WHERE is_active) AS active_regions;
