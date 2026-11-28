import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const sql = readFileSync(new URL("../sql/candidates/20261128100000_scheduled_warehouse_return_and_wayplan.sql", import.meta.url), "utf8");

try {
  await db.exec(`
    create schema auth;
    create schema private;
    create role anon;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
    create function public.be_current_role() returns text language sql stable as
      $$select current_setting('test.role',true)$$;
    create function public.be_warehouse_assert_internal() returns text language plpgsql as $$
    begin
      if public.be_current_role() not in ('warehouse','branch_manager') then
        raise exception 'Warehouse operation permission is required';
      end if;
      return public.be_current_role();
    end $$;
    create function public.be_warehouse_actor_email() returns text language sql as $$select 'receiver@example.test'::text$$;
    create function public.be_branch_warehouse_require_way_v1(text,text) returns void language plpgsql as $$
    begin
      if $1 <> 'BRANCH' then raise exception 'wrong branch'; end if;
    end $$;
    create function public.be_branch_warehouse_scope_v1(boolean) returns text language sql as $$select 'MDY'::text$$;
    create function public.be_branch_scope_v1(text) returns text language sql as $$select 'MDY'::text$$;
    create function public.be_branch_require_region_v1(text) returns void language sql as $$select$$;
    create function public.be_branch_parcel_at_v1(text,text) returns boolean language sql as $$select $1='BRANCH'$$;
    create function public.be_resolve_internal_way_id_v70(text,text) returns text language sql as $$select $1$$;
    create function public.be_operational_way_id_v70(text) returns text language sql as $$select $1$$;
    create function public.be_warehouse_return_scan(text,text,text,text,text) returns jsonb language plpgsql as $$
    begin
      if $1 <> 'FAILED' then raise exception 'Delivery failure must be recorded'; end if;
      return jsonb_build_object('ok',true,'legacy_failure_path',true);
    end $$;
    create function public.be_set_delivery_reschedule_v71(text,date,text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;
    create table public.be_data_entry_parcel_details (
      id uuid default gen_random_uuid(), delivery_way_id text primary key,
      pickup_id text, parcel_sequence integer, saved_at timestamptz default now(),
      updated_at timestamptz default now(), created_at timestamptz default now(),
      parcel_status text default 'OUT_FOR_DELIVERY', financial_validation_status text default 'OK',
      financial_quote jsonb, merchant_id text, recipient_name text, contact_no_1 text,
      township text, recipient_address text, cod_amount numeric, delivery_fee numeric,
      weight_kg numeric, way_management_status text, delivery_region text default 'YANGON',
      delivery_route_mode text default 'DOORSTEP_MAP', location_required boolean default true
    );
    create table public.be_warehouse_receipts_v36 (
      pickup_id text, parcel_sequence integer, delivery_way_id text, warehouse_status text,
      receipt_method text, warehouse_code text, warehouse_entered_at timestamptz,
      updated_at timestamptz, staging_zone text, primary key(pickup_id,parcel_sequence)
    );
    create table public.be_warehouse_receipt_events_v36 (
      id uuid default gen_random_uuid(), delivery_way_id text, created_at timestamptz, action text,
      pickup_id text, parcel_sequence integer, previous_status text, new_status text,
      exception_code text, remark text, warehouse_code text, staging_zone text, actor_email text
    );
    create table public.be_warehouse_return_scans_v39 (delivery_way_id text, scanned_at timestamptz);
    create table public.be_delivery_reschedules_v71 (
      delivery_way_id text primary key, original_way_id text, status text, reason_code text,
      requested_delivery_date date, requested_at timestamptz
    );
    create table public.be_delivery_attempt_state_v39 (
      delivery_way_id text primary key, last_status text, consecutive_failures integer, last_failure_reason text
    );
    create table public.be_wayplan_membership_v40 (
      delivery_way_id text, wayplan_id text, membership_status text, updated_at timestamptz default now()
    );
    create table public.be_wayplan_dispatch_stops (
      delivery_way_id text, wayplan_id text, rider_status text, stop_status text, delivered_at timestamptz,
      metadata jsonb
    );
    create table public.be_dispatch_scans_v39 (
      delivery_way_id text, wayplan_code text, scan_status text, scanned_at timestamptz,
      scanned_by text, updated_at timestamptz default now()
    );
    create table public.be_delivery_location_registry (
      delivery_way_id text primary key, latitude numeric, longitude numeric,
      review_status text, match_level text, coordinate_source text
    );
    create table public.be_wayplan_dispatches (
      wayplan_id text primary key, wayplan_status text, vehicle_code text, vehicle_name text,
      metadata jsonb, driver_name text, helper_name text, rider_name text
    );
    create table public.be_wayplan_review_v43 (wayplan_id text, review_status text, dispatch_ready_at timestamptz);
    create table public.be_provider_transfer_custody_v1 (
      id bigint, delivery_way_id text, physically_handed_over_at timestamptz, provider_code text
    );
    create table public.be_thirdparty_cs_current_v1 (delivery_way_id text, provider_code text);
    create table private.be_warehouse_provider_assignment_confirmation_v1
      (parcel_detail_id uuid, delivery_way_id text, provider_code text);
    create function public.be_warehouse_scan_lifecycle_snapshot_v164() returns jsonb language sql as $$
      select jsonb_build_object('rows',jsonb_agg(jsonb_build_object('delivery_way_id',delivery_way_id,
        'pickup_id',pickup_id,'dispatch_workflow_stage','READY_FOR_WAYPLAN')))
      from public.be_data_entry_parcel_details
    $$;

    insert into public.be_data_entry_parcel_details(delivery_way_id,pickup_id,parcel_sequence)
    select way,'P-'||way,1 from unnest(array['DUE','FUTURE','CLOSED','NO_DISPATCH','FAILED','BRANCH','PENDING','NO_PIN_NEEDED']) way;
    update public.be_data_entry_parcel_details set parcel_status='DELIVERED' where delivery_way_id='CLOSED';
    update public.be_data_entry_parcel_details set delivery_region='MANDALAY' where delivery_way_id='BRANCH';
    update public.be_data_entry_parcel_details set location_required=false where delivery_way_id='NO_PIN_NEEDED';
    insert into public.be_warehouse_receipts_v36
      (pickup_id,parcel_sequence,delivery_way_id,warehouse_status,receipt_method,warehouse_code)
    select pickup_id,parcel_sequence,delivery_way_id,'WAREHOUSE_READY','SCAN','YGN-MAIN'
    from public.be_data_entry_parcel_details;
    insert into public.be_delivery_location_registry values
      ('DUE',16.9,96.2,'ACCEPTED','REVIEW','MANUAL_PIN'),
      ('FUTURE',16.9,96.2,'ACCEPTED','TOWNSHIP_DEFAULT','TOWNSHIP_DEFAULT_V136'),
      ('PENDING',16.9,96.2,'REVIEW_REQUIRED','ADDRESS_EXACT','GOOGLE_GEOCODE');
    insert into public.be_delivery_reschedules_v71
    select way,'ALIAS-'||way,'ACTIVE','CUSTOMER_REQUESTED_RESCHEDULE',
      (now() at time zone 'Asia/Yangon')::date + case when way='FUTURE' then 1 else 0 end,now()-interval '1 hour'
    from unnest(array['DUE','FUTURE','CLOSED','NO_DISPATCH','BRANCH']) way;
    insert into public.be_wayplan_membership_v40(delivery_way_id,wayplan_id,membership_status)
    select delivery_way_id,'WP-'||delivery_way_id,'ON_HOLD' from public.be_delivery_reschedules_v71;
    insert into public.be_wayplan_dispatch_stops(delivery_way_id,wayplan_id,rider_status,stop_status)
    select delivery_way_id,wayplan_id,'DELIVERY_RESCHEDULED','RETURN_TO_WAREHOUSE' from public.be_wayplan_membership_v40;
    insert into public.be_dispatch_scans_v39(delivery_way_id,wayplan_code,scan_status,scanned_at)
    select delivery_way_id,wayplan_id,'SCANNED',now()-interval '2 hours'
    from public.be_wayplan_membership_v40 where delivery_way_id <> 'NO_DISPATCH';
    insert into public.be_delivery_attempt_state_v39 values ('FAILED','ATTEMPTED_FAILED',1,'CUSTOMER_UNAVAILABLE');

    set test.role='warehouse';
  `);
  await db.exec(sql);
  const queryValue = async (query, params = []) => (await db.query(query, params)).rows[0].result;
  const scan = (id) => queryValue("select public.be_warehouse_return_scan_v71($1,null) as result", [id]);
  const eligible = (id) => queryValue("select public.be_delivery_schedule_allows_wayplan_v71($1) as result", [id]);
  const queue = async () => (await queryValue("select public.be_wayplan_visible_queue_v124() as result")).queue;
  const stage = async (id) => (await queryValue("select public.be_warehouse_dispatch_scan_state_v75($1) as result", [id])).dispatch_workflow_stage;
  const warehouseRow = async (id) => (await queryValue("select public.be_warehouse_scan_lifecycle_snapshot_v211() as result")).rows.find((row) => row.delivery_way_id === id);

  await assert.rejects(scan("DUE"), /Authentication is required/);
  await db.exec("set test.uid='10000000-0000-0000-0000-000000000000'; set test.role='rider'");
  await assert.rejects(scan("DUE"), /Warehouse operation permission is required/);
  await db.exec("set test.role='warehouse'");
  assert.equal(await eligible("DUE"), false);
  assert.equal(await stage("DUE"), "AWAITING_RETURN_SCAN");
  assert.equal((await warehouseRow("DUE")).scheduled_return_pending, true);
  assert.equal((await queue()).find((row) => row.delivery_way_id === "DUE").route_ready, true);
  assert.equal((await queue()).find((row) => row.delivery_way_id === "DUE").wayplan_eligible, false);
  assert.equal((await queue()).find((row) => row.delivery_way_id === "PENDING").latitude, null);
  assert.equal((await queue()).find((row) => row.delivery_way_id === "NO_PIN_NEEDED").route_block_reason, "ROAD_PIN_NOT_REQUIRED");

  await assert.rejects(scan("NO_DISPATCH"), /Delivery failure must be recorded/);
  await assert.rejects(scan("CLOSED"), /Delivery failure must be recorded/);
  assert.equal((await scan("FAILED")).legacy_failure_path, true);
  assert.equal((await scan("DUE")).scheduled_return, true);
  assert.equal((await scan("DUE")).duplicate_return_scan, true);
  assert.equal(await eligible("DUE"), true);
  assert.equal(await eligible("alias-due"), true);
  assert.equal(await stage("DUE"), "RETURNED_WAITING_REPLAN");
  const returned = await warehouseRow("DUE");
  assert.equal(returned.scheduled_return_pending, false);
  assert.equal(returned.physical_return_scan_count, 0);
  assert.equal(returned.dispatch_workflow_stage, "RETURNED_WAITING_REPLAN");

  assert.equal((await scan("FUTURE")).scheduled_return, true);
  assert.equal(await eligible("FUTURE"), false);
  assert.equal(await stage("FUTURE"), "SCHEDULED_HOLD");
  await db.exec("set test.role='branch_manager'");
  await assert.rejects(scan("DUE"), /wrong branch/);
  assert.equal((await scan("BRANCH")).scheduled_return, true);
  assert.equal(await queryValue("select warehouse_code as result from public.be_warehouse_receipt_events_v36 where delivery_way_id='BRANCH'"), "MDY-MAIN");

  await db.exec("update public.be_delivery_reschedules_v71 set requested_at=clock_timestamp()+interval '1 second' where delivery_way_id='DUE'");
  assert.equal(await eligible("DUE"), false);
  assert.equal(await queryValue("select count(*)::int as result from public.be_warehouse_receipt_events_v36 where delivery_way_id='DUE'"), 1);
  assert.equal(await queryValue("select count(*)::int as result from public.be_delivery_attempt_state_v39 where delivery_way_id='DUE'"), 0);
  assert.equal(await queryValue("select count(*)::int as result from public.be_warehouse_return_scans_v39 where delivery_way_id='DUE'"), 0);
  console.log("PASS scheduled custody return, retry, dated Wayplan eligibility, location readiness, and role/branch guards");
} finally {
  await db.close();
}
