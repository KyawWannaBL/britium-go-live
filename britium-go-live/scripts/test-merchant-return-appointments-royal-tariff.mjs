import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const actor = "11111111-1111-1111-1111-111111111111";
const call = async (sql, args = []) => (await db.query(sql, args)).rows[0].result;

try {
  await db.exec(`
    create schema auth;
    create role anon;
    create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.actor',true),'')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{"email":"staff@example.test"}'::jsonb $$;
    create function be_current_role() returns text language sql stable as $$ select current_setting('app.role',true) $$;
    create function be_current_user_role() returns text language sql stable as $$ select be_current_role() $$;
    create function be_tariff_manage_allowed_v1() returns boolean language sql stable as $$
      select auth.uid() is not null and be_current_role() in ('superadmin','data_entry')
    $$;
    create table be_tariff_location_alias_v61_7_1(normalized_alias text primary key,alias_value text,
      location_key text,location_kind text,canonical_label text);
    create table master_locations(township text,city text,state_region text,active boolean);
    insert into master_locations values ('Fixture Town','Fixture City','Region',true);
    create function be_financial_v2_normalize_township_text_v61_7(text) returns text language sql as $$
      select lower(btrim(translate($1,'()','  ')))
    $$;
    create function be_approved_tariff_lookup_key(text) returns text language sql stable as $$
      select location_key from be_tariff_location_alias_v61_7_1
        where normalized_alias=be_financial_v2_normalize_township_text_v61_7($1)
    $$;
    create table be_data_entry_tariff_catalog(destination_key text primary key,destination_name text,
      provider_code text,is_active boolean,standard_rate_mmk numeric);
    create function be_tariff_catalog_manage_v1(p_provider text,p_action text,p_key text,p_name text,p_rate numeric)
    returns jsonb language plpgsql as $$
    declare item be_data_entry_tariff_catalog%rowtype;
    begin
      if p_action='REMOVE' then
        update be_data_entry_tariff_catalog set is_active=false where destination_key=p_key returning * into item;
      else
        if be_approved_tariff_lookup_key(p_name) is null then raise exception 'Unapproved Finance destination'; end if;
        insert into be_data_entry_tariff_catalog values(p_key,p_name,p_provider,true,p_rate)
          on conflict(destination_key) do update set destination_name=excluded.destination_name,is_active=true,
            standard_rate_mmk=excluded.standard_rate_mmk returning * into item;
      end if;
      return jsonb_build_object('ok',true,'tariff',to_jsonb(item));
    end $$;

    create table be_data_entry_parcel_details(delivery_way_id text primary key,pickup_id text,parcel_status text,
      saved_at timestamptz,branch_code text,township text,merchant_id text,financial_quote jsonb);
    create table be_delivery_reschedules_v71(delivery_way_id text primary key,original_way_id text,
      requested_delivery_date date,reason_code text,reason_name_en text,reason_name_mm text,note text,
      status text,requested_by text,requested_at timestamptz,updated_at timestamptz,metadata jsonb);
    create table be_delivery_attempt_state_v39(delivery_way_id text primary key,last_status text,last_failure_at timestamptz,
      last_failure_reason text);
    create table be_warehouse_return_scans_v39(id bigint generated always as identity,delivery_way_id text,
      warehouse_code text,scanned_at timestamptz);
    create table be_waybill_ledger(delivery_way_id text,dispatch_status text,rider_status text);
    create table be_audit_log(action text,table_name text,record_id text,old_values jsonb,new_values jsonb,
      performed_by uuid,performed_at timestamptz);
    create table be_user_account_registry(auth_user_id uuid,active boolean,is_active boolean,status text,
      branch_code text,updated_at timestamptz);
    create table be_branch_parcel_transfer_items_v1(delivery_way_id text,received_at timestamptz);
    create function be_cs_resolve_parcel_branch(jsonb) returns text language sql as $$ select $1->>'branch_code' $$;
    create function be_employee_can_access_territory(uuid,text,text,text) returns boolean language sql as $$
      select be_current_role()='customer_service' and $2='YGN' and $4='update' $$;
    create function be_customer_service_can_manage_pickup_request(text,text,text) returns boolean language sql as $$ select false $$;
    create function be_branch_warehouse_rto_confirmed_v1(text) returns boolean language sql as $$ select false $$;
    create function be_operational_way_id_v70(text) returns text language sql as $$ select $1 $$;
    create function be_resolve_internal_way_id_v70(text,text) returns text language sql as $$ select $1 $$;
    create function be_branch_warehouse_require_way_v1(text,text) returns text language sql as $$ select 'YGN' $$;
    create function be_branch_warehouse_scope_v1(boolean) returns text language sql as $$ select 'YGN' $$;
    create function be_warehouse_actor_email() returns text language sql as $$ select 'staff@example.test' $$;
    create function be_set_delivery_reschedule_v71(text,date,text,text,text) returns jsonb language plpgsql as $$
      begin raise exception 'existing appointment should not be rewritten by the return scan'; end $$;
    create function be_warehouse_return_scan(text,text,text,text,text) returns jsonb language sql as $$ select '{"ok":true}'::jsonb $$;
    create function be_finance_assert_internal_v3() returns text language plpgsql as $$
      begin if be_current_role()<>'finance' then raise exception 'Finance permission required'; end if;
      return be_current_role(); end $$;

    insert into be_data_entry_tariff_catalog values ('မော်လမြိုင်ကျွန်း (royal)','မော်လမြိုင်ကျွန်း (Royal)','ROYAL EXPRESS',true,5000);
    insert into be_data_entry_parcel_details values
      ('WAY-YGN','P-1','REGISTERED',now(),'YGN','Yangon','M01','{}'),
      ('WAY-MDY','P-2','REGISTERED',now(),'MDY','Mandalay','M01','{}'),
      ('WAY-RTO','P-3','REGISTERED',now(),'YGN','Yangon','M02','{"source_waybill_no":"RETURN-123"}'),
      ('WAY-WAIT','P-4','REGISTERED',now(),'YGN','Yangon','M02','{}');
    insert into be_delivery_attempt_state_v39 values
      ('WAY-YGN','ATTEMPTED_FAILED',now(),'CUSTOMER_REQUESTED_RESCHEDULE'),
      ('WAY-RTO','RTO',now()-interval '1 day','RECIPIENT_REFUSED'),
      ('WAY-WAIT','RTO',now(), 'RECIPIENT_REFUSED');
    insert into be_warehouse_return_scans_v39(delivery_way_id,warehouse_code,scanned_at) values
      ('WAY-RTO','YGN-MAIN',now()), ('WAY-WAIT','YGN-MAIN',now()-interval '1 day');
    insert into be_user_account_registry values ('${actor}',true,true,'active','YGN',now());
  `);

  for (const migration of [
    "20261127131500_royal_tariff_destination_entry.sql",
    "20261127131600_cs_delivery_appointments.sql",
    "20261127131700_merchant_return_custody.sql",
  ]) {
    await db.exec(readFileSync(new URL("../sql/candidates/" + migration, import.meta.url), "utf8"));
  }

  await db.exec(`set app.actor='${actor}'; set app.role='data_entry'`);
  const tariff = "select be_royal_tariff_save_v1($1,$2,$3,$4) result";
  await assert.rejects(call(tariff, ["ADD", null, "မော်ကျွန်းမြို့", 5000]), /already exists/);
  await assert.rejects(call(tariff, ["ADD", null, "အသုတ်", 0]), /positive whole number/);
  const added = await call(tariff, ["ADD", null, " အသုတ် (Royal Express) ", 6000]);
  assert.equal(added.tariff.destination_name, "အသုတ် (Royal)");
  assert.equal(Number(added.tariff.standard_rate_mmk), 6000);
  assert.equal(await call("select be_approved_tariff_lookup_key('အသုတ် (Royal)') result"), "APPROVED:အသုတ်");
  assert.equal((await call(tariff, ["ADD", null, "Fixture Town", 6000])).ok, true);
  await assert.rejects(call(tariff, ["ADD", null, "Unlisted destination", 6000]), /location master/);
  await assert.rejects(call(tariff, ["REMOVE", added.tariff.destination_key, null, null]), /Only Super Admin/);
  await db.exec("set app.role='superadmin'");
  assert.equal((await call(tariff, ["REMOVE", added.tariff.destination_key, null, null])).tariff.is_active, false);
  assert.equal((await call(tariff, ["SAVE", added.tariff.destination_key, "အသုတ် (Royal)", 6500])).tariff.is_active, true);

  await db.exec("set app.role='customer_service'");
  const appointment = "select be_cs_change_delivery_appointment_v218($1,((now() at time zone 'Asia/Yangon')::date+$2::int),$3) result";
  await assert.rejects(call(appointment, ["WAY-MDY", 2, "Confirmed by customer"]), /parcel territory/);
  await assert.rejects(call(appointment, ["WAY-RTO", 2, "Confirmed by customer"]), /closed/);
  await assert.rejects(call(appointment, ["WAY-YGN", -1, "Confirmed by customer"]), /later delivery date/);
  assert.equal((await call(appointment, ["WAY-YGN", 1, "Confirmed by customer"])).ok, true);
  const revised = await call(appointment, ["WAY-YGN", 2, "Customer confirmed Tuesday"]);
  assert.equal(revised.ok, true);
  assert.equal((await call(appointment, ["WAY-YGN", 2, "Customer confirmed Tuesday"])).unchanged, true);
  assert.equal(await call("select jsonb_array_length(metadata->'cs_appointment_change_history') result from be_delivery_reschedules_v71"), 2);
  await db.exec("set app.role='warehouse'");
  const scan = await call("select be_warehouse_return_scan_v71('WAY-YGN', 'CUSTOMER_REQUESTED_RESCHEDULE', current_date) result");
  assert.equal(scan.reschedule.requested_delivery_date, revised.requested_delivery_date);

  const queue = "select be_merchant_return_queue_v1($1,$2) result";
  const update = "select be_record_merchant_return_v1($1,$2,$3) result";
  assert.deepEqual((await call(queue, [null, null])).map(row => row.delivery_way_id), ["WAY-RTO"]);
  await assert.rejects(call(update, ["WAY-WAIT", "DISPATCH", "Manifest 1"]), /physical Warehouse Return Scan/);
  await assert.rejects(call(update, ["WAY-RTO", "RECEIPT", "Merchant proof"]), /dispatch to merchant/);
  await db.exec("update be_user_account_registry set branch_code='MDY'");
  assert.deepEqual(await call(queue, ["RETURN-123", null]), []);
  await assert.rejects(call(update, ["WAY-RTO", "DISPATCH", "Manifest 1"]), /holding this RTO parcel/);
  await db.exec("update be_user_account_registry set branch_code='YGN'");
  const dispatch = await call(update, ["WAY-RTO", "DISPATCH", "Manifest 1"]);
  assert.equal((await call(update, ["WAY-RTO", "DISPATCH", "Manifest 1"])).dispatched_at, dispatch.dispatched_at);
  assert.ok((await call(update, ["WAY-RTO", "RECEIPT", "Merchant proof"])).received_at);
  await db.exec("set app.role='finance'");
  const [result] = await call(queue, ["RETURN-123", "M02"]);
  assert.equal(result.receipt_reference, "Merchant proof");
  await assert.rejects(call(update, ["WAY-RTO", "RECEIPT", "Different proof"]), /Warehouse authorization/);

  console.log("PASS Royal tariff create/deactivate/reactivate, scoped CS appointment create and revise, and merchant return dispatch/receipt through Finance");
} finally {
  await db.close();
}
