
-- Unified Go-Live Smoke Test

select public.be_go_live_system_readiness();

select public.be_submit_pickup_request(
  '{
    "source_portal":"merchant_portal",
    "requester_type":"merchant",
    "merchant_code":"BBG",
    "merchant_name":"Baby Genius",
    "pickup_date":"2026-05-17",
    "pickup_address":"Yangon",
    "pickup_city":"Yangon",
    "parcel_count":15,
    "created_by_name":"Smoke Test"
  }'::jsonb
);

select public.be_supervisor_assign_job(
  '{
    "pickup_way_id":"P0517-BBG-015",
    "rider_id":"RID001",
    "rider_name":"Ko Kyaw Zin Khant",
    "rider_phone":"09-779 052 872",
    "driver_id":"DRV001",
    "driver_name":"Driver Test",
    "helper_id":"HLP001",
    "helper_name":"Helper Test",
    "fleet_id":"FLT001",
    "fleet_label":"YGN-1234",
    "merchant_code":"BBG",
    "merchant_name":"Baby Genius",
    "pickup_address":"Yangon",
    "parcel_count":15,
    "assigned_by_name":"Supervisor Smoke"
  }'::jsonb
);

select public.be_mobile_go_live_snapshot('RID001', '09-779 052 872', 100);

select public.be_mobile_update_job_status(
  '{
    "pickup_way_id":"P0517-BBG-015",
    "action":"verify_pickup",
    "workforce_code":"RID001",
    "name":"Ko Kyaw Zin Khant"
  }'::jsonb
);

select public.be_role_portal_snapshot('supervisor', 'YGN', null, 100);
